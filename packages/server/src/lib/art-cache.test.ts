import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// ART_CACHE_DIR is read at module load time, so point it at a throwaway
// directory BEFORE importing the module under test.
const tempDir = mkdtempSync(join(tmpdir(), "decksift-art-cache-"));
process.env.ART_CACHE_DIR = tempDir;

let artCache: typeof import("./art-cache");

beforeAll(async () => {
  artCache = await import("./art-cache");
});

afterAll(() => {
  delete process.env.ART_CACHE_DIR;
  rmSync(tempDir, { recursive: true, force: true });
});

const IMAGE_BYTES = Buffer.from("fake-jpeg-bytes");

function imageResponse(): Response {
  return new Response(new Uint8Array(IMAGE_BYTES), {
    status: 200,
    headers: { "Content-Type": "image/jpeg" },
  });
}

describe("art-cache disk round-trip", () => {
  it("saves and reads back the image with its content type", () => {
    artCache.saveArtToCache("https://cdn.example/a.jpg", IMAGE_BYTES, "image/jpeg");
    const cached = artCache.readArtFromCache("https://cdn.example/a.jpg");
    expect(cached).not.toBeNull();
    expect(cached!.buffer.equals(IMAGE_BYTES)).toBe(true);
    expect(cached!.contentType).toBe("image/jpeg");
  });

  it("distinguishes different URLs", () => {
    artCache.saveArtToCache("https://cdn.example/b.jpg", IMAGE_BYTES, "image/jpeg");
    expect(artCache.readArtFromCache("https://cdn.example/other.jpg")).toBeNull();
  });

  it("returns null when nothing was cached", () => {
    expect(artCache.readArtFromCache("https://cdn.example/missing.jpg")).toBeNull();
  });
});

describe("fetchImageWithCache", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("fetches once and serves subsequent requests from the cache", async () => {
    fetchMock.mockResolvedValueOnce(imageResponse());

    const first = await artCache.fetchImageWithCache("https://cdn.example/c.jpg");
    const second = await artCache.fetchImageWithCache("https://cdn.example/c.jpg");

    expect(first.contentType).toBe("image/jpeg");
    expect(first.buffer.equals(IMAGE_BYTES)).toBe(true);
    expect(second.buffer.equals(IMAGE_BYTES)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("dedupes concurrent requests for the same URL into one upstream fetch", async () => {
    fetchMock.mockResolvedValueOnce(imageResponse());

    const [a, b] = await Promise.all([
      artCache.fetchImageWithCache("https://cdn.example/d.jpg"),
      artCache.fetchImageWithCache("https://cdn.example/d.jpg"),
    ]);

    expect(a.buffer.equals(b.buffer)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects on a failed upstream response", async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockResolvedValue(new Response("nope", { status: 500 }));
      const pending = artCache.fetchImageWithCache("https://cdn.example/e.jpg");
      const assertion = expect(pending).rejects.toThrow("Image fetch failed");
      await vi.advanceTimersByTimeAsync(10_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects when the response is not an image", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("html", { status: 200, headers: { "Content-Type": "text/html" } }),
    );
    await expect(
      artCache.fetchImageWithCache("https://cdn.example/f.jpg"),
    ).rejects.toThrow("Image fetch failed");
  });
});
