import { apiGet } from "@/lib/api/client";
import type { Result } from "@magic-vault/shared";

export interface StatsTelemetry {
  totalScans: number;
  scansToday: number;
  scansLastHour: number;
  /** Throughput since local midnight (cards/hr), null until time has elapsed. */
  cardsPerHourToday: number | null;
  /** Last 14 days, zero-filled, oldest first. */
  daily: { date: string; count: number }[];
  byGame: { gameKey: string; total: number }[];
  byCollection: { guid: string; name: string; total: number }[];
}

export async function getStats(): Promise<Result<StatsTelemetry>> {
  return apiGet<Result<StatsTelemetry>>("/api/stats");
}
