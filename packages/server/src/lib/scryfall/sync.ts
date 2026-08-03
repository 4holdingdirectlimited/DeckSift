import type { SyncSource, SyncSourceCard } from "../card-search/sync-types";
import { loadCachedCatalog, saveCachedCatalog } from "../sync-cache";
import { SCRYFALL_DEFAULT_URL, SCRYFALL_HEADERS } from "./search";

// Cache key for the bulk catalog; must match the game key in sync-job.ts.
const GAME_KEY = "mtg";

type ScryfallBulkCard = {
  id: string;
  name: string;
  set: string;
  image_uris?: { png?: string; large?: string };
  card_faces?: { image_uris?: { png?: string; large?: string } }[];
};

// Double-faced / modal cards carry their images under card_faces[].image_uris
// rather than top-level image_uris — without this fallback every DFC would be
// silently skipped by the sync (no imageUrl) and could never match a scan.
function cardImageUrl(card: ScryfallBulkCard): string | undefined {
  return (
    card.image_uris?.png ??
    card.image_uris?.large ??
    card.card_faces?.[0]?.image_uris?.png ??
    card.card_faces?.[0]?.image_uris?.large
  );
}

function apiRoot(baseUrl: string): string {
  try {
    return new URL(baseUrl).origin;
  } catch {
    return new URL(SCRYFALL_DEFAULT_URL).origin;
  }
}

async function fetchCards(
  baseUrl: string,
  addLog: (msg: string) => void,
): Promise<SyncSourceCard[]> {
  addLog("Fetching Scryfall bulk data catalog...");

  const catalogRes = await fetch(`${apiRoot(baseUrl)}/bulk-data`, {
    headers: SCRYFALL_HEADERS,
  });
  if (!catalogRes.ok) {
    throw new Error(`Scryfall catalog fetch failed: ${catalogRes.status}`);
  }
  const catalog = (await catalogRes.json()) as {
    data: { type: string; download_uri: string; updated_at?: string }[];
  };

  const artEntry = catalog.data.find((e) => e.type === "unique_artwork");
  if (!artEntry)
    throw new Error("Could not find unique_artwork bulk data entry");

  // Local-first: Scryfall bulk files are static snapshots with an updated_at
  // timestamp. When we already have this exact version on disk, skip the
  // multi-hundred-MB download entirely.
  const version = artEntry.updated_at ?? "";
  if (version) {
    const cached = loadCachedCatalog(GAME_KEY, version);
    if (cached) {
      addLog(
        `Using cached bulk artwork data (${cached.length} cards, unchanged since ${version}).`,
      );
      return cached;
    }
  }

  addLog("Downloading bulk artwork data...");

  const bulkRes = await fetch(artEntry.download_uri, {
    headers: SCRYFALL_HEADERS,
  });
  if (!bulkRes.ok)
    throw new Error(`Bulk data download failed: ${bulkRes.status}`);

  const cards = (await bulkRes.json()) as ScryfallBulkCard[];
  addLog(`Downloaded ${cards.length} cards.`);

  const mapped = cards.map((c) => ({
    id: c.id,
    name: c.name,
    setCode: c.set,
    imageUrl: cardImageUrl(c),
    // unique_artwork entries are complete Scryfall card objects — exactly the
    // shape searchById returns — so we can persist them for local hydration.
    cardData: c as unknown,
  }));
  saveCachedCatalog(GAME_KEY, version, mapped);
  return mapped;
}

async function fetchOne(id: string, baseUrl: string) {
  const res = await fetch(`${baseUrl}/${id}`, { headers: SCRYFALL_HEADERS });
  if (!res.ok) return null;
  const card = (await res.json()) as ScryfallBulkCard;
  return {
    name: card.name,
    setCode: card.set,
    imageUrl: cardImageUrl(card),
  };
}

export const scryfallSyncSource: SyncSource = {
  gameKey: "mtg",
  label: "Magic: The Gathering (Scryfall)",
  defaultUrl: SCRYFALL_DEFAULT_URL,
  fetchHeaders: SCRYFALL_HEADERS,
  fetchCards,
  fetchOne,
};
