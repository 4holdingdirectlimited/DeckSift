import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ZoomRange } from "@/features/scanner/types";
import {
  IconAdjustments,
  IconCamera,
  IconDeviceUsb,
  IconDeviceUsbFilled,
} from "@tabler/icons-react";

interface ScannerMenuProps {
  isCameraActive: boolean;
  isConnected: boolean;
  autoFeed: boolean;
  allowDuplicates: boolean;
  maxCopiesPerCard: number;
  reviewQueue: boolean;
  reviewMatchPercent: number;
  autoRejectMatchPercent: number;
  zoom: number;
  zoomRange: ZoomRange | null;
  cameras: MediaDeviceInfo[];
  selectedCameraId: string | null;
  onCameraConnect: () => void;
  onCameraDisconnect: () => void;
  onCameraSelect: (deviceId: string) => void;
  onZoomChange: (value: number) => void;
  onScannerConnect: () => void;
  onScannerDisconnect: () => void;
  onScannerRetry: () => void;
  onCalibrate: () => void;
  onAutoFeedChange: (enabled: boolean) => void;
  onAllowDuplicatesChange: (enabled: boolean) => void;
  onMaxCopiesPerCardChange: (value: number) => void;
  onReviewQueueChange: (enabled: boolean) => void;
  onReviewMatchPercentChange: (value: number) => void;
  onAutoRejectMatchPercentChange: (value: number) => void;
}

export function ScannerMenu({
  isCameraActive,
  isConnected,
  autoFeed,
  allowDuplicates,
  maxCopiesPerCard,
  reviewQueue,
  reviewMatchPercent,
  autoRejectMatchPercent,
  zoom,
  zoomRange,
  cameras,
  selectedCameraId,
  onCameraConnect,
  onCameraDisconnect,
  onCameraSelect,
  onZoomChange,
  onScannerConnect,
  onScannerDisconnect,
  onScannerRetry,
  onCalibrate,
  onAutoFeedChange,
  onAllowDuplicatesChange,
  onMaxCopiesPerCardChange,
  onReviewQueueChange,
  onReviewMatchPercentChange,
  onAutoRejectMatchPercentChange,
}: ScannerMenuProps) {
  return (
    <div className="absolute top-2 right-2 z-40">
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button size="icon" variant="secondary" />}>
          <IconAdjustments size={16} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <IconCamera />
              Camera
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {isCameraActive ? (
                <>
                  {cameras.length > 1 && (
                    <>
                      {cameras.map((cam, i) => (
                        <DropdownMenuCheckboxItem
                          key={cam.deviceId}
                          checked={cam.deviceId === selectedCameraId}
                          onCheckedChange={() => onCameraSelect(cam.deviceId)}
                        >
                          {cam.label || `Camera ${i + 1}`}
                        </DropdownMenuCheckboxItem>
                      ))}
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem onClick={onCameraConnect}>
                    Reconnect
                  </DropdownMenuItem>
                  {zoomRange && (
                    <>
                      <DropdownMenuSeparator />
                      <div
                        className="px-2 py-1.5 flex flex-col gap-1"
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <p className="text-xs text-muted-foreground">Zoom</p>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-4">{zoomRange.min}</span>
                          <input
                            type="range"
                            min={zoomRange.min}
                            max={zoomRange.max}
                            step={zoomRange.step}
                            value={zoom}
                            onChange={(e) => onZoomChange(Number(e.target.value))}
                            className="flex-1 cursor-pointer accent-foreground"
                          />
                          <span className="text-xs text-muted-foreground w-4">{zoomRange.max}</span>
                        </div>
                      </div>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={onCameraDisconnect}>
                    Disconnect
                  </DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem onClick={onCameraConnect}>
                  Connect
                </DropdownMenuItem>
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              {isConnected ? <IconDeviceUsbFilled /> : <IconDeviceUsb />}
              Scanner
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {isConnected ? (
                <>
                  <DropdownMenuCheckboxItem
                    checked={autoFeed}
                    onCheckedChange={onAutoFeedChange}
                  >
                    Auto-feed
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={allowDuplicates}
                    onCheckedChange={onAllowDuplicatesChange}
                  >
                    Allow duplicates
                  </DropdownMenuCheckboxItem>
                  <div
                    className="px-2 py-1.5 flex flex-col gap-1"
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <p className="text-xs text-muted-foreground flex items-center justify-between">
                      Max copies per card
                      <span className="font-semibold text-foreground">
                        {maxCopiesPerCard === 0 ? "Unlimited" : maxCopiesPerCard}
                      </span>
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={0}
                        max={20}
                        step={1}
                        value={Math.min(maxCopiesPerCard, 20)}
                        onChange={(e) =>
                          onMaxCopiesPerCardChange(Number(e.target.value))
                        }
                        className="flex-1 cursor-pointer accent-foreground"
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-tight">
                      Over this limit, extras route to the catch-all (reject) bin.
                    </p>
                  </div>
                  <DropdownMenuCheckboxItem
                    checked={reviewQueue}
                    onCheckedChange={onReviewQueueChange}
                  >
                    Review low-confidence
                  </DropdownMenuCheckboxItem>
                  <div
                    className="px-2 py-1.5 flex flex-col gap-1"
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <p className="text-xs text-muted-foreground flex items-center justify-between">
                      Review below
                      <span className="font-semibold text-foreground">
                        {reviewMatchPercent}%
                      </span>
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-7">0</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={reviewMatchPercent}
                        onChange={(e) =>
                          onReviewMatchPercentChange(Number(e.target.value))
                        }
                        className="flex-1 cursor-pointer accent-foreground"
                      />
                      <span className="text-xs text-muted-foreground w-7">100</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-tight">
                      Matches below this pause for a yes/no.
                    </p>
                  </div>
                  <div
                    className="px-2 py-1.5 flex flex-col gap-1"
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <p className="text-xs text-muted-foreground flex items-center justify-between">
                      Auto-reject below
                      <span className="font-semibold text-foreground">
                        {autoRejectMatchPercent === 0
                          ? "Off"
                          : `${autoRejectMatchPercent}%`}
                      </span>
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-7">Off</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={autoRejectMatchPercent}
                        onChange={(e) =>
                          onAutoRejectMatchPercentChange(Number(e.target.value))
                        }
                        className="flex-1 cursor-pointer accent-foreground"
                      />
                      <span className="text-xs text-muted-foreground w-7">100</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-tight">
                      Below this, route straight to catch-all, no pause.
                    </p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onCalibrate}>
                    Calibrate
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onScannerRetry}>
                    Retry Connection
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={onScannerDisconnect}>
                    Disconnect
                  </DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem onClick={onScannerConnect}>
                  Connect
                </DropdownMenuItem>
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
