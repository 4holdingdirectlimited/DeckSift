import type {
  BinCondition,
  BinRuleGroup,
} from "../interfaces/sort-bins.interface";
import { FieldMeta } from "../interfaces/sort-bins.interface";

export const BIN_COUNT = 7;

// ─── Physical bin capacity (overflow protection) ─────────────────────────────
// The machine has three bin depths: 155 mm (module 1, nearest the feeder),
// 110 mm (module 2), 65 mm (module 3), and a 60 mm reject/catch-all channel.
// These are the total usable card heights in millimetres. The per-bin card
// limit is derived so a run can never overflow a bin:
//
//   maxCapacity = floor((binHeightMm / cardThicknessMm) * headroom)
//
// with a 10% headroom so the top cards never jam against the mechanism above
// the stack. Average unsleeved trading-card thickness is ~0.3 mm; a card in a
// premium sleeve is roughly ~0.7 mm (v2 sleeve-tolerant work halves capacity).
export const CARD_THICKNESS_MM = 0.3;
export const CARD_THICKNESS_SLEEVED_MM = 0.7;
export const BIN_HEADROOM_FACTOR = 0.9;
/** Bin number → usable card height in mm. */
export const BIN_HEIGHTS_MM: Record<number, number> = {
  1: 155,
  2: 155,
  3: 110,
  4: 110,
  5: 65,
  6: 65,
  7: 60,
};

/**
 * Card capacity of a bin. Pass a sleeved thickness to compute the v2
 * sleeve-tolerant limits; the default keeps the unsleeved behaviour.
 */
export function computeBinCapacity(
  binNumber: number,
  thickness = CARD_THICKNESS_MM,
): number {
  const height = BIN_HEIGHTS_MM[binNumber];
  if (!height) return 0;
  return Math.floor((height / thickness) * BIN_HEADROOM_FACTOR);
}

export function computeAllBinCapacities(): Record<number, number> {
  const result: Record<number, number> = {};
  for (let bin = 1; bin <= BIN_COUNT; bin++) {
    result[bin] = computeBinCapacity(bin);
  }
  return result;
}

export const SET_NAME_MAX_LENGTH = 50;
export const CONDITION_STRING_MAX_LENGTH = 200;
export const CONDITION_NUMERIC_MAX = 100_000;

export const FIELD_DEFINITIONS: FieldMeta[] = [
  {
    field: "rarity",
    label: "Rarity",
    type: "enum",
    path: "rarity",
    operators: [
      { value: "in", label: "is any of" },
      { value: "not_in", label: "is none of" },
      { value: "equals", label: "equals" },
      { value: "not_equals", label: "does not equal" },
    ],
    options: [
      { value: "common", label: "Common" },
      { value: "uncommon", label: "Uncommon" },
      { value: "rare", label: "Rare" },
      { value: "mythic", label: "Mythic" },
      { value: "special", label: "Special" },
      { value: "bonus", label: "Bonus" },
    ],
  },
  {
    field: "color_identity",
    label: "Color Identity",
    type: "set",
    path: "color_identity",
    operators: [
      { value: "contains_any", label: "contains any of" },
      { value: "contains_all", label: "contains all of" },
      { value: "contains_none", label: "contains none of" },
      { value: "equals", label: "is exactly" },
    ],
    options: [
      { value: "W", label: "White" },
      { value: "U", label: "Blue" },
      { value: "B", label: "Black" },
      { value: "R", label: "Red" },
      { value: "G", label: "Green" },
    ],
  },
  {
    field: "type_line",
    label: "Type Line",
    type: "string",
    path: "type_line",
    operators: [
      { value: "contains", label: "contains" },
      { value: "not_contains", label: "does not contain" },
      { value: "equals", label: "equals" },
      { value: "not_equals", label: "does not equal" },
    ],
  },
  {
    field: "set",
    label: "Set Code",
    type: "string",
    path: "set",
    operators: [
      { value: "equals", label: "equals" },
      { value: "not_equals", label: "does not equal" },
      { value: "in", label: "is any of" },
      { value: "not_in", label: "is none of" },
    ],
  },
  {
    field: "price_usd",
    label: "Price (USD)",
    type: "numeric",
    path: "prices.usd",
    operators: [
      { value: "gt", label: "greater than" },
      { value: "gte", label: "greater than or equal" },
      { value: "lt", label: "less than" },
      { value: "lte", label: "less than or equal" },
      { value: "equals", label: "equals" },
    ],
  },
  {
    field: "price_usd_foil",
    label: "Price (USD, Foil)",
    type: "numeric",
    path: "prices.usd_foil",
    operators: [
      { value: "gt", label: "greater than" },
      { value: "gte", label: "greater than or equal" },
      { value: "lt", label: "less than" },
      { value: "lte", label: "less than or equal" },
      { value: "equals", label: "equals" },
    ],
  },
  {
    field: "cmc",
    label: "Mana Value",
    type: "numeric",
    path: "cmc",
    operators: [
      { value: "equals", label: "equals" },
      { value: "gt", label: "greater than" },
      { value: "gte", label: "greater than or equal" },
      { value: "lt", label: "less than" },
      { value: "lte", label: "less than or equal" },
    ],
  },
  {
    field: "name",
    label: "Name",
    type: "string",
    path: "name",
    operators: [
      { value: "contains", label: "contains" },
      { value: "not_contains", label: "does not contain" },
      { value: "equals", label: "equals" },
      { value: "not_equals", label: "does not equal" },
    ],
  },
  {
    field: "description",
    label: "Description",
    type: "string",
    path: "oracle_text",
    operators: [
      { value: "contains", label: "contains" },
      { value: "not_contains", label: "does not contain" },
      { value: "equals", label: "equals" },
      { value: "not_equals", label: "does not equal" },
    ],
  },
];

export type DefaultBinInit = {
  binNumber: number;
  rules: BinRuleGroup;
  isCatchAll: boolean;
  maxCapacity?: number;
};

const COLOR_BINS: Array<{ binNumber: number; colors: string[] }> = [
  { binNumber: 1, colors: ["W"] },
  { binNumber: 2, colors: ["U"] },
  { binNumber: 3, colors: ["B"] },
  { binNumber: 4, colors: ["R"] },
  { binNumber: 5, colors: ["G"] },
  { binNumber: 6, colors: [] },
];

export function createDefaultColorBins(): DefaultBinInit[] {
  return [
    ...COLOR_BINS.map(({ binNumber, colors }) => ({
      binNumber,
      isCatchAll: false,
      rules: {
        id: crypto.randomUUID(),
        combinator: "and" as const,
        conditions: [
          {
            id: crypto.randomUUID(),
            field: "color_identity",
            operator: "equals",
            value: colors,
          } satisfies BinCondition,
        ],
      } satisfies BinRuleGroup,
    })),
    {
      binNumber: 7,
      isCatchAll: true,
      rules: {
        id: crypto.randomUUID(),
        combinator: "and" as const,
        conditions: [],
      } satisfies BinRuleGroup,
    },
  ];
}

export function createDefaultCatchAllOnlyBins(): DefaultBinInit[] {
  return Array.from({ length: BIN_COUNT }, (_, i) => ({
    binNumber: i + 1,
    isCatchAll: i === BIN_COUNT - 1,
    rules: {
      id: crypto.randomUUID(),
      combinator: "and" as const,
      conditions: [],
    } satisfies BinRuleGroup,
  }));
}
