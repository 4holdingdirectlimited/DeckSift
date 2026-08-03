import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SyncSourceCard } from "./card-search/sync-types";

// Disk cache for downloaded bulk catalogs (Scryfall's unique_artwork file is
// several hundred MB). The cache is keyed by the catalog's version token
// (Scryfall's `updated_at`), so a re-sync only re-downloads when the upstream
// catalog has actually changed.
const CACHE_DIR =
  process.env.SYNC_CACHE_DIR ?? join(process.cwd(), ".cache", "sync");

function metaPath(gameKey: string): string {
  return join(CACHE_DIR, `${gameKey}.meta.json`);
}

function catalogPath(gameKey: string): string {
  return join(CACHE_DIR, `${gameKey}.json`);
}

/**
 * Returns the cached catalog for a game when the stored version token matches
 * the current upstream one, otherwise null (a miss means "download again").
 * The cache is best-effort: any read problem is treated as a miss.
 */
export function loadCachedCatalog(
  gameKey: string,
  version: string,
): SyncSourceCard[] | null {
  try {
    const meta = JSON.parse(readFileSync(metaPath(gameKey), "utf8")) as {
      version?: string;
    };
    if (meta.version !== version) return null;
    return JSON.parse(readFileSync(catalogPath(gameKey), "utf8")) as SyncSourceCard[];
  } catch {
    return null;
  }
}

/**
 * Persists a downloaded catalog alongside its version token. Best-effort: a
 * failed write must never break the sync itself.
 */
export function saveCachedCatalog(
  gameKey: string,
  version: string,
  cards: SyncSourceCard[],
): void {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(metaPath(gameKey), JSON.stringify({ version }));
    writeFileSync(catalogPath(gameKey), JSON.stringify(cards));
  } catch (err) {
    console.error(`[sync-cache] failed to cache ${gameKey} catalog:`, err);
  }
}
