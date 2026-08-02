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

*Template for future entries:*

## Item N — <short title> (area)

**Status:** planned / implemented, uncommitted / committed `<hash>`.

### Why
### What changed
### Behavior notes
### How to revert
