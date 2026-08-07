import { describe, expect, it } from "vitest";
import { getCardFaceName, getCardImageUris } from "./scryfall";
import type { PlayingCard } from "./interfaces/scryfall.interface";

const imageUris = {
  small: "small.jpg",
  normal: "normal.jpg",
  large: "large.jpg",
  png: "card.png",
  art_crop: "art.jpg",
  border_crop: "border.jpg",
};

function card(overrides: Partial<PlayingCard>): PlayingCard {
  return {
    object: "card",
    id: "id-1",
    oracle_id: "oracle-1",
    name: "Delver of Secrets",
    lang: "en",
    released_at: "2011-09-30",
    uri: "https://api.scryfall.com/cards/id-1",
    scryfall_uri: "https://scryfall.com/card/isd/4",
    layout: "transform",
    highres_image: true,
    image_status: "highres_scan",
    cmc: 1,
    type_line: "Creature — Human Wizard",
    color_identity: ["U"],
    legalities: { standard: "not_legal" } as PlayingCard["legalities"],
    games: ["paper"],
    reserved: false,
    game_changer: false,
    foil: false,
    nonfoil: true,
    finishes: ["nonfoil"],
    oversized: false,
    promo: false,
    reprint: false,
    variation: false,
    set_id: "set-1",
    set: "isd",
    set_name: "Innistrad",
    set_type: "expansion",
    set_uri: "",
    set_search_uri: "",
    scryfall_set_uri: "",
    rulings_uri: "",
    prints_search_uri: "",
    collector_number: "4",
    digital: false,
    rarity: "uncommon",
    artist: "Nils Hamm",
    artist_ids: [],
    border_color: "black",
    frame: "2003",
    full_art: false,
    textless: false,
    booster: true,
    story_spotlight: false,
    prices: { usd: null, usd_foil: null, usd_etched: null, eur: null, eur_foil: null, tix: null },
    ...overrides,
  };
}

describe("getCardImageUris", () => {
  it("prefers top-level image_uris", () => {
    expect(getCardImageUris(card({ image_uris: imageUris }))).toBe(imageUris);
  });

  it("falls back to the first card face for double-faced cards", () => {
    const dfc = card({
      image_uris: undefined,
      card_faces: [{ name: "Delver of Secrets", image_uris: imageUris }],
    });
    expect(getCardImageUris(dfc)).toBe(imageUris);
  });

  it("returns undefined when no image exists anywhere", () => {
    const noImage = card({ image_uris: undefined, card_faces: [{ name: "Delver of Secrets" }] });
    expect(getCardImageUris(noImage)).toBeUndefined();
  });
});

describe("getCardFaceName", () => {
  it("returns the front-face name for double-faced cards", () => {
    const dfc = card({
      card_faces: [
        { name: "Delver of Secrets" },
        { name: "Insectile Aberration" },
      ],
    });
    expect(getCardFaceName(dfc)).toBe("Delver of Secrets");
  });

  it("returns the card name for single-faced cards", () => {
    expect(getCardFaceName(card({ name: "Birds of Paradise" }))).toBe("Birds of Paradise");
  });
});
