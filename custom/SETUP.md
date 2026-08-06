# DeckSift — local runbook (this machine)

How to run the app, connect to it, and do the one-time first-run setup.

## The web interface

| URL | What |
| --- | --- |
| **https://decksift.local:5173** | The app, friendly hostname (HTTPS — required for Web Serial). See below for the one-time setup |
| **http://localhost:5173** | The app fallback (works the same; `localhost` is already a secure context) |
| http://localhost:3001 | The API server (the browser talks to it via the Vite `/api` proxy) |
| 127.0.0.1:5433 | Local PostgreSQL (database `mault`) |

**decksift.local one-time setup** (needs no admin except the hosts line):

```powershell
node scripts/ssl-setup.mjs        # downloads mkcert, issues + trusts a local cert
# then, as admin, add to C:\Windows\System32\drivers\etc\hosts:
#   127.0.0.1  decksift.local
# then restart the web server (start-web.cmd)
```

The app also works from other devices on your LAN via `http://<pc-ip>:5173`
(the API is same-origin through the Vite proxy, so no CORS setup needed).

In-app pages: `/app` scanner · `/app/collections` · `/app/library` (card
browser + set completeness) · `/app/bins` · `/app/calibrate` ·
`/app/settings` (games) · `/app/admin` (card sync) · `/app/monitor`.

## Starting / stopping the stack

```powershell
# Postgres (portable, auto-starts at logon if you ran `install`)
node scripts/local-db.mjs status      # is it running?
node scripts/local-db.mjs start|stop

# API server (detached; output appends to server.log at the repo root)
#   Run the next two lines from the repo root.
powershell Start-Process -FilePath ".\scripts\start-server.cmd" -WindowStyle Hidden

# Web UI (detached)
powershell Start-Process -FilePath ".\scripts\start-web.cmd" -WindowStyle Hidden
```

The API has a health check — `curl http://localhost:3001/api/health` returns
`{"success":true,"status":"ok",...}` (503 when the database is down).

## First-run setup (done once — already executed on this machine)

The database on this machine is already seeded. To re-create or repair the
setup on a fresh install, run the seeder (idempotent, safe to re-run):

```powershell
cd packages\server
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

1. Open **https://decksift.local:5173** (or **http://localhost:5173**).
2. **Admin** → run the **sync** for each game. The first MTG sync downloads the
   Scryfall catalog (~54k unique-artwork cards) and embeds each with the local
   SigLIP model — roughly **9-10 hours** on this machine's GPU, one-time and
   resumable (it skips cards already embedded, and the catalog itself is cached
   on disk so re-runs skip the download). The sync log shows live progress
   (`[N/53952] Card Name (SET)`); it can be cancelled and restarted safely.
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
- **Game (SKU prefix)** — pick the game when creating a bundle (defaults to
  the active collection's game). Each run gets an inventory **SKU** at start:
  `{GAME}-{CARD_COUNT}-{SEQ}` (e.g. `MTG-40-001`, `YGO-40-002`). Acronyms:
  MTG, YGO, PKM, DIG, GUN (unknown keys fall back to `TCG`).
- **Bundle inventory** — past runs are listed under the panel with their SKU,
  card count, value, and status. Each run stores the full list of placed
  cards; open it to view the cards, or **download the bundle CSV** — an
  inventory record (SKU, config, game, date, total value + per-card rows) for
  handling sales disputes / “missing card” claims.

Rarity names must match what the sync stores for that game (all lowercased):
MTG uses `common/uncommon/rare/mythic`; Yu-Gi-Oh! uses
`common/rare/super rare/ultra rare/secret rare`; Digimon uses
`common/uncommon/rare/super rare/secret rare`. Edit the rarity strings in the
bundle editor to match the game you're scanning.

### Bundle options

- **Allow duplicates** — when off (default), the same card id can only be
  placed once per bundle run; repeats route to the reject bin. When on, copies
  of the same card all count.
- **Holo detection** — when off (default), the scan light/foil verdict is
  ignored: a holo common and a plain common are both just “common”. When on,
  each rarity target gains a foil filter (**Any / Non-foil / Foil**), so you
  can build e.g. a non-holo common bundle (holo commons go to the reject bin)
  or a foil-chase bundle.

## Bin capacity limits (overflow protection)

The physical bins are 155 mm (module 1, nearest the feeder), 110 mm (module
2), 65 mm (module 3), and 60 mm for the reject/catch-all channel. The app sets
a per-bin max card count so a run can never overflow:

```
maxCapacity = floor((binHeightMm / 0.3 mm average card thickness) × 0.9)
```

| Bins | Height | Max cards |
| --- | --- | --- |
| 1–2 (module 1) | 155 mm | 465 |
| 3–4 (module 2) | 110 mm | 330 |
| 5–6 (module 3) | 65 mm | 195 |
| 7 (reject) | 60 mm | 180 |

When a bin hits its limit the app routes overflow to the catch-all bin and
pauses auto-feed. The 10 % headroom keeps the top of a full stack clear of the
mechanism above. The values live in `BIN_HEIGHTS_MM` / `CARD_THICKNESS_MM` in
the shared package; `cd packages/server && npx tsx scripts/apply-bin-capacities.ts`
re-applies them to the active bin set after a change.

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

## Set-chase mode (complete a set automatically)

The **Chase** panel sits on the scanner page (left sidebar).

- **Create a chase** — name + game + set code + chase bin + reject bin
  (optionally bind a collection so cards you already own are skipped).
- **Start a run** — every scanned card is offered to the chase: if it's part
  of the set, isn't already found this run, and isn't already owned (when a
  collection is bound) it routes to the chase bin. Off-set, owned, and
  duplicate cards route to the reject bin with a reason toast.
- **Resume** — runs persist in Postgres; reload/restart resumes the active run.
- Priority when several modes are on: **bundle > chase > wishlist > normal
  bin rules**. Bin capacity is still enforced — a full chase bin pauses the
  machine until you empty it.

Set codes are uppercased on the server; enter e.g. `JUSH-EN040` (YGO) or the
set code shown in the library for the game you're scanning.

## Wishlist routing (specific cards to their own bin)

The **Wishlist** panel sits on the scanner page (left sidebar).

- **Create a wishlist** — name + game + bin. Add items as a specific card id
  (from the library) or a name pattern (e.g. `Blue-Eyes`).
- A wishlist only fires when the **active collection's game** matches the
  wishlist's game. A matched card routes to the wishlist bin before normal bin
  rules; capacity is still enforced.
- Name patterns match case-insensitively against the card name.

## Collection tools (scanner page + library)

- **Bundle value** — the bundle panel shows the live $ total of the run
  (from `prices.usd` when the game has prices; see below).
- **Export CSV** — toolbar button on the scanner page downloads
  `collection-<date>.csv` (name, set, rarity, collector #, price, qty, foil,
  bin) for everything scanned this session.
- **TCGplayer CSV** — toolbar button downloads `tcgplayer-<date>.csv`, a
  TCGplayer-compatible inventory file (`name, set_name, condition, quantity,
  purchase_price, list_price, tcgplayer_id`). Condition defaults to **Near
  Mint** (edit before upload if you grade differently); foil scans get
  `(Foil)` in the name so TCGplayer's matcher picks the foil product;
  `list_price` is filled from the card's price when the source has one;
  `tcgplayer_id` is left blank until the API integration lands. Upload it in
  the TCGplayer seller portal → Inventory → Import.
- **Digitize mode** — toggle in the scanner sidebar. When on, every scanned
  card is recorded to the collection but **not sorted**: no bin rules, bundles,
  chase, or wishlist apply, and cards route to the catch-all bin so the
  machine keeps moving. Use it to bulk-record a library (e.g. for later
  pricing or TCGplayer listing) without deciding where anything goes.
- **Orientation tolerance** — the scan crop auto-detects a card fed upside
  down (180°) and rotates it upright before matching, so cards don't need to
  be perfectly aligned end-over-end.
- **Duplicates** — toolbar button lists every card scanned more than once, so
  doubles are easy to spot.
- **Set completeness** — switch on the library page; enter a set code and see
  `owned / total` (and %) for cards scanned this session.

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

## Machine responsiveness during sync

The sync saturates the GPU while it runs (that's the embedding step), and on
Windows the desktop compositor shares the GPU — so a full-tilt sync can make
Windows feel sluggish even though CPU is nearly idle. The server now paces
itself: it runs near-full speed when idle and backs off when a scan is in
progress (last 5 s). Tunables (in `.env` or the start command):

```
SYNC_FETCH_BATCH=16      # parallel image fetches
SYNC_EMBED_BATCH=8       # GPU embedding batch (8 is proven stable on this GPU)
SYNC_PACE_SCAN_MS=200    # delay per batch while scanning
SYNC_PACE_IDLE_MS=10     # delay per batch when idle
```

Postgres also starts with `shared_buffers=1GB` (was the 128 MB default) so the
card catalog + vector index stay in RAM. Restart Postgres after a change
(`node scripts/local-db.mjs stop && start`).

Nothing here needs caching *in* the GPU: the lookup step (vector search) runs
in Postgres on CPU, and the SigLIP model is already loaded into VRAM once and
reused for every scan/sync embed.
