import type { PlayingCard } from "@magic-vault/shared";
import {
  baseCard,
  imageUris,
  num,
  str,
  type GenericGameConfig,
} from "./generic";

// ─── Yu-Gi-Oh! (YGOPRODeck) ────────────────────────────────────────────────────
// Verified endpoints (2026-08): cardinfo.php returns {data:[card]} where each
// card has card_sets[] (set_code + set_rarity per printing), atk/def/level,
// attribute, race, archetype, and a stable numeric id. Images at
// images.ygoprodeck.com/images/cards/{id}.jpg.

export const yugiohConfig: GenericGameConfig = {
  key: "yugioh",
  label: "Yu-Gi-Oh! (YGOPRODeck)",
  searchUrl: "https://db.ygoprodeck.com/api/v7/cardinfo.php?fname={q}",
  searchByIdUrl: "https://db.ygoprodeck.com/api/v7/cardinfo.php?id={id}",
  bulkUrl: "https://db.ygoprodeck.com/api/v7/cardinfo.php",
  resultPath: (json) => (json as { data?: unknown } | null)?.data as unknown[],
  cardId: (raw) => String(raw.id ?? ""),
  setCode: (raw) => {
    const sets = raw.card_sets;
    if (Array.isArray(sets) && sets.length > 0) {
      return String((sets[0] as { set_code?: unknown }).set_code ?? "");
    }
    return "";
  },
  imageUrl: (raw) => `https://images.ygoprodeck.com/images/cards/${raw.id ?? ""}.jpg`,
  toCard: (raw): PlayingCard => {
    const id = String(raw.id ?? "");
    const firstSet = Array.isArray(raw.card_sets) ? (raw.card_sets[0] as Record<string, unknown> | undefined) : undefined;
    const card = baseCard();
    card.id = id;
    card.oracle_id = id;
    card.name = str(raw, "name") ?? "";
    card.scryfall_uri = str(raw, "ygoprodeck_url") ?? "";
    card.type_line = [str(raw, "type"), str(raw, "race")]
      .filter(Boolean)
      .join(" - ");
    card.oracle_text = str(raw, "desc") ?? undefined;
    card.power = num(raw, "atk") != null ? String(num(raw, "atk")) : undefined;
    card.toughness = num(raw, "def") != null ? String(num(raw, "def")) : undefined;
    const attribute = str(raw, "attribute");
    card.colors = attribute ? [attribute] : [];
    card.color_identity = card.colors;
    card.keywords = [str(raw, "archetype"), str(raw, "race")].filter(
      (k): k is string => !!k,
    );
    card.image_uris = imageUris(
      id ? `https://images.ygoprodeck.com/images/cards/${id}.jpg` : undefined,
    );
    // Rarity is per-printing; use the first set's. YGO rarities above Rare
    // (Super/Ultra/Secret/Ghost) are physically foil — physical foil status is
    // determined by the scan light, not this field.
    card.rarity = firstSet ? (str(firstSet, "set_rarity")?.toLowerCase() ?? "") : "";
    card.set = firstSet ? (str(firstSet, "set_code") ?? "") : "";
    card.set_id = card.set;
    card.set_name = firstSet ? (str(firstSet, "set_name") ?? "") : "";
    card.collector_number = card.set;
    // YGOPRODeck ships live market prices (tcgplayer/cardmarket) — map them
    // onto prices.usd/eur so value-based bin rules work.
    const priceRow = Array.isArray(raw.card_prices)
      ? (raw.card_prices[0] as Record<string, unknown> | undefined)
      : undefined;
    if (priceRow) {
      const usd = str(priceRow, "tcgplayer_price");
      const eur = str(priceRow, "cardmarket_price");
      card.prices.usd = usd && parseFloat(usd) > 0 ? usd : null;
      card.prices.eur = eur && parseFloat(eur) > 0 ? eur : null;
    }
    return card;
  },
};

/**
 * Digimon rarities come back as inconsistent codes (c/C, u/U, r/R, sr/SR,
 * sec/SEC, p/P, …). Normalize them to the human-readable names the field
 * definitions and bundle recipes use, so rarity binning and bundles work
 * without the operator typing raw codes.
 */
function rarityName(raw: string | undefined): string {
  const code = (raw ?? "").trim().toLowerCase();
  switch (code) {
    case "c":
      return "common";
    case "u":
      return "uncommon";
    case "r":
      return "rare";
    case "rc":
      return "rare";
    case "sr":
      return "super rare";
    case "sec":
      return "secret rare";
    case "ur":
      return "ultra rare";
    case "p":
      return "promo";
    default:
      return code; // unknown codes pass through rather than silently misrouting
  }
}

// ─── Digimon Card Game (digimoncard.io) ─────────────────────────────────────────
// Verified endpoints (2026-08): search?n={q} returns a plain array of card
// objects (id like "ST1-03", color, rarity codes c/u/r/sr/sec/..., stage, form,
// DP, effects, set_name[]). The full-detail catalog is search?series=
// "Digimon Card Game" (~9 MB, ~9k cards with complete fields — the slim
// getAllCards.php bulk only has name + cardnumber, so it is not used). Images
// at images.digimoncard.io/images/cards/{id}.jpg. No id endpoint, so searchById
// filters the bulk catalog.

export const digimonConfig: GenericGameConfig = {
  key: "digimon",
  label: "Digimon Card Game (digimoncard.io)",
  searchUrl: "https://digimoncard.io/api-public/search?n={q}",
  bulkUrl:
    "https://digimoncard.io/api-public/search?series=Digimon%20Card%20Game",
  cardId: (raw) => str(raw, "id") ?? "",
  setCode: (raw) => (str(raw, "id") ?? "").split("-")[0] ?? "",
  imageUrl: (raw) =>
    raw.id ? `https://images.digimoncard.io/images/cards/${raw.id}.jpg` : undefined,
  toCard: (raw): PlayingCard => {
    const id = str(raw, "id") ?? "";
    const card = baseCard();
    card.id = id;
    card.oracle_id = id;
    card.name = str(raw, "name") ?? "";
    card.type_line = [
      str(raw, "type"),
      str(raw, "stage"),
      str(raw, "form"),
      str(raw, "digi_type"),
      str(raw, "attribute"),
    ]
      .filter(Boolean)
      .join(" - ");
    card.oracle_text = [
      str(raw, "main_effect"),
      str(raw, "source_effect"),
      str(raw, "alt_effect"),
    ]
      .filter(Boolean)
      .join("\n\n") || undefined;
    card.power = num(raw, "dp") != null ? String(num(raw, "dp")) : undefined;
    card.cmc = num(raw, "play_cost") ?? 0;
    const color = str(raw, "color");
    card.colors = color ? [color] : [];
    card.color_identity = card.colors;
    card.image_uris = imageUris(
      id ? `https://images.digimoncard.io/images/cards/${id}.jpg` : undefined,
    );
    card.rarity = rarityName(str(raw, "rarity"));
    const setNames = raw.set_name;
    card.set_name =
      Array.isArray(setNames) && setNames.length > 0
        ? String(setNames[0])
        : (str(raw, "set_name") ?? "");
    card.set = id.split("-")[0] ?? "";
    card.set_id = card.set;
    card.collector_number = id;
    return card;
  },
};

// ─── Disney Lorcana (lorcana-api.com) ─────────────────────────────────────────
// Verified endpoints (2026-08): /cards/all returns the complete catalog
// (2,694 cards across 13 sets, official Ravensburger artwork, no pagination
// needed — every card in one response). /cards/fetch accepts ?page=N but does
// NOT filter by name, so search is done client-side over the catalog via
// searchFilter (15-min cache makes repeat searches cheap). Fields: Unique_ID
// (e.g. "AOV-001"), Set_ID/Set_Name/Set_Num, Name, Rarity, Type,
// Classifications, Cost, Inkable, Lore, Strength, Willpower, Body_Text,
// Color, Artist, Card_Num, Image.

export const lorcanaConfig: GenericGameConfig = {
  key: "lorcana",
  label: "Disney Lorcana (lorcana-api.com)",
  searchUrl: "https://api.lorcana-api.com/cards/all",
  bulkUrl: "https://api.lorcana-api.com/cards/all",
  searchFilter: (cards, query) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return cards;
    return cards.filter((c) =>
      (str(c, "Name") ?? "").toLowerCase().includes(needle),
    );
  },
  cardId: (raw) => str(raw, "Unique_ID") ?? "",
  nameOf: (raw) => str(raw, "Name") ?? "",
  setCode: (raw) => str(raw, "Set_ID") ?? "",
  imageUrl: (raw) => str(raw, "Image"),
  toCard: (raw): PlayingCard => {
    const id = str(raw, "Unique_ID") ?? "";
    const card = baseCard();
    card.id = id;
    card.oracle_id = id;
    card.name = str(raw, "Name") ?? "";
    card.type_line = [str(raw, "Type"), str(raw, "Classifications")]
      .filter(Boolean)
      .join(" - ");
    card.oracle_text = str(raw, "Body_Text") ?? undefined;
    card.cmc = num(raw, "Cost") ?? 0;
    card.power =
      num(raw, "Strength") != null ? String(num(raw, "Strength")) : undefined;
    card.toughness =
      num(raw, "Willpower") != null ? String(num(raw, "Willpower")) : undefined;
    const color = str(raw, "Color");
    card.colors = color ? [color] : [];
    card.color_identity = card.colors;
    card.keywords = [
      str(raw, "Classifications"),
      raw.Inkable === true ? "inkable" : "non-inkable",
    ].filter((k): k is string => !!k);
    card.image_uris = imageUris(str(raw, "Image"));
    // Lorcana rarities: Common/Uncommon/Rare/Super Rare/Legendary/Epic/
    // Enchanted/Iconic (lowercased to match the field definitions + bundles).
    card.rarity = (str(raw, "Rarity") ?? "").toLowerCase();
    card.set = str(raw, "Set_ID") ?? "";
    card.set_id = card.set;
    card.set_name = str(raw, "Set_Name") ?? "";
    card.collector_number =
      num(raw, "Card_Num") != null ? String(num(raw, "Card_Num")) : "";
    card.artist = str(raw, "Artist") ?? "";
    return card;
  },
};

/** CamelCase rarity codes ("SuperRare") → spaced lowercase ("super rare"). */
function spacedRarity(raw: string | undefined): string {
  return (raw ?? "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .trim();
}

// ─── One Piece Card Game (punk-records dataset) ────────────────────────────────
// Verified 2026-08: english/index/cards_by_id.json is a JSON OBJECT keyed by
// card id (e.g. "EB01-001") — resultPath converts it to an array. 4,672 cards,
// every one with an image on the official Bandai CDN (en.onepiece-cardgame.com).
// Static file, so search is filtered client-side via searchFilter.

export const onePieceConfig: GenericGameConfig = {
  key: "onepiece",
  label: "One Piece Card Game (punk-records dataset)",
  searchUrl:
    "https://raw.githubusercontent.com/buhbbl/punk-records/main/english/index/cards_by_id.json",
  bulkUrl:
    "https://raw.githubusercontent.com/buhbbl/punk-records/main/english/index/cards_by_id.json",
  resultPath: (json) => Object.values((json as Record<string, unknown>) ?? {}),
  searchFilter: (cards, query) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return cards;
    return cards.filter((c) =>
      (str(c, "name") ?? "").toLowerCase().includes(needle),
    );
  },
  cardId: (raw) => str(raw, "card_id") ?? "",
  nameOf: (raw) => str(raw, "name") ?? "",
  setCode: (raw) => (str(raw, "card_id") ?? "").split("-")[0] ?? "",
  imageUrl: (raw) => str(raw, "img_url"),
  toCard: (raw): PlayingCard => {
    const id = str(raw, "card_id") ?? "";
    const card = baseCard();
    card.id = id;
    card.oracle_id = id;
    card.name = str(raw, "name") ?? "";
    card.type_line = [str(raw, "category"), (str(raw, "types") ?? "")]
      .filter(Boolean)
      .join(" - ");
    card.oracle_text = (str(raw, "keywords") ?? "") || undefined;
    card.cmc = num(raw, "cost") ?? 0;
    card.power =
      num(raw, "power") != null ? String(num(raw, "power")) : undefined;
    card.toughness =
      num(raw, "counter") != null ? String(num(raw, "counter")) : undefined;
    const colors = raw.colors;
    card.colors = Array.isArray(colors)
      ? colors.map(String)
      : colors
        ? [String(colors)]
        : [];
    card.color_identity = card.colors;
    card.image_uris = imageUris(str(raw, "img_url"));
    card.rarity = spacedRarity(str(raw, "rarity"));
    card.set = (id.split("-")[0] ?? "").toUpperCase();
    card.set_id = card.set;
    card.collector_number = id;
    return card;
  },
};

// ─── Star Wars: Unlimited (swu-cards-json dataset) ─────────────────────────────
// Verified 2026-08: data/v1/all-cards.json — 9,058 cards, 9,057 with official
// FFG CDN art (cdn.starwarsunlimited.com). Multi-locale: name/front_image_url/
// rules_text are objects keyed by locale — the accessors pick .en. The file is
// 53 MB, so search fetches + filters it client-side (15-min cache per query).

export const starWarsConfig: GenericGameConfig = {
  key: "starwars",
  label: "Star Wars: Unlimited (swu-cards-json dataset)",
  searchUrl:
    "https://raw.githubusercontent.com/Team-Zura/swu-cards-json/main/data/v1/all-cards.json",
  bulkUrl:
    "https://raw.githubusercontent.com/Team-Zura/swu-cards-json/main/data/v1/all-cards.json",
  searchFilter: (cards, query) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return cards;
    return cards.filter((c) => {
      const name = (c.name as { en?: string } | undefined)?.en ?? "";
      return name.toLowerCase().includes(needle);
    });
  },
  cardId: (raw) => String(raw.serial_code ?? raw.id ?? ""),
  nameOf: (raw) => (raw.name as { en?: string } | undefined)?.en ?? "",
  setCode: (raw) => (raw.set as { code?: string } | undefined)?.code ?? "",
  imageUrl: (raw) =>
    (raw.front_image_url as { en?: string } | undefined)?.en,
  toCard: (raw): PlayingCard => {
    const id = String(raw.serial_code ?? raw.id ?? "");
    const card = baseCard();
    const name = (raw.name as { en?: string } | undefined)?.en ?? "";
    card.id = id;
    card.oracle_id = id;
    card.name = name;
    card.type_line = str(raw, "type") ?? "";
    card.oracle_text =
      (raw.rules_text as { en?: string } | undefined)?.en || undefined;
    card.cmc = num(raw, "cost") ?? 0;
    card.power =
      num(raw, "power") != null ? String(num(raw, "power")) : undefined;
    card.toughness =
      num(raw, "hp") != null ? String(num(raw, "hp")) : undefined;
    const aspects = raw.aspects;
    card.colors = Array.isArray(aspects) ? aspects.map(String) : [];
    card.color_identity = card.colors;
    card.keywords = Array.isArray(raw.keywords)
      ? raw.keywords.map(String)
      : [];
    card.image_uris = imageUris(
      (raw.front_image_url as { en?: string } | undefined)?.en,
    );
    card.rarity = (str(raw, "rarity") ?? "").toLowerCase();
    card.set = (raw.set as { code?: string } | undefined)?.code ?? "";
    card.set_id = card.set;
    card.set_name = (raw.set as { name?: string } | undefined)?.name ?? "";
    card.collector_number = str(raw, "number") ?? "";
    card.artist = str(raw, "artist") ?? "";
    return card;
  },
};

// ─── Union Arena (union-arena-tcg-data dataset) ────────────────────────────────
// Verified 2026-08: cards/en/general.json — 541 cards, all with official Bandai
// art (www.unionarena-tcg.com CDN). Rarity codes stay as-is, lowercased
// (c/u/r/sr/ur + the ★ parallel variants). Static file → client-side search.

export const unionArenaConfig: GenericGameConfig = {
  key: "unionarena",
  label: "Union Arena (union-arena-tcg-data dataset)",
  searchUrl:
    "https://raw.githubusercontent.com/apitcg/union-arena-tcg-data/main/cards/en/general.json",
  bulkUrl:
    "https://raw.githubusercontent.com/apitcg/union-arena-tcg-data/main/cards/en/general.json",
  searchFilter: (cards, query) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return cards;
    return cards.filter((c) =>
      (str(c, "name") ?? "").toLowerCase().includes(needle),
    );
  },
  cardId: (raw) => str(raw, "id") ?? "",
  nameOf: (raw) => str(raw, "name") ?? "",
  setCode: (raw) => (str(raw, "id") ?? "").split("-")[0] ?? "",
  imageUrl: (raw) =>
    (raw.images as { large?: string } | undefined)?.large ??
    (raw.images as { small?: string } | undefined)?.small,
  toCard: (raw): PlayingCard => {
    const id = str(raw, "id") ?? "";
    const card = baseCard();
    card.id = id;
    card.oracle_id = id;
    card.name = str(raw, "name") ?? "";
    card.type_line = [str(raw, "type"), str(raw, "affinity")]
      .filter(Boolean)
      .join(" - ");
    card.oracle_text = [str(raw, "effect"), str(raw, "trigger")]
      .filter(Boolean)
      .join("\n\n") || undefined;
    card.cmc = num(raw, "ap") ?? 0;
    card.power =
      num(raw, "bp") != null ? String(num(raw, "bp")) : undefined;
    card.image_uris = imageUris(
      (raw.images as { large?: string } | undefined)?.large ??
        (raw.images as { small?: string } | undefined)?.small,
    );
    // UA rarity codes ("C", "U", "R", "SR", "SR★", …) stay as codes,
    // lowercased — matches the seeded field definitions.
    card.rarity = (str(raw, "rarity") ?? "").toLowerCase();
    card.set = (id.split("-")[0] ?? "").toUpperCase();
    card.set_id = card.set;
    card.set_name = (raw.set as { name?: string } | undefined)?.name ?? "";
    card.collector_number = id;
    return card;
  },
};

/** FAB rarity codes → names (see rarity.json in the fab-cube repo). */
const FAB_RARITIES: Record<string, string> = {
  C: "common",
  R: "rare",
  S: "super rare",
  M: "majestic",
  L: "legendary",
  F: "fabled",
  T: "token",
  B: "basic",
  V: "marvel",
  P: "promo",
};

// ─── Flesh and Blood (the-fab-cube/flesh-and-blood-cards) ─────────────────────
// Verified 2026-08: json/english/card-flattened.json is already one row per
// printing (16,260 printings) and every row carries a live image_url (Google
// Storage / S3 / CloudFront — fabdb.net itself is unreachable from this
// machine, but the dataset's image CDNs are not). Rarity codes map to names
// via FAB_RARITIES. 39 MB catalog → client-side search, cached 15 min.

export const fleshAndBloodConfig: GenericGameConfig = {
  key: "fab",
  label: "Flesh and Blood (fab-cube dataset)",
  searchUrl:
    "https://raw.githubusercontent.com/the-fab-cube/flesh-and-blood-cards/main/json/english/card-flattened.json",
  bulkUrl:
    "https://raw.githubusercontent.com/the-fab-cube/flesh-and-blood-cards/main/json/english/card-flattened.json",
  searchFilter: (cards, query) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return cards;
    return cards.filter((c) =>
      (str(c, "name") ?? "").toLowerCase().includes(needle),
    );
  },
  cardId: (raw) => str(raw, "unique_id") ?? "",
  nameOf: (raw) => str(raw, "name") ?? "",
  setCode: (raw) => str(raw, "set_id") ?? "",
  imageUrl: (raw) => str(raw, "image_url"),
  toCard: (raw): PlayingCard => {
    const id = str(raw, "unique_id") ?? "";
    const card = baseCard();
    card.id = id;
    card.oracle_id = id;
    card.name = str(raw, "name") ?? "";
    card.type_line = str(raw, "type_text") ?? "";
    card.oracle_text = str(raw, "functional_text_plain") || undefined;
    card.cmc = num(raw, "cost") ?? 0;
    card.power =
      num(raw, "power") != null ? String(num(raw, "power")) : undefined;
    card.toughness =
      num(raw, "defense") != null ? String(num(raw, "defense")) : undefined;
    const color = str(raw, "color");
    card.colors = color && color !== "-" ? [color] : [];
    card.color_identity = card.colors;
    card.keywords = Array.isArray(raw.card_keywords)
      ? raw.card_keywords.map(String)
      : [];
    card.image_uris = imageUris(str(raw, "image_url"));
    card.rarity = FAB_RARITIES[str(raw, "rarity") ?? ""] ?? "";
    card.set = str(raw, "set_id") ?? "";
    card.set_id = card.set;
    card.collector_number = str(raw, "id") ?? "";
    card.artist = Array.isArray(raw.artists)
      ? (raw.artists as string[])[0] ?? ""
      : "";
    return card;
  },
};

/** Pokémon TCG Pocket rarity codes → names (see rarities.json). */
const POCKET_RARITIES: Record<string, string> = {
  C: "common",
  U: "uncommon",
  R: "rare",
  RR: "double rare",
  AR: "art rare",
  SR: "super rare",
  SAR: "special art rare",
  IM: "immersive rare",
  UR: "crown rare",
  S: "shiny",
  SSR: "shiny super rare",
};

// ─── Pokémon TCG Pocket (flibustier/pokemon-tcg-pocket-database) ──────────────
// Verified 2026-08: dist/cards.json has 3,761 cards; each (set, number) pair is
// unique, so images resolve 1:1 from the companion pokemon-tcg-exchange repo at
// public/images/cards-by-set/{set}/{number}.webp. Rarity codes map via
// POCKET_RARITIES. Static file → client-side search.

export const pocketConfig: GenericGameConfig = {
  key: "pokemonpocket",
  label: "Pokémon TCG Pocket (flibustier database)",
  searchUrl:
    "https://raw.githubusercontent.com/flibustier/pokemon-tcg-pocket-database/main/dist/cards.json",
  bulkUrl:
    "https://raw.githubusercontent.com/flibustier/pokemon-tcg-pocket-database/main/dist/cards.json",
  searchFilter: (cards, query) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return cards;
    return cards.filter((c) =>
      (str(c, "name") ?? "").toLowerCase().includes(needle),
    );
  },
  cardId: (raw) => `${str(raw, "set") ?? ""}-${num(raw, "number") ?? ""}`,
  nameOf: (raw) => str(raw, "name") ?? "",
  setCode: (raw) => str(raw, "set") ?? "",
  imageUrl: (raw) =>
    `https://raw.githubusercontent.com/flibustier/pokemon-tcg-exchange/main/public/images/cards-by-set/${str(raw, "set") ?? ""}/${num(raw, "number") ?? ""}.webp`,
  toCard: (raw): PlayingCard => {
    const id = `${str(raw, "set") ?? ""}-${num(raw, "number") ?? ""}`;
    const card = baseCard();
    card.id = id;
    card.oracle_id = id;
    card.name = str(raw, "name") ?? "";
    card.type_line = "Pokémon";
    card.cmc = 0;
    card.image_uris = imageUris(
      `https://raw.githubusercontent.com/flibustier/pokemon-tcg-exchange/main/public/images/cards-by-set/${str(raw, "set") ?? ""}/${num(raw, "number") ?? ""}.webp`,
    );
    card.rarity = POCKET_RARITIES[str(raw, "rarity") ?? ""] ?? "";
    card.set = str(raw, "set") ?? "";
    card.set_id = card.set;
    card.collector_number = id;
    return card;
  },
};
