import {
  type PlayingCard,
  type PlayingCardWithDistance,
  type ScannedCard,
  evaluateCardBin,
  getCatchAllBin,
} from "@magic-vault/shared";

import { useBinConfigs } from "@/features/bins/api/use-bin-configs";
import { useBundles } from "@/features/bundles/api/use-bundles";
import { useChase } from "@/features/chase/api/use-chase";
import { useWishlist } from "@/features/wishlist/api/use-wishlist";
import {
  addCollectionCard,
  clearCollectionCards,
  loadCollectionCards,
  markCollectionCardsDownloaded,
  releaseScanLock,
  removeCollectionCard,
  removeCollectionCards,
  setCollectionCardFoil,
  setCollectionCardCondition,
  updateCollectionCard,
} from "@/features/collections/api/collections";
import { useCollectionLocks } from "@/features/collections/api/use-collection-locks";
import { useCollections } from "@/features/collections/api/use-collections";
import { reportSerialEvent } from "@/features/notifications/api/notification-settings";
import { useScanTimer } from "@/features/scanner/api/use-scan-timer";
import { useSerial } from "@/features/scanner/api/use-serial";
import { announceSetProgress } from "@/features/scanner/lib/set-progress";
import type { ScannedCardsContextValue } from "@/features/scanner/types";
import { generateScanId } from "@/lib/utils";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

const ScannedCardsContext = createContext<ScannedCardsContextValue | null>(
  null,
);

export function ScannedCardsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [cards, setCards] = useState<ScannedCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [digitize, setDigitize] = useState(false);
  const digitizeRef = useRef(digitize);
  useEffect(() => {
    digitizeRef.current = digitize;
  }, [digitize]);

  // Rolling scan-rate telemetry: timestamps of completed scans, kept for a
  // 60-second window. Drives the "Live rate" stat so tuning changes are
  // measurable without watching the session average (which includes idle).
  const scanTimesRef = useRef<number[]>([]);
  const [lastScanAt, setLastScanAt] = useState<number | null>(null);
  const recordScanTime = useCallback(() => {
    const now = Date.now();
    scanTimesRef.current = [
      ...scanTimesRef.current.filter((t) => t >= now - 60_000),
      now,
    ].slice(-60);
    setLastScanAt(now);
  }, []);
  // 5 s tick so the rolling window decays without needing a new scan.
  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNowTick((t) => t + 1), 5000);
    return () => clearInterval(id);
  }, []);
  const scanRatePerMin = useMemo(
    () =>
      scanTimesRef.current.filter((t) => t >= Date.now() - 60_000).length,
    // Recompute when a scan lands or the window slides.
    [lastScanAt, nowTick],
  );

  // Set-completeness announcements: when a new scan lands, fire a toast if the
  // card's set hit a milestone. Uses the newest card (cards[0]) as the trigger.
  const prevCardCountRef = useRef(0);
  useEffect(() => {
    if (cards.length === 0) {
      prevCardCountRef.current = 0;
      return;
    }
    if (cards.length <= prevCardCountRef.current) return;
    prevCardCountRef.current = cards.length;
    const gameKey = activeCollectionRef.current?.game?.key;
    const snapshot = cards.slice(0, 200);
    void announceSetProgress(snapshot, gameKey);
  }, [cards]);
  // Id of the most recently committed scan — powers "Undo last".
  const lastScanIdRef = useRef<string | null>(null);
  const { configs: binConfigs, fieldDefinitions } = useBinConfigs();
  const { sendBin, sendFeed, sendCommandWithResponse, isConnected, isReady } =
    useSerial();
  const { activeCollection } = useCollections();

  const { locks, currentUserId } = useCollectionLocks();
  const locksRef = useRef(locks);
  const currentUserIdRef = useRef(currentUserId);

  useEffect(() => {
    locksRef.current = locks;
  }, [locks]);
  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  const binConfigsRef = useRef(binConfigs);
  const fieldDefinitionsRef = useRef(fieldDefinitions);
  // Bundle-mode routing state. Kept in a ref because addCard is memoized — the
  // ref always points at the latest bundle context while the callback closure
  // stays stable.
  const bundle = useBundles();
  const bundleRef = useRef(bundle);
  useEffect(() => {
    bundleRef.current = bundle;
  }, [bundle]);
  // Same pattern for set-chase and wishlist routing (priority: bundle > chase
  // > wishlist > normal rules).
  const chase = useChase();
  const chaseRef = useRef(chase);
  useEffect(() => {
    chaseRef.current = chase;
  }, [chase]);
  const wishlist = useWishlist();
  const wishlistRef = useRef(wishlist);
  useEffect(() => {
    wishlistRef.current = wishlist;
  }, [wishlist]);
  const serialRef = useRef({
    sendBin,
    sendFeed,
    sendCommandWithResponse,
    isConnected,
    isReady,
  });
  const activeCollectionRef = useRef(activeCollection);
  const prevCollectionGuidRef = useRef<string | undefined>(undefined);
  const [autoFeed, setAutoFeedState] = useState(true);
  const autoFeedRef = useRef(true);
  const cardArrivedHookRef = useRef<(() => void) | null>(null);
  const pauseHookRef = useRef<(() => void) | null>(null);
  const resumeHookRef = useRef<(() => void) | null>(null);
  // Software bin capacity — with no bin-full sensors we count cards per bin
  // this session and refuse to route into a bin that has reached its max.
  // binCounts is the renderable mirror of the ref (the UI shows per-bin
  // status + empty/reset buttons).
  const [binCounts, setBinCounts] = useState<Record<number, number>>({});
  const binCountsRef = useRef<Record<number, number>>({});
  // True while the machine is paused because a bin had no space — Empty-ing
  // any bin clears this and resumes the run automatically.
  const pausedForBinRef = useRef(false);
  // Captured-image dedupe — reusing the photo of a card already scanned this
  // session avoids storing a fresh base64 JPEG for every duplicate card.
  const capturedImageRef = useRef<Record<string, string>>({});
  const [timerTrigger, setTimerTrigger] = useState<number | undefined>(
    undefined,
  );
  const [timerResetSignal, setTimerResetSignal] = useState(0);
  const { elapsedMs, isActive: isTimerActive } = useScanTimer(
    timerTrigger,
    timerResetSignal,
  );

  useEffect(() => {
    binConfigsRef.current = binConfigs;
  }, [binConfigs]);

  useEffect(() => {
    fieldDefinitionsRef.current = fieldDefinitions;
  }, [fieldDefinitions]);

  useEffect(() => {
    serialRef.current = {
      sendBin,
      sendFeed,
      sendCommandWithResponse,
      isConnected,
      isReady,
    };
  }, [sendBin, sendFeed, sendCommandWithResponse, isConnected, isReady]);

  const resetBinCounts = useCallback(() => {
    binCountsRef.current = {};
    setBinCounts({});
    pausedForBinRef.current = false;
  }, []);

  const registerResumeHook = useCallback((fn: () => void) => {
    resumeHookRef.current = fn;
    return () => {
      if (resumeHookRef.current === fn) resumeHookRef.current = null;
    };
  }, []);

  /** Increment the physical card count for a bin (ref + render state). */
  const incrementBin = useCallback((bin: number) => {
    binCountsRef.current[bin] = (binCountsRef.current[bin] ?? 0) + 1;
    setBinCounts((prev) => ({ ...prev, [bin]: (prev[bin] ?? 0) + 1 }));
  }, []);

  /**
   * Pause the run because a card has nowhere to go — the destination bin (and
   * the fallback) are at capacity. The operator empties a bin and taps Empty
   * on it; emptyBin() clears pausedForBinRef and resumes auto-feed.
   */
  const pauseForFullBin = useCallback((bin: number) => {
    pausedForBinRef.current = true;
    autoFeedRef.current = false;
    setAutoFeedState(false);
    pauseHookRef.current?.();
    toast.error(`Bin ${bin} is full`, {
      description:
        "No space left for the next card. Empty a bin, then tap Empty on it to resume.",
      duration: Infinity,
      dismissible: true,
    });
  }, []);

  const setAutoFeed = useCallback((enabled: boolean) => {
    autoFeedRef.current = enabled;
    setAutoFeedState(enabled);
    // Note: enabling auto-feed does NOT reset bin counts — the per-bin Empty
    // buttons (Bin Status) are the confirmation that a bin was physically
    // emptied. Auto-resetting here would forget cards still in other bins.
  }, []);

  const registerCardArrivedHook = useCallback((fn: () => void) => {
    cardArrivedHookRef.current = fn;
    return () => {
      if (cardArrivedHookRef.current === fn) cardArrivedHookRef.current = null;
    };
  }, []);

  const registerPauseHook = useCallback((fn: () => void) => {
    pauseHookRef.current = fn;
    return () => {
      if (pauseHookRef.current === fn) pauseHookRef.current = null;
    };
  }, []);

  const triggerAutoFeed = useCallback(async () => {
    const parsed = await serialRef.current.sendFeed();
    if (parsed === null) {
      autoFeedRef.current = false;
      setAutoFeedState(false);
      toast.error("Auto-feed failed", {
        description: "Could not send feeder command or no response in time.",
      });
      void reportSerialEvent({
        command: "auto-feed",
        sent: true,
        response: null,
      });
      return;
    }
    const res = parsed as Record<string, unknown>;
    if (res.empty) {
      autoFeedRef.current = false;
      setAutoFeedState(false);
      pauseHookRef.current?.();
      toast.error("Feeder empty", {
        description:
          "No cards remaining in the hopper. Add more cards to continue.",
        duration: Infinity,
        dismissible: true,
      });
      void reportSerialEvent({
        command: "auto-feed",
        sent: true,
        response: res,
      });
    } else if (res.error) {
      autoFeedRef.current = false;
      setAutoFeedState(false);
      toast.error("Feeder error", {
        description: String(res.error),
        duration: Infinity,
        dismissible: true,
      });
      void reportSerialEvent({
        command: "auto-feed",
        sent: true,
        response: res,
      });
    } else if (res.detected === false) {
      // Firmware: status "ok" + detected:false = feeder timed out without a
      // card reaching module 1. Don't treat it as a successful feed (which
      // would fire a capture of an empty frame and save a garbage match).
      autoFeedRef.current = false;
      setAutoFeedState(false);
      pauseHookRef.current?.();
      toast.error("Feeder timeout", {
        description:
          "No card reached the scanner. Check the hopper and the feeder, then resume.",
        duration: Infinity,
        dismissible: true,
      });
      void reportSerialEvent({
        command: "auto-feed",
        sent: true,
        response: res,
      });
    } else {
      cardArrivedHookRef.current?.();
    }
  }, []);

  /** Reset a bin's physical count after the operator empties it. */
  const emptyBin = useCallback(
    (bin: number) => {
      binCountsRef.current[bin] = 0;
      setBinCounts((prev) => ({ ...prev, [bin]: 0 }));
      if (pausedForBinRef.current) {
        pausedForBinRef.current = false;
        resumeHookRef.current?.();
        autoFeedRef.current = true;
        setAutoFeedState(true);
        // The card that triggered the pause is still at module 1 — feed it
        // (re-scan) now that a bin has space.
        void triggerAutoFeed();
      }
    },
    [triggerAutoFeed],
  );

  useEffect(() => {
    const prev = prevCollectionGuidRef.current;
    const next = activeCollection?.guid;
    if (prev && prev !== next) {
      releaseScanLock(prev).catch(() => {});
    }
    prevCollectionGuidRef.current = next;
    activeCollectionRef.current = activeCollection;
  }, [activeCollection]);

  useEffect(() => {
    return () => {
      const guid = activeCollectionRef.current?.guid;
      if (guid) releaseScanLock(guid).catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!activeCollection) {
      setCards([]);
      setIsLoading(false);
      return;
    }

    // New collection = fresh session: reset the image dedupe and bin counts.
    capturedImageRef.current = {};
    resetBinCounts();

    let cancelled = false;
    setCards([]);
    setIsLoading(true);

    loadCollectionCards(activeCollection.guid)
      .then((r) => {
        if (!cancelled) setCards(r.data ?? []);
      })
      .catch((err) => {
        if (!cancelled) console.error("Failed to load collection cards:", err);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeCollection?.guid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist a scanned card and physically route it to a bin. Shared by the
  // normal routing path and bundle mode so both record scans the same way.
  const commitScan = useCallback(
    (record: ScannedCard, binNumber: number | undefined) => {
      const collection = activeCollectionRef.current;
      if (!collection) return;
      lastScanIdRef.current = record.scanId;
      setCards((prev) => [record, ...prev]);
      setTimerTrigger(record.scannedAt);
      addCollectionCard(collection.guid, record)
        .then((result) => {
          if (!result.success) {
            setCards((prev) => prev.filter((c) => c.scanId !== record.scanId));
            toast.error("Collection locked", {
              description:
                "Another org member is currently scanning into this collection.",
            });
          }
        })
        .catch((err) => console.error("Failed to persist card:", err));

      if (
        binNumber != null &&
        serialRef.current.isConnected &&
        serialRef.current.isReady
      ) {
        // Pipeline: request the next card NOW, while this one is still being
        // routed. The firmware queues the feed and replies only when the card
        // actually arrives at module 1 — so the next card starts moving the
        // moment the route finishes, instead of after a serial round-trip.
        if (autoFeedRef.current) {
          void triggerAutoFeed();
        }
        serialRef.current.sendBin(binNumber).then((response) => {
          // Abort a still-pending queued feed if routing failed — the next
          // card must not be pulled when the current one wasn't placed.
          const cancelQueuedFeed = () => {
            void serialRef.current.sendCommandWithResponse(
              { cancelFeed: true },
              1000,
            );
          };
          if (!response) {
            cancelQueuedFeed();
            toast.error("Routing failed", {
              description: `No response from sorter for bin ${binNumber}.`,
            });
            void reportSerialEvent({
              command: "bin",
              sent: true,
              response: null,
              cardName: record.card.name,
              binNumber,
            });
            autoFeedRef.current = false;
            setAutoFeedState(false);
            return;
          }
          const res = response as Record<string, unknown>;
          if (res.empty) {
            cancelQueuedFeed();
            toast.error("Feeder empty", {
              description:
                "No cards remaining in the hopper. Add more cards to continue.",
              duration: Infinity,
              dismissible: true,
            });
            void reportSerialEvent({
              command: "bin",
              sent: true,
              response: res,
              cardName: record.card.name,
              binNumber,
            });
            autoFeedRef.current = false;
            setAutoFeedState(false);
            pauseHookRef.current?.();
            return;
          }
          if (res.error) {
            cancelQueuedFeed();
            toast.error("Sorter error", {
              description: String(res.error),
              duration: Infinity,
              dismissible: true,
            });
            void reportSerialEvent({
              command: "bin",
              sent: true,
              response: res,
              cardName: record.card.name,
              binNumber,
            });
            autoFeedRef.current = false;
            setAutoFeedState(false);
            return;
          }
          incrementBin(binNumber);
          // Next-card feed was already requested up front (see above).
        });
      }
    },
    [incrementBin, triggerAutoFeed],
  );

  const addCard = useCallback(
    (
      card: PlayingCardWithDistance,
      capturedImageUrl?: string,
      alternativeMatches?: PlayingCardWithDistance[],
      isFoil?: boolean,
    ) => {
      const collection = activeCollectionRef.current;
      if (!collection) {
        toast.error("No collection selected", {
          description: "Create or select a collection before scanning.",
        });
        return;
      }

      const lock = locksRef.current?.[collection.guid];
      if (lock && lock.userId !== currentUserIdRef.current) {
        toast.error("Collection locked", {
          description:
            "Another org member is currently scanning into this collection.",
        });
        return;
      }

      recordScanTime();

      // Reuse the first capture of this card this session (dedupe) so repeated
      // copies don't each store a full base64 JPEG.
      let effectiveImage = capturedImageRef.current[card.id];
      if (!effectiveImage && capturedImageUrl) {
        effectiveImage = capturedImageUrl;
        capturedImageRef.current[card.id] = effectiveImage;
      }

      // ── Digitize mode: scan + record every card, no sorting. The physical
      // card routes to the catch-all so the machine keeps moving; the scan
      // record still grows the collection/library database.
      if (digitizeRef.current) {
        const catchAll = getCatchAllBin(binConfigsRef.current);
        const binNumber = catchAll?.binNumber;
        const destCapacity = binNumber
          ? binConfigsRef.current.find((b) => b.binNumber === binNumber)
              ?.maxCapacity ?? 0
          : 0;
        if (
          binNumber != null &&
          destCapacity > 0 &&
          (binCountsRef.current[binNumber] ?? 0) >= destCapacity
        ) {
          pauseForFullBin(binNumber);
          return;
        }
        const record: ScannedCard = {
          scanId: generateScanId(),
          card,
          scannedAt: Date.now(),
          binNumber,
          capturedImageUrl: effectiveImage,
          isFoil: isFoil ?? false,
          alternativeMatches: alternativeMatches?.length
            ? alternativeMatches
            : undefined,
        };
        commitScan(record, binNumber);
        toast.success(`Digitized: ${card.name}`, {
          description: "Recorded without sorting (catch-all).",
        });
        return;
      }

      // ── Bundle mode: the active run decides the bin ──
      const bundle = bundleRef.current;
      if (bundle.isBundleActive && bundle.activeRun) {
        const priceUsd = parseFloat(card.prices.usd ?? "");
        void bundle
          .placeCard(
            card.id,
            card.rarity.toLowerCase(),
            isFoil,
            Number.isFinite(priceUsd) ? priceUsd : undefined,
          )
          .then((decision) => {
            // Safe failure mode: if the server can't be reached, route to the
            // reject bin so the physical card leaves module 1 and no bundle
            // bin is ever polluted by an unknown card.
            const binNumber =
              decision?.binNumber ??
              bundle.rejectBinNumber ??
              getCatchAllBin(binConfigsRef.current)?.binNumber;

            // Physical bin capacity — the run decides WHERE the card goes,
            // but a bin can't hold more than its capacity. If the destination
            // is full there is nowhere for this card: pause until a bin is
            // emptied and confirmed.
            const destCapacity =
              binConfigsRef.current.find((b) => b.binNumber === binNumber)
                ?.maxCapacity ?? 0;
            if (
              binNumber != null &&
              destCapacity > 0 &&
              (binCountsRef.current[binNumber] ?? 0) >= destCapacity
            ) {
              pauseForFullBin(binNumber);
              return;
            }

            const record: ScannedCard = {
              scanId: generateScanId(),
              card,
              scannedAt: Date.now(),
              binNumber,
              capturedImageUrl: effectiveImage,
              isFoil: isFoil ?? false,
              alternativeMatches: alternativeMatches?.length
                ? alternativeMatches
                : undefined,
            };
            commitScan(record, binNumber);

            if (!decision) {
              toast.error("Bundle routing failed", {
                description:
                  "Could not reach the server — card sent to the reject bin. Bundle state is unchanged.",
              });
              return;
            }
            if (decision.reason !== "ok") {
              const reasonText =
                decision.reason === "duplicate"
                  ? "already in this bundle"
                  : decision.reason === "target-full"
                    ? "that rarity slot is full"
                    : decision.reason === "foil-mismatch"
                      ? "foil status doesn't match this target"
                      : "rarity is not part of this bundle";
              toast.info(`Rejected: ${reasonText}`, {
                description: `${card.name} → reject bin ${decision.binNumber}.`,
              });
            }
            if (decision.complete) {
              toast.success("Bundle complete! 🎉", {
                description:
                  "All target counts are met. Auto-feed paused — empty the bins and start the next bundle.",
                duration: Infinity,
                dismissible: true,
              });
              autoFeedRef.current = false;
              setAutoFeedState(false);
              pauseHookRef.current?.();
            }
          },
        );
        return;
      }

      // ── Set-chase mode: the active chase decides the bin ──
      const chase = chaseRef.current;
      if (chase.isChaseActive && chase.activeRun) {
        void chase.placeCard(card.id, card.set).then((decision) => {
          const binNumber =
            decision?.binNumber ??
            chase.rejectBinNumber ??
            getCatchAllBin(binConfigsRef.current)?.binNumber;

          const destCapacity =
            binConfigsRef.current.find((b) => b.binNumber === binNumber)
              ?.maxCapacity ?? 0;
          if (
            binNumber != null &&
            destCapacity > 0 &&
            (binCountsRef.current[binNumber] ?? 0) >= destCapacity
          ) {
            pauseForFullBin(binNumber);
            return;
          }

          const record: ScannedCard = {
            scanId: generateScanId(),
            card,
            scannedAt: Date.now(),
            binNumber,
            capturedImageUrl: effectiveImage,
            isFoil: isFoil ?? false,
            alternativeMatches: alternativeMatches?.length
              ? alternativeMatches
              : undefined,
          };
          commitScan(record, binNumber);

          if (!decision) {
            toast.error("Set chase routing failed", {
              description:
                "Could not reach the server — card sent to the reject bin. Chase state is unchanged.",
            });
            return;
          }
          if (decision.reason !== "ok") {
            const reasonText =
              decision.reason === "not-in-set"
                ? "not part of this set"
                : decision.reason === "owned"
                  ? "already owned"
                  : "already found this run";
            toast.info(`Chase reject: ${reasonText}`, {
              description: `${card.name} → reject bin ${decision.binNumber}.`,
            });
          }
        });
        return;
      }

      // ── Wishlist: wanted cards override normal bin rules ──
      const wishlistBin = wishlistRef.current.matchBin(
        card,
        collection.game?.key ?? "",
      );
      if (wishlistBin != null) {
        const destCapacity =
          binConfigsRef.current.find((b) => b.binNumber === wishlistBin)
            ?.maxCapacity ?? 0;
        if (
          destCapacity > 0 &&
          (binCountsRef.current[wishlistBin] ?? 0) >= destCapacity
        ) {
          pauseForFullBin(wishlistBin);
          return;
        }
        const record: ScannedCard = {
          scanId: generateScanId(),
          card,
          scannedAt: Date.now(),
          binNumber: wishlistBin,
          capturedImageUrl: effectiveImage,
          isFoil: isFoil ?? false,
          alternativeMatches: alternativeMatches?.length
            ? alternativeMatches
            : undefined,
        };
        commitScan(record, wishlistBin);
        toast.success(`Wishlist match: ${card.name}`, {
          description: `Routed to wishlist bin ${wishlistBin}.`,
        });
        return;
      }

      // ── Normal mode: evaluate bin rules ──
      const matchedBin = evaluateCardBin(
        card,
        binConfigsRef.current,
        fieldDefinitionsRef.current,
      );

      // Resolve the bin this card will be routed to BEFORE persisting it. If
      // the matched bin is at capacity, fall back to the catch-all bin so the
      // physical card still leaves module 1 - otherwise it would sit there and
      // be re-scanned when auto-feed resumes (double count) while a phantom
      // record was already saved.
      let routeBin = matchedBin;
      if (matchedBin) {
        const maxCapacity = matchedBin.maxCapacity ?? 0;
        if (
          maxCapacity > 0 &&
          (binCountsRef.current[matchedBin.binNumber] ?? 0) >= maxCapacity
        ) {
          const catchAll = getCatchAllBin(binConfigsRef.current);
          if (catchAll) {
            // The catch-all is the last resort — if it is at capacity too,
            // there is nowhere for this card to go: pause until a bin is
            // emptied and confirmed.
            const catchAllCapacity = catchAll.maxCapacity ?? 0;
            if (
              catchAllCapacity > 0 &&
              (binCountsRef.current[catchAll.binNumber] ?? 0) >=
                catchAllCapacity
            ) {
              pauseForFullBin(catchAll.binNumber);
              return;
            }
            routeBin = catchAll;
          } else {
            // No catch-all to absorb it: don't persist a card we can't route.
            pauseForFullBin(matchedBin.binNumber);
            return;
          }
        }
      }

      const record: ScannedCard = {
        scanId: generateScanId(),
        card,
        scannedAt: Date.now(),
        binNumber: routeBin?.binNumber,
        capturedImageUrl: effectiveImage,
        // Pre-fill from the heuristic so the operator can correct the toggle
        // — corrections are persisted and become labeled training data.
        isFoil: isFoil ?? false,
        alternativeMatches: alternativeMatches?.length
          ? alternativeMatches
          : undefined,
      };

      commitScan(record, routeBin?.binNumber);
    },
    [commitScan, pauseForFullBin],
  );

  const sendCatchAllBin = useCallback(() => {
    const catchAll = getCatchAllBin(binConfigsRef.current);
    if (
      catchAll &&
      serialRef.current.isConnected &&
      serialRef.current.isReady
    ) {
      const maxCapacity = catchAll.maxCapacity ?? 0;
      if (
        maxCapacity > 0 &&
        (binCountsRef.current[catchAll.binNumber] ?? 0) >= maxCapacity
      ) {
        pauseForFullBin(catchAll.binNumber);
        return;
      }
      serialRef.current.sendBin(catchAll.binNumber).then((response) => {
        if (!response) {
          toast.error("Routing failed", {
            description: `No response from sorter for catch-all bin ${catchAll.binNumber}.`,
          });
          void reportSerialEvent({
            command: "bin",
            sent: true,
            response: null,
            binNumber: catchAll.binNumber,
          });
          autoFeedRef.current = false;
          setAutoFeedState(false);
          return;
        }
        const res = response as Record<string, unknown>;
        if (res.empty) {
          toast.error("Feeder empty", {
            description:
              "No cards remaining in the hopper. Add more cards to continue.",
            duration: Infinity,
            dismissible: true,
          });
          void reportSerialEvent({
            command: "bin",
            sent: true,
            response: res,
            binNumber: catchAll.binNumber,
          });
          autoFeedRef.current = false;
          setAutoFeedState(false);
          pauseHookRef.current?.();
          return;
        }
        if (res.error) {
          toast.error("Sorter error", {
            description: String(res.error),
            duration: Infinity,
            dismissible: true,
          });
          void reportSerialEvent({
            command: "bin",
            sent: true,
            response: res,
            binNumber: catchAll.binNumber,
          });
          autoFeedRef.current = false;
          setAutoFeedState(false);
          return;
        }
        incrementBin(catchAll.binNumber);
        if (autoFeedRef.current) {
          triggerAutoFeed();
        }
      });
    }
  }, [incrementBin, pauseForFullBin, triggerAutoFeed]);

  const removeCard = useCallback((scanId: string) => {
    const collection = activeCollectionRef.current;
    setCards((prev) => prev.filter((entry) => entry.scanId !== scanId));
    if (collection) {
      removeCollectionCard(collection.guid, scanId).catch((err) =>
        console.error("Failed to remove card:", err),
      );
    }
  }, []);

  /** Undo the most recently committed scan (fixes the record — the physical
   *  card still needs to be moved back by hand if it was misrouted). */
  const undoLastScan = useCallback(() => {
    if (lastScanIdRef.current) {
      removeCard(lastScanIdRef.current);
      lastScanIdRef.current = null;
    }
  }, [removeCard]);

  const removeCards = useCallback((scanIds: string[]) => {
    const collection = activeCollectionRef.current;
    const idSet = new Set(scanIds);
    setCards((prev) => prev.filter((entry) => !idSet.has(entry.scanId)));
    if (collection) {
      removeCollectionCards(collection.guid, scanIds).catch((err) =>
        console.error("Failed to remove cards:", err),
      );
    }
  }, []);

  const correctCard = useCallback((scanId: string, card: PlayingCard) => {
    const collection = activeCollectionRef.current;
    const corrected: PlayingCardWithDistance = { ...card, distance: 0 };
    setCards((prev) =>
      prev.map((entry) =>
        // Keep the original binNumber: the physical card is already sorted
        // into that bin, and re-evaluating the corrected identity would point
        // the user at a bin the card was never routed to.
        entry.scanId === scanId ? { ...entry, card: corrected } : entry,
      ),
    );
    if (collection) {
      updateCollectionCard(collection.guid, scanId, corrected).catch((err) =>
        console.error("Failed to update card:", err),
      );
    }
  }, []);

  const toggleFoil = useCallback((scanId: string, isFoil: boolean) => {
    const collection = activeCollectionRef.current;
    setCards((prev) =>
      prev.map((entry) =>
        entry.scanId === scanId ? { ...entry, isFoil } : entry,
      ),
    );
    if (collection) {
      setCollectionCardFoil(collection.guid, scanId, isFoil).catch((err) =>
        console.error("Failed to update foil status:", err),
      );
    }
  }, []);

  const setCondition = useCallback((scanId: string, condition?: string) => {
    const collection = activeCollectionRef.current;
    setCards((prev) =>
      prev.map((entry) =>
        entry.scanId === scanId ? { ...entry, condition } : entry,
      ),
    );
    if (collection) {
      setCollectionCardCondition(collection.guid, scanId, condition).catch(
        (err) => console.error("Failed to update condition:", err),
      );
    }
  }, []);

  const markDownloaded = useCallback((scanIds: string[]) => {
    const collection = activeCollectionRef.current;
    if (scanIds.length === 0) return;
    const idSet = new Set(scanIds);
    setCards((prev) =>
      prev.map((entry) =>
        idSet.has(entry.scanId) ? { ...entry, isDownloaded: true } : entry,
      ),
    );
    if (collection) {
      markCollectionCardsDownloaded(collection.guid, scanIds).catch((err) =>
        console.error("Failed to mark cards downloaded:", err),
      );
    }
  }, []);

  const clearCards = useCallback(() => {
    const collection = activeCollectionRef.current;
    capturedImageRef.current = {};
    resetBinCounts();
    setCards([]);
    setTimerTrigger(undefined);
    setTimerResetSignal((s) => s + 1);
    if (collection) {
      clearCollectionCards(collection.guid).catch((err) =>
        console.error("Failed to clear cards:", err),
      );
    }
  }, [resetBinCounts]);

  return (
    <ScannedCardsContext
      value={{
        cards,
        isLoading,
        autoFeed,
        elapsedMs,
        isTimerActive,
        scanRatePerMin,
        lastScanAt,
        setAutoFeed,
        digitize,
        setDigitize,
        registerCardArrivedHook,
        registerPauseHook,
        registerResumeHook,
        binCounts,
        emptyBin,
        addCard,
        sendCatchAllBin,
        removeCard,
        removeCards,
        undoLastScan,
        correctCard,
        toggleFoil,
        setCondition,
        markDownloaded,
        clearCards,
      }}
    >
      {children}
    </ScannedCardsContext>
  );
}

export function useScannedCards() {
  const context = useContext(ScannedCardsContext);
  if (!context) {
    throw new Error(
      "useScannedCards must be used within a ScannedCardsProvider",
    );
  }
  return context;
}
