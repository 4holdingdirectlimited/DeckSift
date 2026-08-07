import { describe, expect, it } from "vitest";
import {
  evaluateCardBin,
  getByPath,
  getCatchAllBin,
  type SourceCard,
} from "./evaluate-bin";
import type {
  BinCondition,
  BinConfig,
  ConditionOperator,
} from "./interfaces/sort-bins.interface";
import { FIELD_DEFINITIONS } from "./constants/sort-bins.constant";

/** Minimal card shape used across the rule-engine tests. */
function card(overrides: Record<string, unknown> = {}): SourceCard {
  return {
    name: "Sol Ring",
    rarity: "uncommon",
    set: "ecc",
    cmc: 1,
    type_line: "Artifact",
    oracle_text: "{T}: Add {C}{C}.",
    color_identity: [],
    prices: { usd: "2.74", usd_foil: null },
    ...overrides,
  };
}

function bin(
  binNumber: number,
  rules: BinConfig["rules"],
  isCatchAll = false,
): BinConfig {
  return { guid: `bin-${binNumber}`, binNumber, rules, isCatchAll };
}

function condition(
  field: BinCondition["field"],
  operator: ConditionOperator,
  value: string | number | string[],
  id = "c1",
): BinCondition {
  return { id, field, operator, value };
}

describe("getByPath", () => {
  it("reads top-level keys", () => {
    expect(getByPath(card(), "name")).toBe("Sol Ring");
  });

  it("reads nested keys via dot paths", () => {
    expect(getByPath(card(), "prices.usd")).toBe("2.74");
    expect(getByPath(card({ prices: { usd_foil: "8.00" } }), "prices.usd_foil")).toBe("8.00");
  });

  it("returns undefined for missing paths without throwing", () => {
    expect(getByPath(card(), "prices.missing")).toBeUndefined();
    expect(getByPath(card(), "a.b.c.d")).toBeUndefined();
    expect(getByPath(card(), "oracle_text.length")).toBeUndefined(); // primitives don't recurse
  });
});

describe("getCatchAllBin", () => {
  it("returns the catch-all config when present", () => {
    const configs = [bin(1, { id: "g", combinator: "and", conditions: [condition("name", "equals", "X")] }), bin(7, { id: "g", combinator: "and", conditions: [] }, true)];
    expect(getCatchAllBin(configs)?.binNumber).toBe(7);
  });

  it("returns undefined when there is no catch-all", () => {
    expect(getCatchAllBin([bin(1, { id: "g", combinator: "and", conditions: [] })])).toBeUndefined();
  });
});

describe("evaluateCardBin — equality and string operators", () => {
  it("routes a W card to the white bin (array equals)", () => {
    const configs = [
      bin(1, { id: "g", combinator: "and", conditions: [condition("color_identity", "equals", ["W"])] }),
      bin(7, { id: "g", combinator: "and", conditions: [] }, true),
    ];
    expect(evaluateCardBin(card({ color_identity: ["W"] }), configs)?.binNumber).toBe(1);
  });

  it("routes a colorless card to the colorless bin and a G card to the catch-all", () => {
    const configs = [
      bin(1, { id: "g", combinator: "and", conditions: [condition("color_identity", "equals", ["W"])] }),
      bin(6, { id: "g", combinator: "and", conditions: [condition("color_identity", "equals", [])] }),
      bin(7, { id: "g", combinator: "and", conditions: [] }, true),
    ];
    expect(evaluateCardBin(card({ color_identity: [] }), configs)?.binNumber).toBe(6);
    expect(evaluateCardBin(card({ color_identity: ["G"] }), configs)?.binNumber).toBe(7);
  });

  it("evaluates equals on string fields", () => {
    const configs = [
      bin(2, { id: "g", combinator: "and", conditions: [condition("set", "equals", "ecc")] }),
    ];
    expect(evaluateCardBin(card(), configs)?.binNumber).toBe(2);
    expect(evaluateCardBin(card({ set: "ltr" }), configs)).toBeUndefined();
  });

  it("evaluates not_equals, contains and not_contains (case-insensitive)", () => {
    const configs = [
      bin(1, { id: "g", combinator: "and", conditions: [condition("type_line", "contains", "creature")] }),
      bin(2, { id: "g", combinator: "and", conditions: [condition("name", "not_contains", "sol")] }),
    ];
    expect(evaluateCardBin(card({ type_line: "Creature — Human Wizard" }), configs)?.binNumber).toBe(1);
    expect(evaluateCardBin(card({ type_line: "Artifact" }), configs)).toBeUndefined();
    expect(evaluateCardBin(card({ name: "Bolt" }), configs)?.binNumber).toBe(2);
    expect(evaluateCardBin(card(), configs)).toBeUndefined();
  });
});

describe("evaluateCardBin — numeric operators", () => {
  const configs = [
    bin(1, { id: "g", combinator: "and", conditions: [condition("price_usd", "gte", 10)] }),
    bin(2, { id: "g", combinator: "and", conditions: [condition("price_usd", "lt", 10)] }),
  ];

  it("coerces string prices to numbers", () => {
    expect(evaluateCardBin(card({ prices: { usd: "12.50" } }), configs)?.binNumber).toBe(1);
    expect(evaluateCardBin(card({ prices: { usd: "5.00" } }), configs)?.binNumber).toBe(2);
  });

  it("falls back to 0 when a numeric field is missing", () => {
    const cardWithoutPrice = card();
    delete (cardWithoutPrice as Record<string, unknown>).prices;
    expect(evaluateCardBin(cardWithoutPrice, configs)?.binNumber).toBe(2);
  });

  it("handles cmc comparisons", () => {
    const cmcBins = [bin(1, { id: "g", combinator: "and", conditions: [condition("cmc", "gt", 3)] })];
    expect(evaluateCardBin(card({ cmc: 5 }), cmcBins)?.binNumber).toBe(1);
    expect(evaluateCardBin(card({ cmc: 2 }), cmcBins)).toBeUndefined();
  });
});

describe("evaluateCardBin — set / enum operators", () => {
  it("evaluates in / not_in against a list", () => {
    const configs = [
      bin(1, { id: "g", combinator: "and", conditions: [condition("rarity", "in", ["mythic", "rare"])] }),
      bin(2, { id: "g", combinator: "and", conditions: [condition("rarity", "not_in", ["common"])] }),
    ];
    expect(evaluateCardBin(card({ rarity: "mythic" }), configs)?.binNumber).toBe(1);
    expect(evaluateCardBin(card({ rarity: "uncommon" }), configs)?.binNumber).toBe(2);
    expect(evaluateCardBin(card({ rarity: "common" }), configs)).toBeUndefined();
  });

  it("evaluates contains_any / contains_all / contains_none on color identity", () => {
    const configs = [
      bin(1, { id: "g", combinator: "and", conditions: [condition("color_identity", "contains_any", ["R", "G"])] }),
      bin(2, { id: "g", combinator: "and", conditions: [condition("color_identity", "contains_all", ["W", "U"])] }),
      bin(3, { id: "g", combinator: "and", conditions: [condition("color_identity", "contains_none", ["B"])] }),
    ];
    expect(evaluateCardBin(card({ color_identity: ["G"] }), configs)?.binNumber).toBe(1);
    expect(evaluateCardBin(card({ color_identity: ["W", "U"] }), configs)?.binNumber).toBe(2);
    expect(evaluateCardBin(card({ color_identity: ["W"] }), configs)?.binNumber).toBe(3);
    expect(evaluateCardBin(card({ color_identity: ["B"] }), configs)).toBeUndefined();
  });
});

describe("evaluateCardBin — group combinators and nesting", () => {
  it("requires all conditions with the and combinator", () => {
    const configs = [
      bin(1, {
        id: "g",
        combinator: "and",
        conditions: [
          condition("color_identity", "equals", ["W"]),
          condition("rarity", "equals", "rare"),
        ],
      }),
    ];
    expect(evaluateCardBin(card({ color_identity: ["W"], rarity: "rare" }), configs)?.binNumber).toBe(1);
    expect(evaluateCardBin(card({ color_identity: ["W"], rarity: "common" }), configs)).toBeUndefined();
  });

  it("matches with the or combinator when any condition holds", () => {
    const configs = [
      bin(1, {
        id: "g",
        combinator: "or",
        conditions: [
          condition("rarity", "equals", "mythic"),
          condition("price_usd", "gt", 100),
        ],
      }),
    ];
    expect(evaluateCardBin(card({ rarity: "mythic", prices: { usd: "1.00" } }), configs)?.binNumber).toBe(1);
    expect(evaluateCardBin(card({ rarity: "common", prices: { usd: "150.00" } }), configs)?.binNumber).toBe(1);
    expect(evaluateCardBin(card({ rarity: "common", prices: { usd: "5.00" } }), configs)).toBeUndefined();
  });

  it("supports nested rule groups", () => {
    const configs = [
      bin(1, {
        id: "g1",
        combinator: "or",
        conditions: [
          condition("rarity", "equals", "common"),
          {
            id: "g2",
            combinator: "and",
            conditions: [
              condition("rarity", "equals", "rare"),
              condition("price_usd", "gte", 20),
            ],
          },
        ],
      }),
    ];
    expect(evaluateCardBin(card({ rarity: "common" }), configs)?.binNumber).toBe(1);
    expect(evaluateCardBin(card({ rarity: "rare", prices: { usd: "25.00" } }), configs)?.binNumber).toBe(1);
    expect(evaluateCardBin(card({ rarity: "rare", prices: { usd: "5.00" } }), configs)).toBeUndefined();
  });

  it("never matches a group with zero conditions", () => {
    const configs = [
      bin(1, { id: "g", combinator: "and", conditions: [] }),
      bin(7, { id: "g", combinator: "and", conditions: [] }, true),
    ];
    expect(evaluateCardBin(card(), configs)?.binNumber).toBe(7);
  });
});

describe("evaluateCardBin — ordering and fallbacks", () => {
  it("returns the first matching rule bin and ignores later ones", () => {
    const configs = [
      bin(1, { id: "g", combinator: "and", conditions: [condition("rarity", "equals", "common")] }),
      bin(2, { id: "g", combinator: "and", conditions: [condition("rarity", "equals", "common")] }),
    ];
    expect(evaluateCardBin(card({ rarity: "common" }), configs)?.binNumber).toBe(1);
  });

  it("falls back to the catch-all when nothing matches", () => {
    const configs = [
      bin(1, { id: "g", combinator: "and", conditions: [condition("rarity", "equals", "mythic")] }),
      bin(7, { id: "g", combinator: "and", conditions: [] }, true),
    ];
    expect(evaluateCardBin(card({ rarity: "common" }), configs)?.binNumber).toBe(7);
  });

  it("returns undefined when nothing matches and there is no catch-all", () => {
    const configs = [bin(1, { id: "g", combinator: "and", conditions: [condition("rarity", "equals", "mythic")] })];
    expect(evaluateCardBin(card({ rarity: "common" }), configs)).toBeUndefined();
  });

  it("evaluates against the shared FIELD_DEFINITIONS by default", () => {
    // price_usd has path "prices.usd" in the default field definitions.
    const configs = [
      bin(1, { id: "g", combinator: "and", conditions: [condition("price_usd", "gt", 10)] }),
    ];
    const result = evaluateCardBin(card({ prices: { usd: "42.00" } }), configs);
    expect(result?.binNumber).toBe(1);
    expect(FIELD_DEFINITIONS.some((f) => f.field === "price_usd")).toBe(true);
  });
});
