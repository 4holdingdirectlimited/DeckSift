import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useSerial } from "@/features/scanner/api/use-serial";
import { useState } from "react";
import { toast } from "sonner";

export interface RoutingTiming {
  cardEnterMs: number;
  paddleMs: number;
  pushMs: number;
}

export const DEFAULT_ROUTING_TIMING: RoutingTiming = {
  cardEnterMs: 300,
  paddleMs: 300,
  pushMs: 600,
};

const INPUT_STYLE =
  "h-8 w-24 rounded-md border border-input bg-input/20 px-2 text-xs tabular-nums outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30";

/**
 * Runtime-tunable route delays (firmware-side, persisted to EEPROM with
 * saveConfig). These replace the old compile-time DELAY_* constants, so the
 * machine can be timed with a stopwatch and adjusted from the browser without
 * re-flashing — the "measure, don't guess" loop from PLAN.md.
 */
export function RoutingTimingPanel({ isConnected }: { isConnected: boolean }) {
  const { sendCommandWithResponse } = useSerial();
  const [timing, setTiming] = useState<RoutingTiming>(DEFAULT_ROUTING_TIMING);
  const [saved, setSaved] = useState(false);

  const setField = (field: keyof RoutingTiming, value: string) => {
    const num = Math.max(0, Math.round(Number(value) || 0));
    setTiming((prev) => ({ ...prev, [field]: num }));
    setSaved(false);
  };

  const send = async () => {
    if (!isConnected) return;
    const response = await sendCommandWithResponse(
      { setTimingConfig: timing },
      2000,
    );
    if (!response) {
      toast.error("No response from sorter", {
        description: "Check the USB connection and retry.",
      });
      return;
    }
    // The firmware echoes the clamped values it actually applied.
    const res = response as Record<string, unknown>;
    if (res.error) {
      toast.error("Failed to set timing", { description: String(res.error) });
      return;
    }
    const applied = res.timing as
      | Partial<RoutingTiming>
      | undefined;
    if (applied) {
      setTiming({
        cardEnterMs: applied.cardEnterMs ?? timing.cardEnterMs,
        paddleMs: applied.paddleMs ?? timing.paddleMs,
        pushMs: applied.pushMs ?? timing.pushMs,
      });
    }
    toast.success("Timing sent to sorter");
  };

  const save = async () => {
    if (!isConnected) return;
    const response = await sendCommandWithResponse({ saveConfig: true }, 2000);
    if (!response) {
      toast.error("Could not save to EEPROM", {
        description: "No response from sorter.",
      });
      return;
    }
    setSaved(true);
    toast.success("Timing saved to EEPROM", {
      description: "Persists across reboots.",
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <Label>Routing Timing</Label>
      <p className="text-xs text-muted-foreground">
        Route-phase delays in ms. Tune with a stopwatch, then Save so the
        Arduino keeps them after a reboot (no re-flash needed).
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] text-muted-foreground">
            Card enter
          </Label>
          <input
            type="number"
            min={50}
            max={2000}
            value={timing.cardEnterMs}
            onChange={(e) => setField("cardEnterMs", e.target.value)}
            className={INPUT_STYLE}
            disabled={!isConnected}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] text-muted-foreground">Paddle</Label>
          <input
            type="number"
            min={50}
            max={2000}
            value={timing.paddleMs}
            onChange={(e) => setField("paddleMs", e.target.value)}
            className={INPUT_STYLE}
            disabled={!isConnected}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] text-muted-foreground">Push</Label>
          <input
            type="number"
            min={100}
            max={3000}
            value={timing.pushMs}
            onChange={(e) => setField("pushMs", e.target.value)}
            className={INPUT_STYLE}
            disabled={!isConnected}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={send} disabled={!isConnected}>
            Send to device
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={save}
            disabled={!isConnected}
          >
            {saved ? "Saved ✓" : "Save (EEPROM)"}
          </Button>
        </div>
      </div>
    </div>
  );
}
