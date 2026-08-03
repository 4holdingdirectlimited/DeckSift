import type { ScannedCard } from "@magic-vault/shared";

interface CollectionRow {
  name: string;
  setName: string;
  setCode: string;
  rarity: string;
  collectorNumber: string;
  priceUsd: string | null;
  qty: number;
  isFoil: boolean;
  binNumber?: number;
}

/** Quote a CSV cell when needed (commas/quotes/newlines), doubling internal quotes. */
function csvCell(value: string | number | null | undefined): string {
  if (value == null || value === "") return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Group scanned cards by card id and render a CSV row per unique card.
 * Foil is "yes" when any scan of that card was foil; Bin comes from the
 * most recent scan that reported one.
 */
export function buildCollectionCsv(cards: ScannedCard[]): string {
  const grouped = new Map<string, CollectionRow>();

  for (const scan of cards) {
    const card = scan.card;
    const existing = grouped.get(card.id);
    if (existing) {
      existing.qty += 1;
      if (scan.isFoil) existing.isFoil = true;
      if (scan.binNumber != null) existing.binNumber = scan.binNumber;
    } else {
      grouped.set(card.id, {
        name: card.name,
        setName: card.set_name,
        setCode: card.set,
        rarity: card.rarity,
        collectorNumber: card.collector_number,
        priceUsd: card.prices?.usd ?? null,
        qty: 1,
        isFoil: !!scan.isFoil,
        binNumber: scan.binNumber,
      });
    }
  }

  const header = [
    "Name",
    "Set",
    "Set Code",
    "Rarity",
    "Collector #",
    "Price USD",
    "Qty",
    "Foil",
    "Bin",
  ];
  const lines = [header.map(csvCell).join(",")];

  for (const row of grouped.values()) {
    lines.push(
      [
        row.name,
        row.setName,
        row.setCode,
        row.rarity,
        row.collectorNumber,
        row.priceUsd ?? "",
        row.qty,
        row.isFoil ? "yes" : "",
        row.binNumber ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
  }

  return lines.join("\n");
}

/** Build `collection-<date>.csv` and trigger a browser download. */
export function downloadCollectionCsv(
  cards: ScannedCard[],
  date = new Date(),
): void {
  const csv = buildCollectionCsv(cards);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `collection-${date.toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
