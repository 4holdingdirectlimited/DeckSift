import type { Result, SearchCardMatch } from "@magic-vault/shared";
import { apiGet, apiPost, apiPostForm } from "@/lib/api/client";

export async function searchByImage(formData: FormData): Promise<Result<SearchCardMatch[] | null>> {
  return apiPostForm<Result<SearchCardMatch[] | null>>("/api/cards", formData);
}

export interface PriceStatus {
  lastUpdated: number | null;
  cardCount: number;
}

export async function getPriceStatus(
  collectionGuid: string,
): Promise<PriceStatus> {
  const result = await apiGet<{
    success: boolean;
    data: PriceStatus;
  }>(`/api/cards/price-status?collectionGuid=${encodeURIComponent(collectionGuid)}`);
  return result.data;
}

export async function refreshPrices(
  collectionGuid: string,
): Promise<{ refreshed: number; total: number }> {
  const result = await apiPost<{
    success: boolean;
    data: { refreshed: number; total: number };
  }>("/api/cards/refresh-prices", { collectionGuid });
  return result.data;
}
