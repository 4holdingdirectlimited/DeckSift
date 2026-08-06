import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSerial } from "@/features/scanner/api/use-serial";
import {
  IconPlugConnected,
  IconPlugConnectedX,
  IconRefresh,
  IconTrash,
  IconWifi,
  IconWifiOff,
} from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

interface WifiStatus {
  ssid?: string;
  connected?: boolean;
  ip?: string;
  hostname?: string;
  wsPort?: number;
}

/**
 * Wi-Fi + OTA panel (ESP32-S3 boards with the Wi-Fi firmware build).
 *
 * Two jobs:
 *  1. Configure the board's network — SSID/password are sent over the current
 *     connection (usually USB Web Serial on first setup), stored in the
 *     board's EEPROM, and used to join the LAN on boot.
 *  2. Talk to the board over Wi-Fi instead of USB — the firmware serves the
 *     same JSON protocol over a WebSocket on port 81, so once the board has an
 *     IP you can disconnect USB entirely (power via USB stays fine) and still
 *     drive the machine from the browser. The Arduino IDE can also push OTA
 *     updates over the network (Sketch → Upload Using a Network Port).
 *
 * Non-ESP32 boards (Uno R4 etc.) reply "unknown command" to these requests —
 * the panel simply won't populate, which is expected.
 */
export function WifiPanel() {
  const {
    isConnected,
    isWs,
    connectWs,
    disconnect,
    sendCommandWithResponse,
    subscribe,
  } = useSerial();

  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<WifiStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [wsUrl, setWsUrl] = useState("");
  const [wsBusy, setWsBusy] = useState(false);

  // When the firmware joins the network it announces {"status":"wifi","ip":…}
  // over every transport — auto-fill the connect-over-Wi-Fi address.
  useEffect(() => {
    return subscribe((msg) => {
      if (
        typeof msg === "object" &&
        msg !== null &&
        (msg as Record<string, unknown>).status === "wifi"
      ) {
        const ip = (msg as Record<string, unknown>).ip;
        if (typeof ip === "string") {
          setWsUrl(`ws://${ip}:81`);
        }
      }
    });
  }, [subscribe]);

  const refresh = useCallback(async (): Promise<WifiStatus | null> => {
    if (!isConnected) return null;
    const res = await sendCommandWithResponse({ getWifi: true }, 3000);
    if (!res) return null;
    const r = res as Record<string, unknown>;
    if (r.error) return null; // e.g. "unknown command" on non-ESP32 boards
    const w = (r.wifi as WifiStatus | undefined) ?? null;
    setStatus(w);
    if (w?.ssid) setSsid((prev) => prev || (w.ssid ?? ""));
    if (w?.ip) setWsUrl((prev) => prev || `ws://${w.ip}:${w.wsPort ?? 81}`);
    return w;
  }, [isConnected, sendCommandWithResponse]);

  // Load current state once we have a connection.
  useEffect(() => {
    if (!isConnected) {
      setStatus(null);
      return;
    }
    void refresh();
  }, [isConnected, refresh]);

  const handleSave = async () => {
    if (!isConnected) {
      toast.error("Connect the board first", {
        description: "Use Connect Device (USB), or connect over Wi-Fi if the board already has credentials.",
      });
      return;
    }
    if (!ssid.trim()) {
      toast.error("SSID is required");
      return;
    }
    setBusy(true);
    try {
      const res = await sendCommandWithResponse(
        { wifi: { ssid: ssid.trim(), password } },
        5000,
      );
      if (!res) {
        toast.error("No response from the board");
        return;
      }
      const r = res as Record<string, unknown>;
      if (r.error) {
        toast.error("Board rejected the Wi-Fi settings", {
          description: String(r.error),
        });
        return;
      }
      toast.success("Wi-Fi credentials saved", {
        description: "The board is connecting — its IP will appear here when it joins.",
      });
      // Poll for a few seconds so the user sees the connection land.
      for (let i = 0; i < 10; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const w = await refresh();
        if (w?.connected) break;
      }
    } finally {
      setBusy(false);
    }
  };

  const handleForget = async () => {
    if (!isConnected) return;
    setBusy(true);
    try {
      await sendCommandWithResponse({ wifiForget: true }, 3000);
      setSsid("");
      setPassword("");
      setStatus(null);
      toast.success("Wi-Fi credentials erased", {
        description: "The board will no longer join a network until you save new credentials.",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleWsToggle = async () => {
    if (isWs) {
      await disconnect();
      return;
    }
    let url = wsUrl.trim();
    if (!url) {
      toast.error("Enter the board's address", {
        description: "e.g. decksift-board.local or 192.168.1.50",
      });
      return;
    }
    if (!/^wss?:\/\//i.test(url)) url = `ws://${url}`;
    setWsBusy(true);
    try {
      const ok = await connectWs(url);
      if (ok) {
        toast.success("Connected over Wi-Fi", {
          description: "You can unplug the USB data cable — power can stay via USB.",
        });
      } else {
        toast.error("Could not connect over Wi-Fi", {
          description: "Is the board powered and on the same network?",
        });
      }
    } finally {
      setWsBusy(false);
    }
  };

  const transportLabel = isWs ? "Wi-Fi" : "USB";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconWifi className="size-4" />
          <Label>Wi-Fi &amp; OTA</Label>
          {status?.connected ? (
            <Badge variant="default">Online</Badge>
          ) : status?.ssid ? (
            <Badge variant="secondary">Connecting…</Badge>
          ) : null}
        </div>
        <Button size="sm" variant="ghost" onClick={() => void refresh()} disabled={!isConnected}>
          <IconRefresh className="size-3.5" />
          Refresh
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        ESP32-S3 only: send the board your Wi-Fi details once (over {transportLabel});
        it stores them in EEPROM and joins the network on every boot. Then connect
        the browser over Wi-Fi and flash updates over the network — no USB needed.
      </p>

      {isConnected && (
        <div className="flex flex-col gap-1.5">
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Network (SSID)</Label>
              <Input
                value={ssid}
                onChange={(e) => setSsid(e.target.value)}
                placeholder="MyWiFi"
                maxLength={32}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                maxLength={63}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => void handleSave()} disabled={busy}>
              <IconWifi className="size-3.5" />
              Save &amp; Connect
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleForget()}
              disabled={busy || !status?.ssid}
            >
              <IconTrash className="size-3.5" />
              Forget
            </Button>
          </div>
          {status?.ssid && (
            <p className="text-xs text-muted-foreground">
              Saved network: <span className="font-medium">{status.ssid}</span>
              {status.connected && status.ip ? (
                <>
                  {" "}· connected at <span className="font-medium">{status.ip}</span>
                </>
              ) : (
                " · not connected"
              )}
            </p>
          )}
        </div>
      )}

      {isConnected && (
        <div className="flex flex-col gap-1.5 border-t pt-1.5">
          <Label className="text-xs">Browser ↔ board over Wi-Fi</Label>
          <div className="flex items-center gap-2">
            <Input
              value={wsUrl}
              onChange={(e) => setWsUrl(e.target.value)}
              placeholder="ws://decksift-board.local:81"
            />
            <Button
              size="sm"
              variant={isWs ? "outline" : "default"}
              onClick={() => void handleWsToggle()}
              disabled={wsBusy}
            >
              {isWs ? (
                <>
                  <IconPlugConnectedX className="size-3.5" />
                  Disconnect
                </>
              ) : (
                <>
                  <IconPlugConnected className="size-3.5" />
                  Connect
                </>
              )}
            </Button>
          </div>
          {isWs ? (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <IconWifi className="size-3" />
              Connected over Wi-Fi — routing and diagnostics work exactly as over USB.
            </p>
          ) : (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <IconWifiOff className="size-3" />
              The board answers on port 81 at <span className="font-medium">ws://{status?.hostname ?? "decksift-board"}.local:81</span> — or use the IP above.
            </p>
          )}
        </div>
      )}

      {!isConnected && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <IconWifiOff className="size-3" />
          Connect a device (USB) to configure Wi-Fi, or connect over Wi-Fi if the board already has credentials saved.
        </p>
      )}
    </div>
  );
}
