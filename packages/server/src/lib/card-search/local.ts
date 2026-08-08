import type { PlayingCard, Result } from "@magic-vault/shared";
import { QUERY_MIN_LENGTH } from "@magic-vault/shared";
import { and, eq, ilike } from "drizzle-orm";
import { db } from "../../db";
import { cardImageVectors } from "../../db/schema";
import type { CardSearchAdapter } from "./types";

/**
 * Local-DB-backed adapter for dataset-imported games (no live API): search and
 * hydration read the synced `cards` table. These games are onboarded with
 * `scripts/import-cardset.ts` (or the dataset builders in
 * `scripts/datasets/`), so everything — picker search, scan hydration,
 * library — works fully offline.
 */
export function createLocalAdapter(gameKey: string): CardSearchAdapter {
  return {
    defaultUrl: "local",

    async search(query: string, _baseUrl: string): Promise<Result<PlayingCard[]>> {
      if (!query || query.trim().length < QUERY_MIN_LENGTH) {
        return {
          message: `Your query must be greater than ${QUERY_MIN_LENGTH}`,
          success: false,
        };
      }
      const rows = await db
        .select({ cardData: cardImageVectors.cardData })
        .from(cardImageVectors)
        .where(
          and(
            eq(cardImageVectors.gameKey, gameKey),
            ilike(cardImageVectors.name, `%${query.trim()}%`),
          ),
        )
        .limit(30);
      const cards = rows
        .map((r) => r.cardData as PlayingCard | null)
        .filter((c): c is PlayingCard => c !== null);
      if (cards.length === 0) {
        return {
          message: `No local cards matched: ${query}`,
          success: false,
        };
      }
      return { message: "Cards successfully retrieved.", data: cards, success: true };
    },

    async searchById(id: string, _baseUrl: string): Promise<Result<PlayingCard>> {
      const row = await db.query.cardImageVectors.findFirst({
        where: (t, { and }) =>
          and(eq(t.gameKey, gameKey), eq(t.scryfallId, id)),
        columns: { cardData: true },
      });
      if (!row?.cardData) {
        return {
          success: false,
          message: `Local card ${id} not found for ${gameKey}.`,
        };
      }
      return {
        success: true,
        message: "Successfully fetched card by id.",
        data: row.cardData as PlayingCard,
      };
    },
  };
}
