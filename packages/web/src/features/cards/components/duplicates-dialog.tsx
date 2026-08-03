import { Button } from "@/components/ui/button";
import { DynamicDialog } from "@/components/ui/responsive-dialog";
import type { ScannedCard } from "@magic-vault/shared";
import { useMemo } from "react";

interface DuplicatesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cards: ScannedCard[];
}

interface DuplicateRow {
  id: string;
  name: string;
  qty: number;
  priceUsd: string | null;
}

function formatUsd(value: string | null | undefined): string {
  if (value == null || value === "" || Number.isNaN(Number(value))) return "—";
  return `$${Number(value).toFixed(2)}`;
}

export function DuplicatesDialog({
  open,
  onOpenChange,
  cards,
}: DuplicatesDialogProps) {
  const { rows, duplicateCount } = useMemo(() => {
    const byId = new Map<string, DuplicateRow>();
    for (const scan of cards) {
      const existing = byId.get(scan.card.id);
      if (existing) {
        existing.qty += 1;
      } else {
        byId.set(scan.card.id, {
          id: scan.card.id,
          name: scan.card.name,
          qty: 1,
          priceUsd: scan.card.prices?.usd ?? null,
        });
      }
    }
    const dupRows = [...byId.values()]
      .filter((row) => row.qty > 1)
      .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
    const extraScans = dupRows.reduce((sum, row) => sum + row.qty - 1, 0);
    return { rows: dupRows, duplicateCount: extraScans };
  }, [cards]);

  return (
    <DynamicDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Duplicate Cards"
      description={`${duplicateCount} extra ${
        duplicateCount === 1 ? "scan" : "scans"
      } — duplicates may indicate double-feeds.`}
      footer={
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Close
        </Button>
      }
    >
      {rows.length === 0 ? (
        <p className="py-2 text-xs text-muted-foreground">
          No duplicate cards in this session.
        </p>
      ) : (
        <ul className="max-h-[50vh] divide-y divide-border overflow-y-auto rounded border">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <span className="min-w-0 truncate text-sm font-medium">
                {row.name}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {formatUsd(row.priceUsd)} × {row.qty}
              </span>
            </li>
          ))}
        </ul>
      )}
    </DynamicDialog>
  );
}
