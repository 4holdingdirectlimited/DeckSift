import { Button } from "@/components/ui/button";
import { cn, resolveCardImageUrl } from "@/lib/utils";
import {
  getCardFaceName,
  getCardImageUris,
  type PlayingCardWithDistance,
} from "@magic-vault/shared";
import { IconAlertTriangle, IconCheck, IconX } from "@tabler/icons-react";

export interface ReviewCard {
  card: PlayingCardWithDistance;
  alternativeMatches: PlayingCardWithDistance[];
  capturedImageUrl?: string;
  isFoil?: boolean;
}

/**
 * Low-confidence match review: shown over the scanner when the review queue
 * pauses a scan (match distance above threshold, or several close matches).
 * The operator confirms to sort normally, or rejects to route the physical
 * card to the catch-all bin.
 */
export function ReviewPanel({
  pending,
  onConfirm,
  onReject,
}: {
  pending: ReviewCard;
  onConfirm: () => void;
  onReject: () => void;
}) {
  const { card, alternativeMatches, capturedImageUrl } = pending;
  const confidence = Math.max(0, Math.min(100, 100 - card.distance * 100));

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/85 backdrop-blur-sm rounded-lg p-4">
      <div className="flex flex-col items-center gap-3 w-full max-w-60 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
          <IconAlertTriangle className="size-3" />
          Low-confidence match
        </span>
        <div className="aspect-[2.5/3.5] w-32 overflow-hidden rounded-lg border bg-muted shadow-sm">
          <img
            src={
              capturedImageUrl ||
              resolveCardImageUrl(getCardImageUris(card)?.normal) ||
              ""
            }
            alt={card.name}
            className="h-full w-full object-cover"
          />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">
            {getCardFaceName(card)}
          </p>
          <p className="text-[11px] text-muted-foreground truncate">
            {card.set_name} #{card.collector_number}
            {alternativeMatches.length > 0 &&
              ` · +${alternativeMatches.length} close match${alternativeMatches.length === 1 ? "" : "es"}`}
          </p>
          <p
            className={cn(
              "mt-0.5 font-mono text-[11px]",
              confidence >= 85
                ? "text-emerald-500"
                : confidence >= 75
                  ? "text-amber-500"
                  : "text-red-500",
            )}
          >
            {confidence.toFixed(0)}% match
          </p>
        </div>
        <div className="flex gap-2 w-full">
          <Button
            size="sm"
            className="flex-1"
            onClick={onConfirm}
            title="Sort this card using your bin rules"
          >
            <IconCheck className="size-3.5" />
            Sort it
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={onReject}
            title="Route this card to the catch-all bin"
          >
            <IconX className="size-3.5" />
            Skip
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground leading-tight">
          Skipping routes the card to the catch-all bin — it won't be added to
          your collection.
        </p>
      </div>
    </div>
  );
}
