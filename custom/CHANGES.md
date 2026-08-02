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

*Template for future entries:*

## Item N — <short title> (area)

**Status:** planned / implemented, uncommitted / committed `<hash>`.

### Why
### What changed
### Behavior notes
### How to revert
