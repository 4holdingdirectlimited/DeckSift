# Magic Vault — local runbook (this machine)

How to run the app, connect to it, and do the one-time first-run setup.

## The web interface

| URL | What |
| --- | --- |
| **http://localhost:5173** | The app (Vite dev server; no login — opens straight to the scanner) |
| http://localhost:3001 | The API server (the browser talks to it via the Vite `/api` proxy) |
| 127.0.0.1:5433 | Local PostgreSQL (database `mault`) |

In-app pages: `/app` scanner · `/app/collections` · `/app/bins` · `/app/calibrate`
· `/app/settings` (games) · `/app/admin` (card sync) · `/app/monitor`.

## Starting / stopping the stack

```powershell
# Postgres (portable, auto-starts at logon if you ran `install`)
node scripts/local-db.mjs status      # is it running?
node scripts/local-db.mjs start|stop

# API server (detached)
powershell Start-Process -FilePath "C:\Mault Revised\mault\scripts\start-server.cmd" -WindowStyle Hidden

# Web UI (detached)
powershell Start-Process -FilePath "C:\Mault Revised\mault\scripts\start-web.cmd" -WindowStyle Hidden
```

## First-run setup (done once — already executed on this machine)

The database on this machine is already seeded. To re-create or repair the
setup on a fresh install, run the seeder (idempotent, safe to re-run):

```powershell
cd C:\Mault Revised\mault\packages\server
npx tsx --env-file ..\..\.env scripts\seed-local.ts
```

This creates:

1. **Games** — the five sync-capable game rows (`mtg`, `yugioh`, `digimon`,
   `gundam`, `pokemon`) with their real data-source URLs and per-game rarity
   field definitions. The **key must match** the server adapter — the seeder
   uses the correct keys.
2. **Collection** — `My Collection` (MTG), active.
3. **Bin set** — `Default 7 Bins`, active, 7 bins with bin 7 as catch-all.
4. **Bundle config** — `Standard Bundle (15/15/5/5)` (MTG rarities).

Then run the card sync for each game you'll actually use:

1. Open **http://localhost:5173**.
2. **Admin** → run the **sync** for each game. The first MTG sync downloads
   the catalog and embeds ~25k cards (hours on this machine, one-time,
   resumable — it skips finished cards; the GPU makes it ~2× faster).
3. Back to the scanner, select the collection, connect the sorter + camera,
   and scan.

> Until sync completes for a game, scanning can't match anything — the
> `cards` table is empty and the search has nothing to compare against.

## Bundle mode (fixed-composition bundles, no duplicates)

The **Bundle Mode** panel lives on the scanner page (left sidebar).

- **Create a bundle** — name + rarity targets (rarity, count, bin) + reject
  bin. Example: common ×15 → bin 1, uncommon ×15 → bin 2, rare ×5 → bin 3,
  mythic ×5 → bin 4, reject → bin 7. The default 15/15/5/5 config is pre-seeded.
- **Start a run** — bundle routing switches on. Every scanned card is offered
  to the run: if it's already in the bundle, its rarity slot is full, or its
  rarity isn't part of the recipe, it routes to the **reject bin**. Otherwise it
  routes to its target bin and the count advances.
- **Progress** — the panel shows live per-rarity counts (e.g. 7/15 common) and
  an overall bar; the card grid records every scan as usual.
- **Complete** — when all targets are met the run auto-completes, auto-feed
  pauses, and the bundle is done. Start the next run to assemble another.
- **Resume** — runs persist in Postgres; reloading or restarting the app
  resumes the active run exactly where it left off.

Rarity names must match what the sync stores for that game (all lowercased):
MTG uses `common/uncommon/rare/mythic`; Yu-Gi-Oh! uses
`common/rare/super rare/ultra rare/secret rare`; Digimon uses
`common/uncommon/rare/super rare/secret rare`. Edit the rarity strings in the
bundle editor to match the game you're scanning.

## Sorting by value (e.g. "over $2 → reject bin")

Binning is fully configurable per bin, including numeric price rules:

- The bin field **Price (USD)** (`prices.usd`, with greater-than /
  less-than etc.) is built in; **Price (USD, Foil)** (`prices.usd_foil`) was
  added for foil-value sorting.
- Example: Bin 6 rule `Price (USD) greater than 2` = "valuable" pile;
  Bin 7 (catch-all) = everything else. Or invert it: a low-value reject bin
  under $2, everything else to the good bins. Any combination of rules per
  bin works — rarity, set, type line, name, mana value, price, color.

### Where prices come from

| Game | Prices in the DB? |
| --- | --- |
| MTG (Scryfall) | ✅ bulk data includes `prices.usd` / `usd_foil` |
| Yu-Gi-Oh! (YGOPRODeck) | ✅ `card_prices` → `prices.usd`/`eur` (wired) |
| Gundam / Pokémon / Digimon | ❌ their sources carry no price data — value rules won't fire |

## Known gaps / roadmap (what's not done yet)

- **One Piece / Dragon Ball** — no public API; needs a community dataset via
  `import-cardset.ts` (see `custom/TCGS.md`).
- **Holo detection** — heuristic v1 + two-frame scan light are built;
  thresholds need calibration on the real rig (`custom/PLAN.md` checklist).
- **2 s/card pipeline** — firmware state machine + pipelined feed, deferred
  to machine build (`custom/PLAN.md`).
- **Pricing for Gundam/Pokémon/Digimon** — would need a price source/API.

## Everything is local (after first sync)

Postgres, the API, the web app, the vision model (SigLIP), and card art
(disk-cached) all run on this machine. Only the one-time sync and any brand-new
card art need the internet.
