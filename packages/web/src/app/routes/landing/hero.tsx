import { buttonVariants } from "@/components/ui/button";
import { DeckSiftMark } from "@/components/decksift-mark";
import { getRandomCards } from "@/features/cards/api/card";
import { cn } from "@/lib/utils";
import { listCardGameKeys, listSyncSources } from "@/lib/api/admin";
import type { PlayingCard } from "@magic-vault/shared";
import { getCardFaceName, getCardImageUris } from "@magic-vault/shared";
import { IconArrowRight, IconScan, IconTool } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const CARD_COUNT = 6;

/** Live numbers for the hero stat bar — fetched on load so they stay true as
 *  more games are added and the library grows over time. */
interface LandingStats {
  games: number;
  cards: number;
}

async function loadLandingStats(): Promise<LandingStats | null> {
  try {
    const [sources, counts] = await Promise.all([
      listSyncSources().then((r) => r.data ?? []),
      listCardGameKeys().then((r) => r.data ?? []),
    ]);
    return {
      games: sources.length,
      cards: counts.reduce((sum, g) => sum + g.count, 0),
    };
  } catch {
    // API not reachable (server still booting) — the stat bar keeps its
    // placeholder until it can load.
    return null;
  }
}

function useRandomCards(count: number) {
  const [cards, setCards] = useState<PlayingCard[]>([]);

  useEffect(() => {
    let cancelled = false;
    // Local, not Scryfall: pulls random cards from the synced on-disk library
    // (art served through the local image proxy + disk cache).
    getRandomCards(count)
      .then((results) => {
        if (!cancelled) setCards(results);
      })
      .catch(() => {
        // library empty / server still booting — hero shows its skeleton
      });
    return () => {
      cancelled = true;
    };
  }, [count]);

  return cards;
}

export function LandingHero() {
  const cards = useRandomCards(CARD_COUNT);
  const heroCard = cards[0];
  const heroImage = heroCard
    ? getCardImageUris(heroCard)?.normal
    : undefined;

  const [stats, setStats] = useState<LandingStats | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadLandingStats().then((loaded) => {
      if (!cancelled) setStats(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const statItems = [
    {
      value: stats ? String(stats.games) : "…",
      label: "TCGs supported",
    },
    {
      value: stats ? stats.cards.toLocaleString() : "…",
      label: "Cards in the library",
    },
    { value: "7", label: "Sort bins" },
    { value: "0", label: "Cloud calls at scan time" },
  ];

  return (
    <section className="relative overflow-hidden">
      {/* Backdrop: subtle grid + soft radial glow */}
      <div className="absolute inset-0 -z-10 bg-grid opacity-60 mask-[radial-gradient(ellipse_60%_60%_at_50%_0%,black,transparent)]" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_50%_45%_at_50%_-5%,color-mix(in_oklch,var(--primary)_14%,transparent),transparent)]" />

      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-16 pb-14 md:grid-cols-2 md:pt-24">
        <div className="flex flex-col items-start gap-6">
          <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
            </span>
            Local-first TCG card sorter
          </span>

          <h1 className="text-4xl font-heading font-semibold leading-tight tracking-tight md:text-5xl">
            Every card,
            <br />
            <span className="text-gradient">exactly where it belongs.</span>
          </h1>
          <p className="max-w-md text-sm/relaxed text-muted-foreground md:text-base/relaxed">
            DeckSift identifies cards with on-device AI, then physically sorts
            them into your bins — by rarity, set, value, or any rule you
            define. Fully offline, no accounts, no cloud.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Link
              to="/app"
              className={cn(buttonVariants({ variant: "default", size: "lg" }))}
            >
              Open the app
              <IconArrowRight size={16} />
            </Link>
            <Link
              to="/build"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
            >
              <IconTool size={16} />
              Build the machine
            </Link>
          </div>

          <p className="text-xs text-muted-foreground/80">
            Built on{" "}
            <a
              href="https://mault.xyz"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              MAULT
            </a>{" "}
            by dishwasher-detergent (MIT) · DeckSift by 4holdingdirectlimited
          </p>
        </div>

        {/* Live console mockup */}
        <div className="relative mx-auto w-full max-w-md">
          <div className="absolute inset-0 -z-10 rounded-3xl bg-primary/10 blur-2xl" />
          <div className="overflow-hidden rounded-xl border bg-card shadow-xl glow-primary">
            <div className="flex items-center justify-between border-b bg-secondary/40 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <DeckSiftMark className="size-6 rounded-md" />
                <span className="font-mono text-xs font-semibold">
                  DeckSift console
                </span>
              </div>
              <div className="flex items-center gap-3 font-mono text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  Camera
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  Arduino
                </span>
              </div>
            </div>

            <div className="relative flex items-center justify-center bg-secondary/20 p-6">
              <div className="relative aspect-[2.5/3.5] w-48 overflow-hidden rounded-lg border bg-muted shadow-sm">
                {heroImage ? (
                  <img
                    src={heroImage}
                    alt={heroCard ? getCardFaceName(heroCard) : ""}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col justify-between p-3">
                    <div className="h-3 w-2/3 rounded bg-border" />
                    <div className="space-y-2">
                      <div className="h-2 w-full rounded bg-border" />
                      <div className="h-2 w-4/5 rounded bg-border" />
                      <div className="h-2 w-3/5 rounded bg-border" />
                    </div>
                  </div>
                )}
                <div className="scan-beam" />
                <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 to-transparent p-2">
                  <p className="truncate font-mono text-[10px] font-medium text-white">
                    {heroCard
                      ? `${getCardFaceName(heroCard)} · ${heroCard.set.toUpperCase()} #${heroCard.collector_number}`
                      : "Scanning…"}
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t bg-secondary/40 px-4 py-3">
              <div className="flex items-center justify-between font-mono text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <IconScan size={12} />
                  Route
                </span>
                <span className="text-foreground">Sol Ring → Bin 4 · 1.2s</span>
              </div>
              <div className="mt-2 grid grid-cols-7 gap-1">
                {[1, 2, 3, 4, 5, 6, 7].map((bin) => (
                  <div
                    key={bin}
                    className={cn(
                      "rounded border py-1 text-center font-mono text-[10px] font-semibold",
                      bin === 4
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground",
                    )}
                  >
                    {bin}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stat strip */}
      <div className="mx-auto max-w-6xl px-4 pb-16">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border md:grid-cols-4">
          {statItems.map((stat) => (
            <div
              key={stat.label}
              className="flex flex-col items-center gap-0.5 bg-background px-4 py-5 text-center"
            >
              <span className="font-heading text-2xl font-semibold text-foreground">
                {stat.value}
              </span>
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
