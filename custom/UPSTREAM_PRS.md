# Upstream pull requests — status & ready-to-paste descriptions

Three firmware PRs back to the original project
(`dishwasher-detergent/mault`). Branches are pushed, compile-verified, and
ready to open. All three use **LED 1 (ch0) as the scan light** — no
spare-channel LED 5 wiring — so the LED story is consistent across PRs.

Open each with:
`https://github.com/dishwasher-detergent/mault/compare/master...4holdingdirectlimited:<branch>`
then "Create pull request".

Alternatively, with `gh` authenticated: `gh pr create --repo dishwasher-detergent/mault --head 4holdingdirectlimited:<branch> --base master --title "..." --body-file custom/upstream-pr-1.md` (or open all three with the commands at the bottom).

---

## PR 1 — `pr/fw-robustness`

**Title:** Harden firmware: id-correlated replies, fixed serial buffer, all-module jam watch, boot recovery

**Body:**

```markdown
## Why
The machine can lose a card to a silent failure: a dropped serial byte
mid-route, a jam nobody notices, or a power blip that leaves a card sitting
in the mechanism. Each of these previously just hung or dropped the command.

## What changed
- **Id-correlated replies** — every command may carry an optional `id`; all
  replies echo it, so the host can match responses even while asynchronous
  messages (jam alerts) arrive in between. No more mistaking one reply for
  another.
- **Fixed-size serial buffer** — the `String` accumulator is replaced by a
  fixed `char` buffer; oversized lines are discarded with a clean
  `{"error":"line too long"}` instead of silently truncating.
- **Jam watch on all modules** — a card sitting at any module gate for longer
  than the timeout (no routing command in flight) reports `{"error":"jam"}`,
  not just module 1.
- **Boot recovery report** — if the board boots with a card already at a
  gate (power loss mid-run), it reports `{"error":"recovered","module":N}` so
  the operator flushes the device before feeding.

## Testing
1. Flash to an Uno R4 Minima (libraries: ArduinoJson, Adafruit PWM Servo Driver).
2. Send `{"test":true,"id":1}` — the reply echoes `"id":1`.
3. Hold a card at a module gate for the jam timeout — expect `{"error":"jam","module":N}`.
4. Send an oversized line — expect `{"error":"line too long"}`.
```

---

## PR 2 — `pr/fw-config`

**Title:** Persist servo calibration to EEPROM and add a scan light (LED 1)

**Body:**

```markdown
## Why
Calibration was RAM-only: every reboot reverted a tuned machine to stock
pulses. Also, holo/foil detection needs a second, differently-lit capture —
the build guide's "spare" channel 14 LED was never wired by anyone.

## What changed
- **EEPROM calibration persistence** — `{"setConfig":...}` and
  `{"setFeederConfig":...}` save to EEPROM automatically; `{"saveConfig":true}`
  persists explicitly; `{"resetConfig":true}` restores factory defaults. A
  magic/version guard ignores stale data from older firmware.
- **Scan light on LED 1 (ch0)** — the holo-detection light now uses the
  on-board LED 1 channel instead of spare channel 14: `{"led":1,"on":true}`.
  Wiring stays on the existing PCB, no spare-channel cable. (LEDs 2-4 on
  ch1-3 remain free as indicator lamps.)
- Safe defaults while uncalibrated: module pulses are all within a few µs of
  each other so a freshly-flashed board cannot over-travel and strip a gear.

## Testing
1. Flash, then `{"setConfig":{"module":1,"bottomClosed":150,...}}`.
2. Reboot — the tuned values survive (`{"readConfig":true}` or observe motion).
3. `{"led":1,"on":true}` lights LED 1 on ch0.
```

> Note: this branch supersedes the earlier "scan light (LED 5)" version —
> the scan light moved to LED 1/ch0 to keep the wiring on existing hardware.

---

## PR 3 — `pr/fw-state-machine`

**Title:** Rebuild firmware as a non-blocking state machine with interrupt-driven feeding

**Body:**

```markdown
## Why
Feed/route/test/clear were blocking `delay()` sequences: serial froze for
the whole operation, so a jam mid-route was invisible until it timed out,
and the feeder could only pulse (polling IR) instead of running continuously.

## What changed
This is the firmware rework the other two PRs build toward — it includes the
robustness fixes (id-correlated replies, fixed serial buffer, jam watch) and
the config persistence + scan light from the sibling PRs, so this branch is
the complete modern firmware.

- **Non-blocking state machine** — every operation is a phase machine driven
  from `loop()`: `{"cancel":true}` aborts any phase to neutral, jam alerts
  abort immediately, commands arriving mid-run get a clean `{"error":"busy"}`,
  and a whole-operation watchdog replaces per-command deadlines.
- **Interrupt-driven module-1 IR** — the feeder stops the instant the beam is
  crossed (`attachInterrupt`), so the motor runs continuously instead of
  pulse/pause cycling. This is the biggest single throughput win.
- **Scan light on LED 1 (ch0)** for two-frame holo detection.

## Testing
1. Flash; confirm `{"status":"ready"}`.
2. `{"bin":1}` — watch the route run while `{"ping":true}` still answers
   mid-route.
3. Send `{"cancel":true}` mid-route — returns to neutral cleanly.
4. Feed: the feeder runs continuously and stops the moment the card reaches
   module 1's sensor.
5. Hold a card at a gate — jam alert aborts any active operation.
```

---

## Opening with `gh` (once authenticated)

```bash
gh pr create --repo dishwasher-detergent/mault \
  --head 4holdingdirectlimited:pr/fw-robustness --base master \
  --title "Harden firmware: id-correlated replies, fixed serial buffer, all-module jam watch, boot recovery" \
  --body-file custom/upstream-pr-1.md

gh pr create --repo dishwasher-detergent/mault \
  --head 4holdingdirectlimited:pr/fw-config --base master \
  --title "Persist servo calibration to EEPROM and add a scan light (LED 1)" \
  --body-file custom/upstream-pr-2.md

gh pr create --repo dishwasher-detergent/mault \
  --head 4holdingdirectlimited:pr/fw-state-machine --base master \
  --title "Rebuild firmware as a non-blocking state machine with interrupt-driven feeding" \
  --body-file custom/upstream-pr-3.md
```
