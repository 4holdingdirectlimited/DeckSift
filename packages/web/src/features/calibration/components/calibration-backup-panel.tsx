import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  getFeederConfig,
  saveFeederConfig,
} from "@/features/calibration/api/feeder-config";
import {
  getModuleConfigs,
  saveModuleConfig,
} from "@/features/calibration/api/module-configs";
import { useSerial } from "@/features/scanner/api/use-serial";
import type {
  FeederCalibration,
  Result,
  ServoCalibration,
} from "@magic-vault/shared";
import { IconDownload, IconUpload } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import type { RoutingTiming } from "./routing-timing-panel";

interface CalibrationBundle {
  format: "decksift-calibration";
  version: 1;
  exportedAt: string;
  modules: Record<1 | 2 | 3, ServoCalibration>;
  feeder: FeederCalibration;
  timing: RoutingTiming;
}

const FILE_NAME = "decksift-calibration.json";

/**
 * Host-side copy of the firmware calibration (module servo pulses, feeder,
 * routing delays). Export downloads a JSON snapshot; Import pushes it to a
 * fresh board (EEPROM via saveConfig) and back into the server DB — so a
 * replacement Arduino can be loaded in minutes instead of re-tuned.
 */
export function CalibrationBackupPanel({ isConnected }: { isConnected: boolean }) {
  const { sendCommandWithResponse } = useSerial();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchTiming = async (): Promise<RoutingTiming | null> => {
    const response = await sendCommandWithResponse(
      { getTimingConfig: true },
      2000,
    );
    if (!response) return null;
    const t = (response as Record<string, unknown>).timing as
      | Partial<RoutingTiming>
      | undefined;
    if (!t) return null;
    return {
      cardEnterMs: t.cardEnterMs ?? 300,
      paddleMs: t.paddleMs ?? 300,
      pushMs: t.pushMs ?? 600,
    };
  };

  const handleExport = async () => {
    setBusy(true);
    try {
      const [modulesRes, feederRes, timing] = await Promise.all([
        getModuleConfigs(),
        getFeederConfig(),
        isConnected ? fetchTiming() : null,
      ]);
      if (
        !modulesRes.success ||
        !modulesRes.data ||
        !feederRes.success ||
        !feederRes.data
      ) {
        toast.error("Could not read current calibration");
        return;
      }
      const modules = {} as CalibrationBundle["modules"];
      for (const m of modulesRes.data) {
        modules[m.moduleNumber] = m.calibration;
      }
      const bundle: CalibrationBundle = {
        format: "decksift-calibration",
        version: 1,
        exportedAt: new Date().toISOString(),
        modules,
        feeder: feederRes.data,
        timing:
          timing ?? { cardEnterMs: 300, paddleMs: 300, pushMs: 600 },
      };
      const blob = new Blob([JSON.stringify(bundle, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = FILE_NAME;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Calibration exported", {
        description: `Saved ${FILE_NAME} — keep it with the machine.`,
      });
    } finally {
      setBusy(false);
    }
  };

  const applyBundle = async (bundle: CalibrationBundle) => {
    let pushed = 0;
    // Modules -> server DB + firmware RAM.
    for (const [num, cal] of Object.entries(bundle.modules) as [
      string,
      ServoCalibration,
    ][]) {
      const moduleNumber = Number(num) as 1 | 2 | 3;
      const saved: Result<unknown> = await saveModuleConfig(moduleNumber, cal);
      if (!saved.success) {
        toast.error(`Module ${moduleNumber} failed to save`);
        return;
      }
      if (isConnected) {
        await sendCommandWithResponse(
          { setConfig: { module: moduleNumber, ...cal } },
          2000,
        );
      }
      pushed += 1;
    }
    // Feeder -> server DB + firmware RAM.
    const feederSaved: Result<unknown> = await saveFeederConfig(bundle.feeder);
    if (!feederSaved.success) {
      toast.error("Feeder config failed to save");
      return;
    }
    if (isConnected) {
      await sendCommandWithResponse({ setFeederConfig: bundle.feeder }, 2000);
    }
    // Timing -> firmware RAM + EEPROM (timing is firmware-only, no DB row).
    if (isConnected) {
      await sendCommandWithResponse({ setTimingConfig: bundle.timing }, 2000);
      await sendCommandWithResponse({ saveConfig: true }, 2000);
    }
    queryClient.invalidateQueries({ queryKey: ["modules"] });
    queryClient.invalidateQueries({ queryKey: ["feeder"] });
    toast.success("Calibration restored", {
      description: `${pushed} modules + feeder + timing loaded${isConnected ? " and saved to the board" : " (board not connected — re-connect to push)"}.`,
    });
  };

  const handleImportFile = async (file: File) => {
    setBusy(true);
    try {
      let bundle: CalibrationBundle;
      try {
        bundle = JSON.parse(await file.text());
      } catch {
        toast.error("Not a valid calibration file");
        return;
      }
      if (bundle.format !== "decksift-calibration") {
        toast.error("Not a DeckSift calibration file", {
          description: "Expected a file exported from this panel.",
        });
        return;
      }
      await applyBundle(bundle);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Label>Calibration Backup</Label>
      <p className="text-xs text-muted-foreground">
        Export a copy of the servo/feeder/timing calibration to keep on this
        PC. If the Arduino ever needs replacing, Import loads it onto the new
        board (and back into the app) in one go.
      </p>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={handleExport} disabled={busy}>
          <IconDownload className="size-3.5" />
          Export JSON
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
        >
          <IconUpload className="size-3.5" />
          Import JSON
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleImportFile(file);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
