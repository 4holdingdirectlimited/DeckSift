import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useBinConfigs } from "@/features/bins/api/use-bin-configs";
import { reportSerialEvent } from "@/features/notifications/api/notification-settings";
import { useCardScanner } from "@/features/scanner/api/use-card-scanner";
import { useScannedCards } from "@/features/scanner/api/use-scanned-cards";
import { useRegisterScannerIsland } from "@/features/scanner/api/use-scanner-island";
import { useSerial, useSerialMessage } from "@/features/scanner/api/use-serial";
import { MachineLeds } from "@/features/scanner/components/machine-leds";
import { ScannerMenu } from "@/features/scanner/components/scanner-menu";
import { ScannerOverlay } from "@/features/scanner/components/scanner-overlay";
import { ReviewPanel } from "@/features/scanner/components/review-panel";
import { SCANNABLE_STATUSES } from "@/features/scanner/constants";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useRole } from "@/hooks/use-role";
import { cn } from "@/lib/utils";
import type { CardScannerProps } from "@magic-vault/shared";
import { IconEye } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export function CardScanner({ className, compact }: CardScannerProps) {
  const navigate = useNavigate();
  const { isAdmin } = useRole();
  const isMobile = useIsMobile();
  const {
    addCard,
    sendCatchAllBin,
    autoFeed,
    setAutoFeed,
    maxCopiesPerCard,
    setMaxCopiesPerCard,
    registerCardArrivedHook,
    registerPauseHook,
    registerResumeHook,
  } = useScannedCards();
  const registerIsland = useRegisterScannerIsland();
  const {
    isConnected,
    isReady,
    connect,
    disconnect,
    sendTest,
    sendFeed,
    sendCommand,
    sendCommandWithResponse,
  } = useSerial();

  // Scan light = firmware LED 1 (ch0), used for two-frame holo detection.
  // Absent a serial connection the scanner falls back to single-frame
  // heuristics. (LED 2/3/4 status lamps are driven by MachineLeds.)
  const toggleScanLight = useCallback(
    (on: boolean) => sendCommand(JSON.stringify({ led: 1, on })),
    [sendCommand],
  );
  // Machine-fault flag for the red status lamp: lit by jam/route errors,
  // cleared when a new scan starts. Declared here, driven below (status is
  // destructured from useCardScanner just after).
  const [machineFaulted, setMachineFaulted] = useState(false);
  const [isFeeding, setIsFeeding] = useState(false);
  const [isClearingDevice, setIsClearingDevice] = useState(false);
  // Feeder timeout retry guard: a single missed feed is often a hiccup
  // (skewed card, roller slip) — retry once before pausing the line.
  const feedRetryCountRef = useRef(0);
  const { hasCatchAll } = useBinConfigs();
  const {
    status,
    errorMessage,
    isCameraActive,
    debugImageUrl,
    videoRef,
    displayCanvasRef,
    overlayCanvasRef,
    captureCard,
    handleForceAddDuplicate,
    handleForceScan,
    handleSkipDuplicate: handleSkipDuplicateFromScanner,
    handlePause,
    handleResume,
    handleRetryError,
    handleStopCamera,
    zoom,
    zoomRange,
    cameras,
    selectedCameraId,
    setZoom,
    selectCamera,
    allowDuplicates,
    setAllowDuplicates,
    reviewQueue,
    setReviewQueue,
    reviewMatchPercent,
    setReviewMatchPercent,
    autoRejectMatchPercent,
    setAutoRejectMatchPercent,
    lastScanTiming,
    pendingReview,
    confirmReview,
    rejectReview,
  } = useCardScanner({
    onSearchResults: (cards, capturedImageUrl, isFoil) => {
      if (cards.length > 0) {
        addCard(cards[0], capturedImageUrl, cards.slice(1), isFoil);
      }
    },
    onNoMatch: sendCatchAllBin,
    rotated: !isMobile,
    toggleScanLight,
  });

  // Clear the machine-fault lamp as soon as a new scan actually starts.
  useEffect(() => {
    if (status === "scanning" || status === "searching") setMachineFaulted(false);
  }, [status]);

  useSerialMessage((msg) => {
    if (
      typeof msg === "object" &&
      msg !== null &&
      "error" in msg &&
      (msg as Record<string, unknown>).error === "jam"
    ) {
      const raw = msg as Record<string, unknown>;

      // Module 1 with no bin means the card was never scanned/routed - it's
      // just sitting there unidentified. Try to auto-recover by forcing a
      // scan instead of stopping for a human, as long as the scanner is
      // actually in a state where a scan can run.
      if (
        raw.module === 1 &&
        raw.bin === undefined &&
        SCANNABLE_STATUSES.includes(status)
      ) {
        setMachineFaulted(true);
        toast.info("Card stuck at module 1 - forcing a scan", {
          description:
            "It was never identified, so we're scanning it automatically.",
        });
        handleForceScan();
        return;
      }

      setMachineFaulted(true);
      handlePause();
      toast.error("Card jam detected", {
        description: `Card stuck at module ${raw.module}${raw.bin ? ` (heading to bin ${raw.bin})` : ""}. Check the sorter and resume.`,
        duration: Infinity,
        dismissible: true,
      });
      void reportSerialEvent({ command: "jam", sent: true, response: raw });
    } else if (
      typeof msg === "object" &&
      msg !== null &&
      "error" in msg &&
      (msg as Record<string, unknown>).error === "recovered"
    ) {
      // Firmware reported cards already sitting at a module IR when it booted
      // (e.g. power loss mid-run) — tell the operator to flush the device.
      const raw = msg as Record<string, unknown>;
      toast.warning("Cards found in sorter", {
        description: `Module ${String(raw.module)} had a card when the sorter booted. Use “Clear device” to flush it.`,
        duration: Infinity,
        dismissible: true,
      });
    }
  });

  const handleFeed = useCallback(async () => {
    setIsFeeding(true);
    try {
      const response = await sendFeed();
      if (!response) {
        toast.error("Feed failed", {
          description: "Could not send feeder command or no response in time.",
        });
        void reportSerialEvent({
          command: "feeder",
          sent: true,
          response: null,
        });
        return;
      }
      const parsed = response as Record<string, unknown>;
      if (parsed.empty) {
        handlePause();
        toast.error("Feeder empty", {
          description:
            "No cards remaining in the hopper. Add more cards to continue.",
          duration: Infinity,
          dismissible: true,
        });
        void reportSerialEvent({
          command: "feeder",
          sent: true,
          response: parsed,
        });
      } else if (parsed.error) {
        toast.error("Feeder error", {
          description: String(parsed.error),
          duration: Infinity,
          dismissible: true,
        });
        void reportSerialEvent({
          command: "feeder",
          sent: true,
          response: parsed,
        });
      } else if (parsed.detected === false) {
        // Firmware replies status:"ok", detected:false, empty:false when the
        // feeder ran its full duration without a card tripping module 1's IR -
        // a timeout, not a successful feed. Capturing here would search an
        // empty frame and can save garbage matches.
        if (feedRetryCountRef.current < 1) {
          feedRetryCountRef.current += 1;
          toast.info("Feeder timeout — retrying once", {
            description:
              "No card tripped the sensor. Retrying before pausing the line.",
          });
          void reportSerialEvent({
            command: "feeder",
            sent: true,
            response: parsed,
          });
          await new Promise((r) => setTimeout(r, 400));
          return handleFeed();
        }
        feedRetryCountRef.current = 0;
        handlePause();
        toast.error("Feeder timeout", {
          description:
            "No card reached the scanner after a retry. Check the hopper and the feeder, then try again.",
          duration: Infinity,
          dismissible: true,
        });
        void reportSerialEvent({
          command: "feeder",
          sent: true,
          response: parsed,
        });
      } else {
        // Feeder confirmed a card reached module 1 - capture it now.
        feedRetryCountRef.current = 0;
        captureCard();
      }
    } finally {
      setIsFeeding(false);
    }
  }, [sendFeed, captureCard, handlePause]);

  // Opens every module's bottom paddle at once so any card resting in the
  // mechanism (jammed, stuck between modules, etc.) drops through to the
  // catch-all area - a manual "flush the device" escape hatch, independent
  // of the normal feed/route flow.
  const handleClearDevice = useCallback(async () => {
    setIsClearingDevice(true);
    try {
      const response = await sendCommandWithResponse(
        { clearDevice: true },
        10000,
        1,
      );
      if (!response) {
        toast.error("Clear failed", {
          description: "Device did not respond in time.",
        });
        return;
      }
      toast.success("Device cleared", {
        description: "All bottom paddles were opened to drop any stuck cards.",
      });
    } finally {
      setIsClearingDevice(false);
    }
  }, [sendCommandWithResponse]);

  // Skipping a duplicate means routing the physical card to the catch-all
  // bin (it was never sent anywhere since sendBin is only called on
  // add/add-again) and resetting the scanner to continue.
  const handleSkipDuplicate = useCallback(() => {
    sendCatchAllBin();
    handleSkipDuplicateFromScanner();
  }, [sendCatchAllBin, handleSkipDuplicateFromScanner]);

  useEffect(() => {
    return registerCardArrivedHook(captureCard);
  }, [registerCardArrivedHook, captureCard]);

  useEffect(() => {
    return registerPauseHook(handlePause);
  }, [registerPauseHook, handlePause]);

  useEffect(() => {
    return registerResumeHook(handleResume);
  }, [registerResumeHook, handleResume]);

  useEffect(() => {
    registerIsland({
      status,
      isCameraActive,
      isConnected,
      isReady,
      isFeeding,
      isClearingDevice,
      handleForceAddDuplicate,
      handleForceScan,
      handleSkipDuplicate,
      handlePause: () => {
        setAutoFeed(false);
        handlePause();
      },
      handleResume,
      handleFeed,
      handleClearDevice,
    });
  }, [
    status,
    isCameraActive,
    isConnected,
    isReady,
    isFeeding,
    isClearingDevice,
    handleForceAddDuplicate,
    handleForceScan,
    handleSkipDuplicate,
    handlePause,
    handleResume,
    handleFeed,
    handleClearDevice,
    setAutoFeed,
    registerIsland,
  ]);

  useEffect(() => () => registerIsland(null), [registerIsland]);

  const canScan = isCameraActive;
  const wasReadyRef = useRef(canScan);
  useEffect(() => {
    if (!canScan && wasReadyRef.current) {
      handlePause();
    }
    if (canScan && !wasReadyRef.current && status === "paused") {
      handleResume();
    }
    wasReadyRef.current = canScan;
  }, [canScan, handlePause, handleResume, status]);

  return (
    <div
      className={cn(
        "flex flex-col-reverse md:flex-col overflow-hidden gap-2",
        className,
      )}
    >
      <div
        className={cn(
          "relative overflow-hidden bg-background w-full h-full max-w-full rounded-lg border",
          !compact && "md:aspect-[2.5/3.5]",
        )}
      >
        <video ref={videoRef} className="hidden" playsInline muted />
        <canvas
          ref={displayCanvasRef}
          className={cn("absolute", !isMobile && "rotate-90")}
        />
        <canvas
          ref={overlayCanvasRef}
          className={cn(
            "absolute z-20 pointer-events-none",
            !isMobile && "rotate-90",
          )}
        />
        {isAdmin && debugImageUrl && (
          <Tooltip>
            <TooltipTrigger className="absolute top-2 left-2 z-30 flex items-center justify-center size-7 rounded-lg bg-background/70 text-foreground backdrop-blur-sm hover:bg-background/90 transition-colors">
              <IconEye size={16} />
            </TooltipTrigger>
            <TooltipContent
              side="right"
              className="bg-background text-foreground border border-border p-0 shadow-lg max-w-none"
            >
              <img
                src={debugImageUrl}
                alt="Last search image"
                className="w-48"
              />
            </TooltipContent>
          </Tooltip>
        )}
        <ScannerOverlay
          status={status}
          errorMessage={errorMessage}
          isCameraActive={isCameraActive}
          isConnected={isConnected}
          isReady={isReady}
          hasCatchAll={hasCatchAll}
          onRetryError={handleRetryError}
        />
        {status === "review" && pendingReview && (
          <ReviewPanel
            pending={pendingReview}
            onConfirm={confirmReview}
            onReject={rejectReview}
          />
        )}
        {lastScanTiming && status !== "review" && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-full bg-background/80 backdrop-blur-sm border px-2.5 py-1 text-[10px] text-muted-foreground tabular-nums">
            <span>
              last card:{" "}
              <span className="font-semibold text-foreground">
                {((lastScanTiming.settleMs + lastScanTiming.searchMs) / 1000).toFixed(1)}s
              </span>
            </span>
            <span className="text-border">|</span>
            <span>settle {lastScanTiming.settleMs}ms</span>
            <span>search {lastScanTiming.searchMs.toFixed(0)}ms</span>
          </div>
        )}
        <div className="absolute bottom-2 right-2 z-30 rounded-full bg-background/80 backdrop-blur-sm border px-2.5 py-1">
          <MachineLeds
            status={status}
            isConnected={isConnected}
            isReady={isReady}
            isFeeding={isFeeding}
            faulted={machineFaulted}
          />
        </div>
        <ScannerMenu
          isCameraActive={isCameraActive}
          isConnected={isConnected}
          autoFeed={autoFeed}
          allowDuplicates={allowDuplicates}
          maxCopiesPerCard={maxCopiesPerCard}
          reviewQueue={reviewQueue}
          reviewMatchPercent={reviewMatchPercent}
          autoRejectMatchPercent={autoRejectMatchPercent}
          zoom={zoom}
          zoomRange={zoomRange}
          cameras={cameras}
          selectedCameraId={selectedCameraId}
          onCameraConnect={handleRetryError}
          onCameraDisconnect={handleStopCamera}
          onCameraSelect={selectCamera}
          onZoomChange={setZoom}
          onScannerConnect={connect}
          onScannerDisconnect={disconnect}
          onScannerRetry={sendTest}
          onCalibrate={() => navigate("/app/calibrate")}
          onAutoFeedChange={setAutoFeed}
          onAllowDuplicatesChange={setAllowDuplicates}
          onMaxCopiesPerCardChange={setMaxCopiesPerCard}
          onReviewQueueChange={setReviewQueue}
          onReviewMatchPercentChange={setReviewMatchPercent}
          onAutoRejectMatchPercentChange={setAutoRejectMatchPercent}
        />
      </div>
    </div>
  );
}
