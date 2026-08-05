import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { IconBulb, IconBulbFilled, IconSun, IconSunFilled } from "@tabler/icons-react";

export type LedNumber = 1 | 2 | 3 | 4;

interface LedControlsProps {
  ledStates: Record<LedNumber, boolean>;
  isConnected: boolean;
  onToggle: (led: LedNumber) => void;
}

const LED_LABELS: Record<LedNumber, string> = {
  1: "Scan light",
  2: "Green — operating",
  3: "Red — machine fault",
  4: "Orange — comms fault",
};

export function LedControls({ ledStates, isConnected, onToggle }: LedControlsProps) {
  return (
    <div className="flex flex-col gap-2">
      <Label>LEDs</Label>
      <p className="text-xs text-muted-foreground">
        LED 1 (ch0) is the scan light for holo detection; LEDs 2–4 (ch1–ch3)
        are status lamps the firmware drives itself — green = operating,
        red = machine fault, orange = software/communications fault.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {([1, 2, 3, 4] as const).map((led) => (
          <Button
            key={led}
            variant={ledStates[led] ? "default" : "outline"}
            disabled={!isConnected}
            onClick={() => onToggle(led)}
            title={LED_LABELS[led]}
          >
            {led === 1 ? (
              ledStates[led] ? <IconSunFilled /> : <IconSun />
            ) : ledStates[led] ? (
              <IconBulbFilled />
            ) : (
              <IconBulb />
            )}
            LED {led}
          </Button>
        ))}
      </div>
    </div>
  );
}
