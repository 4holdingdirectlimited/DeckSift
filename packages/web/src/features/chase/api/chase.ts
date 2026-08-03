import type { Result } from "@magic-vault/shared";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api/client";

export interface ChaseConfig {
  guid: string;
  name: string;
  gameKey: string;
  setCode: string;
  binNumber: number;
  rejectBinNumber: number;
  collectionGuid?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChaseRun {
  guid: string;
  configGuid: string;
  configName: string;
  status: string;
  foundCardIds: string[];
  createdAt: string;
  completedAt?: string | null;
  updatedAt: string;
}

export interface ChaseConfigWithRun extends ChaseConfig {
  activeRun?: ChaseRun;
}

export interface ChasePlaceResult {
  accepted: boolean;
  binNumber: number;
  reason: "ok" | "not-in-set" | "owned" | "duplicate";
}

export async function loadChases(): Promise<ChaseConfigWithRun[]> {
  const r = await apiGet<Result<ChaseConfigWithRun[]>>("/api/chase");
  return r.data ?? [];
}

export async function createChase(input: {
  name: string;
  gameKey: string;
  setCode: string;
  binNumber: number;
  rejectBinNumber: number;
  collectionGuid?: string;
}): Promise<ChaseConfigWithRun[]> {
  const r = await apiPost<Result<ChaseConfigWithRun[]>>("/api/chase", input);
  if (!r.success) throw new Error(r.message ?? "Failed to create chase");
  return r.data ?? [];
}

export async function updateChase(
  guid: string,
  input: Partial<{
    name: string;
    setCode: string;
    binNumber: number;
    rejectBinNumber: number;
    collectionGuid?: string;
  }>,
): Promise<ChaseConfigWithRun[]> {
  const r = await apiPut<Result<ChaseConfigWithRun[]>>(
    `/api/chase/${guid}`,
    input,
  );
  if (!r.success) throw new Error(r.message ?? "Failed to update chase");
  return r.data ?? [];
}

export async function deleteChase(guid: string): Promise<ChaseConfigWithRun[]> {
  const r = await apiDelete<Result<ChaseConfigWithRun[]>>(`/api/chase/${guid}`);
  if (!r.success) throw new Error(r.message ?? "Failed to delete chase");
  return r.data ?? [];
}

export async function startChaseRun(
  guid: string,
): Promise<ChaseConfigWithRun[]> {
  const r = await apiPost<Result<ChaseConfigWithRun[]>>(
    `/api/chase/${guid}/start`,
  );
  if (!r.success) throw new Error(r.message ?? "Failed to start chase");
  return r.data ?? [];
}

export async function abortChaseRun(
  guid: string,
): Promise<ChaseConfigWithRun[]> {
  const r = await apiPost<Result<ChaseConfigWithRun[]>>(
    `/api/chase/${guid}/abort`,
  );
  if (!r.success) throw new Error(r.message ?? "Failed to abort chase");
  return r.data ?? [];
}

export async function placeCardInChase(
  runGuid: string,
  cardId: string,
  setCode: string,
): Promise<ChasePlaceResult> {
  const r = await apiPost<Result<ChasePlaceResult>>(
    `/api/chase/run/${runGuid}/place`,
    { cardId, setCode },
  );
  if (!r.success) throw new Error(r.message ?? "Failed to place card in chase");
  return r.data!;
}
