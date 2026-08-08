import { useCollections } from "@/features/collections/api/use-collections";
import { useCollectionLocks } from "@/features/collections/api/use-collection-locks";
import { useScannedCards } from "@/features/scanner/api/use-scanned-cards";
import { useSessionMonitor } from "@/features/scanner/api/use-session-monitor";
import { getStats, type StatsTelemetry } from "@/lib/api/stats";
import { cn } from "@/lib/utils";
import { IconActivity } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function StatCard({
  label,
  value,
  hint,
  indicator,
}: {
  label: string;
  value: string;
  hint?: string;
  indicator?: boolean;
}) {
  return (
    <div className="rounded-lg bg-input/20 dark:bg-input/30 border border-input p-3">
      <div className="flex items-center gap-1.5">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </p>
        {indicator !== undefined && (
          <span
            className={cn(
              "size-1.5 rounded-full shrink-0",
              indicator ? "bg-green-500 animate-pulse" : "bg-muted-foreground/40",
            )}
          />
        )}
      </div>
      <p className="text-xl font-semibold tabular-nums mt-0.5">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}

function DailyChart({ daily }: { daily: { date: string; count: number }[] }) {
  const max = Math.max(1, ...daily.map((d) => d.count));
  return (
    <div className="rounded-lg bg-input/20 dark:bg-input/30 border border-input p-3">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
        Scans per day · last 14 days
      </p>
      <div className="flex items-end gap-1 h-28">
        {daily.map((d) => {
          const pct = Math.max(2, Math.round((d.count / max) * 100));
          return (
            <div
              key={d.date}
              className="flex-1 flex flex-col items-center gap-1 min-w-0"
              title={`${d.date}: ${d.count} scan${d.count === 1 ? "" : "s"}`}
            >
              <div
                className={cn(
                  "w-full rounded-sm transition-colors",
                  d.count > 0
                    ? "bg-primary/70 hover:bg-primary"
                    : "bg-muted/40",
                )}
                style={{ height: `${pct}%` }}
              />
              <span className="text-[9px] text-muted-foreground tabular-nums">
                {d.date.slice(8)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BreakdownList({
  title,
  items,
  emptyLabel,
}: {
  title: string;
  items: { label: string; count: number }[];
  emptyLabel: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div className="rounded-lg bg-input/20 dark:bg-input/30 border border-input p-3">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
        {title}
      </p>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <div key={item.label}>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate">{item.label}</span>
                <span className="text-muted-foreground tabular-nums shrink-0">
                  {item.count.toLocaleString()}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted/50 mt-1 overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary/70"
                  style={{ width: `${(item.count / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function StatsPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["stats"],
    queryFn: getStats,
    refetchInterval: 30_000,
  });
  const telemetry: StatsTelemetry | undefined = data?.data;

  // Live machine block: when the local operator is scanning a collection, show
  // the live rate / last-scan / session errors alongside the historical view.
  const { locks, currentUserId } = useCollectionLocks();
  const { collections } = useCollections();
  const { scanRatePerMin, lastScanAt, elapsedMs, isTimerActive } =
    useScannedCards();
  const localCollectionGuid = useMemo(() => {
    if (!currentUserId) return undefined;
    const entry = Object.entries(locks).find(
      ([, lock]) => lock.userId === currentUserId,
    );
    return entry?.[0];
  }, [locks, currentUserId]);
  const localCollection = useMemo(
    () => collections.find((c) => c.guid === localCollectionGuid),
    [collections, localCollectionGuid],
  );
  const { errors } = useSessionMonitor(localCollectionGuid);

  const secondsSinceLastScan =
    lastScanAt == null ? null : (Date.now() - lastScanAt) / 1000;

  const liveRate = useMemo(() => {
    if (scanRatePerMin > 0) return `${scanRatePerMin}/min`;
    if (secondsSinceLastScan != null && secondsSinceLastScan < 90)
      return `~${Math.round(60 / Math.max(1, secondsSinceLastScan))}/min`;
    return "-";
  }, [scanRatePerMin, secondsSinceLastScan]);

  const liveIndicator =
    localCollectionGuid != null && scanRatePerMin > 0;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-y-auto">
      <div className="p-4 pb-2 flex flex-col gap-3 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-lg font-semibold">Stats</h1>
            <span className="text-xs text-muted-foreground">
              Reliability telemetry for the shop floor
            </span>
          </div>
        </div>
      </div>

      <div className="px-4 pb-4 flex flex-col gap-3">
        {isLoading && (
          <p className="text-xs text-muted-foreground">Loading stats…</p>
        )}
        {isError && (
          <p className="text-xs text-destructive">
            Could not load stats. Check that the API is running.
          </p>
        )}
        {telemetry && (
          <>
            {localCollectionGuid && localCollection && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <IconActivity size={14} className="text-primary" />
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                    Live session · {localCollection.name}
                  </p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <StatCard
                    label="Live rate"
                    value={liveRate}
                    indicator={liveIndicator}
                  />
                  <StatCard
                    label="Last scan"
                    value={
                      secondsSinceLastScan == null
                        ? "-"
                        : secondsSinceLastScan < 60
                          ? `${secondsSinceLastScan.toFixed(1)}s ago`
                          : formatElapsed(Math.round(secondsSinceLastScan * 1000)) +
                            " ago"
                    }
                  />
                  <StatCard
                    label="Session time"
                    value={formatElapsed(elapsedMs)}
                    indicator={isTimerActive}
                  />
                  <StatCard
                    label="Session errors"
                    value={String(errors.length)}
                    hint={
                      errors.length > 0
                        ? "Latest: " + errors[0]!.message
                        : "No errors this session"
                    }
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <StatCard
                label="Total scanned"
                value={telemetry.totalScans.toLocaleString()}
                hint="All time, across collections"
              />
              <StatCard
                label="Scanned today"
                value={telemetry.scansToday.toLocaleString()}
              />
              <StatCard
                label="Last hour"
                value={telemetry.scansLastHour.toLocaleString()}
              />
              <StatCard
                label="Throughput today"
                value={
                  telemetry.cardsPerHourToday == null
                    ? "-"
                    : `${telemetry.cardsPerHourToday.toLocaleString()}/hr`
                }
                hint="Cards per hour since midnight"
              />
            </div>

            <DailyChart daily={telemetry.daily} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <BreakdownList
                title="By game"
                items={telemetry.byGame.map((g) => ({
                  label: g.gameKey,
                  count: g.total,
                }))}
                emptyLabel="No scans recorded yet."
              />
              <BreakdownList
                title="Top collections"
                items={telemetry.byCollection.map((c) => ({
                  label: c.name,
                  count: c.total,
                }))}
                emptyLabel="No scans recorded yet."
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
