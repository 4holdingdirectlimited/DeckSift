import type { PlayingCard, Result } from "@magic-vault/shared";
import { QUERY_MIN_LENGTH } from "@magic-vault/shared";
import type { CardSearchAdapter } from "./types";
import type { SyncSource, SyncSourceCard } from "./sync-types";
import { fetchWithRetry } from "../retry";

// Config-driven adapter factory: one code path for any TCG whose source offers
// a JSON search + a JSON bulk catalog. Adding a game = a config object (URLs +
// field mapping), not a new adapter file. See generic-configs.ts for examples.
export interface GenericGameConfig {
  key: string;
  label: string;
  headers?: Record<string, string>;
  /** Search URL with {q} placeholder (query is URL-encoded). */
  searchUrl: string;
  /** Optional client-side filter for sources whose API can't filter by name
   *  (e.g. Lorcana returns the whole catalog for every query). Receives the
   *  full search-response card list; return the matches. When absent, the
   *  response is used as-is. */
  searchFilter?: (
    cards: Record<string, unknown>[],
    query: string,
  ) => Record<string, unknown>[];
  /** Optional exact-id lookup URL with {id} placeholder. When absent,
   *  searchById falls back to filtering the bulk catalog. */
  searchByIdUrl?: string;
  /** Bulk catalog URL returning every card. */
  bulkUrl: string;
  /** Extracts the card array from a JSON response. Defaults: array, or
   *  `{data: [...]}` (Scryfall-style). */
  resultPath?: (json: unknown) => unknown[];
  /** Stable card id used for sync dedupe + hydration lookups. */
  cardId: (raw: Record<string, unknown>) => string;
  /** Extracts the display name for the DB `name` column. Defaults to the
   *  lowercase "name" field (most sources); sources with differently-cased
   *  fields (e.g. Lorcana's "Name") override this. */
  nameOf?: (raw: Record<string, unknown>) => string;
  setCode: (raw: Record<string, unknown>) => string;
  /** Absolute image URL for embedding during sync. */
  imageUrl: (raw: Record<string, unknown>) => string | undefined;
  /** Normalizes a source card into the shared PlayingCard shape. */
  toCard: (raw: Record<string, unknown>) => PlayingCard;
}

const NOT_LEGAL: PlayingCard["legalities"] = {
  standard: "not_legal",
  future: "not_legal",
  historic: "not_legal",
  timeless: "not_legal",
  gladiator: "not_legal",
  pioneer: "not_legal",
  modern: "not_legal",
  legacy: "not_legal",
  pauper: "not_legal",
  vintage: "not_legal",
  penny: "not_legal",
  commander: "not_legal",
  oathbreaker: "not_legal",
  standardbrawl: "not_legal",
  brawl: "not_legal",
  alchemy: "not_legal",
  paupercommander: "not_legal",
  duel: "not_legal",
  oldschool: "not_legal",
  premodern: "not_legal",
  predh: "not_legal",
};

export function str(
  raw: Record<string, unknown>,
  key: string,
): string | undefined {
  const v = raw[key];
  return v == null ? undefined : String(v);
}

export function num(
  raw: Record<string, unknown>,
  key: string,
): number | undefined {
  const v = raw[key];
  return typeof v === "number" ? v : v == null ? undefined : Number(v);
}

/** Proxy URL used by the UI so art is served from the local disk cache. */
export function proxyImage(url: string): string {
  return `/api/cards/image-proxy?url=${encodeURIComponent(url)}`;
}

/** Complete PlayingCard with neutral defaults; configs override what they have. */
export function baseCard(): PlayingCard {
  return {
    object: "card",
    id: "",
    oracle_id: "",
    name: "",
    lang: "en",
    released_at: "",
    uri: "",
    scryfall_uri: "",
    layout: "normal",
    highres_image: true,
    image_status: "highres_scan",
    image_uris: undefined,
    cmc: 0,
    type_line: "",
    oracle_text: undefined,
    power: undefined,
    toughness: undefined,
    colors: [],
    color_identity: [],
    keywords: [],
    legalities: NOT_LEGAL,
    games: [],
    reserved: false,
    game_changer: false,
    foil: false,
    nonfoil: true,
    finishes: ["nonfoil"],
    oversized: false,
    promo: false,
    reprint: false,
    variation: false,
    set_id: "",
    set: "",
    set_name: "",
    set_type: "expansion",
    set_uri: "",
    set_search_uri: "",
    scryfall_set_uri: "",
    rulings_uri: "",
    prints_search_uri: "",
    collector_number: "",
    digital: false,
    rarity: "",
    artist: "",
    artist_ids: [],
    border_color: "black",
    frame: "2015",
    full_art: false,
    textless: false,
    booster: false,
    story_spotlight: false,
    prices: {
      usd: null,
      usd_foil: null,
      usd_etched: null,
      eur: null,
      eur_foil: null,
      tix: null,
    },
  };
}

export function imageUris(url: string | undefined): PlayingCard["image_uris"] {
  if (!url) return undefined;
  const proxied = proxyImage(url);
  return {
    small: proxied,
    normal: proxied,
    large: proxied,
    png: proxied,
    art_crop: proxied,
    border_crop: proxied,
  };
}

function extractCards(
  cfg: GenericGameConfig,
  json: unknown,
): Record<string, unknown>[] {
  const list = cfg.resultPath
    ? cfg.resultPath(json)
    : Array.isArray(json)
      ? json
      : (json as { data?: unknown } | null)?.data;
  return Array.isArray(list) ? (list as Record<string, unknown>[]) : [];
}

const MAX_SEARCH_RESULTS = 30;

// Full-catalog downloads (bulk sync + the no-id-endpoint searchById fallback)
// can be tens of MB — the default 15s per-call budget would kill them on
// slow links, so these sites get an explicit 2-minute budget. Search-style
// single responses keep the default.
const BULK_FETCH_TIMEOUT_MS = 120_000;

async function fetchRawById(
  cfg: GenericGameConfig,
  id: string,
  headers: Record<string, string>,
): Promise<Record<string, unknown> | null> {
  if (cfg.searchByIdUrl) {
    const url = cfg.searchByIdUrl.replace("{id}", encodeURIComponent(id));
    const res = await fetchWithRetry(url, { headers });
    if (res.ok) {
      return extractCards(cfg, await res.json())[0] ?? null;
    }
    return null;
  }
  // No id endpoint — filter the bulk catalog (fine for small catalogs).
  const res = await fetchWithRetry(cfg.bulkUrl, { headers }, { timeoutMs: BULK_FETCH_TIMEOUT_MS });
  if (!res.ok) return null;
  return extractCards(cfg, await res.json()).find((c) => cfg.cardId(c) === id) ?? null;
}

export function createSearchAdapter(cfg: GenericGameConfig): CardSearchAdapter {
  const headers = { "User-Agent": "MagicVault/1.0", Accept: "application/json", ...cfg.headers };

  async function search(query: string, _baseUrl: string): Promise<Result<PlayingCard[]>> {
    if (!query || query.trim().length < QUERY_MIN_LENGTH) {
      return { message: `Your query must be greater than ${QUERY_MIN_LENGTH}`, success: false };
    }
    const url = cfg.searchUrl.replace("{q}", encodeURIComponent(query));
    const response = await fetchWithRetry(url, { headers });
    if (!response.ok) {
      return { message: `Failed to fetch from ${cfg.label}.`, success: false };
    }
    let list = extractCards(cfg, await response.json());
    if (cfg.searchFilter) list = cfg.searchFilter(list, query);
    const cards = list.slice(0, MAX_SEARCH_RESULTS).map(cfg.toCard);
    if (cards.length === 0) {
      return { message: `No cards were found with the query: ${query}`, success: false };
    }
    return { message: "Cards successfully retrieved.", data: cards, success: true };
  }

  async function searchById(id: string, _baseUrl: string): Promise<Result<PlayingCard>> {
    const raw = await fetchRawById(cfg, id, headers);
    if (!raw) {
      return { success: false, message: `${cfg.label} API error: card ${id} not found.` };
    }
    return { success: true, message: "Successfully fetched card by id.", data: cfg.toCard(raw) };
  }

  return { defaultUrl: cfg.searchUrl, search, searchById };
}

export function createSyncSource(cfg: GenericGameConfig): SyncSource {
  const headers = { "User-Agent": "MagicVault/1.0", Accept: "application/json", ...cfg.headers };

  async function fetchCards(): Promise<SyncSourceCard[]> {
    const res = await fetchWithRetry(cfg.bulkUrl, { headers }, { timeoutMs: BULK_FETCH_TIMEOUT_MS });
    if (!res.ok) throw new Error(`${cfg.label} catalog fetch failed: ${res.status}`);
    return extractCards(cfg, await res.json()).map((raw) => ({
      id: cfg.cardId(raw),
      name: cfg.nameOf ? cfg.nameOf(raw) : (str(raw, "name") ?? ""),
      setCode: cfg.setCode(raw),
      imageUrl: cfg.imageUrl(raw),
      // Store the NORMALIZED card so hydration serves the right shape.
      cardData: cfg.toCard(raw),
    }));
  }

  async function fetchOne(id: string) {
    const raw = await fetchRawById(cfg, id, headers);
    if (!raw) return null;
    const card = cfg.toCard(raw);
    return {
      name: card.name,
      setCode: card.set,
      imageUrl: card.image_uris?.large?.startsWith("/api/")
        ? undefined
        : card.image_uris?.large,
    };
  }

  return {
    gameKey: cfg.key,
    label: cfg.label,
    defaultUrl: cfg.searchUrl,
    fetchHeaders: headers,
    fetchCards,
    fetchOne,
  };
}
