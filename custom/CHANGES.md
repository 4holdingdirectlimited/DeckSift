# Changes from upstream (dishwasher-detergent/mault)

Every entry documents a deliberate change we made for our build: what it is,
why, exactly which code changed, and how to revert it. Entries are cumulative —
later ones may build on earlier ones, so revert in **reverse order** if you need
to roll back multiple items.

**Deployment note:** some changes are a matched pair of firmware + web app edits
and must be updated together — each entry says so explicitly.

---

## Item 1 — Command id / ACK correlation (firmware + web app)

**Status:** implemented, uncommitted.

### Why

The web app's serial layer matched responses by *line order*: after sending
`{"bin":N}` it took the very next line from the Arduino as the response. That
only works because the firmware is fully synchronous today (one command at a
time, `loop()` blocked during routing). It breaks the moment the firmware emits
asynchronous messages — a module-1 jam alert, or a `{"status":"ready"}` after a
brownout reset — which get misread as the reply to the current command. It also
would have broken under the planned non-blocking state machine (custom/PLAN.md),
which will emit async status events mid-route.

### What changed

**Firmware — `arduino/main/main.ino`**
- Commands may now carry an optional numeric `"id"` field; it is extracted at
  the top of `handleCommand()` into `g_cmdId` / `g_hasCmdId`.
- Two new reply helpers, `replyJson(JsonDocument&)` and `replyLiteral(const char*)`,
  echo the id on every response. All command response sites now go through one
  of the two helpers.
- Messages that are not replies to a command — the boot `{"status":"ready"}`
  line and the async `{"error":"jam",...}` alert in `checkModule1Jam()` — stay
  id-less on purpose.

**Web app — `packages/web/src/features/scanner/api/use-serial.tsx`**
- New `waitForId(id, timeout)`: a waiter that only resolves on a parsed message
  whose `id` matches; every other line is ignored (and still dispatched to
  message listeners).
- `sendBin()` now sends `{"bin":N,"id":K}` and awaits `waitForId(K, 15000)`.
- `sendTest()` now sends `{"test":true,"id":K}` and awaits `waitForId(K, 10000)`.
- Line dispatch in `startReading()` now fans out to every waiter whose predicate
  matches, instead of a single FIFO consumer.
- `receiveResponse()` is untouched — it keeps the legacy "next line" semantics
  that the calibration tooling (`use-calibration-page.ts`, `use-module-configs.tsx`,
  `use-feeder-config.tsx`) relies on. A follow-up can migrate those to ids.

**Docs**
- `arduino/main/SERIAL_PROTOCOL.md` — new "Command ids" section.

### Behavior notes / pairing requirement

- **New firmware + new app:** correlated responses — correct behavior.
- **Old firmware + new app:** `sendBin`/`sendTest` will time out because old
  firmware doesn't echo ids. **Flash the firmware and run the new app together.**
- **New firmware + old app:** backward compatible — ids are only echoed when a
  command carries one, and the old app ignores the extra field.

### How to revert

If this change is **not yet committed** (current state):

```bash
git restore arduino/main/main.ino
git restore packages/web/src/features/scanner/api/use-serial.tsx
```

If it **has been committed** as its own commit (recommended when you commit):

```bash
git revert <commit-hash>
```

Then re-upload `arduino/main/main.ino` to the Arduino (Arduino IDE → Upload) and
redeploy/restart the web app to undo the behavior.

---

## Item 2 — Repo tooling: typecheck, firmware compile, CI checks

**Status:** implemented, uncommitted.

### Why

We need a way to validate changes to both halves of the project: typecheck the
web app and compile-check the firmware — locally and automatically in CI.

### What changed

**Scripts / config**
- `packages/web/package.json` — added `"typecheck": "tsc -b"`.
- `package.json` (root) — added `"typecheck": "turbo typecheck"`.
- `turbo.json` — added the `typecheck` task.
- `scripts/arduino-compile.sh` — compiles `arduino/main` for the Uno R4 Minima
  with arduino-cli (installs the `arduino:renesas_uno` core plus ArduinoJson and
  the Adafruit PWM Servo Driver library on first run).
- `.github/workflows/checks.yml` — CI job running `pnpm typecheck` + `pnpm lint`
  (web) and `arduino-cli compile` (firmware) on pushes to master/custom and on
  pull requests. Requires Actions enabled on the fork (same setting as the
  sync-upstream workflow).

**Local tooling (this machine, per-user, no admin)**
- Node.js 22.23.2 + npm (portable zip) at `C:\Users\nsiro\.local\node`
- pnpm 9.1.3 via corepack (matches the repo's `packageManager` pin)
- arduino-cli 1.5.2 at `C:\Users\nsiro\.local\arduino-cli`
- Both `~/.local/node` and `~/.local/arduino-cli` added to the user PATH

### How to revert

Uncommitted:

```bash
git restore package.json
git restore packages/web/package.json

git restore turbo.json

git restore scripts/arduino-compile.sh

git restore .github/workflows/checks.yml
```

For the local tool installs: delete `C:\Users\nsiro\.local\node` and
`C:\Users\nsiro\.local\arduino-cli`, and remove the two entries from the user
PATH (Settings → Environment Variables, or `setx`).

---

## Item 3 — Single image encode + server-hydrated card search

**Status:** implemented, uncommitted.

### Why

Two per-scan inefficiencies: (1) the same card frame was JPEG-encoded twice
(once for the debug image via `toDataURL`, once for the upload via
`canvasToBlob`); (2) after the image search returned distance-only matches,
the client fired one **external** card-API request per close match
(`getCardById` → Scryfall/Gundam/Pokemon) to resolve card details.

### What changed

**`packages/shared`**
- `SearchCardMatch` gained an optional `card` field (`PlayingCard | null`).
- `CLOSE_MATCH_DELTA` (0.05) moved to shared constants so the server and
  client filter on the same value.

**Server**
- `lib/card-cache.ts` (new) — `resolveCardDetails()`: fetches card details
  via the game adapter with an in-memory 1-hour/500-entry cache, so scanning
  a playset fetches each card from the external API once instead of once per
  scan.
- `routes/card.ts` (POST `/api/cards`) — resolves the game adapter once,
  hydrates the close matches with full card data, and returns them in the
  single search response. `lib/card-search/resolve.ts` now also returns
  `gameKey` from `resolveCardSearch`.

**Web app**
- `use-card-scanner.ts` — `searchCardImage()` encodes once (`canvasToBlob`)
  and derives the debug data URL from the same blob via a new `blobToDataUrl`
  helper; it now reads hydrated `card` data straight from the search response
  instead of looping `getCardById`. The old client-side `CLOSE_MATCH_DELTA`
  constant was removed (server filters now).

### Behavior notes

- Response contract for POST `/api/cards` is unchanged in shape (`data` is
  still `SearchCardMatch[] | null`); close matches now carry `card`.
- If an external hydration fails, the match is returned with `card: null` and
  the client skips it (same net effect as the old per-match fetch failing).
- No DB schema change; no migration needed.

### How to revert

Uncommitted:

```bash
git restore packages/shared/src/interfaces/api.interface.ts

git restore packages/shared/src/constants/scryfall.constant.ts

git restore packages/server/src/lib/card-cache.ts

git restore packages/server/src/lib/card-search/resolve.ts

git restore packages/server/src/routes/card.ts

git restore packages/web/src/features/scanner/api/use-card-scanner.ts
```

---

## Item 4 — EEPROM calibration persistence + protocol version handshake

**Status:** implemented, uncommitted.

### Why

Calibration lived only in firmware RAM, so the app re-pushed it on every
connect — and a mid-session reboot (power blip) silently reverted the machine
to stock pulses, misrouting cards until the operator noticed. There was also
no way for the app to detect that it was talking to incompatible firmware.

### What changed

**Firmware — `arduino/main/main.ino`**
- `EEPROM` persistence: a versioned `PersistedCalibration` block (magic +
  version guard) is loaded in `setup()` before any servo moves and saved on
  every `setConfig`/`setFeederConfig`.
- New commands: `{"saveConfig": true}` and `{"resetConfig": true}`.
- Boot message now reports the protocol version:
  `{"status":"ready","proto":2}`.

**Web app**
- `features/scanner/constants.ts` — `EXPECTED_PROTO_VERSION = 2`.
- `use-serial.tsx` — the connect flow parses the boot message and shows a
  warning toast when the firmware's `proto` doesn't match the app's.

**Docs**
- `arduino/main/SERIAL_PROTOCOL.md` — boot message, `saveConfig`/
  `resetConfig` commands, EEPROM persistence notes.

### Behavior notes

- Stale stored config (older layout, changed hardware) is detected by the
  magic/version guard and ignored — factory defaults are used instead.
- EEPROM writes happen on connect (config push) and calibration saves, not on
  individual servo tweaks — flash endurance is a non-issue.

### How to revert

Uncommitted:

```bash
git restore arduino/main/main.ino

git restore packages/web/src/features/scanner/constants.ts

git restore packages/web/src/features/scanner/api/use-serial.tsx
```

Re-upload the firmware and restart the app. Note: firmware and app are a
matched pair — the `proto` handshake only exists on the new firmware.

---

## Item 5 — Full command-id correlation + single feed path

**Status:** implemented, uncommitted.

### Why

Item 1 only correlated `sendBin`/`sendTest`. The feeder, auto-feed, and
calibration commands still used legacy "next line wins" matching — the exact
race we fixed for bin commands — and the feed logic was duplicated in two
places (`card-scanner.tsx` and `use-scanned-cards.tsx`) with already-drifted
error handling. This mattered more once the jam system started emitting async
messages from all three modules (Item 6).

### What changed

**`use-serial.tsx`**
- New `sendCommandWithResponse(data, timeout)` — attaches a command id, sends,
  and waits for the id-matched reply (same mechanism as `sendBin`).
- New `sendFeed()` — id-correlated `{"feeder":true}` with a 10 s timeout.

**Callers migrated to id-correlated responses**
- `use-scanned-cards.tsx` `triggerAutoFeed` → `sendFeed()` (consolidated).
- `card-scanner.tsx` `handleFeed` → `sendFeed()`; `handleClearDevice` →
  `sendCommandWithResponse`.
- `use-module-configs.tsx` + `use-feeder-config.tsx` pre-test config pushes and
  save handlers → `sendCommandWithResponse`.
- `use-calibration-page.ts` `readIR` → `sendCommandWithResponse` (no more
  manual `JSON.parse`).
- `receiveResponse` is no longer used by any of the migrated paths (kept in the
  API for compat).

### How to revert

```bash
git restore packages/web/src/features/scanner/api/use-serial.tsx

git restore packages/web/src/features/scanner/api/use-scanned-cards.tsx

git restore packages/web/src/features/scanner/components/card-scanner.tsx

git restore packages/web/src/features/calibration/api/use-module-configs.tsx

git restore packages/web/src/features/calibration/api/use-feeder-config.tsx

git restore packages/web/src/features/calibration/api/use-calibration-page.ts

git restore packages/web/src/features/scanner/types.ts
```

---

## Item 6 — Jam detection on all modules + boot recovery report

**Status:** implemented, uncommitted.

### Why

The jam watch only covered module 1 and only while idle — a card stuck at
module 2 or 3 was silent, and a power-loss reboot left cards sitting in the
mechanism with nobody told.

### What changed

**Firmware — `arduino/main/main.ino`**
- `checkModule1Jam()` → `checkModuleJams()`: per-module timers watch all three
  module IR sensors while idle; each reports `{"error":"jam","module":N}`
  once after `JAM_TIMEOUT_MS` (renamed from `MODULE1_JAM_TIMEOUT_MS`, still
  20 s).
- On boot, any module IR already blocked emits `{"error":"recovered",
  "module":N}` after `ready` so the operator knows to clear the device.

**Web app — `card-scanner.tsx`**
- `useSerialMessage` now surfaces `recovered` messages as a warning toast with
  a clear-device hint. Jam messages from modules 2/3 already paused the scanner
  via the generic path.

### How to revert

```bash
git restore arduino/main/main.ino

git restore packages/web/src/features/scanner/components/card-scanner.tsx
```

Re-upload the firmware.

---

## Item 7 — Per-bin capacity (software bin-full detection)

**Status:** implemented, uncommitted. **Requires a DB change — see below.**

### Why

No bin-full sensors exist, so the machine would happily feed into a full bin.
A software count per bin pauses routing when a bin reaches its configured max.

### What changed

- **DB:** `bins.max_capacity` integer, default 0 (= unlimited) — added to
  `packages/server/src/db/schema.ts`.
- **Shared:** `BinConfig.maxCapacity` + `DefaultBinInit.maxCapacity`.
- **Server `bins.ts`:** `maxCapacity` carried through create, copy, update, and
  read paths.
- **Web:** capacity input in the bin config panel; `use-scanned-cards.tsx`
  counts cards per bin per session (`binCountsRef`), refuses to route into a
  bin at capacity, pauses auto-feed, and shows a "Bin N is full — empty it and
  re-enable auto-feed" toast. Counts reset when auto-feed is re-enabled, the
  collection changes, or the card list is cleared. The catch-all bin is
  subject to the same check.

### Applying the DB change

This repo's migration history is **out of sync with `schema.ts`** (upstream
predates it: the last snapshot still models the old `user_id` RLS schema, so
`drizzle-kit generate` produces a large wrong diff). This project therefore
runs on the `db:push` workflow — apply the column against the live database:

```bash
pnpm --filter @magic-vault/server db:push
```

or manually: `ALTER TABLE bins ADD COLUMN max_capacity integer NOT NULL DEFAULT 0;`

Until this is applied, the API will error on bin queries/updates referencing
`max_capacity`.

### How to revert

```bash
git restore packages/server/src/db/schema.ts

git restore packages/server/src/routes/bins.ts

git restore packages/shared/src/interfaces/sort-bins.interface.ts

git restore packages/shared/src/constants/sort-bins.constant.ts

git restore packages/web/src/features/bins/api/sort-bins.ts

git restore packages/web/src/features/bins/api/use-bin-configs.tsx

git restore packages/web/src/features/bins/types.ts

git restore packages/web/src/schemas/sort-bins.schema.ts

git restore packages/web/src/features/bins/components/bin-config-panel.tsx

git restore packages/web/src/features/scanner/api/use-scanned-cards.tsx
```

(`max_capacity` in the DB can stay or be dropped — harmless if left.)

---

## Item 8 — Captured-image dedupe + prune script

**Status:** implemented, uncommitted.

### Why

Every scanned card stored a full base64 JPEG in
`collection_cards.captured_image_data_url` (~200–500 KB each), even for
repeated cards in a session — DB bloat you feel in backups and queries.

### What changed

- **App (`use-scanned-cards.tsx`):** the first capture of each unique card id
  in a session is remembered and reused for duplicates (per-card image dedupe
  instead of a fresh JPEG per copy). Reset on collection change / clear.
- **Server:** new maintenance script `packages/server/src/lib/prune-images.ts`
  + `pnpm --filter @magic-vault/server db:prune-images` — nulls
  `captured_image_data_url` for scans older than 30 days.

### How to revert

```bash
git restore packages/web/src/features/scanner/api/use-scanned-cards.tsx

git restore packages/server/src/lib/prune-images.ts

git restore packages/server/package.json
```

---

## Item 9 — Diagnosis fixes

**Status:** implemented, uncommitted.

### What changed

- **`use-serial.tsx` / `scanner/types.ts`:** removed the dead `receiveResponse`
  public API (zero consumers remain after Item 5 migrated everything to
  id-correlated responses).
- **Firmware (`main.ino`):** replaced the persistent `String inputBuffer` with
  a fixed `char` buffer (`handleCommand` now takes `const char*`) — removes
  the heap-fragmentation risk on all-day sessions.
- Root `eslint .` across all packages: clean.

### How to revert

```bash
git restore packages/web/src/features/scanner/api/use-serial.tsx

git restore packages/web/src/features/scanner/types.ts

git restore arduino/main/main.ino
```

---

## Item 10 — Stage-1 watchdog / interruptible timing

**Status:** implemented, uncommitted.

### Why

The firmware only ran its jam watch *between* commands, because `delay()`
blocked `loop()` — a jam during an operation wasn't seen until the operation
finished, and a stuck sequence ran unbounded. The app also had no way to tell
if the board was hung short of a 15 s bin timeout.

### What changed

**Firmware — `arduino/main/main.ino`**
- `interruptibleDelay(ms)` — replaces `delay()` inside command handlers: polls
  the jam sensors and the command watchdog while waiting, returns `false` when
the command should abort.
- `jamAbortRequested` — set when a new jam alert fires; cleared at the start
  of every command; checked by `waitForCard`, `runFeeder`, and
  `interruptibleDelay`.
- `commandGuardStart(budgetMs)` / `commandDeadline` — per-command watchdog
  budgets: routeCard 15 s, test 10 s, clearDevice 5 s.
- `runFeeder`/`settleAndStopFeeder` are abort-aware (`FEED_ABORTED` result);
  `waitForCard` services the jam watch while polling.
- `abortCommand(reason)` — stops the feeder, returns everything to neutral,
  and replies `{"error":"aborted: jam detected","aborted":true}` (with the
  command id).
- New `{"ping": true}` → `{"status":"pong"}` liveness command.

**Web app — `use-serial.tsx`**
- Heartbeat: pings the firmware every 10 s (5 s timeout) while connected and
  ready; a missed pong shows a "Device unresponsive" warning toast once per
  unresponsive stretch and clears on recovery.

### Behavior notes

- No false positives in normal routing: gate presence is transient during a
  ~2 s route, far below the 20 s jam threshold.
- Needs a bench test: timing behavior is unchanged (same delay values), only
  now interruptible.

### How to revert

```bash
git restore arduino/main/main.ino

git restore packages/web/src/features/scanner/api/use-serial.tsx
```

Re-upload the firmware.

---

## Item 11 — Local PostgreSQL hosting + regenerated migration baseline (database)

**Status:** implemented, uncommitted.

### Why

The checked-in drizzle migrations (0000–0010) predated the org-scoping rewrite:
they created only 6 tables with a legacy Supabase-style `user_id`/`auth.user_id()`
model, while `schema.ts` models 13 org-scoped tables. A fresh `db:migrate`
produced a broken database (missing `games`, `collections`, `collection_cards`,
`feeder_configs`, audit tables, `org_id`/`game_key`/`max_capacity` columns), and
the app could only run against hosted Neon because the Neon serverless driver
speaks Neon's WebSocket proxy protocol. We wanted the whole stack to run on a
local machine with no admin rights or Docker.

### What changed

- **Migration baseline regenerated.** Deleted the stale 0000–0010 SQL + meta
  snapshots (backed up) and regenerated a single `drizzle/0000_public_pandemic.sql`
  from `schema.ts`: all 13 tables, 52 org-scoped RLS policies, the per-game
  `(game_key, scryfall_id)` card uniqueness (was global on `scryfall_id`, which
  silently swallowed per-game sync conflicts), calibration defaults aligned with
  the shared constants, and the query-path indexes (`bins.bin_set`,
  `collection_cards.collection_id`/`scryfall_id`, `cards.game_key`, and an HNSW
  index on `cards.embedding`).
- **DB driver swapped.** `packages/server/src/db/index.ts` now uses the standard
  `pg` driver + `drizzle-orm/node-postgres` instead of `@neondatabase/serverless`
  (WebSocket-only; can't reach a local Postgres). Works against both local
  Postgres and Neon's TCP endpoint. Removed the `@neondatabase/serverless` /
  `ws` deps from `packages/server/package.json`; added `pg` / `@types/pg`.
- **Local bootstrap.** New `packages/server/sql/local-neon-bootstrap.sql`
  recreates what hosted Neon provisions automatically — `neon_auth.user` /
  `organization` / `member` tables, the `authenticated` role, table privileges
  for it, and the SECURITY DEFINER `auth_is_org_member()` function the RLS
  policies reference — plus a seeded local user/org.
- **Schema fixes while regenerating:** `module_configs` / `feeder_configs` DB
  defaults now match `DEFAULT_CALIBRATION` / `DEFAULT_FEEDER_CALIBRATION` in
  `@magic-vault/shared` (previously 102/307/… and 400/50/150 — a raw insert
  without a payload drove the servos to the wrong positions).
- **README** documents the portable PostgreSQL + pgvector install, the
  bootstrap, and `.env` values.

### Behavior notes

- Running the server locally without hosted Neon Auth means `NEON_AUTH_URL` is
  a placeholder; JWT verification (and therefore login) still needs the real
  Neon Auth URL. DB-backed API routes and RLS are fully testable locally.
- RLS is enforced by the `authenticated` role (verified locally: cross-org
  rows invisible, cross-org inserts rejected). The app's own pool connects as
  the table owner and bypasses RLS by design — org isolation is enforced at the
  route layer (`requireOrg` + org-scoped queries), with RLS as defense-in-depth.

### How to revert

1. Restore the deleted migrations from `C:\Mault Revised\.local\drizzle-backup`
   (or from git history before this commit).
2. Revert `packages/server/src/db/index.ts` to the
   `@neondatabase/serverless` driver and restore the old deps in
   `packages/server/package.json` (`pnpm install`).
3. Delete `packages/server/sql/` and the README Database section.
4. Re-run `db:generate` to rebuild a migration diff if the schema changes
   again; keep the new baseline otherwise.

---

## Item 12 — Remove Neon entirely: self-hosted better-auth (auth + web)

**Status:** implemented, uncommitted.

### Why

Neon Auth is a hosted wrapper around `better-auth`, but it still forced every
login through the internet (JWKS verification, hosted auth UI) and kept the
project depending on a third-party service. The vision side was already local
(SigLIP via `@huggingface/transformers`); this removes the last online
dependency — auth — by self-hosting the identical better-auth library against
the local Postgres.

### What changed

- **Server — new auth instance.** `packages/server/src/lib/auth.ts` builds a
  better-auth instance with email/password, the `organization` plugin, the
  `emailOTP` plugin (OTP codes are logged to the server console — no email
  provider, fully local), and the `bearer` plugin. Mounted at `/api/auth/*` in
  `packages/server/src/index.ts`.
- **Server — token verification.** `packages/server/src/middleware/auth.ts` no
  longer fetches a JWKS from Neon; it validates `Authorization: Bearer` tokens
  via `auth.api.getSession` against the local `session` table. `getUserRole` /
  `getUserDisplayName` / `requireOrg` now read the better-auth `user` and
  `member` tables instead of `neon_auth.*`.
- **DB — auth tables.** Added `user` (with a `role` column), `session`,
  `account`, `verification`, `organization`, `member`, and `invitation` tables
  to `packages/server/src/db/schema.ts`; regenerated the migration baseline
  (now 20 tables). RLS `auth_is_org_member()` reads the better-auth `member`
  table; the bootstrap runs before AND after `db:migrate` (function/role first,
  grants after) and sets default privileges for future tables.
- **Web — client swap.** `packages/web/src/lib/auth/client.ts` now uses
  `createAuthClient` from `better-auth/react` with the organization + email-OTP
  plugins (Neon's own adapter was a better-auth adapter). Replaced the Neon
  `SignedIn`/`RedirectToSignIn`/`AuthView`/`AccountView`/`UserButton`/
  `NeonAuthUIProvider` with local equivalents (custom sign-in/sign-up/forgot
  password page, account page, sign-out buttons, session-based guards). All
  org hooks (`useListOrganizations`, `useActiveOrganization`, `organization.*`)
  map 1:1. Removed the `@neondatabase/neon-js` dependency and the Neon tailwind
  import. Pinned `better-auth` to the same version (1.4.6) in web and server.
- **Env/docs.** `.env` / `.env.example` now use `BETTER_AUTH_SECRET` (no Neon
  vars); README updated.

### Behavior notes

- **Everything is local now**: DB, auth, and vision. Only card-data sync
  (Scryfall/Gundam/Pokémon), Discord webhooks, and the one-time HuggingFace
  model download need the internet.
- Email OTP codes print to the API server console (`[auth] OTP for …`). For a
  single-user sorter this is the practical offline delivery mechanism.
- Existing users/orgs are stored in the better-auth tables; first sign-up
  creates a `role: user` account (the admin panel gate reads this role).

### How to revert

1. `git checkout` the pre-Item-12 versions of `lib/auth/client.ts`,
   `lib/auth/session.ts`, `router.tsx`, `main.tsx`, the auth/account/nav pages,
   `use-organization.tsx`, the org components, `hooks/use-role.ts`, and
   `use-collection-locks.tsx`.
2. Restore `@neondatabase/neon-js` in `packages/web/package.json` and the
   Neon tailwind import in `src/index.css`.
3. Server: delete `packages/server/src/lib/auth.ts`, restore the JWKS
   verification in `middleware/auth.ts`, and the `neon_auth.*` queries in
   `routes/collections.ts`.
4. Drop the 7 auth tables from `schema.ts` and regenerate the migration.

---

## Item 13 — Remove auth entirely: fully-local single-user build (auth + web)

**Status:** implemented, uncommitted.

### Why

The app is intended to run locally (browser, Arduino, camera, and model all on
one PC) with no remote access. Logins, organizations, and email verification
were pure overhead — they required a sign-in ceremony and leftover cloud
plumbing for zero benefit. This removes the whole auth layer so the app opens
straight into the scanner.

### What changed

- **Server — no-op auth.** `packages/server/src/middleware/auth.ts` now always
  treats every request as the same local operator: `LOCAL_USER_ID`
  (`local-user`), `LOCAL_ORG_ID` (`local-org`), admin role, owner org role.
  `requireAuth`/`requireOrg`/`requireRole`/`requireOrgRole` just set those
  fixed values and pass through. `verifyToken` always succeeds.
- **Server — removed the auth endpoints.** Deleted
  `packages/server/src/lib/auth.ts` (better-auth instance) and its
  `/api/auth/*` mount in `index.ts`. The SSE routes (`/collections/stream`,
  `/collections/lock-events`, `/admin/sync/stream`) no longer require
  `?token=` — they use the fixed org.
- **Server — dropped the 7 auth tables** (`user`, `session`, `account`,
  `verification`, `organization`, `member`, `invitation`) from
  `packages/server/src/db/schema.ts` and regenerated the migration baseline
  (now 13 tables). `auth_is_org_member()` in the bootstrap now just checks the
  org_id claim (no membership table).
- **Web — removed the auth UI.** Deleted the sign-in/sign-up/forgot-password
  page, verify-email page, account page, email-verification banner, and the
  org switcher / picker / settings components. `useRole()` always returns
  admin; `useOrg()` returns the single local org; the nav has no sign-out or
  org menu. Router has no auth guard and no `/auth/*` routes; landing/build
  CTAs link straight to `/app`.
- **Web — no token in API calls.** `getAuthHeaders()` sends only the fixed
  `X-Org-Id: local-org`; the SSE clients and sync stream no longer build
  `?token=` URLs. Removed the `better-auth` dependency from both packages.

### Behavior notes

- Opening `http://localhost:5173` goes straight to the app — no login.
- The `org_id` scoping remains in the DB and queries (single org), so RLS and
  the existing code paths are untouched; the UI just never asks for an org.
- Card data sync, card art, and optional Discord webhooks still need the
  internet; scanning, vision, and everything else are fully local.

### How to revert

1. Restore `packages/server/src/middleware/auth.ts` from before this item, and
   re-add `packages/server/src/lib/auth.ts` + the `/api/auth/*` mount.
2. Restore the 7 auth tables in `schema.ts` and regenerate the migration.
3. Restore `better-auth` in both `package.json`s (`pnpm install`).
4. Web: restore `lib/auth/client.ts` (authClient) and `lib/auth/session.ts`;
   re-add the auth/account/verify-email/org pages and the router guards.

---

## Item 14 — Local-first card art and sync catalog cache (web + database)

**Status:** implemented, committed with the local build.

### Why

The app should work offline once data is in place. Two remaining online paths
were needless: the card grid always fetched art from Scryfall/Gundam/Pokémon
hosts even though every scanned card already has a webcam capture, and every
sync re-downloaded Scryfall's multi-hundred-MB bulk catalog even when nothing
had changed upstream.

### What changed

- **Web — scanned card art is local-first.** `ScannedCardItem` takes an optional
  `capturedImageUrl` (the webcam capture, already stored in
  `collection_cards.captured_image_data_url`) and renders it instead of the
  online art when present, falling back to `getCardImageUris()` only when a
  scan is missing. The grid passes the capture through; the detail panel shows
  the capture as the main art for the scanned card (online art still shown for
  corrected/alternative candidates).
- **Server — sync catalog cache.** `packages/server/src/lib/sync-cache.ts`
  stores the downloaded Scryfall bulk catalog (`packages/server/.cache/sync`)
  keyed by the catalog's `updated_at`. On re-sync the server first fetches the
  tiny bulk-data index, and when the version is unchanged it loads the catalog
  from disk instead of re-downloading the ~GB file. New cards are still
  detected because the sync always compares against the cached catalog; only
  cards without an embedding are vectorized.
- **Server — art proxy disk cache.** `/api/cards/image-proxy` now stores every
  fetched image in `packages/server/.cache/art` (keyed by SHA-256 of the URL)
  and serves previously-viewed art from disk with no network call. Cache
  locations are overridable via `SYNC_CACHE_DIR` / `ART_CACHE_DIR` (see
  `.env.example`).

### Behavior notes

- First sync still downloads the full catalog once; subsequent syncs skip the
  download until Scryfall publishes a new version (roughly daily).
- Card art for cards that have been viewed before works offline; brand-new
  art still needs one fetch to populate the cache.
- The webcam capture is what the vision model matched on, so the grid now
  shows the physical card as scanned — glare/angle and all.

### How to revert

1. Web: remove the `capturedImageUrl` prop plumbing in `ScannedCardItem`/
   `card-grid.tsx`/`card-detail-panel.tsx` and restore the `getCardImageUris`
   art.
2. Server: delete the cache checks in `lib/scryfall/sync.ts` and
   `routes/card.ts`, and remove `lib/sync-cache.ts`.
3. Optionally delete `packages/server/.cache/` to drop stored catalogs/art.

---

## Item 15 — Local card hydration + SigLIP benchmark (server)

**Status:** implemented, uncommitted.

### Why

Scanning re-fetched full card details from the remote card API on every
first encounter of a card (1-hour in-memory cache only). That put 0.5–1.5 s of
variable network latency in the scan path and made scanning depend on the
internet. The card data is already in the bulk sync — it was being thrown away.

### What changed

- **DB — `cards.card_data`.** New `card_data jsonb` column (migration
  `drizzle/0001_pale_jack_murdock.sql`). Stores the complete card object.
- **Sync — populate card data.** `SyncSourceCard` gained `cardData`; the
  Scryfall sync now keeps the full card object from `unique_artwork` instead of
  discarding it. `sync-job.ts` stores it on insert and backfills rows that
  predate the column (batched, next sync run). Gundam/Pokémon bulk lists don't
  carry full card objects, so those games populate on first scan instead.
- **Hydration — DB first, network last.** `resolveCardDetails` now takes
  `gameKey` and serves from the in-memory cache → local DB → remote adapter.
  A remote fetch is persisted back into `cards.card_data` (update-only, never
  inserts junk rows), so each card is fetched from the network at most once
  ever. Verified end-to-end with a smoke test (fetch → persist → local hit).
- **Benchmark — `pnpm bench:vectorize`.** `packages/server/scripts/bench-
  vectorize.ts` times the real scan-path embed (JPEG decode + preprocess +
  model) and reports min/p50/mean/p95 + cards/sec.

### Benchmark results (this machine, SigLIP base 512 q8, CPU)

- Full scan-path embed: **~703 ms** (p95 714 ms)
- Model forward only: **~648 ms** (decode/preprocess is only ~55 ms)
- Throughput ceiling ≈ **1.4 cards/sec** of pure compute

With the search overlapping the physical sort, the 2 s/card target is roughly
achievable on shallow bins (1–4); deep bins (5–6) and any search slower than
the sort push it over. Margin requires a smaller model (e.g. 224 px — cheaper
but needs a re-sync) or faster hardware.

### Behavior notes

- After the next MTG sync, card details are served entirely from Postgres —
  no network in the scan path for synced cards.
- New cards printed after a sync still hydrate once from the API, then stay
  local.
- The `cards` table is currently empty on this machine — **no sync has been
  run yet**. The first sync (admin UI) is required before scanning can match
  anything; it downloads the catalog once and embeds ~25k MTG cards (hours,
  one time).

### How to revert

1. Drop `card_data` from `schema.ts` and generate a migration; or delete
   migration `0001_pale_jack_murdock.sql` and `ALTER TABLE cards DROP COLUMN
   card_data`.
2. Restore `card-cache.ts` to the remote-only version and the old
   `resolveCardDetails` signature in `routes/card.ts`.
3. Remove the `cardData` plumbing from `sync-types.ts`, `scryfall/sync.ts`,
   and `sync-job.ts`.

## Item 16 — GPU (DirectML) acceleration for vision embeddings (server)

**Status:** implemented, uncommitted.

### Why

SigLIP embeddings (the per-scan compute) took ~703 ms on CPU. The machine
has a Quadro M4000; onnxruntime-node already bundles DirectML.dll on Windows,
so the GPU path needed no installs — just a device switch.

### What changed

- **`VECTORIZE_DEVICE` env var** (`cpu` default, `dml` for GPU).
  `lib/vectorize.ts` picks the device + dtype and logs both at load.
- **q8 + DirectML crashes natively** (access violation, confirmed) — so dtype
  is forced to fp32 whenever DML is selected; the q8 model stays the CPU path.
- `.env` on this machine sets `VECTORIZE_DEVICE=dml`; `.env.example` documents
  both options.

### Benchmarks (this machine)

| Path | Device | Embed time | Throughput ceiling |
|---|---|---|---|
| q8 | CPU | ~703 ms | 1.42 cards/sec |
| fp32 | DirectML (M4000) | ~375 ms | 2.67 cards/sec |

≈**1.9× faster**. With the search now ~380 ms (+300 ms settle + encode), it
overlaps shallow-bin sorts with comfortable margin, putting the 2 s/card
target under budget instead of right at it. The bulk sync also embeds ~1.9×
faster (hours saved on the one-time MTG run).

### Behavior notes

- First model load on dml downloads the fp32 weights once (374 MB, cached in
  the transformers.js cache dir); later loads are ~1 s.
- First embed after a server start includes one-time session init (~1.1 s),
  then steady state. On a cold machine with uncached weights, first boot
  takes a few minutes.

### How to revert

1. Remove `VECTORIZE_DEVICE` from `.env` / `.env.example`.
2. Revert `lib/vectorize.ts` to the q8-only load.

## Item 17 — Holo/foil detection v1 (heuristic, web)

**Status:** implemented, uncommitted.

### Why

Holo vs non-holo was a purely manual toggle. Long-term this feeds card
identity for DBZ/One Piece (foil is a different product there), and even for
MTG it saves the operator a correction per foil card.

### What changed

- **`packages/web/src/features/scanner/lib/foil-detect.ts`** — heuristic that
  scores the warped scan crop (the same canvas that gets uploaded, so no
  extra decode or round trip). Features: circular hue variance (rainbow),
  saturation variance (iridescence), value variance + bright coverage
  (specular highlights), and edge energy (sparkle). Returns a 0..1 score;
  `FOIL_SCORE_THRESHOLD = 0.5` is a calibration starting point.
- **Wired through the scan path**: `searchCardImage` computes the score on
  the crop, `onSearchResults` carries `isFoil`, and `addCard` pre-fills the
  card's `isFoil` flag. The detail-panel toggle still lets the operator
  correct it — corrections persist to `collection_cards.is_foil` alongside
  `captured_image_data_url`, which **automatically collects labeled training
  data** for the v2 classifier.
- Pixel core is exported for testing; synthetic smoke test: matte 0.001 vs
  rainbow 0.379.

### Behavior notes

- Heuristic thresholds MUST be calibrated against real captures once the rig
  is built (`custom/PLAN.md` commissioning checklist item 5). Until then it
  may over- or under-detect; corrections are expected and are exactly what
  trains v2.
- v2 = small classifier on the SigLIP embedding or crop, trained on the
  accumulated labeled scans. No extra model download at scan time.
- Hardware assist (angled second light, two captures) remains a future
  near-perfect option.

### How to revert

1. Delete `lib/foil-detect.ts`.
2. Remove the `isFoil` threading from `use-card-scanner.ts`,
   `card-scanner.tsx`, `use-scanned-cards.tsx`, and the `onSearchResults`/
   `addCard` signatures.

## Item 18 — Scan light + two-frame holo detection (firmware + web)

**Status:** implemented, uncommitted.

### Why

Single-frame holo heuristics are the weakest link in foil detection. The
physical signature is angle-dependent: a holo changes COLOR with the light
angle (diffraction grating), a matte card only gets brighter. A toggleable
angled light makes that discrimination nearly deterministic — and the
PCA9685 already had the wiring spots.

### What changed

- **Firmware — LED 5 on PCA9685 ch14.** `{"led": 5, "on": bool}` (range
  extended 4 → 5); header comment + SERIAL_PROTOCOL.md updated.
- **Web — two-frame scan with smart skip.** `foil-detect.ts` adds
  `computeFoilDifferenceScore` (hue/saturation shift fraction between frames)
  and `shouldUseSecondFrame` (frame A below `FOIL_SECOND_FRAME_THRESHOLD` =
  clearly matte → skip the light + second picture entirely). `searchCardImage`
  orchestrates: frame A (light off) → score → if ambiguous: toggle scan light
  (`toggleScanLight` prop, wired to `{"led":5}` via `useSerial`), 120 ms
  settle, frame B (light on) → chroma-difference decision → light off. The
  lit frame doubles as the upload/match image (better illumination).
- **Fallback:** no serial connection → single-frame heuristic (v1) as before.
- **Docs:** BUILD.md scan-light wiring (LED + resistor on ch14, angled mount),
  SERIAL_PROTOCOL.md LED 5.

### Behavior notes

- Most cards (matte) cost one picture + no light toggle. Only holo-looking
  frames trigger the second capture (~200 ms extra, hidden under the sort).
- Thresholds (`FOIL_SECOND_FRAME_THRESHOLD`, `FOIL_DIFF_THRESHOLD`) are
  calibration starting points for when the rig is built.

### How to revert

1. Firmware: revert the LED range to 4.
2. Web: remove `toggleScanLight` from `CardScannerProps`/`useCardScanner` and
   the two-frame branch in `searchCardImage`.

---

## Item 19 — Config-driven multi-TCG adapter: Yu-Gi-Oh! + Digimon (server)

**Status:** implemented, uncommitted.

### Why

Adding a TCG previously meant duplicating the whole search/sync/normalize
adapter (Pokémon pattern). With DBZ/One Piece and others coming, that doesn't
scale. Most TCG databases expose the same JSON shape; only the URLs and field
mapping differ.

### What changed

- **`lib/card-search/generic.ts`** — `createSearchAdapter(config)` +
  `createSyncSource(config)` factory. Config = search URL, optional by-id
  URL (else bulk-catalog filter), bulk URL, result-path extractor, and
  field-mapping functions. Ships `baseCard()`, `imageUris()`, `str()/num()`
  helpers and a complete PlayingCard shape so configs stay ~40 lines.
- **`lib/card-search/generic-configs.ts`** — `yugiohConfig` (YGOPRODeck) and
  `digimonConfig` (digimoncard.io). Both endpoints verified live:
  search, by-id, bulk, and image hosts.
- Registered in `resolve.ts` (search) + `sync-job.ts` (sync) as `yugioh` and
  `digimon`; image hosts added to the proxy allowlist in `routes/card.ts`.
- Sync stores the **normalized** card in `cards.card_data`, so hydration
  serves the correct PlayingCard shape for the new games.

### Behavior notes

- Add the game row in the web admin UI (Settings → Games) with key `yugioh` /
  `digimon`, then run its sync once (bulk embed; YGO ~13k cards, Digimon
  ~9k — one-time, hours on this machine, resumable).
- Top-20 TCG plan + per-game data-source status: `custom/TCGS.md`.

### How to revert

1. Remove the `yugioh`/`digimon` registrations from `resolve.ts`,
   `sync-job.ts`, and the allowlist in `routes/card.ts`.
2. Delete `generic-configs.ts` and `generic.ts`.

## Item 20 — Dataset importer for no-API TCGs (server)

**Status:** implemented, uncommitted.

### Why

Research (2026-08) found One Piece and Dragon Ball Super/Fusion World have
**no clean, hosted, public JSON API** — optcgdb's API gateway rejects direct
access, the official sites have no API, dbscards.com is a static site, and
fabdb.net is unreachable from this machine. Community sources distribute those
games' data as files, so a file importer completes the architecture.

### What changed

- **`packages/server/scripts/import-cardset.ts`** — ingests a JSON array of
  card objects: field-mapping file (dotted paths; `imageUrl` or
  `imageTemplate` with `{id}`), embeds art with the local SigLIP model, stores
  rows in `cards` (embedding + normalized `card_data`). Works offline after
  the one-time import. Verified end-to-end with a real YGOPRODeck export
  (2 cards embedded, rarity preserved, cleaned up after).

```bash
cd packages/server
npx tsx --env-file ../../.env scripts/import-cardset.ts \
  <gameKey> <cards.json> [--map mapping.json] [--limit N]
```

### Behavior notes

- Onboarding One Piece/DBZ = obtain a trusted dataset file, write the ~5-line
  mapping, run once. `custom/TCGS.md` has the updated source status matrix.

### How to revert

1. Delete `scripts/import-cardset.ts`.

## Item 21 — Value-based binning + local runbook (shared + server + docs)

**Status:** implemented, uncommitted.

### Why

Sorting by card value (e.g. "over $2 → reject bin") is a requested sort
axis. The binning engine already supported numeric rules; what was missing was
the foil-price field and price data for the generic-config games. Also: the
machine had never been set up (empty DB, web server not running), so the
one-time first-run flow needed documenting.

### What changed

- **`price_usd_foil` bin field** added to `FIELD_DEFINITIONS` (path
  `prices.usd_foil`) so foil-value sorting works alongside the existing
  `price_usd` field. Price rules (`gt`/`gte`/`lt`/`lte`/`equals`) already
  existed — a rule like `Price (USD) greater than 2` routes a card to
  whatever bin (including a dedicated reject bin) the operator configures.
- **Yu-Gi-Oh! prices wired**: YGOPRODeck `card_prices` → `prices.usd`
  (tcgplayer) and `prices.eur` (cardmarket) in `yugiohConfig`.
- **`scripts/start-web.cmd`** — detached launcher for the Vite dev server;
  the web UI is now running at http://localhost:5173.
- **`custom/SETUP.md`** — runbook: URLs, start/stop, first-run steps (games →
  collection → bins → sync), value-sort how-to, price-source table, known gaps.

### Behavior notes

- Price data availability: MTG ✅ (Scryfall bulk), Yu-Gi-Oh! ✅, Gundam /
  Pokémon / Digimon ❌ (sources carry no prices) — value rules are inert for
  those games until a price source is added.
- The `cards` table is empty on this machine: the first MTG sync (Admin page)
  is required before scanning can match anything.

### How to revert

1. Remove `price_usd_foil` from `FIELD_DEFINITIONS`.
2. Remove the `card_prices` mapping from `yugiohConfig`.
3. Delete `scripts/start-web.cmd` and `custom/SETUP.md`.

## Item 22 — First-run setup executed: seed script + default data (server + web)

**Status:** implemented, committed.

### Why

The machine had never been set up — the DB was completely empty (0 games, 0
collections, 0 bin sets), so the app was unusable until the operator clicked
through Settings → Games, Collections, and Bins by hand. The task was to make
the first-run path one command and to run it.

### What changed

- **`packages/server/scripts/seed-local.ts`** — idempotent seeder: upserts the
  five sync-capable game rows (`mtg`, `yugioh`, `digimon`, `gundam`, `pokemon`)
  with their real data-source URLs and per-game rarity field definitions;
  creates a default active collection (`My Collection`, MTG); creates an active
  7-bin set (bin 7 = catch-all); creates a ready-made `Standard Bundle
  (15/15/5/5)` config. Safe to re-run.
- **Default data created on this machine** via the script (verified through the
  API): 5 games, 1 collection, 1 bin set, 1 bundle config.
- **`custom/SETUP.md`** updated: first-run is now `npx tsx
  scripts/seed-local.ts` + one card sync in Admin (still required — the `cards`
  table stays empty until sync embeds a catalog).

### How to revert

1. Delete the seeded rows (`DELETE FROM bundle_configs/bins/bin_sets/collections/games`).
2. Remove `scripts/seed-local.ts` and the SETUP.md first-run section.

## Item 23 — Yu-Gi-Oh! / Digimon search adapters registered (server)

**Status:** implemented, committed.

### Why

Item 19 wired YGO/Digimon into the **sync** path (`SYNC_SOURCES`) but never into
`ADAPTERS_BY_GAME_KEY` in `resolve.ts` — the search adapter map only had
mtg/gundam/pokemon. Scanning cards for a Yu-Gi-Oh! or Digimon collection would
fail at search time (`resolveCardSearch` returns null), and the dataset
importer's per-card hydration uses the same resolution.

### What changed

- `packages/server/src/lib/card-search/resolve.ts` now includes
  `yugioh: createSearchAdapter(yugiohConfig)` and
  `digimon: createSearchAdapter(digimonConfig)`.

### How to revert

1. Remove the two entries from `ADAPTERS_BY_GAME_KEY`.

## Item 24 — Bundle mode: fixed-composition runs with no duplicates (full stack)

**Status:** implemented, committed.

### Why

The machine's primary job is assembling card bundles (e.g. 15 common / 15
uncommon / 5 rare / 5 super-rare, operator-selectable). That needs: per-rarity
target counts with per-bin routing, a no-duplicates rule across the whole run,
a reject bin for duplicates/overflow/unmatched rarities, and resume support so
a restart doesn't lose the run.

### What changed

- **DB** — migration `0002_bundle_mode`: `bundle_configs` (name, targets jsonb
  `[{rarity, count, binNumber}]`, reject_bin_number, is_active) and
  `bundle_runs` (config FK cascade, status active/completed/aborted,
  placed_card_ids jsonb, counts jsonb), org-RLS like every other table.
- **Server** — `packages/server/src/routes/bundles.ts` (mounted at
  `/api/bundles`): CRUD for configs; start/abort/complete a run; `GET
  /run/active` (resume lookup); `POST /run/:guid/place` is the authoritative
  decision point — duplicate / unmatched-rarity / target-full → reject bin,
  else accept into the target bin, persist counts + placed ids, auto-complete
  when all targets are met.
- **Shared** — `bundles.interface.ts` types (`BundleTarget`, `BundleConfig`,
  `BundleRun`, `BundlePlaceResult`).
- **Web** — `BundlesProvider` (configs + active run + optimistic mirror of
  placements) and a `BundlePanel` on the scanner page: live progress (per-rarity
  count/target bars), start/abort, and a config editor (name, rarity/count/bin
  rows, reject bin). `use-scanned-cards.tsx` `addCard` routes through the active
  run when one exists — the run decides the bin, the scan record is still
  persisted as normal, bundle-complete pauses auto-feed.

### Behavior notes

- Duplicate rule uses the card id (`card.id`). Foil prints that are a different
  product id (DBZ/One Piece) count as distinct cards; MTG foils share the id and
  a second copy is rejected — exactly the "no 2 the same" behaviour.
- Bundle configs are org-global (no game binding) — target rarities must match
  the cards being scanned (e.g. YGO "super rare" ≠ MTG "mythic").
- If the API is unreachable mid-run, a card routes to the reject bin (safe
  failure — a bundle bin is never polluted) and bundle state is unchanged.

### How to revert

1. Drop migration `0002_bundle_mode` (tables + policies).
2. Remove `bundlesRouter` mount, the bundles route file, the provider/panel,
   and the bundle branch in `addCard`.
3. Remove `bundles.interface.ts` + its index export.

## Item 25 — Fix MTG card sync: Scryfall JSONL format + parallel fetch/batch embed (server)

**Status:** implemented, committed.

### Why

Clicking the Admin sync for Magic: The Gathering died immediately with `Fatal
error: Failed to parse URL from undefined`. Scryfall changed their bulk-data API:
entries no longer carry `download_uri` — the catalog now points at a gzipped
**JSONL** file via `jsonl_download_uri`, and the sync tried to `fetch(undefined)`
and then `res.json()` a JSONL payload it couldn't parse. Separately, once the
parse was fixed the sync ran at ~6s/card (a full 54k-card catalog would have
taken ~90 hours) because images were fetched one at a time from a host that
throttles per-connection.

### What changed

- **`scryfall/sync.ts`** — resolves `jsonl_download_uri` (with `download_uri`
  fallback), gunzips the bulk file when gzipped, and parses both formats
  (JSONL lines and the legacy JSON array). A single malformed line is skipped
  rather than failing the whole download. Fetches the `large` (JPG) size — same
  pixel dimensions as PNG but 5-7x fewer bytes, and the connection-throttled
  host makes transfer size the bottleneck.
- **`sync-job.ts`** — images are fetched in **parallel batches of 16** (the CDN
  allows parallel connections; measured 16 in the same wall time as 1) and
  **pipelined** (next chunk fetches while the current chunk embeds). Embeddings
  use a new **`vectorizeBuffers`** batch path (`vectorize.ts`) that runs N
  images in one model forward (~1.4x faster than N singles).
- **GPU safety**: batch-16 embeddings crashed the DirectML device on the Quadro
  M4000 (`DXGI_ERROR_DEVICE_HUNG`), so fetch batch (16) and embed batch (8)
  are decoupled. A GPU-hang guard aborts the sync with a clear “restart the
  server” message instead of churning per-card errors.

### Behavior notes

- Measured on this machine: **~0.6s/card, 0 errors** sustained (was 6s/card).
  The full 54k-card MTG catalog is a one-time ~9-10 hour run; the sync is
  resumable (skips cards already in the DB) and the bulk catalog is cached to
  disk keyed by Scryfall's `updated_at`.

### How to revert

1. Restore `download_uri` parsing and `res.json()` in `scryfall/sync.ts`.
2. Remove `vectorizeBuffers` and the parallel/pipelined loop in `sync-job.ts`.

## Item 26 — Hardware diagnostics: servo wiggle test + scan light control (web)

**Status:** implemented, committed.

### Why

Before trusting any routing, a freshly built machine needs to prove each servo
is wired to the right channel and each bin route fires the right mechanism.
The calibration page already had per-servo jog controls (±1/±10 raw PWM) and
“Set” buttons for calibration points, but nothing that guides an operator
through verifying the hardware, and the scan light (LED 5) couldn't be toggled
from the UI even though the firmware supports it.

### What changed

- **`servo-diagnostics.tsx`** (new, on `/app/calibrate`) — a commissioning
  panel that lists all 9 servos (3 modules × bottom/paddle/pusher) with their
  job (“trapdoor — drops the card to the next module”, “gate — holds the card
  while the pusher ejects it”, “pusher — ejects left/right”), which bins each
  one participates in, and a **Wiggle** button that cycles the servo between
  its two calibrated extremes (2×) and back to rest so the operator can watch
  the physical part and confirm the wiring. “Wiggle all” runs a module's three
  servos in sequence.
- **Bin route map** — a table of bins 1–7 → the exact mechanical sequence each
  route runs (mirrors `routeCard()` in `main.ino`), so testing a bin shows what
  should be moving.
- **`led-controls.tsx`** — added the **Scan Light** toggle (LED 5, firmware
  channel 14) alongside LEDs 1–4; the page hook now tracks five LED states.

### Behavior notes

- Wiggling uses the calibrated pulse values (falls back to defaults when a
  module is unconfigured) and returns each servo to its resting position
  (closed for bottom/paddle, neutral for pusher).
- Combine with the existing tools on the page: ±1/±10 jog to find the exact
  start/end pulses, “Set” to save them as calibration points, then “Run Test”
  for the full sweep and the bin test panel for a complete sample run.

### How to revert

1. Remove `<ServoDiagnostics />` from `calibrate.tsx` and delete the component.
2. Remove the Scan Light button from `led-controls.tsx` and the 5th LED state.

## Item 27 — Pokémon sync fix + auto-advancing sync queue (server + web)

**Status:** implemented, committed.

### Why

Two things: (1) the Pokémon sync silently did nothing — TCGdex's list endpoint
only returns `{id, localId, name}`, no image, so every card was skipped as
“no imageUrl” and the DB would never get a single Pokémon card; (2) syncing
five games one at a time meant babysitting the Admin page for hours, clicking
“Start Sync” again after each finished.

### What changed

- **Pokémon sync** (`pokemon/sync.ts`) — `fetchCards` now enriches every list
  entry with a detail fetch (bounded concurrency 16), which provides the real
  image URL, rarity, and set. The normalized PlayingCard is stored as
  `cardData`, so Pokémon gets rarity binning, bundle recipes, and offline
  hydration like every other game. `fetchDetail` double-encodes ids so the
  punctuation-variant cards (`exu-%3F` Unown, etc.) resolve too.
- **Sync queue** (`sync-job.ts` + `admin.ts`) — `POST /api/admin/sync/queue`
  queues game keys that run one at a time (they share the GPU); when a run
  completes, cancels, or fails, the next key starts automatically. `GET`/
  `DELETE` endpoints expose/clear the queue. The Admin page gained a **Sync
  All Games** button that queues every sync-capable game.

### Behavior notes

- Current queue on this machine: Pokémon → Yu-Gi-Oh! → Digimon → Gundam
  (~8 h total at ~0.6 s/card on the GPU).
- Pokémon's detail enrichment adds ~5–10 min of catalog fetching before the
  embedding phase starts.

### How to revert

1. Remove the enrichment loop from `pokemon/sync.ts` and the encode fix in
   `fetchDetail`.
2. Remove the queue functions from `sync-job.ts`, the queue endpoints from
   `admin.ts`, and the Sync All button.

## Item 28 — Card Library browser (server + web)

**Status:** implemented, committed.

### Why

The synced card database had no real browsing UI — only a bare text list in
Admin (name + set code, no art, no filters). The library is the payoff of the
sync work, so it should be browsable like a collection.

### What changed

- **`GET /api/cards/library`** (new, in `routes/card.ts`) — paginated card
  browsing with filters: `gameKey`, name `search` (ILIKE), `rarity` and `set`
  (both extracted from the stored `card_data` jsonb). Returns art URL + rarity
  + set name + the full card object so detail views need no second request.
- **`/app/library` page** (new) — art grid (lazy-loaded thumbnails) with game
  tabs (All / Magic / Pokémon / Yu-Gi-Oh! / Digimon / Gundam), debounced name
  search, a per-game rarity dropdown (from the game's field definitions), a set
  code filter, and “Load more” pagination. Clicking a card opens a detail panel
  (large art, rarity badge, type line, collector number, prices, oracle text).
- **Nav** — new Library item in the sidebar.

### Behavior notes

- Art is served through the existing local image proxy, so re-viewing a card
  is instant/offline once its art is cached.
- The rarity dropdown shows the options seeded for each game; games with
  rarities outside those options can still be found via search/set filters.

### How to revert

1. Remove the `/library` route from `card.ts`.
2. Delete `packages/web/src/app/routes/app/library.tsx`, the library feature
   folder, the route entry, and the nav item.

## Item 29 — Bundle holo/duplicate toggles + physical bin capacity limits (shared + server + web)

**Status:** implemented, committed.

### Why

Two needs from the operator: (1) bundles shouldn't always care about holo — a
plain common bundle is fine with a holo common mixed in, and some bundles need
to allow repeated copies of the same card; (2) the machine's bins have fixed
physical heights (155 mm at module 1 nearest the feeder, 110 mm module 2,
65 mm module 3, 60 mm reject), so each bin needs a card limit computed from
real card thickness to guarantee no overflow.

### What changed

- **Bundle toggles**: `bundle_configs` gained `allow_duplicates` and
  `holo_detection` (migration `0003_bundle_toggles`). Each rarity target also
  carries an optional `foil` filter (`any` / `foil` / `nonfoil`). When holo
  detection is off, the scan's foil signal is ignored — a holo common and a
  plain common are both just “common”. When on, targets can be split by foil
  (e.g. “common non-foil ×15 → bin 1” and “common foil ×1 → bin 2”), and a
  card whose foil status matches no same-rarity target rejects with
  `foil-mismatch`. `allowDuplicates` skips the no-duplicates check. The
  bundle editor (Bundle Mode panel) exposes both toggles and the per-target
  foil selector; the scan path passes the two-frame foil verdict into the
  bundle decision.
- **Bin capacities**: shared constants `BIN_HEIGHTS_MM` (1–2: 155, 3–4: 110,
  5–6: 65, 7: 60), `CARD_THICKNESS_MM = 0.3`, and
  `maxCapacity = floor((height / 0.3) × 0.9)` (10 % headroom so a full stack
  never jams against the mechanism). Applied to the default bin set by
  `scripts/apply-bin-capacities.ts` (bins 1–2: 465, 3–4: 330, 5–6: 195,
  reject: 180) and by the seeder for fresh installs. The existing per-bin
  “max capacity” routing check (overflow → catch-all) enforces the limits.

### Behavior notes

- Counts are now keyed by target (`rarity[:foil]`), so two same-rarity targets
  split by foil each track independently.
- When duplicates are allowed, placed-card ids don't accumulate, so progress
  is summed from per-target counts.

### How to revert

1. Drop migration `0003` and the foil logic in `routes/bundles.ts`.
2. Remove the capacity constants/script and reset `maxCapacity` to 0.

## Item 30 — Sound bin-full logic: per-bin status, empty/reset, pause-on-overflow (web)

**Status:** implemented, committed.

### Why

A seller/collector running long batches needs certainty that a bin can never
overflow. Previously a full matched bin fell back to the catch-all, but the
catch-all itself could overflow, and bundle mode ignored physical bin capacity
entirely — rejects piled into the reject bin with no limit. There was also no
way to see per-bin fill or tell the machine “this bin is empty now”.

### What changed

- **Per-bin status + Empty/reset** — the scanner page gained a **Bin Status**
  strip showing every bin's count vs capacity (green/amber/red by fill level,
  catch-all marked `R`) with a per-bin **Empty** button. Emptying a bin resets
  its session count — the confirmation that it was physically emptied.
- **Pause until space exists** — when a card has nowhere to go (matched bin
  full AND catch-all full; bundle destination bin at capacity; reject bin at
  capacity), the machine pauses with a clear “Bin N is full — empty a bin,
  then tap Empty to resume” message and no phantom scan record is saved. The
  card stays at module 1 and is re-scanned after resume.
- **Empty resumes the run** — `emptyBin` clears the pause flag, re-enables
  auto-feed, and feeds the stuck card automatically (a resume hook is wired
  into the scanner so its state returns to scanning).
- **No more silent count resets** — toggling auto-feed no longer wipes all bin
  counts (that would forget cards still sitting in other bins); only the
  per-bin Empty buttons (or clearing the session) reset them.
- Bundle mode now checks physical bin capacity before committing, so a bundle
  whose target count exceeds the bin's physical capacity pauses instead of
  overflowing (bundle targets should stay within the bin capacities in
  `custom/SETUP.md`).

### Behavior notes

- Bin counts are session-scoped (reset on browser reload) — consistent with
  the existing software-capacity model; there are no bin-full sensors.
- When a bundle run completes exactly as its last bin fills, the leftover card
  routes to the reject bin after the operator empties and resumes.

### How to revert

1. Remove `bin-status.tsx` and its page placements.
2. Remove `binCounts`/`emptyBin`/`pauseForFullBin`/resume hook from
   `use-scanned-cards.tsx` and restore `setAutoFeed`'s count reset.

## Item 31 — Bundle live value (shared + server + web)

**Status:** implemented, uncommitted.

### Why

A seller needs to know what a bundle is worth while it's being assembled, not
only after it completes. The bundle run now tracks a running `totalValueUsd`
so the panel can show the value growing in real time.

### What changed

- **Schema** — `bundle_runs.total_value_usd` numeric column (migration
  `0004_chase_wishlist_value.sql`).
- **Shared** — `BundleRun.totalValueUsd: number` in
  `packages/shared/src/interfaces/bundles.interface.ts`.
- **Server** — `routes/bundles.ts` `POST /run/:guid/place` accepts an optional
  `priceUsd`; when present and > 0 it's added to `totalValueUsd`. The value
  persists with the run, so reload/restart resume is exact.
- **Web** — bundle panel shows the running total next to the progress bar;
  `bundles.ts` / `use-bundles.tsx` pass `totalValueUsd` through.

### Behavior notes

- Price comes from the scanned card's `prices.usd` (see "Where prices come
  from" in `custom/SETUP.md` for which games have prices). Cards without a
  price contribute $0.

### How to revert

1. Drop `bundle_runs.total_value_usd` (reverse migration `0004`).
2. Remove `totalValueUsd` from the shared interface and the price
   accumulation block in `routes/bundles.ts`.

---

## Item 32 — Export collection to CSV (web)

**Status:** implemented, uncommitted.

### Why

A collector wants their scanned cards in a spreadsheet (inventory, pricing,
backup) without any export plumbing.

### What changed

- `packages/web/src/features/cards/lib/collection-export.ts` — groups scanned
  cards by card id and renders CSV (name, set, set code, rarity, collector #,
  price USD, qty, foil, bin), with proper quoting.
- `packages/web/src/features/cards/components/card-grid.tsx` — **Export CSV**
  button downloads `collection-<date>.csv`. Exports all scanned cards, not
  just the filtered view.

### Behavior notes

- Foil = “yes” when any scan of that card was foil; Bin comes from the most
  recent scan that reported one.

### How to revert

1. Remove the Export CSV button from `card-grid.tsx`.
2. Delete `collection-export.ts`.

---

## Item 33 — Set completeness view (web)

**Status:** implemented, uncommitted.

### Why

Collectors chase full sets; the library can now answer “how close am I to
finishing this set?” using the cards scanned this session.

### What changed

- `packages/web/src/app/routes/app/library.tsx` — **Set completeness** switch
  on the library page. When on, search/rarity inputs are disabled and a set
  code drives the browse; the header shows `owned / total` and a percentage.
  Owned = scanned-card ids matching the set's cards.

### Behavior notes

- Ownership is session-scoped (scanned cards in the current browser session),
  matching the scanner's count model.

### How to revert

1. Remove the switch + completeness query from `library.tsx`.

---

## Item 34 — Duplicate report (web)

**Status:** implemented, uncommitted.

### Why

For no-duplicate workflows (and bulk resale), knowing which cards were scanned
more than once is the fastest way to find accidental doubles.

### What changed

- `packages/web/src/features/cards/components/duplicates-dialog.tsx` — dialog
  listing every card scanned more than once, with quantity.
- `card-grid.tsx` — **Duplicates** button opens it (all scanned cards, not the
  filtered view).

### How to revert

1. Remove the Duplicates button + dialog from `card-grid.tsx`.
2. Delete `duplicates-dialog.tsx`.

---

## Item 35 — Set-chase mode (server + web)

**Status:** implemented, uncommitted.

### Why

“Chase” a single set: any card from that set that the collection doesn't own
yet routes to a chase bin; owned/duplicate/off-set cards go to the reject bin.
Builds set-complete piles automatically.

### What changed

- **Schema** — `chase_configs` + `chase_runs` tables (migration `0004`),
  org-scoped RLS like every other table.
- **Server** — `packages/server/src/routes/chase.ts` (mounted in `index.ts`):
  CRUD on configs, `POST /:guid/start` / `/abort`, and
  `POST /run/:guid/place` which accepts a card only when its `setCode` matches
  the config, isn't already found this run, and (when a collection is bound)
  isn't already owned. Rejects return `not-in-set` / `duplicate` / `owned`
  with the reject bin.
- **Web** — `ChaseProvider` (`use-chase.tsx`) + **Chase panel** on the scanner
  sidebar; scan routing in `use-scanned-cards.tsx` gives chase priority over
  wishlist and normal bin rules (bundle still wins). Physical bin capacity is
  checked before a chase placement, so a full chase bin pauses the machine.

### Behavior notes

- Chase runs resume after reload/restart (runs persist in Postgres).
- Set code comparison is case-insensitive/uppercased on the server.

### How to revert

1. Drop `chase_configs` / `chase_runs` (reverse migration `0004`).
2. Remove `routes/chase.ts` + mount line, `use-chase.tsx`, `chase-panel.tsx`,
   and the chase branch in `use-scanned-cards.tsx`.

---

## Item 36 — Wishlist routing (server + web)

**Status:** implemented, uncommitted.

### Why

A seller building orders (or a collector chasing singles) wants specific cards
to route to their own bin no matter what the normal bin rules say.

### What changed

- **Schema** — `wishlists` + `wishlist_items` tables (migration `0004`).
- **Server** — `packages/server/src/routes/wishlist.ts` (mounted in
  `index.ts`): CRUD on wishlists and their items; items are a card id or a
  name pattern.
- **Web** — `WishlistProvider` (`use-wishlist.tsx`) + **Wishlist panel** on
  the scanner sidebar. `useScannedCards.matchBin(card, gameKey)` matches an
  active wishlist for the collection's game by card id or name pattern;
  matches override normal bin rules (after bundle + chase). Bin capacity is
  enforced before routing.

### Behavior notes

- A wishlist only fires for the same game as the active collection.
- Name patterns match case-insensitively against the card name.

### How to revert

1. Drop `wishlists` / `wishlist_items` (reverse migration `0004`).
2. Remove `routes/wishlist.ts` + mount line, `use-wishlist.tsx`,
   `wishlist-panel.tsx`, and the wishlist branch in `use-scanned-cards.tsx`.

---

## Item 37 — Local art cache + in-flight dedupe (server)

**Status:** implemented, uncommitted.

### Why

Art requests previously hit the image CDN every time (slow, and useless for a
local-only build). The sync already downloads every card's image; now that
work is reused as a disk cache.

### What changed

- `packages/server/src/lib/art-cache.ts` — SHA-256-keyed disk cache under
  `.cache/art` (image + content-type meta), a best-effort `saveArtToCache`,
  and `fetchImageWithCache` with in-flight dedupe (concurrent requests for the
  same URL share one upstream fetch).
- `routes/card.ts` image proxy now serves from the cache first.
- `lib/sync-job.ts` warms the cache for every image it downloads for
  embedding, so after a game sync its art is fully local and instant.

### Behavior notes

- Cache dir is `process.cwd()/.cache/art` (override with `ART_CACHE_DIR`).
- The bulk catalogs (Scryfall etc.) were already cached on disk; this extends
  that to individual card art.

### How to revert

1. Delete `lib/art-cache.ts`; restore the image proxy's direct fetch.
2. Remove the `saveArtToCache` call in `sync-job.ts`.

## Item 38 — Scan-aware sync pacing + Postgres RAM tuning (server + scripts)

**Status:** implemented, uncommitted.

### Why

A full-tilt sync saturates the DirectML GPU, and on Windows the desktop
compositor (DWM) shares that GPU — so the whole machine feels sluggish during
sync even though CPU sits at ~2 %. The scanner also needs the GPU for its own
per-scan embed, so a running sync can delay scans.

### What changed

- **`lib/scan-activity.ts` (new)** — `recordScan()` / `recentScanWithin(ms)`
  track when the last scan embed happened.
- **`routes/card.ts`** — calls `recordScan()` after each successfully
  vectorized scan.
- **`lib/sync-job.ts`** — pacing between fetch/embed batches:
  - `SYNC_FETCH_BATCH` / `SYNC_EMBED_BATCH` env vars (defaults 16 / 8) so the
    batch sizes are tunable without code edits.
  - `SYNC_PACE_SCAN_MS` (default 200) delay per batch while the scanner was
    used in the last 5 s; `SYNC_PACE_IDLE_MS` (default 10) otherwise. Idle
    cost is negligible; the machine stays responsive during a sync.
- **`scripts/local-db.mjs`** — Postgres now starts with
  `-c shared_buffers=1GB` (was the 128 MB default), so the card catalog +
  vector index stay resident in RAM. Applied on next Postgres start/restart
  (both `start` and the logon auto-start launcher).

### Behavior notes

- Sync is still one game at a time and fully resumable; the pacing only
  changes timing between batches.
- The GPU/memory “half free” numbers during sync are normal: SigLIP uses a
  small slice of VRAM; the 100 % is compute utilization, and the card
  *lookups* (pgvector search) run on CPU in Postgres, not the GPU.

### How to revert

1. Remove the `pace()` calls + env vars from `sync-job.ts` and the
   `recordScan()` call from `routes/card.ts`; delete `lib/scan-activity.ts`.
2. Drop `-c shared_buffers=1GB` from `scripts/local-db.mjs` (both places).

## Item 39 — Docs refresh + bootstrap rename (docs + scripts)

**Status:** implemented, uncommitted.

### Why

After items 11–13 removed hosted Neon, the file name
`packages/server/sql/local-neon-bootstrap.sql` was a misleading leftover for
anyone onboarding. The README (GitHub landing page) also still referenced a
Docker deployment and a feature list that predated bundle/chase/wishlist
mode, and the Arduino README still pointed at the old Logitech webcam.

### What changed

- **`packages/server/sql/local-neon-bootstrap.sql` → `local-bootstrap.sql`**
  (renamed; references updated in `README.md`, `.env.example`, `db/index.ts`,
  `db/schema.ts`, and the file's own header).
- **`README.md`** rewritten: current feature set (bundle/chase/wishlist, value
  binning, holo detection, bin status, export/duplicates/set-completeness,
  art cache), accurate stack versions, real step-by-step getting-started,
  removed the stale Docker/nginx deployment section, hardware + webcam now
  match the EMEET C60E + scan light.
- **`custom/README.md`** — status checklist replaced with a summary of the
  38 documented items.
- **`arduino/main/README.md`** — scan light (LED 5 / ch14) added to the
  channel summary; webcam section updated to the EMEET C60E.
- **`custom/SETUP.md`** — `/app/library` added to the page list.
- **`.env.example`** — sync pacing variables documented.

### How to revert

1. Rename `packages/server/sql/local-bootstrap.sql` back and restore the
   references.
2. Restore the previous README/docs from git.

## Item 40 — Dependency security pass (repo)

**Status:** implemented, uncommitted.

### Why

`pnpm audit` flagged 2 critical and 45 high-severity advisories. The criticals
were transitive through the vision stack (`@huggingface/transformers` →
`onnxruntime-web`/`onnxruntime-node` → `protobufjs`/`tar`), and several highs
were in our direct runtime deps (hono, @hono/node-server, drizzle-orm,
react-router-dom, vite).

### What changed

- **Bumped direct deps** — hono `^4.12.4` (4.12.34), `@hono/node-server`
  `^2.0.12` (2.x — 1.x is EOL for the serve-static advisory), drizzle-orm
  `^0.45.2`, react-router-dom `^7.18.2`, vite `^6.4.3`, turbo `^2.10.8`,
  shadcn `^4.16.1`.
- **pnpm overrides (root `package.json`)** for transitives with no patched
  release in their pinned line: `protobufjs >=7.6.1` (→8.7.1),
  `tar >=7.5.19` (→7.5.22), `sharp >=0.35.3` (libvips CVEs), `kysely
  >=0.28.17`.
- **Verified the vision path still works** after the sharp override — a live
  scan (image → sharp decode → SigLIP/DirectML embed → pgvector search)
  returned 200 on a fresh server process; the web build passes with
  react-router 7.18.

### Result

`pnpm audit`: **critical 2 → 0**; high 45 → 21, of which **0 are in runtime
paths** (the remaining highs are dev-tooling transitives via the `shadcn` CLI,
`tsup`, and ESLint — never shipped). One react-router advisory is flagged but
only affects RSC mode (server actions), which this SPA does not use; the fix
is v8-only.

### How to revert

1. Restore the three `package.json` files and `pnpm-lock.yaml` from git, then
   `pnpm install`.
2. Remove the `pnpm.overrides` block from root `package.json`.

## Item 41 — Fix theme toggles + bundle SKU/inventory (web + server)

**Status:** implemented, uncommitted.

### Why

Two things: (a) the Light/Dark/System theme toggles did nothing — `next-themes`
`useTheme()` was used but no `ThemeProvider` was mounted (the provider lived in
the auth-gated layout removed in item 13, so this has been broken since); (b) a
seller needs every completed bundle to be traceable — a SKU, the list of cards
that went into it, and a CSV record for disputes/claims.

### What changed

- **Theme** — `packages/web/src/main.tsx` now wraps the app in
  `<ThemeProvider attribute="class" defaultTheme="system" enableSystem>`;
  the CSS already had the class-based `dark` variant and `.dark` variables.
- **Bundle SKU** — `bundle_runs.sku` column (migration `0005_bundle_sku`)
  assigned at run start: `{ACRONYM}-{CARD_COUNT}-{SEQ}` (e.g. `MTG-40-001`)
  from the config's game + total target count + per-game run sequence.
  `bundle_configs.game_key` column records the game (picked in the bundle
  editor, defaulting to the active collection's game). Shared
  `GAME_ACRONYMS` / `gameAcronym()` in
  `packages/shared/src/constants/game-acronyms.constant.ts` (MTG/YGO/PKM/DIG/GUN,
  `TCG` fallback).
- **Bundle inventory** — new endpoints: `GET /bundles/runs` (all runs),
  `GET /bundles/run/:guid/cards` (card details grouped with qty),
  `GET /bundles/run/:guid/csv` (downloadable inventory CSV). The panel shows
  the SKU on the active run, a **Bundle inventory** list of past runs, a
  view-cards dialog, and an Export CSV button per run.
- Seeder now sets `game_key: "mtg"` on the default bundle.

### Behavior notes

- Existing runs/configs predating the columns show no SKU/game until a new
  run is started (configs can be edited to set a game).
- The CSV is the inventory record: SKU, config, game, date, card count, total
  value, then per-card rows (qty, name, set, rarity, price).

### How to revert

1. Drop migration `0005` (`bundle_runs.sku`, `bundle_configs.game_key`).
2. Remove the SKU/inventory endpoints + panel additions and the
   `ThemeProvider` wrap in `main.tsx`.

## Item 42 — Gundam card-data fix + backend production hardening (server)

**Status:** implemented, uncommitted.

### Why

(a) The Gundam sync adapter stored cards + embeddings but never populated
`card_data` (its `fetchCards` only kept id/name/set/image), so library,
detail hydration, and bundle CSV exports showed empty data for Gundam — the
only game with that gap. (b) The server had no health endpoint, logged into
the void (hidden window), returned no JSON for 404s/500s, and had no graceful
shutdown or fail-fast config check.

### What changed

- **Gundam** — `lib/gundam/sync.ts` now maps each row through
  `normalizeGundamCard()` so `card_data` is stored; re-running the sync
  backfilled all 1,816 existing rows (the sync's existing backfill path).
  DB now has full card_data for all five games.
- **`src/index.ts`** — production hardening:
  - `GET /api/health` — liveness + DB reachability (`SELECT 1`), returns
    `{ success, status, uptime, timestamp }` or 503.
  - `app.notFound` / `app.onError` — JSON 404 / 500 for every route (the web
    client always parses JSON).
  - Fail-fast `DATABASE_URL` check on boot with a clear message.
  - Graceful shutdown on SIGINT/SIGTERM (close DB pool, exit cleanly).
  - `uncaughtException` / `unhandledRejection` handlers that log then exit(1)
    so a crash is visible in the log.
- **`scripts/start-server.cmd`** — server output now appends to
  `C:\Mault Revised\mault\server.log` instead of vanishing.
- **`custom/PLAN.md`** — new “v2 machine” section: MG90S servo upgrade,
  interrupt-driven / comparator / encoder card detection options, and the
  ~1.5–2 s/card target.
- **`custom/TCGS.md`** — per-game sync completeness table updated.

### How to revert

1. Revert `lib/gundam/sync.ts` to the minimal mapping (rows keep null
   card_data).
2. Restore the previous `src/index.ts` and `scripts/start-server.cmd` from git.

## Item 43 — Hardware v2 production review doc (docs)

**Status:** implemented, uncommitted.

### Why

Goal is small-scale production: a faster, more reliable machine (not PLA, a
stable heavy base), and long-term concurrent multi-machine operation (3
machines + 3 cameras off one PC) instead of one bigger machine.

### What changed

- **`custom/HARDWARE_V2.md` (new)** — production review covering:
  - **Materials:** PLA → ASA/PETG per part (creep/heat/toughness table),
    heat-set brass inserts, connectorized modules, when injection molding wins.
  - **Stability/mass:** steel base plate (~4 kg), sorbothane feet, one rigid
    aluminum backplate spine, camera on the machine — the cheapest way to
    shorten the blind routing delays.
  - **Mechanism:** MG90S, brass bushings/bearings at pivots, steel pin through
    flappers, silicone pinch roller + hopper agitator + feeder encoder.
  - **Multi-machine:** `station_id` software plan (per-machine scans/bin
    status/bundle runs; shared card library + configs), USB/power/camera
    sizing for 3 stations, single-GPU embed queue math, and a throughput
    table (~50k cards/8-h shift on a 3-machine v2 farm).
  - **Market comparison:** vs TCGplayer's **Roca Sorter** (~$25k, 500 sort /
    725 sift per hr, 1,000-card batches) — our v1 already sorts ~2.4× faster
    on raw throughput and the 3× v2 farm ~12.6×, at 1/10 the cost. Roca's real
    value is inventory digitization, alphabetizing, sleeved-card handling,
    and unattended batches — logged as feature gaps to borrow, not speed gaps.
  - **Measurement gate:** the roadmap now orders *finish v1 software → build
    + tune the first machine → measure cards/hr, error rate, jams &
    double-feeds per 1,000 → cheap upgrades, re-measure → v2 → farm*, so
    every hardware dollar is justified by a measured number.
- `custom/README.md` + `custom/PLAN.md` — doc index updated to point at it.

### How to revert

1. Delete `custom/HARDWARE_V2.md` and revert the index links.

## Item 44 — Orientation-tolerant crop + digitize mode (web + shared)

**Status:** implemented, uncommitted.

### Why

Two scanner capabilities that move toward the v2/Roca-style workflow:
(a) cards fed upside-down (end-over-end) previously failed to match because
SigLIP embeddings are orientation-sensitive; (b) bulk-recording a library
(before pricing/listing) needed a “record everything, sort nothing” mode.

### What changed

- **Orientation-tolerant crop** — `autoOrientCard()` in
  `packages/web/src/features/scanner/lib/card-detection.ts`: after the fixed
  scan-region crop, a cheap downscaled grayscale pass compares the ink density
  of the top vs bottom bands (light name bar vs dense rules-text box — a
  layout shared by every supported TCG) and rotates the crop 180° when it is
  clearly flipped. Conservative threshold: ambiguous cards stay as-fed
  (a wrong flip would no-match, which is visible). Wired into the capture
  path in `use-card-scanner.ts` so foil detection and the upload both see an
  upright card.
- **Digitize mode** — `digitize` / `setDigitize` on the scanned-cards
  context; when on, `addCard` records the scan but bypasses bundle/chase/
  wishlist/bin rules entirely and routes to the catch-all bin (capacity
  check included) so the machine keeps moving. New `DigitizeModeToggle` in
  the scanner sidebar (all three layouts).
- **Sleeved capacity (shared)** — `CARD_THICKNESS_SLEEVED_MM = 0.7` and
  `computeBinCapacity(bin, thickness)` so the app's capacity model can switch
  to sleeved limits with one value (v2 sleeve-tolerant work).
- **Docs** — `custom/HARDWARE_V2.md` gained a “Sleeve tolerance” section
  (gaps, foil calibration on sleeves, capacity); `custom/TCGS.md` gained the
  TCGplayer integration investigation + roadmap; `custom/SETUP.md` documents
  both new scanner features. Alphabetizing is explicitly out of scope.

### How to revert

1. Remove the `autoOrientCard` call in `use-card-scanner.ts` and the
   function in `card-detection.ts`.
2. Remove the digitize branch in `use-scanned-cards.tsx`, the context
   fields, and `DigitizeModeToggle`.
3. Drop the sleeved constant (keep `computeBinCapacity` with its default).

## Item 45 — TCGplayer inventory CSV export (web)

**Status:** implemented, uncommitted.

### Why

Step 1 of the TCGplayer integration roadmap (`custom/TCGS.md`): the
no-API 80/20 win — export a scan/digitize session as a TCGplayer-compatible
inventory CSV, uploaded in the seller portal without any API access.

### What changed

- **`packages/web/src/features/cards/lib/tcgplayer-export.ts`** —
  `buildTcgplayerCsv()` / `downloadTcgplayerCsv()`: groups scanned cards by
  card id + foil variant, emits the community-standard inventory shape
  (`name, set_name, condition, quantity, purchase_price, list_price,
  tcgplayer_id`).
  - Condition defaults to **Near Mint** (operator edits before upload).
  - Foil scans get `(Foil)` appended to the name (TCGplayer's foil product
    naming) and use `prices.usd_foil` when available.
  - `list_price` from the card price; blank when the source has none.
  - `purchase_price` and `tcgplayer_id` are left blank (no cost tracking yet;
    IDs come with the API integration).
- **`card-grid.tsx`** — **TCG CSV** button next to Export CSV, exports all
  scanned cards.
- Verified output shape with a sample-data run (grouping, foil rows, foil
  pricing, blank prices all correct).

### How to revert

1. Remove the TCG CSV button + handler from `card-grid.tsx` and delete
   `tcgplayer-export.ts`.

## Item 46 — QoL quick wins + product strategy doc (web + docs)

**Status:** implemented, uncommitted.

### Why

Adoption-first thinking for v1: fix the trust/feedback gaps a home user hits
on day one, and capture the v1→v2 product strategy so the roadmap has a
thesis.

### What changed

- **Sounds** — `use-card-scanner.ts`: successful matches now play a short
  ascending chime; no-match plays a distinct low square tone. Previously the
  *same* ding played on no-match and matches were silent (inverted UX).
- **Undo last scan** — `use-scanned-cards.tsx` tracks the most recently
  committed scan (`lastScanIdRef`) and exposes `undoLastScan()` (removes the
  record; the physical card is moved by hand). **Undo last** button added to
  the card-grid toolbar.
- **`custom/PRODUCT.md` (new)** — v1 home vs v2 commercial positioning, the
  five adoption drivers (correctness, trust, easy setup, fun, no surprises),
  and a value-vs-effort feature backlog with status markers (many items
  already built; quick wins flagged for the next session).
- `custom/README.md` — doc index updated.

### How to revert

1. Restore the single ding in `use-card-scanner.ts` (or revert the file).
2. Remove `lastScanIdRef`/`undoLastScan` from `use-scanned-cards.tsx`,
   `types.ts`, and the toolbar button.
3. Delete `custom/PRODUCT.md` and revert the index link.

---

## Item 48 — Rebrand to DeckSift + custom license + credit restructure (repo)

**Status:** implemented, uncommitted.

### Why

DeckSift has grown into a distinct product built on MAULT, and the repo was
presenting it ambiguously: browser tab said MAULT, the app said "Magic Vault",
"Report an issue" pointed at the upstream repo, and the LICENSE named only the
original author. The v1→v2 plan also needs a licensing model that lets home
users build the machine for free while reserving commercial sales to the
DeckSift team.

### What changed

- **`LICENSE`** — new DeckSift License: copyright © 2026 4holdingdirectlimited.
  Personal/non-commercial use is free; commercial use (selling DeckSift or
  building it into a product) requires a license from the copyright holder.
  The MAULT-derived portions (original Fusion design, build photos, firmware
  base) remain MIT with the original Kenneth Bass notice included verbatim.
- **Product name** — all user-facing strings now say **DeckSift**: landing
  page (hero/nav/features/pipeline/cta/footer/open-source), build guide
  (nav/hero/footer), app sidebar nav, browser tab (`index.html` +
  `document-title-updater.tsx`), and Discord notification titles (server).
- **Credit restructure** — credit for the v1 machine's Fusion 3D design,
  build photos, and firmware base stays explicit and prominent (footers,
  `/build` guide, README Credits, `arduino/main` docs): "the sorter we built
  from" by dishwasher-detergent (MIT). The DeckSift work — software stack,
  firmware modifications, planned revised Bambu Lab print kit — is credited to
  4holdingdirectlimited.
- **"Report an issue"** — build guide footer/nav now point at
  `4holdingdirectlimited/DeckSift/issues` instead of the upstream repo.
- **Repo renamed** on GitHub from `mault` to **`DeckSift`**; the git
  `origin` remote and all fork-repo links now use the new URL.
- **README / custom docs** — rewritten intro, Credits, license summary, and
  PRODUCT.md positioning for the personal-free / commercial-by-license model.
- **Not changed (deliberately):** the `@magic-vault/*` package names, the
  local database name, the `C:\Mault Revised` path, and the upstream repo
  links for the 3D model files (those files genuinely live upstream).

### How to revert

1. Restore `LICENSE` to the upstream MIT text.
2. Replace the "DeckSift" strings with the previous name in the files above.
3. Point "Report an issue" back at `dishwasher-detergent/mault/issues/new`.
4. Revert README/custom-doc edits.

---

## Item 49 — Review queue, set-completeness toast, non-blocking firmware state machine + interrupt IR (web + firmware)

**Status:** implemented, uncommitted.

### Why

Closes the last big trust gap (low-confidence scans auto-routed without a human
check), makes set progress visible mid-run, and delivers the firmware roadmap's
two speed/robustness items: a non-blocking operation machine and interrupt-
driven card detection.

### What changed

**Review queue (web)**
- `packages/shared/src/interfaces/scanner.interface.ts` — `ScannerStatus` gains
  `"review"`.
- `packages/web/src/features/scanner/api/use-card-scanner.ts` — when the top
  match is low-confidence (`distance >= 0.18`) or has close alternatives, the
  scan pauses with `pendingReview` instead of auto-routing. `confirmReview()`
  sorts normally; `rejectReview()` routes the physical card to the catch-all
  via the no-match path. Toggle persisted in localStorage (default ON) and
  surfaced in the scanner menu.
- `packages/web/src/features/scanner/components/review-panel.tsx` (new) —
  overlay with the card image, name, confidence %, and Sort it / Skip buttons.
- `packages/web/src/features/scanner/components/card-scanner.tsx` +
  `scanner-menu.tsx` — panel wired in, “Review low-confidence” menu toggle.

**Set-completeness toast (web)**
- `packages/web/src/features/scanner/lib/set-progress.ts` (new) — counts unique
  cards owned per set and compares with the set's total in the synced library;
  toasts on milestones (first card, every 5th, completion) to avoid spam.
- `use-scanned-cards.tsx` — fires it whenever a new scan lands.

**Non-blocking firmware state machine + interrupt IR (firmware)**
- `arduino/main/main.ino` rebuilt: `runFeeder`/`routeCard`/test/clear are now
  phases of a `runMachine()` state machine driven from `loop()`, so serial is
  serviced mid-operation (`{"cancel":true}` aborts any phase; jam alerts abort
  immediately; commands mid-run get `{"error":"busy"}`; oversized lines are
  reported). The whole-operation watchdog replaces the old command deadline.
- Module-1 IR is interrupt-driven (`attachInterrupt` + volatile flag); the
  feeder runs continuously and stops the instant the beam is crossed — the
  old pulse/pause feeding cycle is gone.
- Command protocol and replies are unchanged (`status`/`bin`/`detected`/
  `empty`/`error` with id echo), so the web app needs no protocol changes.

### Behavior notes

- Review queue is on by default; disable it from the scanner menu for
  unattended runs (e.g. digitize/bulk sessions).
- The feeder now ignores `pulseDuration`/`pauseDuration` (continuous feed);
  `settleDuration` still controls the last-card push.
- Firmware compiled: 79,240 bytes (30%) flash, 6,316 bytes (19%) RAM.

### How to revert

1. Remove the `"review"` status + review-queue logic and the panel/menu toggle.
2. Remove `set-progress.ts` and its effect in `use-scanned-cards.tsx`.
3. Restore the previous blocking firmware (`git` history of `main.ino`).

---

## Item 47 — Six adoption features: CSV import, condition, badge, shortcuts, backup script, first-run checklist (server + web + scripts)

**Status:** implemented, uncommitted.

### Why

Closes out the v1 adoption backlog from `custom/PRODUCT.md`: import an existing
collection (the strongest hook for chase/set-completeness), per-scan grading for
TCGplayer listings, instant trust signals on every card, keyboard control, a
one-command safety net, and a guided first-run path.

### What changed

**Collection CSV import (server + web)**
- `packages/server/src/routes/collections.ts` — new `POST /api/collections/:guid/import`
  (multipart `file`). Parses ManaBox/TCGplayer/Delver-style CSVs (case-insensitive
  header aliases: Name, Set/Set Name, Collector Number, Rarity, Foil, Condition,
  Qty, Price; RFC-4180 quoting). Rows are matched fully locally against the
  synced `cards` table by name (ILIKE, escaped) plus set code/name and collector
  number when present; `Qty` inserts one row per copy. Imports are inserted as
  `ScannedCard` rows (`binNumber` null, `distance` 0) and announced via
  `card_added` session events. Returns `{ success, count, errors }` where errors
  are per-row (line number + reason).
- `packages/web/src/features/collections/api/collections.ts` —
  `importCollectionCards(guid, formData)` (multipart via `apiPostForm`).
- `packages/web/src/app/routes/app/collections.tsx` — per-collection **Import
  CSV** button + dialog (file picker, format help, result toast with unmatched
  row preview).

**Condition field (server was done; frontend now complete)**
- `packages/web/src/features/collections/api/collections.ts` —
  `setCollectionCardCondition(guid, scanId, condition)` (PUT `{ condition }`).
- `packages/web/src/features/scanner/api/use-scanned-cards.tsx` + `types.ts` —
  `setCondition(scanId, condition?)` in the context.
- `packages/web/src/features/cards/components/card-detail-panel.tsx` — condition
  Select (Near Mint / Lightly Played / Moderately Played / Heavily Played /
  Damaged / Not graded) next to the Foil toggle.
- `packages/web/src/features/cards/lib/tcgplayer-export.ts` — TCG CSV now groups
  by card + foil + **condition** and emits each scan's condition (defaults
  "Near Mint").

**Match confidence badge**
- `packages/web/src/features/cards/components/scanned-card-item.tsx` — distance
  badge is now a colored dot + compact %: green < 0.15, amber < 0.25, red
  ≥ 0.25; imports/manual adds (no distance) show a neutral "—" instead of a
  misleading "0.00%".

**Keyboard shortcuts**
- `packages/web/src/features/scanner/api/use-scan-shortcuts.ts` (new) — Space =
  pause/resume, S = force scan, Z = undo last scan; ignored in inputs/textarea
  and with modifier keys. Mounted in the scanner route (`app/index.tsx`).

**Backup/restore script**
- `scripts/backup-db.mjs` (new) — `node scripts/backup-db.mjs backup [dir]`
  (pg_dump --clean --if-exists to `.local/backups/mault-<timestamp>.sql`),
  `list`, and `restore <file>` (psql restore with a bootstrap re-run hint).

**First-run checklist**
- `packages/web/src/features/setup/components/first-run-checklist.tsx` (new) —
  live checklist in the scanner sidebar: camera → Arduino → sync a game →
  calibrate servos → first scan; links to Admin / Calibrate / Build guide.

### Behavior notes

- CSV import never touches the network — it matches against the synced library
  only, so the game must be synced first (unmatched rows are reported, not
  silently dropped).
- `condition` is optional everywhere; blank grades stay "Near Mint" on TCG
  export.
- `guid` is a Postgres UUID — imported scan ids are plain `randomUUID()`s.

### How to revert

1. Remove the `/import` route + CSV helpers from `collections.ts`, and the
   import button/dialog from the collections page.
2. Drop `setCondition` from the provider/context type, the panel Select, and
   the TCG export condition grouping.
3. Revert the badge change in `scanned-card-item.tsx`; delete
   `use-scan-shortcuts.ts` and its usage; delete `scripts/backup-db.mjs`;
   delete the first-run checklist component and its sidebar mount.

---

## Item 50 — Integrate useful upstream additions (server + web)

**Status:** implemented, committed (this commit).

### Why

Upstream (dishwasher-detergent/mault) advanced ~16 commits past our fork. We
reviewed every diff and pulled in the changes that fit our local-only, no-auth,
DeckSift-branded tree — the rest was cosmetic (icon swaps), not portable
(auth/Neon), or upstream's own design files (3D models). The wins below
improve response time during scanning, fix raw-value select labels, and round
out the build docs.

### What changed

- **Server: generic adapter TTL cache** — new
  `packages/server/src/lib/card-search/cache.ts` (`withCache` wrapper with
  TTL + in-flight dedupe) applied to all five game adapters in `resolve.ts`
  (mtg, gundam, pokemon, yugioh, digimon). Search results now cache for
  15 min and concurrent identical lookups share one upstream request.
- **Web: "Min. match" filter** — `minMatchPercent` added to `CardFilters`
  (all three `EMPTY_FILTERS`), a new `components/ui/slider.tsx`, and a
  Min. match slider in the card-filter popover that hides low-confidence
  matches (`(1 - distance) * 100 >= threshold`).
- **Web: grid performance** — card grid now paginates (96/page) and
  `framer-motion`/`AnimatePresence` was removed from the card grid, card
  item, and monitor grid. This was the main render bottleneck while
  scanning with hundreds of cards (each scan re-triggered layout
  animation across the whole grid). Newest-scan flash (`isNew`/
  `newestScanId`) removed with it; scan feedback stays via stats + review
  queue.
- **Web: game-switch alert** — new `GameSwitchAlert` toast (amber,
  dismissible) after switching collection games, reminding to re-adjust the
  feeder tube wall; mounted in all three scanner layouts.
- **Web: select label fixes** — `SelectValue` now renders the human label
  (not the raw value) for condition field/operator/value selects, the
  collection-switcher game select, and the collections page game select.
- **Firmware/scan tuning:** `CARD_SETTLE_DELAY_MS` 300 → 500 (fewer
  mid-slide/blurred captures).
- **Docs:** "Flash the firmware" build phase moved earlier (before servo
  mounting), IR sensor short-throw calibration note added, and a full
  wiring diagram image added to the Build → Wiring page.

### Behavior notes

- The upstream global `Toaster` removal was **not** taken — we mount sonner's
  `<Toaster />` exactly once and rely on it for toasts.
- `AppLoadingGate` (full-screen splash) was **not** taken — our local,
  single-org app loads fast and already has inline skeletons.
- Pagination resets to page 0 on search/filter/sort/collection changes.

### How to revert

1. Revert `resolve.ts` to unwrapped adapters and delete `cache.ts`.
2. Remove `minMatchPercent` from `CardFilters` + the three `EMPTY_FILTERS`,
   the filter-sort block, the popover slider, and delete `slider.tsx`.
3. Restore `isNew`/`newestScanId`/`AnimatePresence` in `card-grid.tsx`,
   `scanned-card-item.tsx`, `monitor.tsx` if the animation is wanted back.
4. Delete `GameSwitchAlert` and its three mounts; set
   `CARD_SETTLE_DELAY_MS` back to 300.
5. Remove the SelectValue children in `condition-row.tsx`,
   `collection-switcher.tsx`, `collections.tsx`.
6. Move the firmware phase back in `assembly.tsx`, drop the IR note, and
   remove the wiring-diagram section + image from `wiring.tsx`.

---

## Item 51 — Configurable match thresholds + per-game alert dismissal (web)

**Status:** implemented, committed (this commit).

### Why

Item 50 brought upstream's view-only "Min. match" filter. The review queue
had the same concept hardcoded (`REVIEW_DISTANCE = 0.18`, i.e. pause below
82%), but different games score matches differently and a fixed threshold
mis-fires on some TCGs. Making the runtime thresholds adjustable — and adding
an auto-reject floor — turns the filter concept into automation.

### What changed

- **Review threshold slider** — Scanner menu → Scanner → "Review below %"
  replaces the hardcoded 82% pause point. Persisted in localStorage
  (`reviewMatchPercent`, default 82). Close-alternative matches still always
  pause.
- **Auto-reject floor slider** — "Auto-reject below %" (default 0 = off):
  cards below the floor are routed straight to the catch-all bin without
  pausing, keeping the line moving during unattended bundle runs. A toast
  reports each auto-rejection. Persisted in localStorage
  (`autoRejectMatchPercent`).
- **Per-game alert dismissal** — the game-switch feeder-tube alert remembers
  dismissed games (localStorage) so it only reappears when switching to a
  game you haven't dismissed.
- **Tailwind v4 lint fix** — `bg-gradient-to-br` → `bg-linear-to-br` (4 files)
  to clear the remaining Zed diagnostic.

### Behavior notes

- Auto-rejected cards are never added to the collection and don't set the
  duplicate guard, so a re-feed of the same card scans normally.
- Both sliders live in the Scanner submenu next to "Review low-confidence"
  and use the same drag pattern as the camera Zoom slider.

### How to revert

1. Restore the hardcoded `REVIEW_DISTANCE` check in `use-card-scanner.ts`
   and remove the two persisted settings + auto-reject branch.
2. Remove the two sliders from `scanner-menu.tsx` and their props through
   `card-scanner.tsx`.
3. Revert `game-switch-alert.tsx` to the always-show dismissal; restore
   `bg-gradient-to-br` if wanted.

---

## Item 52 — Scan-rate telemetry, per-game thresholds, monitor pagination, feeder retry (web)

**Status:** implemented, committed (this commit).

### Why

No-new-hardware speed/reliability pass. The machine isn't assembled yet, so
this batch is about making tuning measurable, keeping each TCG's match
thresholds independent, and removing two rough edges (monitor grid rendering
every card; a single feeder hiccup pausing the whole line).

### What changed

- **Live scan-rate telemetry** — `use-scanned-cards` records each completed
  scan timestamp and exposes a rolling 60-second rate (`scanRatePerMin`) +
  last-scan time. ScanStats now shows **Live rate** (scans/min, with a
  decaying 5 s tick so it drops when the line idles) and **Last scan**
  ("X.Xs ago"), alongside the existing session stats. This makes firmware
  delay tuning measurable when the machine is built.
- **Per-game match thresholds** — review-below and auto-reject-below
  settings are now keyed by game (`reviewMatchPercent:<gameKey>`), so each
  TCG keeps its own tuned values and switching collections reloads them.
- **Monitor page pagination** — the live-session grid now pages at 96
  cards/page (same as the main grid) instead of rendering every card.
- **Feeder retry-once** — a `detected:false` feeder timeout now retries
  once (toast + 400 ms) before pausing, absorbing single-card hiccups;
  the pause only happens if the retry also times out.

### Behavior notes

- Existing users keep their current thresholds: the old unqualified
  localStorage keys are no longer read, but the new per-game keys default
  to the same 82% / 0% values.
- fp16 DirectML embedding was benchmarked and **not** adopted — identical
  to fp32 on this GPU (375 ms vs 372 ms mean), so `vectorize.ts` stays fp32.

### How to revert

1. Remove `scanRatePerMin`/`lastScanAt` from `use-scanned-cards.tsx`,
   `types.ts`, and the two stat cards in `scan-stats.tsx`.
2. Restore the unqualified localStorage keys in `use-card-scanner.ts`.
3. Revert the pagination in `monitor.tsx`.
4. Remove the retry branch in `card-scanner.tsx` `handleFeed`.

---

## Item 53 — decksift.local access + software-only speed/reliability batch (web + server + firmware)

**Status:** implemented, committed (this commit).

### Why

Make the app reachable at a friendly hostname and squeeze speed/reliability
out of the existing hardware before the machine is built. Two hard facts
shaped this: Web Serial only works in a **secure context**, so `decksift.local`
needs HTTPS (not just a hosts entry); and fp16 DirectML embedding benchmarked
identical to fp32 on this GPU (item 52), so embedding stays fp32.

### What changed

- **decksift.local access** — `scripts/ssl-setup.mjs` downloads mkcert,
  issues + trusts (per-user Root store, no admin) certs for
  decksift.local/localhost/127.0.0.1; Vite serves HTTPS when the certs exist
  and listens on all interfaces; `VITE_API_URL` is now empty (same-origin
  via the Vite `/api` proxy), so any hostname/LAN IP works; the API CORS
  accepts a comma-separated `WEB_URL` list. README/SETUP document the hosts
  entry + cert step. (Localhost still works as a fallback.)
- **Pipelining step 1 — queued feed (firmware + web)** — the firmware now
  queues a `{"feeder": true}` command received while another operation is
  running (replying only when the queued feed completes, with the original
  command id), plus `{"cancelFeed": true}` to drop a pending feed. The web
  requests the next card **up front**, right after sending the bin command,
  instead of waiting for the route ACK — the next card starts moving the
  moment the route finishes, and routing failures cancel the queued feed.
  (Full concurrent feed-during-route stays a machine-validation step per
  PLAN.md.)
- **Runtime-tunable route delays (firmware + web)** — `DELAY_CARD_ENTER /
  DELAY_PADDLE / DELAY_PUSH` are now a persisted `TimingConfig` (EEPROM
  version 2) settable via `{"setTimingConfig": ...}` and exposed as a
  **Routing Timing** panel on the Calibrate page — tune with a stopwatch
  from the browser, no re-flash.
- **HNSW index tuning** — `cards_embedding_idx` rebuilt with
  `m=32, ef_construction=128` (migration 0007; note drizzle 0.45 passes
  `with()` keys through literally, so the option must be `ef_construction`).
- **Auto-backup on server start** — `backup-db.mjs backup-if-stale <hours>`
  (skips if a newer backup exists or Postgres is down); `start-server.cmd`
  calls it with 24 h before booting the API.
- **Serial retry with backoff** — `sendCommandWithResponse(data, timeout,
  retries)` retries with linear backoff for idempotent commands only;
  `clearDevice` now retries once. Bin routing stays single-shot (a retried
  bin command could double-route).
- **Scan-phase breakdown** — the scanner records settle + search latency per
  card and shows a live "last card: Xs (settle Nms · search Nms)" pill under
  the camera, making commissioning tuning measurable.
- **Price refresh status + action** — `GET /api/cards/price-status` shows
  when the collection's card data was last updated; `POST
  /api/cards/refresh-prices` force re-fetches (raw adapter, caches bypassed)
  up to the 200 most recent cards, paced; the stats panel shows updated-ago
  and a Refresh button.

### Behavior notes

- Users of the pre-built bundle see the same app on localhost; the HTTPS
  certs only affect `decksift.local`/`localhost` serving.
- Firmware EEPROM config version bumped to 2 — old persisted calibration is
  ignored once (falls back to factory defaults); re-save calibration after
  flashing.
- Queued feeds wait within the web's existing 10 s feed timeout; a jammed
  route can time that out and disable auto-feed exactly as a normal feed
  timeout would.

### How to revert

1. Revert `vite.config.ts`, `index.ts` CORS, `.env*` API base; delete
   `scripts/ssl-setup.mjs` and `.local/certs`.
2. Revert the pending-feed/cancelFeed firmware + the up-front feed in
   `use-scanned-cards.tsx`.
3. Revert `TimingConfig`/EEPROM v2/`setTimingConfig` (firmware) and the
   Routing Timing panel (web).
4. Drop migration 0007 and restore the default HNSW index params in schema.
5. Remove `backup-if-stale` from `backup-db.mjs`/`start-server.cmd`.
6. Remove the retries param + clearDevice retry; the timing pill; the
   price-status/refresh routes and the stats-panel UI.

---

*Template for future entries:*

## Item N — <short title> (area)

**Status:** planned / implemented, uncommitted / committed `<hash>`.

### Why
### What changed
### Behavior notes
### How to revert
