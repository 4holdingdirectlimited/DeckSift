import type { SyncSource, SyncSourceCard } from "../card-search/sync-types";
import {
  fetchDetail,
  fetchLocalizedNameMaps,
  normalizePokemonCard,
  POKEMON_DEFAULT_URL,
  POKEMON_HEADERS,
  type PokemonCardDetail,
} from "./search";

interface PokemonListCard {
  id: string;
  localId: string;
  name: string;
}

const PAGE_LIMIT = 1000;
// TCGdex's list endpoint only returns {id, localId, name} — no image, no
// rarity. Each card needs a detail fetch to be syncable at all, so fetch them
// concurrently (bounded) rather than one at a time.
const DETAIL_CONCURRENCY = 16;

// TCGdex image fields are a base URL with no extension - append the
// quality/format suffix to get an actual fetchable asset.
function highResUrl(image: string | undefined): string | undefined {
  return image ? `${image}/high.webp` : undefined;
}

/** Map an array with a bounded-concurrency async mapper. */
async function mapLimit<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await mapper(items[i], i);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

async function fetchCards(
  baseUrl: string,
  addLog: (msg: string) => void,
): Promise<SyncSourceCard[]> {
  addLog("Fetching Pokémon TCG catalog...");

  const all: PokemonListCard[] = [];
  let page = 1;
  for (;;) {
    const url = `${baseUrl}?pagination:page=${page}&pagination:itemsPerPage=${PAGE_LIMIT}`;
    const res = await fetch(url, { headers: POKEMON_HEADERS });
    if (!res.ok) throw new Error(`Pokémon card list fetch failed: ${res.status}`);

    const rows = (await res.json()) as PokemonListCard[];
    all.push(...rows);
    addLog(`Fetched ${all.length} card ids so far...`);

    if (rows.length < PAGE_LIMIT) break;
    page += 1;
  }

  addLog(
    `Enriching ${all.length} cards with details (image, rarity, set)...`,
  );
  const details = await mapLimit(all, DETAIL_CONCURRENCY, async (brief) => {
    const detail = await fetchDetail(brief.id, baseUrl);
    return detail;
  });

  // Localized names (fr/de/es/it/pt) via the cheap per-locale list endpoints,
  // so foreign-language Pokémon cards are searchable by their own name.
  addLog("Fetching localized card names (fr/de/es/it/pt)...");
  const localizedNames = await fetchLocalizedNameMaps(baseUrl);
  addLog(`Localized names loaded for ${localizedNames.size} cards.`);

  const cards: SyncSourceCard[] = [];
  let skipped = 0;
  for (const detail of details) {
    if (!detail || !detail.image) {
      skipped++;
      continue;
    }
    cards.push({
      id: detail.id,
      name: detail.name,
      setCode: detail.set?.id ?? detail.id.split("-")[0] ?? "",
      imageUrl: highResUrl(detail.image),
      // Full PlayingCard (rarity, set, etc.) so rarity binning, bundle
      // recipes, and offline hydration all work without a second lookup.
      cardData: normalizePokemonCard(detail, localizedNames.get(detail.id)),
    });
  }
  addLog(
    `Got ${cards.length} syncable cards (${skipped} without an image).`,
  );
  return cards;
}

async function fetchOne(id: string, baseUrl: string) {
  const raw = await fetchDetail(id, baseUrl);
  if (!raw) return null;
  return {
    name: raw.name,
    setCode: raw.set?.id ?? raw.id.split("-")[0] ?? "",
    imageUrl: highResUrl(raw.image),
  };
}

export const pokemonSyncSource: SyncSource = {
  gameKey: "pokemon",
  label: "Pokémon (TCGdex)",
  defaultUrl: POKEMON_DEFAULT_URL,
  fetchHeaders: POKEMON_HEADERS,
  fetchCards,
  fetchOne,
};

export type { PokemonCardDetail };
