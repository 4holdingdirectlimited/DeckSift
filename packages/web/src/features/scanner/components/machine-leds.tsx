import { useSerial } from "@/features/scanner/api/use-serial";
import type { ScannerStatus } from "@magic-vault/shared";
import { useEffect } from "react";

// Statuses where the machine is actively processing a card.
const OPERATING_STATUSES: ScannerStatus[] = [
  "scanning",
  "searching",
  "review",
  "duplicate",
  "no-match",
  "captured",
];

export interface MachineLedsProps {
  status: ScannerStatus;
  isConnected: boolean;
  isReady: boolean;
  isFeeding: boolean;
  /** Set when a machine fault (jam / route error) occurred; cleared on the next scan. */
  faulted: boolean;
}

/**
 * Machine status lamps — LED 2 green (operating), LED 3 red (machine fault),
 * LED 4 orange (software/comms fault). Drives the physical LEDs over serial
 * AND mirrors the same state on screen so the browser shows what the machine
 * is doing. LED 1 (the scan light) is toggled by the foil-detection path, not
 * here.
 */
export function MachineLeds({
  status,
  isConnected,
  isReady,
  isFeeding,
  faulted,
}: MachineLedsProps) {
  const { sendCommand } = useSerial();

  const green = isFeeding || OPERATING_STATUSES.includes(status);
  const red = faulted || status === "error";
  const orange = !isConnected || !isReady;

  // Best-effort sync of the physical lamps whenever the derived state changes.
  useEffect(() => {
    if (!isConnected) return;
    const send = (led: number, on: boolean) => {
      void sendCommand(JSON.stringify({ led, on }) + "\n");
    };
    send(2, green);
    send(3, red);
    send(4, orange);
  }, [green, red, orange, isConnected, sendCommand]);

  const led = (
    color: string,
    on: boolean,
    label: string,
  ) => (
    <div
      className="flex items-center gap-1.5"
      title={`${label}${on ? " — ON" : " — off"}`}
    >
      <span
        className={`size-2.5 rounded-full transition-colors ${
          on ? color : "bg-muted-foreground/25"
        }`}
      />
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );

  return (
    <div className="flex items-center gap-3">
      {led("bg-emerald-500 shadow-[0_0_6px_1px] shadow-emerald-500/60", green, "Operating")}
      {led("bg-red-500 shadow-[0_0_6px_1px] shadow-red-500/60", red, "Fault")}
      {led("bg-orange-500 shadow-[0_0_6px_1px] shadow-orange-500/60", orange, "Comms")}
    </div>
  );
}
