import {
  addWishlistItem,
  createWishlist,
  deleteWishlist,
  loadWishlists,
  removeWishlistItem,
  updateWishlist,
  type Wishlist,
} from "@/features/wishlist/api/wishlist";
import type { PlayingCard } from "@magic-vault/shared";
import { toast } from "sonner";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface WishlistContextValue {
  wishlists: Wishlist[];
  isLoaded: boolean;
  createList: (input: {
    name: string;
    gameKey: string;
    binNumber: number;
  }) => Promise<void>;
  updateList: (
    guid: string,
    input: Partial<{ name: string; binNumber: number; isActive: boolean }>,
  ) => Promise<void>;
  deleteList: (guid: string) => Promise<void>;
  addItem: (wishlistGuid: string, input: { cardId?: string; namePattern?: string }) => Promise<void>;
  removeItem: (wishlistGuid: string, itemGuid: string) => Promise<void>;
  /**
   * If the card matches an active wishlist for the given game, returns that
   * wishlist's bin number (wishlist routing overrides normal bin rules).
   */
  matchBin: (card: PlayingCard, gameKey: string) => number | null;
}

const WishlistContext = createContext<WishlistContextValue | null>(null);

export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { data: wishlists = [] } = useQuery({
    queryKey: ["wishlist"],
    queryFn: () => loadWishlists(),
    staleTime: Infinity,
  });
  const wishlistsRef = useRef(wishlists);
  wishlistsRef.current = wishlists;

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["wishlist"] });
  }, [queryClient]);

  const createList = useCallback(
    async (input: { name: string; gameKey: string; binNumber: number }) => {
      try {
        await createWishlist(input);
        refresh();
        toast.success("Wishlist created");
      } catch (err) {
        toast.error("Failed to create wishlist", {
          description: err instanceof Error ? err.message : undefined,
        });
      }
    },
    [refresh],
  );

  const updateList = useCallback(
    async (
      guid: string,
      input: Partial<{ name: string; binNumber: number; isActive: boolean }>,
    ) => {
      try {
        await updateWishlist(guid, input);
        refresh();
        toast.success("Wishlist updated");
      } catch (err) {
        toast.error("Failed to update wishlist", {
          description: err instanceof Error ? err.message : undefined,
        });
      }
    },
    [refresh],
  );

  const deleteList = useCallback(
    async (guid: string) => {
      try {
        await deleteWishlist(guid);
        refresh();
        toast.success("Wishlist deleted");
      } catch (err) {
        toast.error("Failed to delete wishlist", {
          description: err instanceof Error ? err.message : undefined,
        });
      }
    },
    [refresh],
  );

  const addItem = useCallback(
    async (
      wishlistGuid: string,
      input: { cardId?: string; namePattern?: string },
    ) => {
      try {
        await addWishlistItem(wishlistGuid, input);
        refresh();
      } catch (err) {
        toast.error("Failed to add item", {
          description: err instanceof Error ? err.message : undefined,
        });
      }
    },
    [refresh],
  );

  const removeItem = useCallback(
    async (wishlistGuid: string, itemGuid: string) => {
      try {
        await removeWishlistItem(wishlistGuid, itemGuid);
        refresh();
      } catch (err) {
        toast.error("Failed to remove item", {
          description: err instanceof Error ? err.message : undefined,
        });
      }
    },
    [refresh],
  );

  const matchBin = useCallback(
    (card: PlayingCard, gameKey: string): number | null => {
      const lists = wishlistsRef.current.filter(
        (w) => w.isActive && w.gameKey === gameKey,
      );
      if (lists.length === 0) return null;
      const name = card.name.toLowerCase();
      for (const list of lists) {
        const hit = list.items.some(
          (item) =>
            (item.cardId && item.cardId === card.id) ||
            (item.namePattern &&
              name.includes(item.namePattern.toLowerCase())),
        );
        if (hit) return list.binNumber;
      }
      return null;
    },
    [],
  );

  const value = useMemo(
    () => ({
      wishlists,
      isLoaded: true,
      createList,
      updateList,
      deleteList,
      addItem,
      removeItem,
      matchBin,
    }),
    [wishlists, createList, updateList, deleteList, addItem, removeItem, matchBin],
  );

  return (
    <WishlistContext value={value}>{children}</WishlistContext>
  );
}

export function useWishlist() {
  const context = useContext(WishlistContext);
  if (!context) {
    throw new Error("useWishlist must be used within a WishlistProvider");
  }
  return context;
}
