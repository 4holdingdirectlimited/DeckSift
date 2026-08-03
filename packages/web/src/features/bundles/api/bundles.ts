import type {
  BundleConfig,
  BundlePlaceResult,
  BundleRun,
  BundleTarget,
  Result,
} from "@magic-vault/shared";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api/client";
import { queryOptions } from "@tanstack/react-query";

/** A config with its active run embedded (when one is running). */
export interface BundleConfigWithRun extends BundleConfig {
  activeRun?: BundleRun;
}

export async function loadBundles(): Promise<BundleConfigWithRun[]> {
  const r = await apiGet<Result<BundleConfigWithRun[]>>("/api/bundles");
  return r.data ?? [];
}

export const bundlesQueryOptions = queryOptions({
  queryKey: ["bundles"] as const,
  queryFn: () => loadBundles(),
  staleTime: Infinity,
});

export async function createBundle(input: {
  name: string;
  targets: BundleTarget[];
  rejectBinNumber: number;
}): Promise<BundleConfigWithRun[]> {
  const r = await apiPost<Result<BundleConfigWithRun[]>>("/api/bundles", input);
  if (!r.success) throw new Error(r.message ?? "Failed to create bundle");
  return r.data ?? [];
}

export async function updateBundle(
  guid: string,
  input: Partial<{
    name: string;
    targets: BundleTarget[];
    rejectBinNumber: number;
  }>,
): Promise<BundleConfigWithRun[]> {
  const r = await apiPut<Result<BundleConfigWithRun[]>>(
    `/api/bundles/${guid}`,
    input,
  );
  if (!r.success) throw new Error(r.message ?? "Failed to update bundle");
  return r.data ?? [];
}

export async function deleteBundle(guid: string): Promise<BundleConfigWithRun[]> {
  const r = await apiDelete<Result<BundleConfigWithRun[]>>(`/api/bundles/${guid}`);
  if (!r.success) throw new Error(r.message ?? "Failed to delete bundle");
  return r.data ?? [];
}

export async function startBundleRun(guid: string): Promise<BundleConfigWithRun[]> {
  const r = await apiPost<Result<BundleConfigWithRun[]>>(
    `/api/bundles/${guid}/start`,
  );
  if (!r.success) throw new Error(r.message ?? "Failed to start bundle run");
  return r.data ?? [];
}

export async function abortBundleRun(guid: string): Promise<BundleConfigWithRun[]> {
  const r = await apiPost<Result<BundleConfigWithRun[]>>(
    `/api/bundles/${guid}/abort`,
  );
  if (!r.success) throw new Error(r.message ?? "Failed to abort bundle run");
  return r.data ?? [];
}

export async function completeBundleRun(guid: string): Promise<BundleConfigWithRun[]> {
  const r = await apiPost<Result<BundleConfigWithRun[]>>(
    `/api/bundles/${guid}/complete`,
  );
  if (!r.success) throw new Error(r.message ?? "Failed to complete bundle run");
  return r.data ?? [];
}

/** Resume lookup — the active run across the org, if any. */
export async function loadActiveBundleRun(): Promise<BundleRun | null> {
  const r = await apiGet<Result<BundleRun | null>>("/api/bundles/run/active");
  return r.data ?? null;
}

/** Offer a card to the active run; server decides accept/reject + bin. */
export async function placeCardInBundle(
  runGuid: string,
  cardId: string,
  rarity: string,
): Promise<BundlePlaceResult> {
  const r = await apiPost<Result<BundlePlaceResult>>(
    `/api/bundles/run/${runGuid}/place`,
    { cardId, rarity },
  );
  if (!r.success) throw new Error(r.message ?? "Failed to place card in bundle");
  return r.data!;
}
