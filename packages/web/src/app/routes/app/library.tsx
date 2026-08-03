import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { gamesQueryOptions } from "@/features/games/api/games";
import {
  browseLibrary,
  type LibraryCard,
} from "@/features/library/api/library";
import { useOrg } from "@/features/companies/api/use-organization";
import { cn, resolveCardImageUrl } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const GAME_TABS: { key: string; label: string }[] = [
  { key: "mtg", label: "Magic" },
  { key: "pokemon", label: "Pokémon" },
  { key: "yugioh", label: "Yu-Gi-Oh!" },
  { key: "digimon", label: "Digimon" },
  { key: "gundam", label: "Gundam" },
];

function formatUsd(value: string | number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `$${Number(value).toFixed(2)}`;
}

function rarityBadgeClass(rarity: string | null): string {
  switch ((rarity ?? "").toLowerCase()) {
    case "common":
      return "bg-slate-500/20 text-slate-300";
    case "uncommon":
      return "bg-emerald-500/20 text-emerald-400";
    case "rare":
      return "bg-sky-500/20 text-sky-400";
    case "mythic":
    case "secret rare":
    case "legend rare":
      return "bg-amber-500/20 text-amber-400";
    case "super rare":
      return "bg-fuchsia-500/20 text-fuchsia-400";
    case "promo":
      return "bg-violet-500/20 text-violet-400";
    default:
      return "bg-muted text-muted-foreground";
  }
}

// ─── Card detail dialog ───────────────────────────────────────────────────────

function CardDetail({ card, onClose }: { card: LibraryCard; onClose: () => void }) {
  const data = card.cardData;
  const imageUrl = resolveCardImageUrl(card.imageUrl ?? undefined);
  const prices = data?.prices;

  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      {imageUrl && (
        <img
          src={imageUrl}
          alt={card.name}
          className="w-48 shrink-0 rounded-lg border self-start"
        />
      )}
      <div className="flex flex-col gap-2 min-w-0">
        <div>
          <h3 className="font-heading text-lg font-semibold leading-tight">
            {card.name}
          </h3>
          <p className="text-xs text-muted-foreground">
            {card.setName ?? card.setCode} · {card.setCode}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              rarityBadgeClass(card.rarity),
            )}
          >
            {card.rarity ?? "—"}
          </span>
          {data?.type_line && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {data.type_line}
            </span>
          )}
          {data?.collector_number && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              #{data.collector_number}
            </span>
          )}
        </div>

        {prices && (
          <div className="grid grid-cols-2 gap-1.5 text-xs">
            <div className="rounded border p-1.5">
              <p className="text-[10px] text-muted-foreground uppercase">USD</p>
              <p className="font-medium tabular-nums">{formatUsd(prices.usd)}</p>
            </div>
            <div className="rounded border p-1.5">
              <p className="text-[10px] text-muted-foreground uppercase">
                USD Foil
              </p>
              <p className="font-medium tabular-nums">
                {formatUsd(prices.usd_foil)}
              </p>
            </div>
          </div>
        )}

        {data?.oracle_text && (
          <p className="text-xs/relaxed text-muted-foreground whitespace-pre-wrap">
            {data.oracle_text}
          </p>
        )}

        <div className="flex items-center justify-between gap-2 mt-1">
          <p className="text-[10px] font-mono text-muted-foreground/60 uppercase">
            {card.gameKey} · {card.scryfallId.slice(0, 8)}
          </p>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LibraryPage() {
  const { activeOrg } = useOrg();
  const [gameKey, setGameKey] = useState<string>("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [rarity, setRarity] = useState<string>("");
  const [setCode, setSetCode] = useState("");
  const [page, setPage] = useState(1);
  const [cards, setCards] = useState<LibraryCard[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<LibraryCard | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: games = [] } = useQuery({
    ...gamesQueryOptions,
    enabled: !!activeOrg,
  });

  const rarityOptions = useMemo(() => {
    const game = games.find((g) => g.key === gameKey);
    const rarityField = game?.fieldDefinitions.find((f) => f.field === "rarity");
    return rarityField?.options?.map((o) => o.value) ?? [];
  }, [games, gameKey]);

  const query = useQuery({
    queryKey: ["library", gameKey, search, rarity, setCode, page],
    queryFn: () =>
      browseLibrary({
        gameKey: gameKey || undefined,
        search: search || undefined,
        rarity: rarity || undefined,
        set: setCode || undefined,
        page,
      }),
    staleTime: 30_000,
    enabled: !!activeOrg,
  });

  useEffect(() => {
    if (query.data) {
      setCards((prev) =>
        page === 1 ? query.data!.cards : [...prev, ...query.data!.cards],
      );
      setTotal(query.data.total);
    }
  }, [query.data, page]);

  // Reset the accumulated grid when any filter changes.
  const resetPage = useCallback(() => setPage(1), []);
  useEffect(() => {
    resetPage();
  }, [gameKey, search, rarity, setCode, resetPage]);

  function handleSearchInput(value: string) {
    setSearchInput(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setSearch(value), 300);
  }

  const hasMore = cards.length < total;
  const isLoading = query.isLoading || query.isFetching;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-y-auto">
      <div className="p-4 pb-2 flex flex-col gap-3 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-lg font-semibold">Card Library</h1>
            <span className="text-xs text-muted-foreground tabular-nums">
              {total.toLocaleString()} cards
            </span>
          </div>
          <Input
            placeholder="Search by name..."
            value={searchInput}
            onChange={(e) => handleSearchInput(e.target.value)}
            className="h-8 text-xs max-w-56"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1">
            <Button
              size="sm"
              variant={gameKey === "" ? "default" : "outline"}
              onClick={() => setGameKey("")}
            >
              All
            </Button>
            {GAME_TABS.map((g) => (
              <Button
                key={g.key}
                size="sm"
                variant={gameKey === g.key ? "default" : "outline"}
                onClick={() => setGameKey(g.key)}
              >
                {g.label}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 ml-auto">
            {rarityOptions.length > 0 && (
              <Select value={rarity} onValueChange={(v) => setRarity(v ?? "")}>
                <SelectTrigger className="h-8 text-xs w-40">
                  <SelectValue placeholder="Any rarity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Any rarity</SelectItem>
                  {rarityOptions.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Input
              placeholder="Set code (e.g. mkm)"
              value={setCode}
              onChange={(e) => setSetCode(e.target.value)}
              className="h-8 text-xs w-36"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
        {isLoading && page === 1 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[5/7] rounded-lg" />
            ))}
          </div>
        )}

        {!isLoading && cards.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-10">
            No cards found. Sync a game in Admin to populate the library.
          </p>
        )}

        {cards.length > 0 && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {cards.map((card) => {
                const imageUrl = resolveCardImageUrl(card.imageUrl ?? undefined);
                return (
                  <button
                    key={card.scryfallId}
                    type="button"
                    onClick={() => setSelected(card)}
                    className="group flex flex-col rounded-lg border bg-card overflow-hidden text-left transition-colors hover:border-primary/50 hover:bg-accent/50"
                  >
                    <div className="aspect-[5/7] overflow-hidden bg-muted">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={card.name}
                          loading="lazy"
                          className="size-full object-cover transition-transform group-hover:scale-[1.03]"
                        />
                      ) : (
                        <div className="size-full grid place-items-center">
                          <span className="text-[10px] text-muted-foreground">
                            no art
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="p-1.5 flex flex-col gap-0.5 min-w-0">
                      <p className="text-[11px] font-medium truncate">
                        {card.name}
                      </p>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] font-mono text-muted-foreground truncate">
                          {card.setCode}
                        </span>
                        {card.rarity && (
                          <span
                            className={cn(
                              "shrink-0 rounded px-1 py-px text-[9px] font-semibold uppercase",
                              rarityBadgeClass(card.rarity),
                            )}
                          >
                            {card.rarity.split(" ")[0]}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {hasMore && (
              <div className="flex justify-center py-4">
                <Button
                  variant="outline"
                  disabled={isLoading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {isLoading ? "Loading..." : "Load more"}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="max-w-lg w-full rounded-lg border bg-background p-4 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <CardDetail card={selected} onClose={() => setSelected(null)} />
          </div>
        </div>
      )}
    </div>
  );
}
