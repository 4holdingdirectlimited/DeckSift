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

---

*Template for future entries:*

## Item N — <short title> (area)

**Status:** planned / implemented, uncommitted / committed `<hash>`.

### Why
### What changed
### Behavior notes
### How to revert
