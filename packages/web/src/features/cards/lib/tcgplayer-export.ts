import type { ScannedCard } from "@magic-vault/shared";

/**
 * TCGplayer-compatible inventory CSV.
 *
 * TCGplayer's seller portal imports inventory CSVs and matches cards by name
 * (+ set). Exact matching needs TCGplayer product/SKU IDs (the API path —
 * see custom/TCGS.md), but name+set is the accepted no-API route: the portal
 * validates matches and lets you fix stragglers.
 *
 * Columns follow the community-standard inventory shape that TCGplayer's
 * importer and ecosystem tools accept (case-insensitive headers):
 *   name, set_name, condition, quantity, purchase_price, list_price, tcgplayer_id
 *
 * - condition defaults to "Near Mint" — edit the CSV before upload if you
 *   grade differently.
 * - Foil variants get " (Foil)" appended to the name, TCGplayer's convention
 *   for foil product names, so the matcher picks the right product.
 * - list_price is filled from the card's price (usd_foil for foil rows) when
 *   the source carries one; blank rows let TCGplayer use market price.
 * - tcgplayer_id is left blank — populate it via the API integration later.
 */

const DEFAULT_CONDITION = "Near Mint";

interface TcgRow {
  name: string;
  setName: string;
  quantity: number;
  listPrice: string | null;
  isFoil: boolean;
}

/** Group scanned cards by unique product (card id + foil variant). */
function groupTcgRows(cards: ScannedCard[]): TcgRow[] {
  const grouped = new Map<string, TcgRow>();
  for (const scan of cards) {
    const card = scan.card;
    const key = `${card.id}|${scan.isFoil ? "f" : "n"}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.quantity += 1;
    } else {
      grouped.set(key, {
        name: card.name,
        setName: card.set_name || card.set || "",
        quantity: 1,
        listPrice: scan.isFoil
          ? card.prices?.usd_foil ?? card.prices?.usd ?? null
          : card.prices?.usd ?? null,
        isFoil: !!scan.isFoil,
      });
    }
  }
  return [...grouped.values()];
}

/** Quote a CSV cell when needed (commas/quotes/newlines), doubling internal quotes. */
function csvCell(value: string | number | null | undefined): string {
  if (value == null || value === "") return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildTcgplayerCsv(cards: ScannedCard[]): string {
  const rows = groupTcgRows(cards);
  const header = [
    "name",
    "set_name",
    "condition",
    "quantity",
    "purchase_price",
    "list_price",
    "tcgplayer_id",
  ];
  const lines = [header.map(csvCell).join(",")];

  for (const row of rows) {
    lines.push(
      [
        row.isFoil ? `${row.name} (Foil)` : row.name,
        row.setName,
        DEFAULT_CONDITION,
        row.quantity,
        "", // purchase_price — we don't track cost basis
        row.listPrice ?? "",
        "", // tcgplayer_id — filled via the API integration later
      ]
        .map(csvCell)
        .join(","),
    );
  }

  return lines.join("\n");
}

/** Build `tcgplayer-<date>.csv` and trigger a browser download. */
export function downloadTcgplayerCsv(
  cards: ScannedCard[],
  date = new Date(),
): void {
  const csv = buildTcgplayerCsv(cards);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `tcgplayer-${date.toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
