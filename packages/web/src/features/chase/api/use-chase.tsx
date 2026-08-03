import {
  abortChaseRun,
  createChase,
  deleteChase,
  loadChases,
  placeCardInChase,
  startChaseRun,
  updateChase,
  type ChaseConfigWithRun,
  type ChasePlaceResult,
  type ChaseRun,
} from "@/features/chase/api/chase";
import { toast } from "sonner";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface ChaseContextValue {
  configs: ChaseConfigWithRun[];
  isLoaded: boolean;
  activeRun: ChaseRun | null;
  isChaseActive: boolean;
  rejectBinNumber: number | null;
  createConfig: (input: {
    name: string;
    gameKey: string;
    setCode: string;
    binNumber: number;
    rejectBinNumber: number;
    collectionGuid?: string;
  }) => Promise<void>;
  updateConfig: (
    guid: string,
    input: Partial<{ name: string; setCode: string; binNumber: number; rejectBinNumber: number; collectionGuid?: string }>,
  ) => Promise<void>;
  deleteConfig: (guid: string) => Promise<void>;
  startRun: (configGuid: string) => Promise<void>;
  abortRun: (configGuid: string) => Promise<void>;
  placeCard: (
    cardId: string,
    setCode: string,
  ) => Promise<ChasePlaceResult | null>;
}

const ChaseContext = createContext<ChaseContextValue | null>(null);

export function ChaseProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { data: configs = [] } = useQuery({
    queryKey: ["chase"],
    queryFn: () => loadChases(),
    staleTime: Infinity,
  });

  const activeRun = useMemo(
    () => configs.find((c) => c.activeRun)?.activeRun ?? null,
    [configs],
  );
  const isChaseActive = !!activeRun;
  const rejectBinNumber = useMemo(
    () => configs.find((c) => c.activeRun)?.rejectBinNumber ?? null,
    [configs],
  );
  const activeRunRef = useRef(activeRun);
  activeRunRef.current = activeRun;

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["chase"] });
  }, [queryClient]);

  const createConfig = useCallback(
    async (input: {
      name: string;
      gameKey: string;
      setCode: string;
      binNumber: number;
      rejectBinNumber: number;
      collectionGuid?: string;
    }) => {
      try {
        await createChase(input);
        refresh();
        toast.success("Set chase created");
      } catch (err) {
        toast.error("Failed to create set chase", {
          description: err instanceof Error ? err.message : undefined,
        });
      }
    },
    [refresh],
  );

  const updateConfig = useCallback(
    async (
      guid: string,
      input: Partial<{ name: string; setCode: string; binNumber: number; rejectBinNumber: number; collectionGuid?: string }>,
    ) => {
      try {
        await updateChase(guid, input);
        refresh();
        toast.success("Set chase updated");
      } catch (err) {
        toast.error("Failed to update set chase", {
          description: err instanceof Error ? err.message : undefined,
        });
      }
    },
    [refresh],
  );

  const deleteConfig = useCallback(
    async (guid: string) => {
      try {
        await deleteChase(guid);
        refresh();
        toast.success("Set chase deleted");
      } catch (err) {
        toast.error("Failed to delete set chase", {
          description: err instanceof Error ? err.message : undefined,
        });
      }
    },
    [refresh],
  );

  const startRun = useCallback(
    async (configGuid: string) => {
      try {
        await startChaseRun(configGuid);
        refresh();
        toast.success("Set chase started", {
          description:
            "Cards from this set that you don't own route to the chase bin; everything else goes to the reject bin.",
        });
      } catch (err) {
        toast.error("Failed to start set chase", {
          description: err instanceof Error ? err.message : undefined,
        });
      }
    },
    [refresh],
  );

  const abortRun = useCallback(
    async (configGuid: string) => {
      try {
        await abortChaseRun(configGuid);
        refresh();
        toast("Set chase stopped", {
          description: "Normal routing is restored.",
        });
      } catch (err) {
        toast.error("Failed to stop set chase", {
          description: err instanceof Error ? err.message : undefined,
        });
      }
    },
    [refresh],
  );

  const placeCard = useCallback(
    async (cardId: string, setCode: string): Promise<ChasePlaceResult | null> => {
      const run = activeRunRef.current;
      if (!run) return null;
      try {
        const decision = await placeCardInChase(run.guid, cardId, setCode);
        queryClient.setQueryData<ChaseConfigWithRun[]>(["chase"], (old) =>
          (old ?? []).map((cfg) => {
            if (cfg.guid !== run.configGuid || !cfg.activeRun) return cfg;
            if (!decision.accepted) return cfg;
            return {
              ...cfg,
              activeRun: {
                ...cfg.activeRun,
                foundCardIds: [...cfg.activeRun.foundCardIds, cardId],
                updatedAt: new Date().toISOString(),
              },
            };
          }),
        );
        return decision;
      } catch (err) {
        console.error("Chase place failed:", err);
        return null;
      }
    },
    [queryClient],
  );

  return (
    <ChaseContext
      value={{
        configs,
        isLoaded: true,
        activeRun,
        isChaseActive,
        rejectBinNumber,
        createConfig,
        updateConfig,
        deleteConfig,
        startRun,
        abortRun,
        placeCard,
      }}
    >
      {children}
    </ChaseContext>
  );
}

export function useChase() {
  const context = useContext(ChaseContext);
  if (!context) throw new Error("useChase must be used within a ChaseProvider");
  return context;
}
