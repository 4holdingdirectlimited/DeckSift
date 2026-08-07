import { searchByImage } from "@/features/cards/api/card";
import { useCollections } from "@/features/collections/api/use-collections";
import { orgSettingsQueryOptions } from "@/features/companies/api/org-settings";
import { useOrg } from "@/features/companies/api/use-organization";
import { useCameraContext } from "@/features/scanner/api/use-camera";
import {
  CARD_SETTLE_DELAY_MS,
  SCANNABLE_STATUSES,
} from "@/features/scanner/constants";
import {
  autoOrientCard,
  canvasToBlob,
  downscaleCanvas,
  drawDetectionOverlay,
  extractCardImage,
  getDefaultCardContour,
} from "@/features/scanner/lib/card-detection";
import {
  computeFoilDifferenceScore,
  computeFoilScore,
  isFoilByDifference,
  isFoilByScore,
  shouldUseSecondFrame,
} from "@/features/scanner/lib/foil-detect";
import {
  DEFAULT_SCAN_REGION,
  type CardContour,
  type CardScannerProps,
  type PlayingCardWithDistance,
  type ScanRegion,
  type ScannerStatus,
} from "@magic-vault/shared";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

// Singleton AudioContext - browsers cap concurrent contexts (~6).
// Creating one per scan exhausts the limit quickly.
let sharedAudioCtx: AudioContext | null = null;
function getAudioContext(): AudioContext {
  if (!sharedAudioCtx || sharedAudioCtx.state === "closed") {
    sharedAudioCtx = new AudioContext();
  }
  return sharedAudioCtx;
}

function playMatchSound() {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") ctx.resume();

  const notes = [880, 1174.66]; // A5 → D6, ascending
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.09);
    gain.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.09);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.09 + 0.22);
    osc.start(ctx.currentTime + i * 0.09);
    osc.stop(ctx.currentTime + i * 0.09 + 0.25);
  });
}

/** Low single tone on a no-match — distinct from the match chime. */
function playNoMatchSound() {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") ctx.resume();

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = "square";
  osc.frequency.setValueAtTime(220, ctx.currentTime);
  gain.gain.setValueAtTime(0.12, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.25);
}

// Encode a blob to a data URL without a second canvas encode — the upload
// blob and the debug image should share the same JPEG.
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read image blob"));
    reader.readAsDataURL(blob);
  });
}

async function searchCardImage(
  canvas: HTMLCanvasElement,
  contour: CardContour | null | undefined,
  collectionGuid: string | undefined,
  getFreshFrame: () => HTMLCanvasElement | null,
  toggleScanLight: ((on: boolean) => Promise<boolean>) | undefined,
): Promise<{
  card: PlayingCardWithDistance | null;
  alternativeMatches: PlayingCardWithDistance[];
  debugImageUrl: string;
  isFoil: boolean;
}> {
  const warp = (c: HTMLCanvasElement) =>
    contour ? autoOrientCard(extractCardImage(c, contour)) : c;
  const canvasA = warp(canvas);

  // Frame A (scan light off): static foil heuristic. If it's clearly a matte
  // card, skip the light + second frame entirely — most cards cost one
  // picture. Only ambiguous/holo-looking frames trigger the two-shot path.
  const scoreA = computeFoilScore(canvasA);
  let isFoil = isFoilByScore(scoreA);
  let uploadCanvas = canvasA;

  if (shouldUseSecondFrame(scoreA) && toggleScanLight) {
    const lit = await toggleScanLight(true);
    if (lit) {
      // Give the LED and the camera exposure a beat to settle.
      await new Promise((r) => setTimeout(r, 120));
      const fresh = getFreshFrame();
      if (fresh) {
        const canvasB = warp(fresh);
        // A holo changes color with the light angle; a matte card only gets
        // brighter. Chroma shift between the frames is the reliable signal.
        const diff = computeFoilDifferenceScore(canvasA, canvasB);
        isFoil = isFoilByDifference(diff) || isFoilByScore(scoreA);
        // The lit frame is the better image for matching too.
        uploadCanvas = canvasB;
      }
      await toggleScanLight(false);
    }
  }

  // Encode once: the upload blob and the debug image share the same JPEG,
  // so we don't run two full canvas encodes per scan. The canvas is
  // downscaled to the model's 512px input first — same embeddings, ~5-10x
  // smaller upload and stored capture.
  const blob = await canvasToBlob(downscaleCanvas(uploadCanvas), 0.9);
  const debugImageUrl = await blobToDataUrl(blob);
  const formData = new FormData();
  formData.append("image", blob, "card.jpg");
  if (collectionGuid) formData.append("collectionGuid", collectionGuid);

  const { data } = await searchByImage(formData);
  if (!data || data.length === 0)
    return { card: null, alternativeMatches: [], debugImageUrl, isFoil };

  // Matches are hydrated server-side — close matches already carry full card
  // data, so no follow-up per-match requests are needed.
  const cards: PlayingCardWithDistance[] = data
    .map((m) => (m.card ? { ...m.card, distance: m.distance } : null))
    .filter((c): c is PlayingCardWithDistance => c !== null);
  if (cards.length === 0)
    return { card: null, alternativeMatches: [], debugImageUrl, isFoil };

  const [card, ...alternativeMatches] = cards;
  return { card, alternativeMatches, debugImageUrl, isFoil };
}

export function useCardScanner({
  onSearchResults,
  onNoMatch,
  onError,
  rotated = true,
  scanRegion: scanRegionProp,
  toggleScanLight,
}: Omit<CardScannerProps, "className"> & {
  rotated?: boolean;
  scanRegion?: ScanRegion;
} = {}) {
  const {
    stream,
    status: cameraStatus,
    errorMessage: cameraError,
    zoom,
    zoomRange,
    cameras,
    selectedCameraId,
    setZoom,
    selectCamera,
    retryCamera,
    stopCamera,
  } = useCameraContext();
  const { activeCollection } = useCollections();
  const { activeOrg } = useOrg();
  const { data: orgSettingsData } = useQuery(
    orgSettingsQueryOptions(activeOrg?.id),
  );

  const rotatedRef = useRef(rotated);
  rotatedRef.current = rotated;

  const scanRegion =
    scanRegionProp ?? orgSettingsData?.scanRegion ?? DEFAULT_SCAN_REGION;
  const scanRegionRef = useRef(scanRegion);
  scanRegionRef.current = scanRegion;

  const activeCollectionGuidRef = useRef(activeCollection?.guid);
  activeCollectionGuidRef.current = activeCollection?.guid;

  const videoRef = useRef<HTMLVideoElement>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  const statusRef = useRef<ScannerStatus>("initializing");
  const lastScannedCardIdRef = useRef<string | null>(null);
  const isCapturingRef = useRef(false);
  const settleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bumped whenever the camera stream is torn down or replaced (unmount,
  // retryCamera, camera switch). In-flight captures check it after their await
  // so a stale search result can't fire handlers for a dead stream.
  const streamGenerationRef = useRef(0);
  const onSearchResultsRef = useRef(onSearchResults);
  const onNoMatchRef = useRef(onNoMatch);
  const handleErrorRef = useRef<(msg: string) => void>(() => {});
  const toggleScanLightRef = useRef(toggleScanLight);
  toggleScanLightRef.current = toggleScanLight;

  const [status, setStatus] = useState<ScannerStatus>("initializing");
  const [errorMessage, setErrorMessage] = useState("");
  const [duplicateCard, setDuplicateCard] =
    useState<PlayingCardWithDistance | null>(null);
  const [debugImageUrl, setDebugImageUrl] = useState<string | null>(null);
  const debugImageUrlRef = useRef<string | null>(null);
  const [allowDuplicates, setAllowDuplicates] = useState(true);

  // Match-confidence thresholds for the review queue, persisted per-browser
  // AND per-game (different TCGs score matches differently, so each game keeps
  // its own tuned values). "Review below" is where a low-confidence match
  // pauses for a yes/no; "auto-reject below" skips the pause entirely and
  // routes to the catch-all (0 = off).
  const REVIEW_MATCH_PCT_KEY = "reviewMatchPercent";
  const AUTO_REJECT_MATCH_PCT_KEY = "autoRejectMatchPercent";
  const DEFAULT_REVIEW_MATCH_PCT = 82;
  const DEFAULT_AUTO_REJECT_MATCH_PCT = 0;

  const gameKey = activeCollection?.game?.key ?? "default";
  const gameKeyRef = useRef(gameKey);
  gameKeyRef.current = gameKey;

  const loadThreshold = useCallback((key: string, fallback: number): number => {
    const raw = localStorage.getItem(key);
    const parsed = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100
      ? parsed
      : fallback;
  }, []);

  const [reviewMatchPercent, setReviewMatchPercentState] = useState<number>(
    () =>
      loadThreshold(
        `${REVIEW_MATCH_PCT_KEY}:${gameKey}`,
        DEFAULT_REVIEW_MATCH_PCT,
      ),
  );
  const reviewMatchPercentRef = useRef(reviewMatchPercent);
  reviewMatchPercentRef.current = reviewMatchPercent;
  const setReviewMatchPercent = useCallback(
    (pct: number) => {
      const clamped = Math.max(0, Math.min(100, Math.round(pct)));
      setReviewMatchPercentState(clamped);
      localStorage.setItem(
        `${REVIEW_MATCH_PCT_KEY}:${gameKeyRef.current}`,
        String(clamped),
      );
    },
    [],
  );

  const [autoRejectMatchPercent, setAutoRejectMatchPercentState] = useState<
    number
  >(() =>
    loadThreshold(
      `${AUTO_REJECT_MATCH_PCT_KEY}:${gameKey}`,
      DEFAULT_AUTO_REJECT_MATCH_PCT,
    ),
  );
  const autoRejectMatchPercentRef = useRef(autoRejectMatchPercent);
  autoRejectMatchPercentRef.current = autoRejectMatchPercent;
  const setAutoRejectMatchPercent = useCallback(
    (pct: number) => {
      const clamped = Math.max(0, Math.min(100, Math.round(pct)));
      setAutoRejectMatchPercentState(clamped);
      localStorage.setItem(
        `${AUTO_REJECT_MATCH_PCT_KEY}:${gameKeyRef.current}`,
        String(clamped),
      );
    },
    [],
  );

  // Reload the active game's thresholds when the collection's game changes.
  useEffect(() => {
    setReviewMatchPercentState(
      loadThreshold(
        `${REVIEW_MATCH_PCT_KEY}:${gameKey}`,
        DEFAULT_REVIEW_MATCH_PCT,
      ),
    );
    setAutoRejectMatchPercentState(
      loadThreshold(
        `${AUTO_REJECT_MATCH_PCT_KEY}:${gameKey}`,
        DEFAULT_AUTO_REJECT_MATCH_PCT,
      ),
    );
  }, [gameKey, loadThreshold]);

  // Review queue: when the top match is low-confidence (or has close
  // alternatives), pause for an operator yes/no instead of auto-routing.
  // Persisted per-browser so the trust default survives reloads.
  const REVIEW_QUEUE_KEY = "reviewQueue";
  const [reviewQueue, setReviewQueueState] = useState<boolean>(
    () => localStorage.getItem(REVIEW_QUEUE_KEY) !== "off",
  );
  const reviewQueueRef = useRef(reviewQueue);
  reviewQueueRef.current = reviewQueue;
  const setReviewQueue = useCallback((enabled: boolean) => {
    setReviewQueueState(enabled);
    localStorage.setItem(REVIEW_QUEUE_KEY, enabled ? "on" : "off");
  }, []);

  interface PendingReview {
    card: PlayingCardWithDistance;
    alternativeMatches: PlayingCardWithDistance[];
    capturedImageUrl?: string;
    isFoil?: boolean;
  }
  const [pendingReview, setPendingReview] = useState<PendingReview | null>(
    null,
  );
  const pendingReviewRef = useRef<PendingReview | null>(null);

  // Per-card timing for tuning: settle wait + server search round trip. The
  // firmware-side route time is fixed until the delays are runtime-tunable.
  const [lastScanTiming, setLastScanTiming] = useState<{
    settleMs: number;
    searchMs: number;
  } | null>(null);

  const updateStatus = useCallback((newStatus: ScannerStatus) => {
    statusRef.current = newStatus;
    setStatus(newStatus);
  }, []);

  const handleError = useCallback(
    (msg: string) => {
      updateStatus("error");
      setErrorMessage(msg);
      onError?.(msg);
    },
    [onError, updateStatus],
  );

  useEffect(() => {
    onSearchResultsRef.current = onSearchResults;
  }, [onSearchResults]);

  useEffect(() => {
    onNoMatchRef.current = onNoMatch;
  }, [onNoMatch]);

  useEffect(() => {
    handleErrorRef.current = handleError;
  }, [handleError]);

  // Sync camera-level status/errors into scanner status
  useEffect(() => {
    if (cameraStatus === "requesting") {
      updateStatus("requesting-camera");
    } else if (cameraStatus === "error") {
      updateStatus("error");
      setErrorMessage(cameraError);
    } else if (cameraStatus === "idle") {
      updateStatus("initializing");
    }
    // 'ready' is handled by the stream attachment effect below
  }, [cameraStatus, cameraError, updateStatus]);

  const performCapture = useCallback(
    async (checkDuplicate: boolean, contour?: CardContour | null) => {
      const canvas = displayCanvasRef.current;
      if (!canvas) {
        isCapturingRef.current = false;
        updateStatus("scanning");
        return;
      }
      const generation = streamGenerationRef.current;
      const searchStartMs = performance.now();

      try {
        const { card, alternativeMatches, debugImageUrl, isFoil } =
          await searchCardImage(
            canvas,
            contour,
            activeCollectionGuidRef.current,
            () => displayCanvasRef.current,
            toggleScanLightRef.current,
          );
        setLastScanTiming({
          settleMs: CARD_SETTLE_DELAY_MS,
          searchMs: performance.now() - searchStartMs,
        });
        // The stream may have been replaced/unmounted while the search was in
        // flight — drop the result instead of updating a dead tree or letting
        // an old camera's capture enter the session.
        if (generation !== streamGenerationRef.current) return;
        setDebugImageUrl(debugImageUrl);
        debugImageUrlRef.current = debugImageUrl;

        if (card) {
          if (
            checkDuplicate &&
            !allowDuplicates &&
            lastScannedCardIdRef.current === card.id
          ) {
            setDuplicateCard(card);
            updateStatus("duplicate");
          } else {
            const confidencePct = (1 - card.distance) * 100;
            // Far below the floor: asking is pointless, so keep the line
            // moving and route the card to the catch-all bin instead of
            // pausing for review.
            if (
              autoRejectMatchPercentRef.current > 0 &&
              confidencePct < autoRejectMatchPercentRef.current
            ) {
              playNoMatchSound();
              onNoMatchRef.current?.();
              updateStatus("scanning");
              toast.info("Low-confidence match auto-rejected", {
                description: `${confidencePct.toFixed(0)}% match is below your auto-reject threshold — routed to the catch-all bin.`,
              });
              return;
            }
            lastScannedCardIdRef.current = card.id;
            playMatchSound();
            const needsReview =
              reviewQueueRef.current &&
              (confidencePct < reviewMatchPercentRef.current ||
                alternativeMatches.length > 0);
            if (needsReview) {
              const pending: PendingReview = {
                card,
                alternativeMatches,
                capturedImageUrl: debugImageUrl,
                isFoil,
              };
              pendingReviewRef.current = pending;
              setPendingReview(pending);
              updateStatus("review");
            } else {
              onSearchResultsRef.current?.(
                [card, ...alternativeMatches],
                debugImageUrl,
                isFoil,
              );
              updateStatus("scanning");
            }
          }
        } else {
          playNoMatchSound();
          onNoMatchRef.current?.();
          updateStatus("no-match");
        }
      } catch (err) {
        if (generation !== streamGenerationRef.current) return;
        handleErrorRef.current(
          err instanceof Error ? err.message : "Failed to search card",
        );
      } finally {
        if (generation === streamGenerationRef.current) {
          isCapturingRef.current = false;
        }
      }
    },
    [updateStatus, allowDuplicates],
  );

  // Draws the live camera feed to the display canvas every frame. Capture is
  // no longer triggered from here - see `captureCard`, which fires off the
  // module 1 IR sensor confirming a card has arrived (via the feeder command
  // round trip), not from continuously polling the frame for a card shape.
  const detectionLoop = useCallback(() => {
    const video = videoRef.current;
    const displayCanvas = displayCanvasRef.current;

    if (!video || !displayCanvas) return;
    if (video.readyState < video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(detectionLoop);
      return;
    }

    const displayCtx = displayCanvas.getContext("2d");
    if (!displayCtx) return;

    displayCtx.drawImage(video, 0, 0);

    rafRef.current = requestAnimationFrame(detectionLoop);
  }, []);

  // Attach stream to video/canvases and start the detection loop.
  // Re-runs if the stream is replaced (e.g. after retryCamera).
  // On unmount: cancels the RAF loop but does NOT stop the stream tracks -
  // the CameraProvider owns the stream lifetime.
  useEffect(() => {
    if (!stream) return;

    let cancelled = false;
    const video = videoRef.current;
    if (!video) return;

    updateStatus("initializing");
    video.srcObject = stream;

    (async () => {
      try {
        await video.play();
        if (cancelled) return;

        const { videoWidth, videoHeight } = video;
        for (const ref of [displayCanvasRef, overlayCanvasRef]) {
          if (ref.current) {
            ref.current.width = videoWidth;
            ref.current.height = videoHeight;
          }
        }

        const overlayCtx = overlayCanvasRef.current?.getContext("2d");
        if (overlayCtx) {
          overlayCtx.clearRect(0, 0, videoWidth, videoHeight);
          drawDetectionOverlay(overlayCtx, {
            detected: true,
            contour: getDefaultCardContour(
              videoWidth,
              videoHeight,
              scanRegionRef.current,
            ),
            confidence: 1,
          });
        }

        const container = displayCanvasRef.current?.parentElement;
        if (container) {
          const cw = container.clientWidth;
          const ch = container.clientHeight;
          const scale = rotatedRef.current
            ? Math.max(cw / videoHeight, ch / videoWidth)
            : Math.max(cw / videoWidth, ch / videoHeight);
          const cssW = Math.round(videoWidth * scale);
          const cssH = Math.round(videoHeight * scale);
          for (const ref of [displayCanvasRef, overlayCanvasRef]) {
            if (ref.current) {
              ref.current.style.width = `${cssW}px`;
              ref.current.style.height = `${cssH}px`;
              ref.current.style.left = `${(cw - cssW) / 2}px`;
              ref.current.style.top = `${(ch - cssH) / 2}px`;
            }
          }
        }

        updateStatus("paused");
        rafRef.current = requestAnimationFrame(detectionLoop);
      } catch (err) {
        if (!cancelled) {
          handleErrorRef.current(
            err instanceof Error ? err.message : "Failed to start video",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      // Invalidate any in-flight capture against this (now dead) stream.
      streamGenerationRef.current += 1;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      if (settleTimeoutRef.current) {
        clearTimeout(settleTimeoutRef.current);
        settleTimeoutRef.current = null;
        isCapturingRef.current = false;
      }
      video.srcObject = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream]);

  useEffect(() => {
    const canvas = displayCanvasRef.current;
    const overlayCtx = overlayCanvasRef.current?.getContext("2d");
    if (!canvas || !overlayCtx || !canvas.width || !canvas.height) return;
    overlayCtx.clearRect(0, 0, canvas.width, canvas.height);
    drawDetectionOverlay(overlayCtx, {
      detected: true,
      contour: getDefaultCardContour(canvas.width, canvas.height, scanRegion),
      confidence: 1,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanRegion.coverage, scanRegion.offsetX, scanRegion.offsetY]);

  const handleForceAddDuplicate = useCallback(() => {
    if (duplicateCard) {
      onSearchResultsRef.current?.(
        [duplicateCard],
        debugImageUrlRef.current ?? undefined,
      );
      setDuplicateCard(null);
      updateStatus("scanning");
    }
  }, [duplicateCard, updateStatus]);

  const handleForceScan = useCallback(() => {
    if (
      isCapturingRef.current ||
      !SCANNABLE_STATUSES.includes(statusRef.current)
    )
      return;

    const canvas = displayCanvasRef.current;
    if (!canvas) return;

    isCapturingRef.current = true;
    updateStatus("searching");
    setDuplicateCard(null);
    performCapture(
      false,
      getDefaultCardContour(canvas.width, canvas.height, scanRegionRef.current),
    );
  }, [updateStatus, performCapture]);

  const captureCard = useCallback(() => {
    if (
      isCapturingRef.current ||
      !SCANNABLE_STATUSES.includes(statusRef.current)
    )
      return;

    const canvas = displayCanvasRef.current;
    if (!canvas) return;

    isCapturingRef.current = true;
    updateStatus("searching");
    const contour = getDefaultCardContour(
      canvas.width,
      canvas.height,
      scanRegionRef.current,
    );
    settleTimeoutRef.current = setTimeout(() => {
      settleTimeoutRef.current = null;
      performCapture(true, contour);
    }, CARD_SETTLE_DELAY_MS);
  }, [updateStatus, performCapture]);

  const handleSkipDuplicate = useCallback(() => {
    setDuplicateCard(null);
    updateStatus("scanning");
  }, [updateStatus]);

  /** Route the reviewed card normally (it passed the operator's check). */
  const confirmReview = useCallback(() => {
    const pending = pendingReviewRef.current;
    pendingReviewRef.current = null;
    setPendingReview(null);
    if (pending) {
      onSearchResultsRef.current?.(
        [pending.card, ...pending.alternativeMatches],
        pending.capturedImageUrl,
        pending.isFoil,
      );
    }
    updateStatus("scanning");
  }, [updateStatus]);

  /** The match was wrong (or low quality) - route the card to the catch-all. */
  const rejectReview = useCallback(() => {
    pendingReviewRef.current = null;
    setPendingReview(null);
    onNoMatchRef.current?.();
    updateStatus("scanning");
  }, [updateStatus]);

  const handlePause = useCallback(() => {
    pendingReviewRef.current = null;
    setPendingReview(null);
    setDuplicateCard(null);
    updateStatus("paused");
  }, [updateStatus]);

  const handleResume = useCallback(() => {
    updateStatus("scanning");
  }, [updateStatus]);

  const handleRetryError = useCallback(async () => {
    setErrorMessage("");
    try {
      await retryCamera();
    } catch {
      handleErrorRef.current("Failed to reinitialize camera");
    }
  }, [retryCamera]);

  return {
    status,
    errorMessage,
    duplicateCard,
    debugImageUrl,
    videoRef,
    displayCanvasRef,
    overlayCanvasRef,
    captureCard,
    handleForceAddDuplicate,
    handleForceScan,
    handleSkipDuplicate,
    handlePause,
    handleResume,
    handleRetryError,
    handleStopCamera: stopCamera,
    isCameraActive: cameraStatus === "ready",
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
  };
}
