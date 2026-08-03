import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useModuleConfigs } from "@/features/calibration/api/use-module-configs";
import { useSerial } from "@/features/scanner/api/use-serial";
import {
  DEFAULT_CALIBRATION,
  type ServoCalibration,
} from "@magic-vault/shared";
import { cn } from "@/lib/utils";
import { IconLoader2, IconWand } from "@tabler/icons-react";
import { useCallback, useState } from "react";

type ServoName = "bottom" | "paddle" | "pusher";
type ModuleNumber = 1 | 2 | 3;

interface ServoInfo {
  name: ServoName;
  label: string;
  job: string;
  /** Wiggle extremes — the two calibrated positions the servo cycles between. */
  aKey: keyof ServoCalibration;
  bKey: keyof ServoCalibration;
  /** Resting position after the wiggle. */
  restKey: keyof ServoCalibration;
}

const SERVO_INFO: Record<ServoName, ServoInfo> = {
  bottom: {
    name: "bottom",
    label: "Bottom",
    job: "Trapdoor under the module — opens to drop the card down to the next module.",
    aKey: "bottomOpen",
    bKey: "bottomClosed",
    restKey: "bottomClosed",
  },
  paddle: {
    name: "paddle",
    label: "Paddle",
    job: "Gate that holds the card at this module while the pusher ejects it.",
    aKey: "paddleOpen",
    bKey: "paddleClosed",
    restKey: "paddleClosed",
  },
  pusher: {
    name: "pusher",
    label: "Pusher",
    job: "Ejects the card left or right into its side bin.",
    aKey: "pusherLeft",
    bKey: "pusherRight",
    restKey: "pusherNeutral",
  },
};

/** Which bins each servo participates in (from routeCard in main.ino). */
const BINS_BY_SERVO: Record<ModuleNumber, Record<ServoName, string>> = {
  1: { bottom: "3, 4, 5, 6, 7", paddle: "1, 2", pusher: "1, 2" },
  2: { bottom: "5, 6, 7", paddle: "3, 4", pusher: "3, 4" },
  3: { bottom: "7", paddle: "5, 6", pusher: "5, 6" },
};

/** The mechanical sequence each bin route runs (routeCard in main.ino). */
const BIN_ROUTES: { bin: number; moves: string }[] = [
  { bin: 1, moves: "Module 1 paddle opens → pusher pushes LEFT" },
  { bin: 2, moves: "Module 1 paddle opens → pusher pushes RIGHT" },
  { bin: 3, moves: "M1 bottom opens (card drops) → M2 paddle opens → pusher LEFT" },
  { bin: 4, moves: "M1 bottom opens (card drops) → M2 paddle opens → pusher RIGHT" },
  { bin: 5, moves: "M1 + M2 bottoms open (drops) → M3 paddle opens → pusher LEFT" },
  { bin: 6, moves: "M1 + M2 bottoms open (drops) → M3 paddle opens → pusher RIGHT" },
  { bin: 7, moves: "All three bottoms open — card falls to the catch-all" },
];

const WIGGLE_CYCLES = 2;
const WIGGLE_HOLD_MS = 500;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Hardware commissioning diagnostics: proves each servo is wired to the right
 * channel before any routing is trusted. Wiggle a servo and watch the physical
 * machine — it should be the one matching the label and bin list below.
 */
export function ServoDiagnostics() {
  const { configs, moveServo } = useModuleConfigs();
  const { isConnected } = useSerial();
  const [wiggling, setWiggling] = useState<string | null>(null);

  const wiggleServo = useCallback(
    async (module: ModuleNumber, servo: ServoName) => {
      const key = `${module}:${servo}`;
      setWiggling(key);
      const cal =
        configs.find((c) => c.moduleNumber === module)?.calibration ??
        DEFAULT_CALIBRATION;
      const info = SERVO_INFO[servo];
      try {
        for (let i = 0; i < WIGGLE_CYCLES; i++) {
          moveServo(module, servo, cal[info.aKey]);
          await sleep(WIGGLE_HOLD_MS);
          moveServo(module, servo, cal[info.bKey]);
          await sleep(WIGGLE_HOLD_MS);
        }
        moveServo(module, servo, cal[info.restKey]);
        await sleep(WIGGLE_HOLD_MS);
      } finally {
        setWiggling(null);
      }
    },
    [configs, moveServo],
  );

  const wiggleModule = useCallback(
    async (module: ModuleNumber) => {
      for (const servo of ["bottom", "paddle", "pusher"] as const) {
        await wiggleServo(module, servo);
      }
    },
    [wiggleServo],
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label>Servo Diagnostics</Label>
        <span className="text-[11px] text-muted-foreground">
          Watch the physical servo as you wiggle it — it must match the label.
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 rounded-lg border overflow-hidden">
        {([1, 2, 3] as const).map((module) => (
          <div
            key={module}
            className="p-2 flex flex-col gap-3 border-b md:border-b-0 md:border-r last:border-0 bg-sidebar"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold font-heading">Module {module}</h3>
              <Button
                variant="outline"
                size="sm"
                disabled={!isConnected || wiggling !== null}
                onClick={() => void wiggleModule(module)}
              >
                {wiggling?.startsWith(`${module}:`) ? (
                  <IconLoader2 className="size-3 animate-spin" />
                ) : (
                  <IconWand className="size-3" />
                )}
                Wiggle all
              </Button>
            </div>
            {(["bottom", "paddle", "pusher"] as const).map((servo) => {
              const info = SERVO_INFO[servo];
              const key = `${module}:${servo}`;
              const active = wiggling === key;
              return (
                <div key={servo} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold">{info.label}</p>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      disabled={!isConnected || wiggling !== null}
                      onClick={() => void wiggleServo(module, servo)}
                    >
                      {active ? (
                        <IconLoader2 className="size-3 animate-spin" />
                      ) : (
                        <IconWand className="size-3" />
                      )}
                      Wiggle
                    </Button>
                  </div>
                  <p className="text-[11px]/relaxed text-muted-foreground">
                    {info.job}
                  </p>
                  <p
                    className={cn(
                      "text-[11px] font-mono",
                      active ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    Bins: {BINS_BY_SERVO[module][servo]}
                  </p>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-120 border-collapse text-xs/relaxed">
          <thead>
            <tr className="bg-secondary/40">
              <th className="border-b px-3 py-2 text-left font-mono text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                Bin
              </th>
              <th className="border-b px-3 py-2 text-left font-mono text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                What should move
              </th>
            </tr>
          </thead>
          <tbody>
            {BIN_ROUTES.map((route, i) => (
              <tr
                key={route.bin}
                className={cn("hover:bg-secondary/30", i !== BIN_ROUTES.length - 1 && "border-b")}
              >
                <td className="px-3 py-2 font-mono tabular-nums">
                  {route.bin}
                  {route.bin === 7 && (
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      (catch-all)
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">{route.moves}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
