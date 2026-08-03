import {
  type PlayingCard,
  type PlayingCardWithDistance,
  type ScannedCard,
  evaluateCardBin,
  getCatchAllBin,
} from "@magic-vault/shared";

import { useBinConfigs } from "@/features/bins/api/use-bin-configs";
import { useBundles } from "@/features/bundles/api/use-bundles";
import {
  addCollectionCard,
  clearCollectionCards,
  loadCollectionCards,
  markCollectionCardsDownloaded,
  releaseScanLock,
  removeCollectionCard,
  removeCollectionCards,
  setCollectionCardFoil,
  updateCollectionCard,
} from "@/features/collections/api/collections";
import { useCollectionLocks } from "@/features/collections/api/use-collection-locks";
import { useCollections } from "@/features/collections/api/use-collections";
import { reportSerialEvent } from "@/features/notifications/api/notification-settings";
import { useScanTimer } from "@/features/scanner/api/use-scan-timer";
import { useSerial } from "@/features/scanner/api/use-serial";
import type { ScannedCardsContextValue } from "@/features/scanner/types";
import { generateScanId } from "@/lib/utils";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
  const { configs: binConfigs, fieldDefinitions } = useBinConfigs();
  const { sendBin, sendFeed, isConnected, isReady } = useSerial();
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
  const serialRef = useRef({
    sendBin,
    sendFeed,
    isConnected,
    isReady,
  });
  const activeCollectionRef = useRef(activeCollection);
  const prevCollectionGuidRef = useRef<string | undefined>(undefined);
  const [autoFeed, setAutoFeedState] = useState(true);
  const autoFeedRef = useRef(true);
  const cardArrivedHookRef = useRef<(() => void) | null>(null);
  const pauseHookRef = useRef<(() => void) | null>(null);
  // Software bin capacity — with no bin-full sensors we count cards per bin
  // this session and refuse to route into a bin that has reached its max.
  const binCountsRef = useRef<Record<number, number>>({});
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
      isConnected,
      isReady,
    };
  }, [sendBin, sendFeed, isConnected, isReady]);

  const resetBinCounts = useCallback(() => {
    binCountsRef.current = {};
  }, []);

  const setAutoFeed = useCallback(
    (enabled: boolean) => {
      autoFeedRef.current = enabled;
      setAutoFeedState(enabled);
      // Starting a run means the bins were just emptied — restart the count.
      if (enabled) resetBinCounts();
    },
    [resetBinCounts],
  );

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
        serialRef.current.sendBin(binNumber).then((response) => {
          if (!response) {
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
          binCountsRef.current[binNumber] =
            (binCountsRef.current[binNumber] ?? 0) + 1;
          if (autoFeedRef.current) {
            triggerAutoFeed();
          }
        });
      }
    },
    [triggerAutoFeed],
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

      // Reuse the first capture of this card this session (dedupe) so repeated
      // copies don't each store a full base64 JPEG.
      let effectiveImage = capturedImageRef.current[card.id];
      if (!effectiveImage && capturedImageUrl) {
        effectiveImage = capturedImageUrl;
        capturedImageRef.current[card.id] = effectiveImage;
      }

      // ── Bundle mode: the active run decides the bin ──
      const bundle = bundleRef.current;
      if (bundle.isBundleActive && bundle.activeRun) {
        void bundle
          .placeCard(card.id, card.rarity.toLowerCase(), isFoil)
          .then((decision) => {
            // Safe failure mode: if the server can't be reached, route to the
            // reject bin so the physical card leaves module 1 and no bundle
            // bin is ever polluted by an unknown card.
            const binNumber =
              decision?.binNumber ??
              bundle.rejectBinNumber ??
              getCatchAllBin(binConfigsRef.current)?.binNumber;
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
            routeBin = catchAll;
          } else {
            // No catch-all to absorb it: don't persist a card we can't route.
            toast.error(`Bin ${matchedBin.binNumber} is full`, {
              description: `Reached its capacity of ${maxCapacity} cards. Empty the bin, then re-enable auto-feed to continue.`,
              duration: Infinity,
              dismissible: true,
            });
            autoFeedRef.current = false;
            setAutoFeedState(false);
            pauseHookRef.current?.();
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
    [commitScan],
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
        toast.error(`Catch-all bin ${catchAll.binNumber} is full`, {
          description: `Reached its capacity of ${maxCapacity} cards. Empty it, then re-enable auto-feed to continue.`,
          duration: Infinity,
          dismissible: true,
        });
        autoFeedRef.current = false;
        setAutoFeedState(false);
        pauseHookRef.current?.();
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
        binCountsRef.current[catchAll.binNumber] =
          (binCountsRef.current[catchAll.binNumber] ?? 0) + 1;
        if (autoFeedRef.current) {
          triggerAutoFeed();
        }
      });
    }
  }, [triggerAutoFeed]);

  const removeCard = useCallback((scanId: string) => {
    const collection = activeCollectionRef.current;
    setCards((prev) => prev.filter((entry) => entry.scanId !== scanId));
    if (collection) {
      removeCollectionCard(collection.guid, scanId).catch((err) =>
        console.error("Failed to remove card:", err),
      );
    }
  }, []);

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
        setAutoFeed,
        registerCardArrivedHook,
        registerPauseHook,
        addCard,
        sendCatchAllBin,
        removeCard,
        removeCards,
        correctCard,
        toggleFoil,
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
