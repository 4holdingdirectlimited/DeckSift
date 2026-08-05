import { authQuery, db } from "../../db";
import { gundamAdapter } from "../gundam/search";
import { pokemonAdapter } from "../pokemon/search";
import { scryfallAdapter } from "../scryfall/search";
import { withCache } from "./cache";
import { createSearchAdapter } from "./generic";
import { digimonConfig, yugiohConfig } from "./generic-configs";
import type { CardSearchAdapter } from "./types";

const ADAPTERS_BY_GAME_KEY: Record<string, CardSearchAdapter> = {
  mtg: withCache(scryfallAdapter),
  gundam: withCache(gundamAdapter),
  pokemon: withCache(pokemonAdapter),
  yugioh: withCache(createSearchAdapter(yugiohConfig)),
  digimon: withCache(createSearchAdapter(digimonConfig)),
};

// Resolves the game backing a collection. Scoped by orgId (the card routes
// receive it from the X-Org-Id header): a collection guid alone must never be
// enough to resolve another org's collection/game.
async function findCollectionGame(
  jwtClaims: string,
  orgId: string | undefined,
  collectionGuid: string,
) {
  return authQuery(jwtClaims, async (tx) => {
    const collection = await tx.query.collections.findFirst({
      where: (t, { eq, and }) =>
        orgId
          ? and(eq(t.guid, collectionGuid), eq(t.orgId, orgId))
          : eq(t.guid, collectionGuid),
      columns: { gameId: true },
    });
    if (!collection?.gameId) return null;
    return tx.query.games.findFirst({
      where: (t, { eq }) => eq(t.id, collection.gameId!),
    });
  });
}

export async function resolveGameKey(
  jwtClaims: string,
  orgId: string | undefined,
  collectionGuid: string | undefined,
): Promise<string | null> {
  if (!collectionGuid) return null;
  const game = await findCollectionGame(jwtClaims, orgId, collectionGuid);
  return game?.key ?? null;
}

export async function resolveGameDataSourceUrl(
  gameKey: string,
  fallback: string,
): Promise<string> {
  const game = await db.query.games.findFirst({
    where: (t, { eq }) => eq(t.key, gameKey),
    columns: { dataSourceUrl: true },
  });
  return game?.dataSourceUrl || fallback;
}

export async function resolveCardSearch(
  jwtClaims: string,
  orgId: string | undefined,
  collectionGuid: string | undefined,
): Promise<{
  adapter: CardSearchAdapter;
  baseUrl: string;
  gameKey: string;
} | null> {
  if (!collectionGuid) return null;
  const game = await findCollectionGame(jwtClaims, orgId, collectionGuid);
  if (!game) return null;

  const adapter = ADAPTERS_BY_GAME_KEY[game.key];
  if (!adapter) return null;

  const baseUrl =
    game.dataSourceUrl ||
    (await resolveGameDataSourceUrl(game.key, adapter.defaultUrl));

  return { adapter, baseUrl, gameKey: game.key };
}
