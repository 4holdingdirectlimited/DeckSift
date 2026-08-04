# Magic Vault

A TCG card scanner and physical sorter that runs **entirely on your own machine** — no hosted services, no logins, no cloud. A webcam identifies cards via on-device AI embeddings, a rule engine decides which bin each card belongs in, and an Arduino-driven feeder and servo mechanism physically routes the card there.

Fork of [MAULT](https://mault.xyz) by [dishwasher-detergent](https://github.com/dishwasher-detergent/mault) — the physical sorter design (3D model, build guide, firmware base) comes from the original project; this fork adds a fully-local, single-user software stack. See [Credits](#credits).

## MakerWorld

Original hardware build: https://makerworld.com/en/models/3066180-tcg-card-sorting-machine#profileId-3451252

## How it works

1. A feeder mechanism (continuous-rotation servo + roller) pulls a card from the hopper into view of the webcam, into a fixed, per-camera-calibrated scan region (see the calibration screen)
2. The browser crops that region to a straightened card image (plain Canvas 2D, no computer vision needed, since the camera mounting and card size are fixed and calibrated ahead of time)
3. The image is sent to the server for embedding search (SigLIP, running locally on CPU or DirectML GPU)
4. PostgreSQL vector similarity search (pgvector) identifies the card
5. Configurable, per-collection bin rules — plus bundle, set-chase, wishlist, and value routing — decide which bin the card should go to
6. The web app sends a serial command to the Arduino, which drives the trapdoor/paddle/pusher servos to route the card into that bin

## Features

- **Fully local & offline** — Postgres, the API, the web app, the vision model, and card art all run on this machine. No accounts, no hosted database, no cloud calls at scan time. Only the one-time card-data sync needs the internet.
- **Live webcam scanning** with automatic card detection and identification; captures wait for the card to physically settle at the sensor before the shot is taken
- **Multi-TCG support**: pluggable card-search adapters per game (MTG/Scryfall, Yu-Gi-Oh!, Digimon, Gundam Card Game, Pokémon), each with its own field definitions driving sorting, filtering, and bin rules — a config-driven architecture makes adding more games (One Piece, Dragon Ball, …) a small, independent task
- **Rule-based sort bins**, grouped by collection, with and/or rule trees across each game's own card fields (color, rarity, price, set, type line, mana value, …)
- **Value-based binning** — numeric price rules on every bin (`Price (USD) greater than 2` → reject bin, etc.), backed by live prices for MTG and Yu-Gi-Oh!
- **Bundle mode** — assemble fixed-composition bundles (e.g. 15 common / 15 uncommon / 5 rare / 5 mythic) with no duplicates, optional holo filtering, live running value, and pause-on-complete. Every run gets an inventory **SKU** (`MTG-40-001`), stores the full list of cards it contained, and can be exported as a CSV record
- **Set-chase mode** — route every card from a target set that you don't already own into a chase bin, automatically building set-complete piles
- **Wishlist routing** — specific cards (by id or name pattern) route to their own bin ahead of normal rules
- **Holo/foil detection** — two-frame scan light (firmware-controlled LED) + heuristic classifier, with a smart skip so matte cards only need one frame
- **Sound bin-full logic** — per-bin status vs physical capacity, per-bin Empty/reset, and pause-on-overflow so a bin can never silently overflow
- **Collection tools** — export everything scanned as CSV (including a **TCGplayer-compatible inventory CSV** for the seller portal), a duplicate report, a set-completeness view, and a card library browser with set/rarity filters
- **Digitize mode** — bulk-record a library without sorting: every scanned card is saved to the collection while cards route to the catch-all bin
- **Orientation tolerance** — cards fed upside-down are auto-rotated before matching, so alignment is relaxed
- **Card grid** sorting (by name, price, rarity, etc.) adapts automatically to whichever game a collection uses
- **Remote monitoring** — watch an in-progress scan session live from another device on your LAN
- **Discord notifications** (optional) for sorter errors/jams
- **Feeder, servo, camera, and scan-light diagnostics** — live calibration tools plus hardware tests from the browser, so servos and lights are verified before a run
- **In-app hardware build guide** (`/build`) with bill of materials, wiring diagrams, and assembly instructions

## Stack

| Layer | What | Version |
| --- | --- | --- |
| Web | React + Vite + React Router + Tailwind CSS + TanStack Query | React 19 · Vite 6 · Tailwind 4 |
| Server | Hono + Drizzle ORM + PostgreSQL (pgvector) | Hono 4 · Drizzle 0.45 · Postgres 18.4 |
| Vision | SigLIP base (patch16-512) via `@huggingface/transformers`, onnxruntime-node (CPU q8 or DirectML GPU fp32) | transformers 3.8 |
| Auth | **none** — fully-local single-user build, no logins | — |
| Hardware | Arduino Uno R4 Minima via Web Serial (9600 baud), PCA9685 servo driver, IR sensors, scan-light LED | — |
| Monorepo | Turborepo + pnpm workspaces | pnpm 9 |

**Security posture (2026-08):** `pnpm audit` reports **0 critical** and **0
high-severity issues in the runtime dependency graph**. The one remaining
runtime-path flag is a React Router advisory that only affects **RSC mode**
(server actions) — this app is a classic client-rendered SPA, so it does not
apply; the fix is v8-only and upgrading would be a breaking change with no
benefit here. All other `pnpm audit` findings are transitive dependencies of
dev-only tooling (the `shadcn` CLI, `tsup`, ESLint) that is never shipped or
exposed. The app itself is local-only and unauthenticated by design — it is
not intended to be exposed to the public internet.

## Project structure

```
packages/
├── shared/   @magic-vault/shared - types, constants, evaluate-bin rule engine
├── server/   @magic-vault/server - Hono API, Drizzle schema/db, card-search adapters, sync jobs
└── web/      @magic-vault/web    - React SPA (scanner, bins, collections, library, admin, build guide)
arduino/      Firmware + build docs (arduino/main/main.ino, BUILD.md, SERIAL_PROTOCOL.md)
3d model/     Printable enclosure/module design (Fusion 360 + .3mf)
custom/       Our docs: CHANGES.md (all modifications), SETUP.md (local runbook), TCGS.md, PLAN.md
drizzle/      Generated SQL migrations
scripts/      Local helpers: start-server.cmd, start-web.cmd, local-db.mjs, backup-db.mjs,
              arduino-compile.sh
              (+ packages/server/scripts: seed-local.ts, apply-bin-capacities.ts, import-cardset.ts, bench-vectorize.ts)
```

## Getting started

**Prerequisites:** Windows (or Linux/macOS with adjustments), [pnpm 9](https://pnpm.io), Node 20+, and a portable PostgreSQL + pgvector install (see below). The browser must support the [Web Serial API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API) (Chrome/Edge) for hardware control.

```bash
pnpm install
cp .env.example .env   # then fill in DATABASE_URL etc.
```

### 1. Local PostgreSQL (no Docker/admin needed)

Download the portable PostgreSQL + pgvector bundle (user-space, no admin rights or services required):

```bash
curl -L -o postgres.zip \
  https://github.com/YukeonWayne/pg_pgvector_binary/releases/download/v18.4-pgvector0.8.3-win32-x64/postgres-18.4-pgvector-0.8.3-win32-x64.zip
```

Extract it anywhere (e.g. `C:\Mault Revised\.local\postgres`), then initialize and start:

```bash
PGBIN="<extracted>/win32-x64/bin"
"$PGBIN/initdb" -D "<extracted>/data" -U postgres -A trust -E UTF8 --locale=C
# Start detached (Windows):
powershell -NoProfile -Command "Start-Process -FilePath '<extracted>\win32-x64\bin\postgres.exe' -ArgumentList '\"-D\" \"<extracted>\data\" \"-p\" \"5433\" \"-c\" \"listen_addresses=127.0.0.1\" \"-c\" \"shared_buffers=1GB\"' -WindowStyle Hidden"
```

Create the database and apply the local bootstrap (creates the pgvector extension, the RLS role, and the `auth_is_org_member()` function). Run it **before** `db:migrate` and **again after**:

```bash
"$PGBIN/psql" -h 127.0.0.1 -p 5433 -U postgres -c "CREATE DATABASE mault;"
"$PGBIN/psql" -h 127.0.0.1 -p 5433 -U postgres -d mault -f packages/server/sql/local-bootstrap.sql
pnpm --filter @magic-vault/server db:migrate
"$PGBIN/psql" -h 127.0.0.1 -p 5433 -U postgres -d mault -f packages/server/sql/local-bootstrap.sql
```

Then point `.env` at it:

```
DATABASE_URL=postgres://postgres@127.0.0.1:5433/mault
VECTORIZE_DEVICE=dml    # or cpu (see .env.example)
```

A helper script manages the server day-to-day, and can register a no-admin logon auto-start:

```bash
node scripts/local-db.mjs start|stop|status|install|uninstall
```

Back up the database with one command (safety net — see `scripts/backup-db.mjs`):

```bash
node scripts/backup-db.mjs backup        # dump to .local/backups
node scripts/backup-db.mjs list          # list existing backups
node scripts/backup-db.mjs restore <file>  # restore (wipes current data)
```

### 2. Seed + run

```bash
# One-time seed: games, default collection, bin set, default bundle config
cd packages/server && npx tsx --env-file ../../.env scripts/seed-local.ts

# Start the stack (two detached processes)
powershell Start-Process -FilePath "C:\Mault Revised\mault\scripts\start-server.cmd" -WindowStyle Hidden
powershell Start-Process -FilePath "C:\Mault Revised\mault\scripts\start-web.cmd" -WindowStyle Hidden
```

Open **http://localhost:5173** — no login, it opens straight to the scanner.

### 3. Card sync (the one internet step)

In the web app, go to **Admin → Sync** and run the sync for each game you'll use. The first MTG sync downloads the Scryfall catalog (~54k cards) and embeds each with the local SigLIP model — roughly 9–10 hours on a mid-range GPU, one-time and resumable (it skips cards already embedded, and the catalog is cached on disk). Syncs are queued one game at a time and auto-advance; the sync paces itself so your desktop stays responsive and scans keep priority.

> Until sync completes for a game, scanning can't match anything — the `cards` table is empty and the search has nothing to compare against.

### 4. Flash the firmware + calibrate

1. Open `arduino/main/main.ino` in the Arduino IDE, install **ArduinoJson** + **Adafruit PWM Servo Driver**, select **Arduino Uno R4 Minima**, and upload.
2. Open **http://localhost:5173**, connect the Arduino via **Web Serial**, then calibrate at `/app/calibrate` (drag the scan region, tune servo positions) and run the hardware diagnostics to verify servos and the scan light.
3. Load cards, connect the camera (see [Webcam](#webcam)), and scan.

**Full walkthrough, hardware BOM, wiring, and tuning:** see `custom/SETUP.md` (our local runbook) and `arduino/main/BUILD.md`.

## Environment variables

Copy `.env.example` to `.env` and fill in. All variables live in a single root `.env` (Vite reads up from `packages/web`).

| Variable | Purpose | Default |
| --- | --- | --- |
| `DATABASE_URL` | Local Postgres connection string | `postgres://postgres@127.0.0.1:5433/mault` |
| `PORT` | API port | `3001` |
| `WEB_URL` | CORS origin / absolute links (Discord) | `http://localhost:5173` |
| `VITE_API_URL` | Base URL of the API (baked into the web bundle) | `http://localhost:3001` |
| `VITE_APP_ENV` | `local` / `development` / `qa` (banner + warnings) | `local` |
| `VECTORIZE_DEVICE` | `cpu` (q8) or `dml` (DirectML GPU, fp32 — ~1.9× faster) | `cpu` |
| `SYNC_FETCH_BATCH` | Parallel image fetches during sync | `16` |
| `SYNC_EMBED_BATCH` | GPU embedding batch (8 is proven stable on weaker GPUs) | `8` |
| `SYNC_PACE_SCAN_MS` | Sync back-off per batch while a scan is active | `200` |
| `SYNC_PACE_IDLE_MS` | Sync beat per batch when idle | `10` |
| `ART_CACHE_DIR` / `SYNC_CACHE_DIR` | Override local cache locations | `<repo>/packages/server/.cache/…` |

## Database

Migrations live in `drizzle/`:

```bash
pnpm --filter @magic-vault/server db:generate  # generate a migration from schema changes
pnpm --filter @magic-vault/server db:migrate   # apply migrations
pnpm --filter @magic-vault/server db:push      # push schema directly (dev)
pnpm --filter @magic-vault/server db:studio    # open Drizzle Studio
```

The migration history is a single regenerated baseline from the current schema — all tables use org-scoped RLS policies (defense-in-depth for any future deployment; the local build enforces isolation at the route layer). Postgres starts with `shared_buffers=1GB` so the card catalog + vector index stay resident in RAM.

### What still needs the internet

- **Card data sync** (Scryfall / Yu-Gi-Oh! / Digimon / Gundam / Pokémon) in the Admin page — how the card database gets built
- **Card art** — the image proxy fetches new art; everything synced is disk-cached locally afterwards
- **One-time SigLIP model download** — the vision model downloads once from HuggingFace, then all scanning runs fully on-device
- **Discord webhooks** — optional, only if you configure a URL

Everything else — scanning, sorting, calibration, the database, and vision — runs entirely on the local machine.

## Hardware

The full bill of materials, wiring diagrams, and assembly instructions live in the app at `/build`. In short:

- Arduino Uno R4 Minima, driving a PCA9685 servo controller over I2C
- 9 positional SG90 servos (3 per module: trapdoor, paddle gate, pusher) plus 1 continuous-rotation SG90 for the feeder
- IR sensors for card-feed detection (hopper + one per module)
- **Scan light** (LED 5, PCA9685 channel 14) — a small angled LED the firmware toggles for two-frame holo detection
- External 5 V PSU (4–10 A) into the PCA9685 `V+`, common ground with the Arduino (mandatory)
- Enclosure and module parts are in `3d model/` (Fusion 360 source + printable `.3mf`)

Upload `arduino/main/main.ino` (ArduinoJson + Adafruit PWM Servo Driver libraries). It communicates via JSON over USB serial (9600 baud): the web app sends `{"bin": N}` and the Arduino runs the routing sequence. Protocol details in `arduino/main/SERIAL_PROTOCOL.md`.

## Webcam

Primary: **EMEET C60E 4K** — the higher resolution gives holo detection and the embeddings more detail to work with. Recommended settings:

- Autofocus: Off (fixed focus on the scan plane)
- Resolution: 1080p or 4K, whichever the scan-region calibration covers
- Brightness / contrast / saturation: moderate, consistent lighting

The original build used a Logitech C920 (Auto Focus: Off · Focus: 50% · Auto Exposure: On · Low Light Compensation: On · Auto White Balance: On · Brightness: 140 · Contrast: 140 · Saturation: 160 · Sharpness: 130).

## Documentation

- `custom/SETUP.md` — **the local runbook**: stack URLs, start/stop, first-run setup, bundle/chase/wishlist modes, bin capacities, value sorting, machine responsiveness tuning
- `custom/CHANGES.md` — every modification relative to upstream, in revert order
- `custom/TCGS.md` — multi-TCG architecture, top-20 TCG data-source status, adding a new game
- `custom/PLAN.md` — firmware roadmap (non-blocking state machine, pipelining, watchdog) and the machine-build commissioning checklist
- `arduino/main/BUILD.md` — hardware build guide, wiring, calibration
- `arduino/main/SERIAL_PROTOCOL.md` — JSON serial contract

## Credits

This project is a fork of [MAULT](https://mault.xyz) by
[dishwasher-detergent](https://github.com/dishwasher-detergent/mault), released
under the MIT license. The physical sorter design — the 3D model, build photos,
wiring layout, and the Arduino firmware it started from — all come from the
original project. Our fork keeps that hardware base and adds a fully-local,
single-user software stack: no hosted services, no logins, on-device vision,
and local card storage.

See the LICENSE file for the MIT terms. Build photos on the `/build` page are
from the original project, used with attribution.
