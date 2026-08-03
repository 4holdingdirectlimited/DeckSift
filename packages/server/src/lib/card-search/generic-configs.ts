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
