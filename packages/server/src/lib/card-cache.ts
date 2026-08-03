import type { PlayingCard } from "@magic-vault/shared";
import type { CardSearchAdapter } from "./card-search/types";

// In-memory cache of resolved card details. Scanning a playset re-encounters
// the same card repeatedly; without this, every scan would re-fetch the same
// scryfall id from the external card API (Scryfall/Gundam/Pokemon). Entries
// expire after TTL_MS and the map is capped so it can't grow unbounded on
// long multi-set sessions.
const TTL_MS = 60 * 60 * 1000;
const MAX_ENTRIES = 500;

const cache = new Map<string, { data: PlayingCard; expiresAt: number }>();

function cacheKey(baseUrl: string, scryfallId: string): string {
  return `${baseUrl}::${scryfallId}`;
}

export async function resolveCardDetails(
  adapter: CardSearchAdapter,
  baseUrl: string,
  scryfallId: string,
): Promise<PlayingCard | null> {
  const key = cacheKey(baseUrl, scryfallId);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    // Refresh LRU position so hot cards aren't evicted ahead of cold ones.
    cache.delete(key);
    cache.set(key, hit);
    return hit.data;
  }
  // Opportunistically drop expired entries so stale data can't linger past
  // TTL (previously an expired entry was only removed when the map hit
  // MAX_ENTRIES, and then by insertion order, not expiry).
  if (cache.size > 0) {
    const now = Date.now();
    for (const [k, entry] of cache) {
      if (entry.expiresAt <= now) cache.delete(k);
    }
  }

  const result = await adapter.searchById(scryfallId, baseUrl);
  if (!result.success || !result.data) return null;

  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { data: result.data, expiresAt: Date.now() + TTL_MS });
  return result.data;
}
