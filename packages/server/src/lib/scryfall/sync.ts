import { gunzipSync } from "node:zlib";
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

type ScryfallBulkEntry = {
  type: string;
  /** Legacy bulk format (whole-file JSON array) — deprecated by Scryfall. */
  download_uri?: string;
  /** Current bulk format — newline-delimited JSON, gzipped. */
  jsonl_download_uri?: string;
  updated_at?: string;
};

// The sync fetches the JPG (`large`) size: same pixel dimensions as PNG but
// 5-7x fewer bytes, and cards.scryfall.io throttles per-connection (~300 KB/s),
// so transfer size is the bottleneck. SigLIP embeddings are robust to JPEG
// compression, and scan-time captures are camera-compressed anyway. The
// card_faces fallback covers double-faced / modal cards, whose images live
// under card_faces[].image_uris rather than top-level image_uris.
function cardImageUrl(card: ScryfallBulkCard): string | undefined {
  return (
    card.image_uris?.large ??
    card.image_uris?.png ??
    card.card_faces?.[0]?.image_uris?.large ??
    card.card_faces?.[0]?.image_uris?.png
  );
}

function apiRoot(baseUrl: string): string {
  try {
    return new URL(baseUrl).origin;
  } catch {
    return new URL(SCRYFALL_DEFAULT_URL).origin;
  }
}

function isGzip(buffer: Buffer): boolean {
  return buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
}

/**
 * Scryfall bulk files come in two shapes:
 * - current: `.jsonl.gz` — newline-delimited JSON (gzipped), one card object
 *   per line;
 * - legacy: `.json` — a plain JSON array of card objects.
 * Detect and parse both so the sync keeps working if Scryfall flips formats
 * again (a single malformed line is skipped rather than killing the sync).
 */
function parseBulkBuffer(buffer: Buffer): ScryfallBulkCard[] {
  const raw = isGzip(buffer) ? gunzipSync(buffer) : buffer;
  const text = raw.toString("utf8");
  const trimmed = text.trim();
  if (trimmed.startsWith("[")) {
    return JSON.parse(trimmed) as ScryfallBulkCard[];
  }
  const cards: ScryfallBulkCard[] = [];
  for (const line of text.split("\n")) {
    const lineTrimmed = line.trim();
    if (!lineTrimmed) continue;
    try {
      cards.push(JSON.parse(lineTrimmed) as ScryfallBulkCard);
    } catch {
      // Skip a malformed line instead of failing the whole multi-hundred-MB
      // download over one bad record.
    }
  }
  return cards;
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
  const catalog = (await catalogRes.json()) as { data: ScryfallBulkEntry[] };

  const artEntry = catalog.data.find((e) => e.type === "unique_artwork");
  if (!artEntry)
    throw new Error("Could not find unique_artwork bulk data entry");

  const downloadUri = artEntry.jsonl_download_uri ?? artEntry.download_uri;
  if (!downloadUri)
    throw new Error("Scryfall bulk data entry has no download URL");

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

  const bulkRes = await fetch(downloadUri, {
    headers: SCRYFALL_HEADERS,
  });
  if (!bulkRes.ok)
    throw new Error(`Bulk data download failed: ${bulkRes.status}`);

  const cards = parseBulkBuffer(Buffer.from(await bulkRes.arrayBuffer()));
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
