import { DeleteDialog } from "@/components/delete-dialog";
import { Button } from "@/components/ui/button";
import { DynamicDialog } from "@/components/ui/responsive-dialog";
import { useBundles } from "@/features/bundles/api/use-bundles";
import type {
  BundleRun,
  BundleRunCard,
  BundleRunStatus,
} from "@magic-vault/shared";
import {
  IconDownload,
  IconEye,
  IconPackage,
  IconTrash,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

function StatusBadge({ status }: { status: BundleRunStatus }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-500">
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-75" />
          <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
        </span>
        Active
      </span>
    );
  }
  if (status === "aborted") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-500">
        Aborted
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-600">
      Completed
    </span>
  );
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function InventoryPage() {
  const { runs, getRunCards, exportRunCsv, deleteRun } = useBundles();
  const [cardsFor, setCardsFor] = useState<BundleRunCard[] | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BundleRun | null>(null);

  const finished = useMemo(
    () => runs.filter((r) => r.status !== "active"),
    [runs],
  );

  const summary = useMemo(() => {
    const bundles = finished.length;
    const cards = finished.reduce(
      (sum, r) => sum + r.placedCardIds.length,
      0,
    );
    const value = finished.reduce((sum, r) => sum + (r.totalValueUsd ?? 0), 0);
    return { bundles, cards, value };
  }, [finished]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteRun(deleteTarget.guid);
    setDeleteTarget(null);
  };

  return (
    <div className="flex flex-col p-4 md:p-6 max-w-5xl mx-auto w-full gap-4 h-full overflow-y-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold font-heading">Bundle Inventory</h1>
          <p className="text-xs text-muted-foreground">
            Finished bundles ready to sell or trade — every SKU keeps its card
            list so you can verify contents later.
          </p>
        </div>
        <Link to="/app">
          <Button variant="outline" size="sm">
            <IconPackage className="size-3.5" />
            Make a bundle
          </Button>
        </Link>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border bg-border">
        {[
          { value: summary.bundles, label: "Bundles made" },
          { value: summary.cards, label: "Cards sorted" },
          { value: `$${summary.value.toFixed(2)}`, label: "Inventory value" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="flex flex-col items-center gap-0.5 bg-background px-4 py-4 text-center"
          >
            <span className="font-heading text-xl font-semibold">
              {stat.value.toLocaleString()}
            </span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {stat.label}
            </span>
          </div>
        ))}
      </div>

      {/* Runs list */}
      {runs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
          <IconPackage className="size-8" />
          <p className="text-sm font-medium">No bundles yet</p>
          <p className="text-xs">
            Start a bundle run from the scanner to build your first inventory
            SKU.
          </p>
        </div>
      ) : (
        <div className="flex flex-col divide-y rounded-lg border overflow-hidden">
          {runs.map((run) => (
            <div
              key={run.guid}
              className="flex items-center gap-3 px-3 py-2.5 bg-background"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm font-semibold">
                    {run.sku ?? run.guid.slice(0, 8)}
                  </span>
                  <StatusBadge status={run.status} />
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {run.configName} · {run.placedCardIds.length} cards
                  {run.totalValueUsd > 0
                    ? ` · $${run.totalValueUsd.toFixed(2)}`
                    : ""}
                  {run.status === "active"
                    ? ` · started ${formatDate(run.createdAt)}`
                    : ` · ${formatDate(run.completedAt ?? run.createdAt)}`}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground"
                  title="View cards in this bundle"
                  onClick={() =>
                    void getRunCards(run.guid).then(setCardsFor)
                  }
                >
                  <IconEye className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground"
                  title="Download bundle CSV"
                  onClick={() => void exportRunCsv(run.guid)}
                >
                  <IconDownload className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "size-8",
                    run.status === "active"
                      ? "text-muted-foreground/30"
                      : "text-muted-foreground hover:text-red-500",
                  )}
                  title={
                    run.status === "active"
                      ? "Abort or complete the run before deleting"
                      : "Delete this bundle from inventory"
                  }
                  disabled={run.status === "active"}
                  onClick={() => setDeleteTarget(run)}
                >
                  <IconTrash className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* View-cards dialog */}
      <DynamicDialog
        open={cardsFor !== null}
        onOpenChange={(open) => !open && setCardsFor(null)}
        title="Bundle cards"
        description={
          cardsFor ? `${cardsFor.length} unique cards in this bundle` : undefined
        }
        className="sm:max-w-xl"
      >
        {cardsFor && cardsFor.length > 0 ? (
          <div className="flex flex-col gap-1 max-h-96 overflow-y-auto">
            {cardsFor.map((card) => (
              <div
                key={card.cardId}
                className="flex items-center justify-between gap-2 text-xs py-1 border-b border-border/60 last:border-0"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-muted-foreground shrink-0">
                    ×{card.qty}
                  </span>
                  <span className="truncate font-medium">{card.name}</span>
                </div>
                <span className="text-muted-foreground shrink-0 truncate">
                  {card.setName} · {card.setCode} · {card.rarity}
                  {card.priceUsd ? ` · $${card.priceUsd}` : ""}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            No cards recorded for this bundle.
          </p>
        )}
      </DynamicDialog>

      {/* Delete confirmation */}
      <DeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Bundle"
        description={`Permanently deletes "${deleteTarget?.sku || deleteTarget?.guid.slice(0, 8)}" (${deleteTarget?.configName}) and its card list. This cannot be undone — export the CSV first if you need a record. Type the identifier shown above to confirm.`}
        confirm={{
          type: "name",
          name: deleteTarget?.sku || deleteTarget?.guid.slice(0, 8) || "",
        }}
        onConfirm={handleDelete}
      />
    </div>
  );
}
