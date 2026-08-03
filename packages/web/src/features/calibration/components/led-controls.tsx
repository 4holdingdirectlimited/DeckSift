import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { IconBulb, IconBulbFilled, IconSun, IconSunFilled } from "@tabler/icons-react";

type LedNumber = 1 | 2 | 3 | 4 | 5;

interface LedControlsProps {
  ledStates: Record<LedNumber, boolean>;
  isConnected: boolean;
  onToggle: (led: LedNumber) => void;
}

export function LedControls({ ledStates, isConnected, onToggle }: LedControlsProps) {
  return (
    <div className="flex flex-col gap-2">
      <Label>LEDs</Label>
      <div className="flex flex-wrap items-center gap-2">
        {([1, 2, 3, 4] as const).map((led) => (
          <Button
            key={led}
            variant={ledStates[led] ? "default" : "outline"}
            disabled={!isConnected}
            onClick={() => onToggle(led)}
          >
            {ledStates[led] ? <IconBulbFilled /> : <IconBulb />}
            LED {led}
          </Button>
        ))}
        <Button
          variant={ledStates[5] ? "default" : "outline"}
          disabled={!isConnected}
          onClick={() => onToggle(5)}
          title="Scan light — used by two-frame holo detection"
        >
          {ledStates[5] ? <IconSunFilled /> : <IconSun />}
          Scan Light
        </Button>
      </div>
    </div>
  );
}
