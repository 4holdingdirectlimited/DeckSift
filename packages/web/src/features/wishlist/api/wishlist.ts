import type { Result } from "@magic-vault/shared";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api/client";

export interface WishlistItem {
  guid: string;
  cardId: string | null;
  namePattern: string | null;
  createdAt: string;
}

export interface Wishlist {
  guid: string;
  name: string;
  gameKey: string;
  binNumber: number;
  isActive: boolean;
  items: WishlistItem[];
  createdAt: string;
  updatedAt: string;
}

export async function loadWishlists(): Promise<Wishlist[]> {
  const r = await apiGet<Result<Wishlist[]>>("/api/wishlist");
  return r.data ?? [];
}

export async function createWishlist(input: {
  name: string;
  gameKey: string;
  binNumber: number;
}): Promise<Wishlist[]> {
  const r = await apiPost<Result<Wishlist[]>>("/api/wishlist", input);
  if (!r.success) throw new Error(r.message ?? "Failed to create wishlist");
  return r.data ?? [];
}

export async function updateWishlist(
  guid: string,
  input: Partial<{ name: string; binNumber: number; isActive: boolean }>,
): Promise<Wishlist[]> {
  const r = await apiPut<Result<Wishlist[]>>(`/api/wishlist/${guid}`, input);
  if (!r.success) throw new Error(r.message ?? "Failed to update wishlist");
  return r.data ?? [];
}

export async function deleteWishlist(guid: string): Promise<Wishlist[]> {
  const r = await apiDelete<Result<Wishlist[]>>(`/api/wishlist/${guid}`);
  if (!r.success) throw new Error(r.message ?? "Failed to delete wishlist");
  return r.data ?? [];
}

export async function addWishlistItem(
  wishlistGuid: string,
  input: { cardId?: string; namePattern?: string },
): Promise<Wishlist[]> {
  const r = await apiPost<Result<Wishlist[]>>(
    `/api/wishlist/${wishlistGuid}/items`,
    input,
  );
  if (!r.success) throw new Error(r.message ?? "Failed to add item");
  return r.data ?? [];
}

export async function removeWishlistItem(
  wishlistGuid: string,
  itemGuid: string,
): Promise<Wishlist[]> {
  const r = await apiDelete<Result<Wishlist[]>>(
    `/api/wishlist/${wishlistGuid}/items/${itemGuid}`,
  );
  if (!r.success) throw new Error(r.message ?? "Failed to remove item");
  return r.data ?? [];
}
