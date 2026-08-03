import type { PlayingCard } from "@magic-vault/shared";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { cardImageVectors } from "../db/schema";
import type { CardSearchAdapter } from "./card-search/types";

// Card detail hydration.
//
// Priority: in-memory cache (playsets re-encounter the same card seconds
// apart) → local DB (cards.card_data, populated by sync) → remote adapter
// (only for cards missing from the DB; the result is persisted so it is only
// ever fetched once). This keeps the scan path network-free after sync.
const TTL_MS = 60 * 60 * 1000;
const MAX_ENTRIES = 500;

const cache = new Map<string, { data: PlayingCard; expiresAt: number }>();

function cacheKey(gameKey: string, scryfallId: string): string {
  return `${gameKey}::${scryfallId}`;
}

export async function resolveCardDetails(
  gameKey: string,
  adapter: CardSearchAdapter,
  baseUrl: string,
  scryfallId: string,
): Promise<PlayingCard | null> {
  const key = cacheKey(gameKey, scryfallId);
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

  // Local DB first: bulk sync stores full card objects for games whose
  // sources provide them (Scryfall). No network here.
  const fromDb = await db.query.cardImageVectors.findFirst({
    where: (t, { and }) =>
      and(eq(t.gameKey, gameKey), eq(t.scryfallId, scryfallId)),
    columns: { cardData: true },
  });
  if (fromDb?.cardData) {
    const data = fromDb.cardData as PlayingCard;
    remember(key, data);
    return data;
  }

  // Miss: fetch from the remote adapter once, then persist so every later
  // scan (even after a server restart) is served locally.
  const result = await adapter.searchById(scryfallId, baseUrl);
  if (!result.success || !result.data) return null;
  remember(key, result.data);
  void persistCardData(gameKey, scryfallId, result.data);
  return result.data;
}

function remember(key: string, data: PlayingCard): void {
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { data, expiresAt: Date.now() + TTL_MS });
}

async function persistCardData(
  gameKey: string,
  scryfallId: string,
  cardData: PlayingCard,
): Promise<void> {
  try {
    // Update-only on purpose: a hydrated card always matched a vector row, so
    // its row must already exist. Never insert here — a card missing from the
    // cards table is the next sync's job, and inserting without an embedding
    // would pollute the vector search.
    await db
      .update(cardImageVectors)
      .set({ cardData, updatedAt: new Date() })
      .where(
        and(
          eq(cardImageVectors.gameKey, gameKey),
          eq(cardImageVectors.scryfallId, scryfallId),
        ),
      );
  } catch (err) {
    // Persisting is best-effort — the in-memory cache already covers this scan.
    console.error(`[card-cache] failed to persist card data for ${scryfallId}:`, err);
  }
}
