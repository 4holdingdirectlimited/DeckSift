import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { BinLocationDiagram } from "@/features/bins/components/bin-location-diagram";
import type { ScannedCardItemProps } from "@/features/cards/types";
import { cn, resolveCardImageUrl } from "@/lib/utils";
import {
  getCardImageUris,
  isPossibleMisprint,
  matchConfidence,
} from "@magic-vault/shared";
import {
  IconAlertTriangle,
  IconCheck,
  IconDownload,
  IconHelpCircle,
  IconSparkles,
} from "@tabler/icons-react";
import { memo } from "react";

export const ScannedCardItem = memo(function ScannedCardItem({
  card,
  capturedImageUrl,
  onOpen,
  binNumber,
  isSelected = false,
  onToggleSelect,
  hasAlternatives = false,
  isFoil = false,
  isDownloaded = false,
}: ScannedCardItemProps) {
  const confidence = matchConfidence(card.distance);
  const possibleMisprint = isPossibleMisprint(card.distance);

  return (
    <div
      className={cn(
        "relative rounded-lg p-1 bg-muted border transition-shadow",
        isSelected && "ring-2 ring-primary ring-offset-1",
      )}
    >
      <button type="button" className="w-full cursor-pointer" onClick={onOpen}>
        <div className="aspect-[2.5/3.5] rounded-lg overflow-hidden relative">
          {hasAlternatives && (
            <div
              className="absolute top-1 left-1 z-20 rounded-full bg-amber-500 p-0.5 shadow-md"
              title="Multiple close matches - tap to review"
            >
              <IconHelpCircle className="size-3 text-white" />
            </div>
          )}
          {isFoil && (
            <div
              className={cn(
                "absolute top-1 z-20 rounded-full p-0.5 shadow-md bg-linear-to-br from-fuchsia-400 via-cyan-400 to-amber-300",
                hasAlternatives ? "left-6" : "left-1",
              )}
              title="Foil"
            >
              <IconSparkles className="size-3 text-white" />
            </div>
          )}
          <div className="absolute bottom-1 left-1 right-1 flex gap-1 items-center justify-between z-20">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Badge
                    variant="secondary"
                    className={cn(
                      "gap-1 shadow-md",
                      possibleMisprint &&
                        "border-amber-500/50 text-amber-600 dark:text-amber-400",
                      card.distance == null && "opacity-70",
                    )}
                  >
                    {possibleMisprint ? (
                      <IconAlertTriangle className="size-2.5 shrink-0" />
                    ) : (
                      <span
                        className={cn(
                          "size-1.5 rounded-full shrink-0",
                          card.distance == null
                            ? "bg-muted-foreground"
                            : card.distance < 0.15
                              ? "bg-emerald-500"
                              : card.distance < 0.25
                                ? "bg-amber-500"
                                : "bg-red-500",
                        )}
                      />
                    )}
                    {confidence != null ? `${confidence.toFixed(0)}%` : "—"}
                  </Badge>
                }
              />
              <TooltipContent>
                {card.distance != null
                  ? possibleMisprint
                    ? `Possible misprint/error card — ${confidence?.toFixed(1)}% match. Art differs from the catalog (distance ${card.distance.toFixed(3)}); verify before pricing.`
                    : `Match confidence ${confidence?.toFixed(1)}% (distance ${card.distance.toFixed(3)}) — visual similarity to the scanned image`
                  : "No match distance (added manually or imported)"}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Badge variant="secondary" className="shadow-md">
                    Bin {binNumber}
                  </Badge>
                }
              />
              <TooltipContent side="top" className="p-0">
                <BinLocationDiagram binNumber={binNumber} />
              </TooltipContent>
            </Tooltip>
          </div>
          <img
            src={
              capturedImageUrl ||
              resolveCardImageUrl(getCardImageUris(card)?.normal) ||
              ""
            }
            alt={card.name}
            className="w-full h-full object-cover"
          />
        </div>
      </button>
      {onToggleSelect && (
        <Button
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect();
          }}
          variant={isSelected ? "default" : "secondary"}
          className="absolute top-2 right-2 z-30"
        >
          <IconCheck />
        </Button>
      )}
      <div className="flex flex-row justify-between items-center px-1 pb-1">
        <div className="flex flex-row items-center gap-2">
          <div
            className="size-3 rounded-full shrink-0"
            style={{ backgroundColor: `var(--${card.rarity})` }}
          />
          <p className="text-xs font-semibold uppercase" title={card.set}>
            {card.set}
          </p>
          <p className="text-xs text-muted-foreground">
            #{card.collector_number}
          </p>
          {isDownloaded && (
            <span title="Downloaded">
              <IconDownload className="size-3 text-muted-foreground shrink-0" />
            </span>
          )}
        </div>
        {card.prices?.usd && (
          <p className="text-xs font-medium text-muted-foreground">
            ${card.prices.usd}
          </p>
        )}
      </div>
    </div>
  );
});
