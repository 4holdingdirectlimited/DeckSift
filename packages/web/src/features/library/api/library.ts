import type { PlayingCard } from "@magic-vault/shared";
import { apiGet } from "@/lib/api/client";

export interface LibraryCard {
  scryfallId: string;
  gameKey: string;
  name: string;
  setCode: string;
  rarity: string | null;
  setName: string | null;
  imageUrl: string | null;
  cardData: PlayingCard | null;
}

export interface LibraryPage {
  cards: LibraryCard[];
  total: number;
  page: number;
  limit: number;
}

export interface LibraryFilters {
  gameKey?: string;
  search?: string;
  rarity?: string;
  set?: string;
  page: number;
  limit?: number;
}

export async function browseLibrary(
  filters: LibraryFilters,
): Promise<LibraryPage> {
  const params = new URLSearchParams({
    page: String(filters.page),
    limit: String(filters.limit ?? 60),
  });
  if (filters.gameKey) params.set("gameKey", filters.gameKey);
  if (filters.search) params.set("search", filters.search);
  if (filters.rarity) params.set("rarity", filters.rarity);
  if (filters.set) params.set("set", filters.set);
  const r = await apiGet<{ success: boolean; data: LibraryPage }>(
    `/api/cards/library?${params.toString()}`,
  );
  return r.data;
}
