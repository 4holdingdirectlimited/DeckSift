import { cn } from "@/lib/utils";
import { IconStack2 } from "@tabler/icons-react";

/**
 * DeckSift brand mark — a layered "deck" glyph on the primary tile. Used in
 * the landing page, build guide, and app shell navigation so the product has
 * one consistent identity (the original MAULT pig logo was inherited from
 * upstream and doesn't represent DeckSift).
 */
export function DeckSiftMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm",
        className,
      )}
    >
      <IconStack2 className="size-4" aria-hidden />
    </span>
  );
}
