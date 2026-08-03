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

## First-run setup (required once — the DB is currently empty)

1. Open **http://localhost:5173**.
2. **Settings → Games** → create each game you'll use. The **key must match**
   the server adapter: `mtg`, `gundam`, `pokemon`, `yugioh`, `digimon`.
   Set the data-source URL and the rarity field definitions (the UI's
   defaults are fine; add rarity options per game if binning by rarity).
3. **Collections** → create a collection, pick its game.
4. **Bins** → configure the bin set (rules per bin; see "Sorting by value").
5. **Admin** → run the **sync** for each game. The first MTG sync downloads
   the catalog and embeds ~25k cards (hours on this machine, one-time,
   resumable — it skips finished cards; the GPU makes it ~2× faster).
6. Back to the scanner, select the collection, connect the sorter + camera,
   and scan.

> Until step 5 completes for a game, scanning can't match anything — the
> `cards` table is empty and the search has nothing to compare against.

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

- **Bundle mode** (15/15/5/5 composition, duplicates→reject, resume) — not
  built; see `custom/PLAN.md`.
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
