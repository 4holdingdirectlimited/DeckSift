import { Button } from "@/components/ui/button";
import { useBinConfigs } from "@/features/bins/api/use-bin-configs";
import { useScannedCards } from "@/features/scanner/api/use-scanned-cards";
import { cn } from "@/lib/utils";
import { IconTrash } from "@tabler/icons-react";

/**
 * Per-bin physical status: how many cards this session's run has placed in
 * each bin vs its capacity, with an Empty button for after the operator
 * physically empties a bin. Emptying a full bin also resumes a paused run.
 */
export function BinStatus() {
  const { binCounts, emptyBin } = useScannedCards();
  const { configs } = useBinConfigs();

  const bins = configs.map((config) => {
    const capacity = config.maxCapacity ?? 0;
    const count = binCounts[config.binNumber] ?? 0;
    const pct = capacity > 0 ? count / capacity : 0;
    const state =
      capacity > 0 && count >= capacity
        ? "full"
        : pct >= 0.8
          ? "warning"
          : count > 0
            ? "active"
            : "empty";
    return { ...config, capacity, count, state };
  });

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Bin Status
        </span>
        <span className="text-[10px] text-muted-foreground/70">
          tap Empty after emptying a bin
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {bins.map((bin) => (
          <div
            key={bin.binNumber}
            title={
              bin.isCatchAll
                ? "Catch-all bin"
                : `Bin ${bin.binNumber} — capacity ${bin.capacity || "unlimited"}`
            }
            className={cn(
              "flex items-center gap-1 rounded-md border px-1.5 py-1 text-[11px] tabular-nums",
              bin.state === "full" &&
                "border-red-500/50 bg-red-500/10 text-red-400",
              bin.state === "warning" &&
                "border-amber-500/40 bg-amber-500/10 text-amber-400",
              bin.state === "active" &&
                "border-primary/30 bg-primary/5 text-foreground",
              bin.state === "empty" &&
                "border-border bg-muted/40 text-muted-foreground",
            )}
          >
            <span className="font-mono font-semibold">
              {bin.isCatchAll ? "R" : bin.binNumber}
            </span>
            <span className="opacity-70">
              {bin.count}
              {bin.capacity > 0 ? `/${bin.capacity}` : ""}
            </span>
            {(bin.count > 0 || bin.state === "full") && (
              <Button
                variant="ghost"
                size="icon"
                className="size-4 text-muted-foreground hover:text-foreground"
                title={`Mark bin ${bin.binNumber} as emptied`}
                onClick={() => emptyBin(bin.binNumber)}
              >
                <IconTrash className="size-3" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
