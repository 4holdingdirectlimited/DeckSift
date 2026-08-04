import { Switch } from "@/components/ui/switch";
import { useScannedCards } from "@/features/scanner/api/use-scanned-cards";

/**
 * Digitize mode toggle — when on, every scanned card is recorded to the
 * collection but NOT sorted (no bin rules / bundles / chase / wishlist);
 * cards route to the catch-all bin so the machine keeps moving. Use it to
 * bulk-record a library without deciding where anything goes.
 */
export function DigitizeModeToggle() {
  const { digitize, setDigitize } = useScannedCards();

  return (
    <div className="flex items-center justify-between rounded-lg border px-3 py-2">
      <div className="flex flex-col">
        <span className="text-xs font-medium">Digitize mode</span>
        <span className="text-[11px] text-muted-foreground">
          Scan + record only, no sorting (catch-all)
        </span>
      </div>
      <Switch checked={digitize} onCheckedChange={setDigitize} />
    </div>
  );
}
