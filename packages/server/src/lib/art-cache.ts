import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { logger } from "./logger";
import { fetchWithRetry } from "./retry";

// Local-first card art cache. The image proxy serves from here, and the card
// sync warms it by saving every image it downloads for embedding — so after a
// game has been synced, browsing its art (library, scanner detail) is instant
// and works offline.
const ART_CACHE_DIR =
  process.env.ART_CACHE_DIR ?? join(process.cwd(), ".cache", "art");

function artCachePaths(url: string): { imgPath: string; metaPath: string } {
  const key = createHash("sha256").update(url).digest("hex");
  return {
    imgPath: join(ART_CACHE_DIR, `${key}.img`),
    metaPath: join(ART_CACHE_DIR, `${key}.meta`),
  };
}

export function readArtFromCache(url: string): {
  buffer: Buffer;
  contentType: string;
} | null {
  try {
    const { imgPath, metaPath } = artCachePaths(url);
    if (!existsSync(imgPath) || !existsSync(metaPath)) return null;
    return {
      buffer: readFileSync(imgPath),
      contentType: readFileSync(metaPath, "utf8"),
    };
  } catch {
    return null;
  }
}

export function saveArtToCache(
  url: string,
  buffer: Buffer,
  contentType: string,
): void {
  try {
    const { imgPath, metaPath } = artCachePaths(url);
    mkdirSync(ART_CACHE_DIR, { recursive: true });
    writeFileSync(imgPath, buffer);
    writeFileSync(metaPath, contentType);
  } catch (err) {
    // Best-effort — a failed cache write must never break a scan or sync.
    logger.error(`[art-cache] failed to cache ${url.slice(0, 80)}`, err);
  }
}

// In-flight dedupe: concurrent requests for the same URL share one upstream
// fetch instead of each round-tripping the (slow) image CDN.
const inFlight = new Map<
  string,
  Promise<{ buffer: Buffer; contentType: string }>
>();

export async function fetchImageWithCache(
  url: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  const cached = readArtFromCache(url);
  if (cached) return cached;

  const pending = inFlight.get(url);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const res = await fetchWithRetry(url, {
        headers: { "User-Agent": "MagicVault/1.0", Accept: "image/*" },
        signal: AbortSignal.timeout(30_000),
      });
      const contentType = res.headers.get("content-type") ?? "";
      if (!res.ok || !contentType.startsWith("image/")) {
        throw new Error(`Image fetch failed: ${res.status}`);
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      saveArtToCache(url, buffer, contentType);
      return { buffer, contentType };
    } finally {
      inFlight.delete(url);
    }
  })();
  inFlight.set(url, promise);
  return promise;
}
