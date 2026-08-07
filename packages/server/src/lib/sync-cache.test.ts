import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// SYNC_CACHE_DIR is read at module load time, so point it at a throwaway
// directory BEFORE importing the module under test.
const tempDir = mkdtempSync(join(tmpdir(), "decksift-sync-cache-"));
process.env.SYNC_CACHE_DIR = tempDir;

let syncCache: typeof import("./sync-cache");

beforeAll(async () => {
  syncCache = await import("./sync-cache");
});

afterAll(() => {
  delete process.env.SYNC_CACHE_DIR;
  rmSync(tempDir, { recursive: true, force: true });
});

const CARDS: import("./card-search/sync-types").SyncSourceCard[] = [
  {
    id: "card-1",
    name: "Sol Ring",
    setCode: "ECC",
    imageUrl: "https://cdn.example/1.jpg",
    cardData: { name: "Sol Ring" },
  },
  {
    id: "card-2",
    name: "Island",
    setCode: "ECC",
    imageUrl: undefined,
    cardData: { name: "Island" },
  },
];

describe("sync-catalog disk cache", () => {
  it("round-trips a catalog with its version token", () => {
    syncCache.saveCachedCatalog("mtg", "2026-08-08", CARDS);
    const loaded = syncCache.loadCachedCatalog("mtg", "2026-08-08");
    expect(loaded).toHaveLength(2);
    expect(loaded![0]).toMatchObject({ id: "card-1", name: "Sol Ring" });
    expect(loaded![1].imageUrl).toBeUndefined();
  });

  it("treats a version mismatch as a cache miss", () => {
    syncCache.saveCachedCatalog("mtg", "2026-08-08", CARDS);
    expect(syncCache.loadCachedCatalog("mtg", "2026-09-01")).toBeNull();
  });

  it("treats a missing game as a cache miss", () => {
    expect(syncCache.loadCachedCatalog("never-synced", "2026-08-08")).toBeNull();
  });

  it("does not throw when writing is impossible", () => {
    expect(() => syncCache.saveCachedCatalog("bad:key", "", CARDS)).not.toThrow();
  });
});
