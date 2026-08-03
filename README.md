# Magic Vault

A TCG card scanner and physical sorter. A webcam identifies cards via AI image embeddings, a rule engine decides which bin each card belongs in, and an Arduino-driven feeder and servo mechanism physically routes the card there.

## MakerWorld

https://makerworld.com/en/models/3066180-tcg-card-sorting-machine#profileId-3451252

## How it works

1. A feeder mechanism (continuous-rotation servo + roller) pulls a card from the hopper into view of the webcam, into a fixed, per-camera-calibrated scan region (see calibration screen)
2. The browser crops that region to a straightened card image (plain Canvas 2D, no computer vision needed, since the camera mounting and card size are fixed and calibrated ahead of time)
3. The image is sent to the server for embedding search (Hugging Face SigLIP)
4. PostgreSQL vector similarity search (pgvector) identifies the card
5. Configurable, per-collection bin rules decide which bin the card should go to
6. The web app sends a serial command to the Arduino, which drives the trapdoor/paddle/pusher servos to route the card into that bin

## Features

- Live webcam scanning with automatic card detection and identification; captures wait for the card to physically settle at the sensor before the shot is taken
- Multi-TCG support: pluggable card-search adapters per game (Scryfall/MTG, Yu-Gi-Oh!, Digimon, Gundam Card Game, Pokémon), with each game's own admin-configurable field definitions driving sorting, filtering, and bin rules
- Rule-based sort bins, grouped by collection, with and/or rule trees across each game's own card fields (color, rarity, price, set, etc.)
- Card grid sorting (by name, price, rarity, etc.) adapts automatically to whichever game a collection uses
- Multiple collections per organization, each with their own bin configuration and card history
- Remote monitoring: watch an in-progress scan session live from another device
- Discord notifications for sorter errors/jams, plus an optional per-card-scanned notification with the card's image, name, price, collection/game, and a link to watch the session live
- Per-organization branding and scanner layout settings
- Feeder, servo, and camera scan-region calibration tools: the camera's capture region can be dragged/resized live against the feed to match different webcam mountings and fields of view
- In-app hardware build guide (`/build`) with bill of materials, wiring diagrams, and assembly instructions

## Stack

- **Web**: React 19, Vite, React Router v7, Tailwind CSS 4, TanStack Query
- **Server**: Hono 4, Drizzle ORM, PostgreSQL (pgvector)
- **Auth**: none — fully-local single-user build, no logins
- **Hardware**: Arduino Uno R4 via Web Serial API (9600 baud), PCA9685 servo driver
- **Monorepo**: Turborepo + pnpm workspaces

## Project structure

```
packages/
├── shared/   @magic-vault/shared - types, constants, evaluate-bin rule engine
├── server/   @magic-vault/server - Hono API, Drizzle schema/db, auth middleware
└── web/      @magic-vault/web    - React SPA (scanner, bins, collections, admin, build guide)
arduino/      Arduino sketch (arduino/main/main.ino)
"3d model"/   Printable enclosure/module design (Fusion 360 + .3mf)
drizzle/      Generated SQL migrations
scripts/      Release/version-bump helpers
```

## Getting started

```bash
pnpm install
pnpm dev        # Vite on :5173, Hono on :3001
```

### Environment variables

Everything lives in a single root `.env` (Vite is configured to read up from `packages/web`, so there's no separate `packages/web/.env`). Copy `.env.example` to `.env` and fill it in:

```bash
cp .env.example .env
```

```
# Server
DATABASE_URL=                 # local Postgres, e.g. postgres://postgres@127.0.0.1:5433/mault
PORT=                         # optional, defaults to 3001
WEB_URL=                      # optional, used for CORS and to build absolute links (Discord monitor-page links) - must be publicly reachable for those links/images to work outside your own machine

# Public variables for the React app (baked into the client bundle at build time)
VITE_API_URL=                 # base URL of the Hono API, e.g. http://localhost:3001
VITE_APP_ENV=                 # local/developement/QA/production
```

## Database

The app runs entirely against a local PostgreSQL — no hosted services needed.

### Local PostgreSQL (no Docker/admin needed)

Download the portable PostgreSQL + pgvector bundle (57 MB, user-space — no
admin rights or services required):

```bash
# Download once
curl -L -o postgres.zip \
  https://github.com/YukeonWayne/pg_pgvector_binary/releases/download/v18.4-pgvector0.8.3-win32-x64/postgres-18.4-pgvector-0.8.3-win32-x64.zip
```

Extract it anywhere (e.g. `C:\Mault Revised\.local\postgres`), then initialize
and start:

```bash
PGBIN="<extracted>/win32-x64/bin"
"$PGBIN/initdb" -D "<extracted>/data" -U postgres -A trust -E UTF8 --locale=C
# Start detached (Windows):
powershell -NoProfile -Command "Start-Process -FilePath '<extracted>\win32-x64\bin\postgres.exe' -ArgumentList '\"-D\" \"<extracted>\data\" \"-p\" \"5433\" \"-c\" \"listen_addresses=127.0.0.1\"' -WindowStyle Hidden"
```

Create the database and apply the local bootstrap (creates the pgvector
extension, `authenticated` RLS role, and the `auth_is_org_member()` function
that the schema's RLS policies reference). Run it BEFORE `db:migrate` (the
function must exist first) and again AFTER (to grant the `authenticated` role
access to the newly created tables):

```bash
"$PGBIN/psql" -h 127.0.0.1 -p 5433 -U postgres -c "CREATE DATABASE mault;"
"$PGBIN/psql" -h 127.0.0.1 -p 5433 -U postgres -d mault -f packages/server/sql/local-neon-bootstrap.sql
pnpm --filter @magic-vault/server db:migrate
"$PGBIN/psql" -h 127.0.0.1 -p 5433 -U postgres -d mault -f packages/server/sql/local-neon-bootstrap.sql
```

Then point `.env` at it (see `.env.example`):

```
DATABASE_URL=postgres://postgres@127.0.0.1:5433/mault
VECTORIZE_DEVICE=dml
```

A helper script manages the server day-to-day (start/stop/status), and can
register a no-admin logon auto-start so it comes up with your session:

```bash
node scripts/local-db.mjs start       # start (detached, survives terminal close)
node scripts/local-db.mjs stop        # graceful shutdown
node scripts/local-db.mjs status      # is it up?
node scripts/local-db.mjs install     # add to Windows Startup (runs at logon)
node scripts/local-db.mjs uninstall   # remove from Startup
```

### Migrations

```bash
pnpm --filter @magic-vault/server db:generate  # generate a migration from schema changes
pnpm --filter @magic-vault/server db:migrate   # apply migrations
pnpm --filter @magic-vault/server db:push      # push schema directly (dev)
pnpm --filter @magic-vault/server db:studio    # open Drizzle Studio
```

The migration history was regenerated as a single baseline (`drizzle/0000_*`)
from the current schema — it models all 13 tables with org-scoped RLS, the
`(game_key, scryfall_id)` card uniqueness, calibration defaults aligned with
the shared constants, and the query-path indexes.

### Auth & RLS note

This is a **fully-local, single-user build with no logins**. Every request is
treated as the same local operator (`local-user` in the `local-org` org — see
`packages/server/src/middleware/auth.ts`), so the app opens straight into the
scanner with no sign-in, tokens, or org switching. The `X-Org-Id` header is
sent automatically by the web client and the server scopes all queries by it.

The schema enables row-level security on every table with `crudPolicy`
policies scoped by `auth_is_org_member()`. The app's own connection pool
connects as the table owner (which bypasses RLS), so org isolation is enforced
at the route layer (`requireOrg` + org-scoped queries). The policies remain as
defense-in-depth and are fully enforceable by the `authenticated` role — the
local bootstrap grants it table privileges so you can exercise them locally.

### What still needs the internet

- **Card data sync** (Scryfall / Yu-Gi-Oh! / Digimon / Gundam / Pokémon) —
  downloading card data in the Admin page. This is how the card database gets
  built.
- **Card art** — the image proxy fetches card images from external hosts.
- **Discord webhooks** — optional notifications, only if you configure a URL.
- **One-time SigLIP model download** — the vision model downloads once from
  HuggingFace into a local cache, then all scanning runs fully on-device.

Everything else — scanning, sorting, calibration, the database, auth (none), and
vision — runs entirely on the local machine.

The vision model (SigLIP) also runs locally via `@huggingface/transformers`;
it downloads once from HuggingFace into a cache on first use, then all
embeddings are computed on-device.

## Deployment

`Dockerfile.server` builds the Hono API (and pre-downloads the SigLIP model at build time). `Dockerfile.web` builds the Vite SPA and serves it with nginx (`nginx.conf`); `VITE_API_URL` must be supplied as a build arg since it's baked into the client bundle.

## Hardware

The full bill of materials, wiring diagrams, and assembly instructions live in the app at `/build`. In short:

- Arduino Uno R4 Minima, driving a PCA9685 servo controller over I2C
- 9 positional SG90 servos (3 per module: trapdoor, paddle gate, pusher) plus 1 continuous-rotation SG90 for the feeder
- IR sensor for card-feed detection
- Enclosure and module parts are in `3d model/` (Fusion 360 source + printable `.3mf`)

Upload `arduino/main/main.ino` (requires the ArduinoJson library). It communicates via JSON over USB serial: the web app sends `{"bin": N}` and the Arduino runs the routing sequence.

## Webcam

Primary: **EMEET C60E 4K** (higher resolution gives the holo-detection and
embeddings more detail to work with). Recommended camera settings:

- Autofocus: Off (fixed focus on the scan plane)
- Resolution: 1080p or 4K, whichever the scan-region calibration covers
- Brightness / contrast / saturation: moderate, consistent lighting

The old documented setup (Logitech C920) used these settings:

Auto Focus: Off
Focus: 50%
Auto Exposure: On
Low Light Compensation: On
Auto White Balance: On
Brightness: 140
Contrast: 140
Saturation: 160
Sharpness: 130

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
