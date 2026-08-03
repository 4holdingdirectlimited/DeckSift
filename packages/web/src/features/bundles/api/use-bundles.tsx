import { bundleTargetKey } from "@magic-vault/shared";
import type {
  BundlePlaceResult,
  BundleRun,
  BundleTarget,
} from "@magic-vault/shared";
import {
  abortBundleRun,
  completeBundleRun,
  createBundle,
  deleteBundle,
  loadBundles,
  placeCardInBundle,
  startBundleRun,
  updateBundle,
  type BundleConfigWithRun,
} from "@/features/bundles/api/bundles";
import { toast } from "sonner";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface BundlesContextValue {
  configs: BundleConfigWithRun[];
  isLoaded: boolean;
  /** The active run across all configs (at most one), or null. */
  activeRun: BundleRun | null;
  /** True when bundle routing is live (an active run exists). */
  isBundleActive: boolean;
  /** Reject bin of the config backing the active run (safe-failure fallback). */
  rejectBinNumber: number | null;
  createConfig: (input: {
    name: string;
    targets: BundleTarget[];
    rejectBinNumber: number;
    allowDuplicates?: boolean;
    holoDetection?: boolean;
  }) => Promise<void>;
  updateConfig: (
    guid: string,
    input: Partial<{
      name: string;
      targets: BundleTarget[];
      rejectBinNumber: number;
      allowDuplicates: boolean;
      holoDetection: boolean;
    }>,
  ) => Promise<void>;
  deleteConfig: (guid: string) => Promise<void>;
  startRun: (configGuid: string) => Promise<void>;
  abortRun: (configGuid: string) => Promise<void>;
  completeRun: (configGuid: string) => Promise<void>;
  /**
   * Offer a card to the active run. Returns the server verdict, or null when
   * no run is active / the call failed. Callers treat null as "route to the
   * reject bin" (safe failure mode — never pollutes a bundle bin).
   */
  placeCard: (
    cardId: string,
    rarity: string,
    isFoil?: boolean,
    priceUsd?: number,
  ) => Promise<BundlePlaceResult | null>;
}

const BundlesContext = createContext<BundlesContextValue | null>(null);

export function BundlesProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [pendingRefresh, setPendingRefresh] = useState(0);

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ["bundles"],
    queryFn: async () => {
      // First load doubles as the resume lookup — the active run comes back
      // embedded in its config, so a restart picks up where the run left off.
      const loaded = await loadBundles();
      return loaded;
    },
    staleTime: Infinity,
    refetchInterval: pendingRefresh > 0 ? 1000 : false,
  });

  const activeRun = useMemo(
    () => configs.find((c) => c.activeRun)?.activeRun ?? null,
    [configs],
  );
  const isBundleActive = !!activeRun;
  const rejectBinNumber = useMemo(
    () => configs.find((c) => c.activeRun)?.rejectBinNumber ?? null,
    [configs],
  );

  const activeRunRef = useRef(activeRun);
  activeRunRef.current = activeRun;

  /** Refresh configs after a mutation and bounce a follow-up refresh so the
   *  embedded run state stays current. */
  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["bundles"] });
    setPendingRefresh((n) => n + 1);
    window.setTimeout(() => setPendingRefresh((n) => Math.max(0, n - 1)), 1500);
  }, [queryClient]);

  const createConfig = useCallback(
    async (input: {
      name: string;
      targets: BundleTarget[];
      rejectBinNumber: number;
      allowDuplicates?: boolean;
      holoDetection?: boolean;
    }) => {
      try {
        await createBundle(input);
        refresh();
        toast.success("Bundle config created");
      } catch (err) {
        toast.error("Failed to create bundle", {
          description: err instanceof Error ? err.message : undefined,
        });
      }
    },
    [refresh],
  );

  const updateConfig = useCallback(
    async (
      guid: string,
      input: Partial<{
        name: string;
        targets: BundleTarget[];
        rejectBinNumber: number;
        allowDuplicates: boolean;
        holoDetection: boolean;
      }>,
    ) => {
      try {
        await updateBundle(guid, input);
        refresh();
        toast.success("Bundle config updated");
      } catch (err) {
        toast.error("Failed to update bundle", {
          description: err instanceof Error ? err.message : undefined,
        });
      }
    },
    [refresh],
  );

  const deleteConfig = useCallback(
    async (guid: string) => {
      try {
        await deleteBundle(guid);
        refresh();
        toast.success("Bundle config deleted");
      } catch (err) {
        toast.error("Failed to delete bundle", {
          description: err instanceof Error ? err.message : undefined,
        });
      }
    },
    [refresh],
  );

  const startRun = useCallback(
    async (configGuid: string) => {
      try {
        await startBundleRun(configGuid);
        refresh();
        toast.success("Bundle run started", {
          description:
            "Bundle routing is now active — duplicates and overflow go to the reject bin.",
        });
      } catch (err) {
        toast.error("Failed to start bundle run", {
          description: err instanceof Error ? err.message : undefined,
        });
      }
    },
    [refresh],
  );

  const abortRun = useCallback(
    async (configGuid: string) => {
      try {
        await abortBundleRun(configGuid);
        refresh();
        toast("Bundle run aborted", {
          description: "Normal bin routing is restored.",
        });
      } catch (err) {
        toast.error("Failed to abort bundle run", {
          description: err instanceof Error ? err.message : undefined,
        });
      }
    },
    [refresh],
  );

  const completeRun = useCallback(
    async (configGuid: string) => {
      try {
        await completeBundleRun(configGuid);
        refresh();
        toast.success("Bundle run completed");
      } catch (err) {
        toast.error("Failed to complete bundle run", {
          description: err instanceof Error ? err.message : undefined,
        });
      }
    },
    [refresh],
  );

  const placeCard = useCallback(
    async (
      cardId: string,
      rarity: string,
      isFoil?: boolean,
      priceUsd?: number,
    ): Promise<BundlePlaceResult | null> => {
      const run = activeRunRef.current;
      if (!run) return null;
      try {
        const decision = await placeCardInBundle(
          run.guid,
          cardId,
          rarity,
          isFoil,
          priceUsd,
        );
        // Mirror the server state into the cached config so the panel updates
        // without a refetch on every scan.
        queryClient.setQueryData<BundleConfigWithRun[]>(["bundles"], (old) =>
          (old ?? []).map((cfg) => {
            if (cfg.guid !== run.configGuid || !cfg.activeRun) return cfg;
            const counts = { ...cfg.activeRun.counts };
            let placed = cfg.activeRun.placedCardIds;
            let value = cfg.activeRun.totalValueUsd ?? 0;
            if (decision.accepted) {
              const target = cfg.targets.find((t) => t.rarity === rarity);
              if (target) {
                const key = bundleTargetKey(target);
                counts[key] = (counts[key] ?? 0) + 1;
              }
              if (!cfg.allowDuplicates) placed = [...placed, cardId];
              if (priceUsd && priceUsd > 0) value += priceUsd;
            }
            return {
              ...cfg,
              activeRun: {
                ...cfg.activeRun,
                counts,
                placedCardIds: placed,
                totalValueUsd: value,
                status: decision.complete ? "completed" : "active",
                updatedAt: new Date().toISOString(),
              },
            };
          }),
        );
        return decision;
      } catch (err) {
        console.error("Bundle place failed:", err);
        return null;
      }
    },
    [queryClient],
  );

  return (
    <BundlesContext
      value={{
        configs,
        isLoaded: !isLoading,
        activeRun,
        isBundleActive,
        rejectBinNumber,
        createConfig,
        updateConfig,
        deleteConfig,
        startRun,
        abortRun,
        completeRun,
        placeCard,
      }}
    >
      {children}
    </BundlesContext>
  );
}

export function useBundles() {
  const context = useContext(BundlesContext);
  if (!context) {
    throw new Error("useBundles must be used within a BundlesProvider");
  }
  return context;
}
