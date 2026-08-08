import type {
  FieldMeta,
  PlayingCardWithDistance,
  ScannedCard,
} from "@magic-vault/shared";
import { getByPath } from "@magic-vault/shared";

function csvEscape(val: string): string {
  return val.includes(",") || val.includes('"')
    ? `"${val.replace(/"/g, '""')}"`
    : val;
}

function groupByCardId(
  cards: ScannedCard[],
): Map<string, { card: PlayingCardWithDistance; quantity: number }> {
  const grouped = new Map<
    string,
    { card: PlayingCardWithDistance; quantity: number }
  >();
  for (const entry of cards) {
    const existing = grouped.get(entry.card.id);
    if (existing) existing.quantity++;
    else grouped.set(entry.card.id, { card: entry.card, quantity: 1 });
  }
  return grouped;
}

function groupByCardIdAndFoil(
  cards: ScannedCard[],
): Map<
  string,
  { card: PlayingCardWithDistance; quantity: number; isFoil: boolean }
> {
  const grouped = new Map<
    string,
    { card: PlayingCardWithDistance; quantity: number; isFoil: boolean }
  >();
  for (const entry of cards) {
    const isFoil = !!entry.isFoil;
    const key = `${entry.card.id}:${isFoil}`;
    const existing = grouped.get(key);
    if (existing) existing.quantity++;
    else grouped.set(key, { card: entry.card, quantity: 1, isFoil });
  }
  return grouped;
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const dateSuffix = () => new Date().toISOString().slice(0, 10);

export function exportToManabox(cards: ScannedCard[], collection: string) {
  if (cards.length === 0) return;
  const grouped = groupByCardId(cards);
  const headers = [
    "Name",
    "Set code",
    "Set name",
    "Collector number",
    "Foil",
    "Quantity",
    "Scryfall ID",
    "Condition",
    "Language",
    "Purchase price",
  ];
  const rows = Array.from(grouped.values()).map(({ card, quantity }) => [
    csvEscape(card.name),
    card.set.toUpperCase(),
    csvEscape(card.set_name),
    card.collector_number,
    "",
    String(quantity),
    card.id,
    "Near Mint",
    card.lang,
    card.prices.usd ?? "",
  ]);
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  downloadCsv(csv, `magic-vault-manabox-${dateSuffix()}-${collection}.csv`);
}

export function exportToMoxfield(cards: ScannedCard[], collection: string) {
  if (cards.length === 0) return;
  const grouped = groupByCardId(cards);
  const headers = [
    "Count",
    "Name",
    "Edition",
    "Condition",
    "Language",
    "Foil",
    "Collector Number",
    "Alter",
    "Proxy",
    "Purchase Price",
  ];
  const rows = Array.from(grouped.values()).map(({ card, quantity }) => [
    String(quantity),
    csvEscape(card.name),
    card.set.toUpperCase(),
    "Near Mint",
    card.lang?.toUpperCase() ?? "EN",
    "",
    card.collector_number,
    "False",
    "False",
    card.prices.usd ?? "",
  ]);
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  downloadCsv(csv, `magic-vault-moxfield-${dateSuffix()}-${collection}.csv`);
}

export function exportToTcgplayer(cards: ScannedCard[], collection: string) {
  if (cards.length === 0) return;
  const grouped = groupByCardId(cards);
  const headers = [
    "Quantity",
    "Name",
    "Set Name",
    "Number",
    "Condition",
    "Printing",
    "Language",
  ];
  const rows = Array.from(grouped.values()).map(({ card, quantity }) => [
    String(quantity),
    csvEscape(card.name),
    csvEscape(card.set_name),
    card.collector_number,
    "Near Mint",
    "Normal",
    "English",
  ]);
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  downloadCsv(csv, `magic-vault-tcgplayer-${dateSuffix()}-${collection}.csv`);
}

export function exportToCsv(
  cards: ScannedCard[],
  collection: string,
  fieldDefinitions: FieldMeta[],
) {
  if (cards.length === 0) return;
  const grouped = groupByCardIdAndFoil(cards);
  const headers = ["Quantity", "Foil", ...fieldDefinitions.map((f) => f.label)];
  const rows = Array.from(grouped.values()).map(
    ({ card, quantity, isFoil }) => [
      String(quantity),
      isFoil ? "True" : "False",
      ...fieldDefinitions.map((f) => {
        const raw = getByPath(card, f.path);
        if (Array.isArray(raw)) return csvEscape(raw.join("; "));
        return csvEscape(raw == null ? "" : String(raw));
      }),
    ],
  );
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  downloadCsv(csv, `magic-vault-export-${dateSuffix()}-${collection}.csv`);
}

export function exportToCardKingdom(cards: ScannedCard[], collection: string) {
  if (cards.length === 0) return;
  const grouped = groupByCardIdAndFoil(cards);
  const headers = ["Title", "Edition", "Foil", "Quantity"];
  const rows = Array.from(grouped.values()).map(
    ({ card, quantity, isFoil }) => [
      csvEscape(card.name),
      csvEscape(card.set_name),
      isFoil ? "True" : "False",
      String(quantity),
    ],
  );
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  downloadCsv(csv, `magic-vault-cardkingdom-${dateSuffix()}-${collection}.csv`);
}

// eBay Condition IDs for trading card singles (collectibles category). Near
// Mint and below map onto eBay's graded-condition ladder; anything unknown
// falls back to 1 (New) so the file always imports.
function ebayConditionId(condition: string | undefined): number {
  switch ((condition ?? "").toLowerCase().replace(/[^a-z]/g, "")) {
    case "nearmint":
      return 2750;
    case "lightlyplayed":
      return 2751;
    case "moderatelyplayed":
      return 2752;
    case "heavilyplayed":
      return 2753;
    case "damaged":
      return 2754;
    default:
      return 1;
  }
}

export function exportToEbay(cards: ScannedCard[], collection: string) {
  if (cards.length === 0) return;
  const grouped = groupByCardIdAndFoil(cards);
  // Condition is per-scan; for a grouped (multi-copy) row use the first
  // scan's grade.
  const conditionByCardId = new Map(
    cards.map((c) => [c.card.id, c.condition] as const),
  );
  // eBay file-exchange bulk listing (Selling Manager) — minimal column set.
  // The condition text is echoed in the description so a human can verify the
  // numeric ID before upload.
  const headers = [
    "Title",
    "Subtitle",
    "Condition ID",
    "Price",
    "Quantity",
    "Custom label (SKU)",
    "Description",
  ];
  const rows = Array.from(grouped.values()).map(
    ({ card, quantity, isFoil }) => [
      csvEscape(card.name),
      isFoil ? "FOIL" : "",
      String(ebayConditionId(conditionByCardId.get(card.id))),
      card.prices.usd ?? "",
      String(quantity),
      `${card.id}${isFoil ? "-f" : ""}`,
      csvEscape(
        [
          `${card.set_name} (${card.set.toUpperCase()}) #${card.collector_number}`,
          isFoil ? "Foil printing" : "",
        ]
          .filter(Boolean)
          .join(" — "),
      ),
    ],
  );
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  downloadCsv(csv, `magic-vault-ebay-${dateSuffix()}-${collection}.csv`);
}

export function exportToShopify(cards: ScannedCard[], collection: string) {
  if (cards.length === 0) return;
  const grouped = groupByCardIdAndFoil(cards);
  // Shopify product-import CSV (product + variant rows in one).
  const headers = [
    "Title",
    "Handle",
    "Tags",
    "Variant SKU",
    "Variant Inventory Policy",
    "Variant Inventory Qty",
    "Variant Price",
    "Image Src",
    "Status",
  ];
  const rows = Array.from(grouped.values()).map(
    ({ card, quantity, isFoil }) => [
      csvEscape(isFoil ? `${card.name} (Foil)` : card.name),
      csvEscape(card.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")),
      csvEscape(card.set_name),
      `${card.id}${isFoil ? "-f" : ""}`,
      "deny",
      String(quantity),
      card.prices.usd ?? "",
      csvEscape(card.image_uris?.large ?? ""),
      "active",
    ],
  );
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  downloadCsv(csv, `magic-vault-shopify-${dateSuffix()}-${collection}.csv`);
}
