# Plan — faster + more robust card sorter (Arduino Uno R4 Minima)

Goal: keep the existing Arduino hardware and make the machine **faster** (higher
throughput, less dead time between cards) and **more robust** (no silent hangs,
no lost calibration, recovers from jams/timeouts cleanly).

All line references are to `arduino/main/main.ino` as of upstream `a1dfa44`
(unchanged in our copy). This is a draft roadmap — pick items per priority; each
is independently implementable.

## Where the current firmware falls short

### 1. Blocking, delay-heavy sequence — the #1 bottleneck and robustness issue

`routeCard()` (L258–354) and `runFeeder()` (L140–190) block `loop()` for the
entire feed + routing sequence (seconds per card). Consequences:

- New serial commands are **not processed mid-routing** — no cancel, no status.
- `checkModule1Jam()` (L198–217) only runs *between* commands, so jam detection
  is blind while a card is in motion.
- All motion timing is blind `delay()` calls (`DELAY_CARD_ENTER/PADDLE/PUSH`
  = 300/300/600 ms) regardless of actual sensor events.

**Plan:** convert the routing pipeline to a **non-blocking state machine** run
from `loop()`. Each mechanical phase becomes a state that advances on a
timestamp or a sensor edge. Serial stays responsive; a `{"cancel": true}`
command can abort any phase back to neutral.

### 2. Polled IR instead of edge detection — leaves speed on the table

`runFeeder()` pulses the motor 80 ms on / 50 ms off and polls module 1's IR
every 2 ms (`delay(2)`). The card can only be caught when the poll happens to
sample it, and the pulsing means the roller is off half the time.

**Plan:** use **interrupt-driven IR edges** (`attachInterrupt`/GPIO IRQ) to stop
the feeder the instant the beam is crossed. Feeder can then run continuously
(speed-limited only by mechanics), and the settle behavior stays as-is.

### 3. Calibration is RAM-only — lost on every reboot

`{"setConfig": ...}` and `{"setFeederConfig": ...}` write only to RAM
(`moduleConfig` L64–68, `feederConfig` L80). Re-powering the unit reverts to
stock pulses, so a tuned machine must be re-calibrated after every power cycle.

**Plan:** persist `moduleConfig` + `feederConfig` to EEPROM (Uno R4 Minima has
8 KB). Load on boot in `setup()` (L580–595), add `{"saveConfig": true}` /
`{"resetConfig": true}` commands.

### 4. `String` + line buffer — slow drift toward heap fragmentation

`String inputBuffer` (L87) plus `String` use in `handleCommand` fragment the
heap over long sessions. On an always-on sorter this eventually causes weird
crashes.

**Plan:** replace with a fixed `char` buffer + index, and avoid `String`
construction in the parser. (`ArduinoJson`'s `JsonDocument` is fine.)

### 5. Serial framing is fragile

Commands are newline-delimited with a 256-char cap that **silently discards**
the whole line on overflow (L597–611), and a truncated line is just ignored.
No CRC, no ACK contract, so a dropped byte = silently lost command mid-run.

**Plan:** keep newline framing but respond to every command (already done for
known commands — add explicit ACK for every path), and drop oversized lines
with an `{"error":"line too long"}` instead of silence. Optionally add a
start-of-command marker (e.g. `>` prefix) so partial garbage can be flushed.

### 6. Jam/error coverage is module-1-only, idle-only

The jam watch covers only module 1 and only between commands.

**Plan:** generalize `checkModule1Jam()` to all modules and the hopper, and run
the watch from the state machine even mid-sequence. Report `{"error":"jam","module":N}`
per module with per-module timeout config.

### 7. No per-phase watchdog

`waitForCard()` (L49–56) and the feeder have timeouts, but a stalled servo or a
stuck paddle during a *motion* phase blocks forever (e.g. the 600 ms `DELAY_PUSH`
is fixed, but a physically jammed pusher isn't detected).

**Plan:** every state in the machine gets a budget; exceeding it returns to
neutral and reports an error. Consider an MCU-level watchdog reset as a last
resort (R4 Minima: software watchdog via the Renesas core is limited — a
loop-level supervisor is the practical option).

## Speed items (independent of robustness)

- **Concurrent motions** — start opening the next module's bottom while the
  current pusher retracts (currently strictly sequential).
- **Re-tune timing with real measurements** — `DELAY_CARD_ENTER` 300 /
  `DELAY_PADDLE` 300 / `DELAY_PUSH` 600 ms and feeder pulse 80 / pause 50 /
  settle 150 ms are starting points, not optimized. Measure actual fall/push
  times and shrink safely.
- **Pipeline feed** — with the state machine, the feeder can start pulling the
  next card while the previous card is still being pushed, bounded by sensor
  state rather than fixed delays.
- *(Optional)* raise serial to 115200 baud — commands are small so 9600 is not
  the bottleneck, but telemetry/status streaming would benefit. **Note:** the
  web app hardcodes 9600 in `packages/web/src/features/scanner/api/use-serial.tsx`,
  so baud changes must be coordinated there.

## Power / electrical robustness (hardware side)

- Bulk capacitance on the servo rail (e.g. 1000–2200 µF) to absorb SG90/MG90S
  inrush — cheap insurance against brownouts that corrupt an in-flight sequence.
- Verify common ground between PSU, PCA9685 and Arduino (already called out in
  `arduino/main/BUILD.md`).
- Consider a soft-start for the feeder (ramp pulse instead of slam to full speed).

## Suggested order of work

1. Fixed serial buffer + oversized-line error (5) — small, removes a real failure mode.
2. EEPROM persistence for calibration (3) — big daily-life win.
3. Non-blocking state machine (1) — unlocks everything else (cancel, mid-sequence jam watch, pipelining).
4. Interrupt-driven IR feeding (2) + timing re-tune — the actual throughput win.
5. Watchdog budgets per phase (7), full jam coverage (6).
6. Concurrent/pipelined motions — last, once the machine is deterministic.

## Related docs

- `arduino/main/SERIAL_PROTOCOL.md` — current JSON contract (will grow: cancel, save/reset config, per-module jam timeouts).
- `arduino/main/BUILD.md` — wiring/BOM notes (PSU, capacitance).
