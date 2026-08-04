import { Button } from "@/components/ui/button";
import { getModuleHistory } from "@/features/calibration/api/module-configs";
import { useCameraContext } from "@/features/scanner/api/use-camera";
import { useScannedCards } from "@/features/scanner/api/use-scanned-cards";
import { useSerial } from "@/features/scanner/api/use-serial";
import { cn } from "@/lib/utils";
import { listCardGameKeys } from "@/lib/api/admin";
import {
  IconCheck,
  IconChevronDown,
  IconCircleDashed,
  IconRocket,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";

interface ChecklistItem {
  key: string;
  label: string;
  done: boolean;
  hint: string;
  href?: string;
}

/**
 * Guided first-run setup: connect camera → Arduino → sync → calibrate →
 * first scan. Each item reflects live state so it doubles as a health check
 * for an existing machine.
 */
export function FirstRunChecklist() {
  const [open, setOpen] = useState(true);
  const { status: cameraStatus } = useCameraContext();
  const { isConnected: arduinoConnected } = useSerial();
  const { cards } = useScannedCards();

  const { data: gameCounts = [] } = useQuery({
    queryKey: ["first-run", "games"],
    queryFn: () => listCardGameKeys().then((r) => r.data ?? []),
    staleTime: 60_000,
  });
  const { data: moduleHistory = [] } = useQuery({
    queryKey: ["first-run", "modules"],
    queryFn: () => getModuleHistory().then((r) => r.data ?? []),
    staleTime: 60_000,
  });

  const anyGameSynced = gameCounts.some((g) => g.count > 0);
  const calibrated = moduleHistory.length > 0;

  const items: ChecklistItem[] = [
    {
      key: "camera",
      label: "Connect the camera",
      done: cameraStatus === "ready",
      hint:
        cameraStatus === "ready"
          ? "Camera is streaming"
          : "Start the camera in the scanner panel",
    },
    {
      key: "arduino",
      label: "Connect the Arduino",
      done: arduinoConnected,
      hint: arduinoConnected
        ? "Arduino is connected"
        : "Plug it in and press Connect in the scanner panel",
    },
    {
      key: "sync",
      label: "Sync a game (e.g. Magic)",
      done: anyGameSynced,
      href: "/app/admin",
      hint: anyGameSynced
        ? "Card library is populated"
        : "Downloads card images once so scanning works offline",
    },
    {
      key: "calibrate",
      label: "Calibrate servo positions",
      done: calibrated,
      href: "/app/calibrate",
      hint: calibrated
        ? "Servo positions saved"
        : "Bins must line up before sorting",
    },
    {
      key: "scan",
      label: "Scan your first card",
      done: cards.length > 0,
      hint:
        cards.length > 0
          ? `${cards.length} ${cards.length === 1 ? "card" : "cards"} scanned`
          : "Place a card in the feeder and press Scan",
    },
  ];

  const doneCount = items.filter((i) => i.done).length;
  const allDone = doneCount === items.length;

  return (
    <div className="rounded-lg bg-input/20 dark:bg-input/30 border border-input text-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 p-2 cursor-pointer"
      >
        <span className="flex items-center gap-1.5 font-semibold text-muted-foreground">
          <IconRocket className="size-3.5 shrink-0" />
          {allDone
            ? "Setup complete"
            : `Getting started (${doneCount}/${items.length})`}
        </span>
        <IconChevronDown
          className={cn(
            "size-4 text-muted-foreground shrink-0 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <ul className="flex flex-col p-2 pt-0 gap-1">
          {items.map((item) => (
            <li key={item.key} className="flex items-start gap-2">
              {item.done ? (
                <IconCheck className="size-4 text-emerald-500 shrink-0 mt-px" />
              ) : (
                <IconCircleDashed className="size-4 text-muted-foreground shrink-0 mt-px" />
              )}
              <div className="min-w-0 flex-1">
                {item.href ? (
                  <Link
                    to={item.href}
                    className="text-xs font-medium hover:underline"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <p className="text-xs font-medium">{item.label}</p>
                )}
                <p className="text-[11px] text-muted-foreground leading-tight">
                  {item.hint}
                </p>
              </div>
            </li>
          ))}
          {!allDone && (
            <li className="pt-1">
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                render={<Link to="/build">Build instructions</Link>}
              />
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
