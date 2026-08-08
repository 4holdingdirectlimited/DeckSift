import { authQuery, db } from "../../db";
import { gundamAdapter } from "../gundam/search";
import { pokemonAdapter } from "../pokemon/search";
import { scryfallAdapter } from "../scryfall/search";
import { withCache } from "./cache";
import { createSearchAdapter } from "./generic";
import {
  digimonConfig,
  fleshAndBloodConfig,
  lorcanaConfig,
  onePieceConfig,
  pocketConfig,
  starWarsConfig,
  unionArenaConfig,
  yugiohConfig,
} from "./generic-configs";
import { createLocalAdapter } from "./local";
import type { CardSearchAdapter } from "./types";

// Dataset-imported games (no live API): search + hydration read the local
// cards table. Onboarded via scripts/import-cardset.ts + scripts/datasets/.
const DATASET_GAMES = ["altered", "fow", "duelmasters", "weiss"] as const;

const RAW_ADAPTERS: Record<string, CardSearchAdapter> = {
  mtg: scryfallAdapter,
  gundam: gundamAdapter,
  pokemon: pokemonAdapter,
  yugioh: createSearchAdapter(yugiohConfig),
  digimon: createSearchAdapter(digimonConfig),
  lorcana: createSearchAdapter(lorcanaConfig),
  onepiece: createSearchAdapter(onePieceConfig),
  starwars: createSearchAdapter(starWarsConfig),
  unionarena: createSearchAdapter(unionArenaConfig),
  fab: createSearchAdapter(fleshAndBloodConfig),
  pokemonpocket: createSearchAdapter(pocketConfig),
  ...Object.fromEntries(DATASET_GAMES.map((k) => [k, createLocalAdapter(k)])),
};

const ADAPTERS_BY_GAME_KEY: Record<string, CardSearchAdapter> = {
  mtg: withCache(scryfallAdapter),
  gundam: withCache(gundamAdapter),
  pokemon: withCache(pokemonAdapter),
  yugioh: withCache(createSearchAdapter(yugiohConfig)),
  digimon: withCache(createSearchAdapter(digimonConfig)),
  lorcana: withCache(createSearchAdapter(lorcanaConfig)),
  onepiece: withCache(createSearchAdapter(onePieceConfig)),
  starwars: withCache(createSearchAdapter(starWarsConfig)),
  unionarena: withCache(createSearchAdapter(unionArenaConfig)),
  fab: withCache(createSearchAdapter(fleshAndBloodConfig)),
  pokemonpocket: withCache(createSearchAdapter(pocketConfig)),
  ...Object.fromEntries(DATASET_GAMES.map((k) => [k, withCache(createLocalAdapter(k))])),
};

/**
 * Unwrapped adapter (no TTL cache) — for forced refreshes like the manual
 * "Refresh prices" action, which must hit the source API, not the cache.
 */
export function getRawAdapter(gameKey: string): CardSearchAdapter | null {
  return RAW_ADAPTERS[gameKey] ?? null;
}

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
