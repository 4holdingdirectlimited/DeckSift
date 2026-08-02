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

export async function resolveCardDetails(
  adapter: CardSearchAdapter,
  baseUrl: string,
  scryfallId: string,
): Promise<PlayingCard | null> {
  const hit = cache.get(scryfallId);
  if (hit && hit.expiresAt > Date.now()) return hit.data;

  const result = await adapter.searchById(scryfallId, baseUrl);
  if (!result.success || !result.data) return null;

  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(scryfallId, { data: result.data, expiresAt: Date.now() + TTL_MS });
  return result.data;
}
