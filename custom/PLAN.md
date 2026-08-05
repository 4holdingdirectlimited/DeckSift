# Plan — faster + more robust card sorter (Arduino Uno R4 Minima)

Goal: keep the existing Arduino hardware and make the machine **faster** (higher
throughput, less dead time between cards) and **more robust** (no silent hangs,
no lost calibration, recovers from jams/timeouts cleanly).

All line references are to `arduino/main/main.ino` as of upstream `a1dfa44`
(unchanged in our copy). This is a draft roadmap — pick items per priority; each
is independently implementable.

## Where the current firmware falls short

### 1. Blocking, delay-heavy sequence — ~~the #1 bottleneck and robustness issue~~ ✅ rebuilt

`routeCard()` and `runFeeder()` used to block `loop()` for the entire feed +
routing sequence. They're now a **non-blocking state machine** (`runMachine()` in
`main.ino`): every mechanical phase advances on a timestamp or a sensor edge,
so serial stays responsive mid-operation. `{"cancel": true}` aborts any phase
back to neutral, jam alerts abort immediately, and commands arriving mid-run
get a clean `{"error":"busy"}` instead of being silently delayed.

### 2. Polled IR instead of edge detection — ~~leaves speed on the table~~ ✅ rebuilt

Module 1's IR sensor is now **interrupt-driven** (`attachInterrupt` on
`IR_PIN_MODULE1`): the feeder stops the instant the beam is crossed, and the
motor runs **continuously** (no pulse/pause cycling — the old
`pulseDuration`/`pauseDuration` feed cycling is gone). Module 2/3 sensors stay
polled, which is fine for routing waits.

### 3. Calibration is RAM-only — lost on every reboot ✅ built

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

## Revised Bambu Lab print kit (planned)

DeckSift's own contribution to the *printable* side of the v1 machine: a
Bambu Lab quantity kit that reorganizes the original parts (same geometry,
from `3d model/`) into faster, more efficient print batches — fewer
color/material changes and better bed utilization. Not yet in the repo; the
original `Card Sorter.f3d` / `card_sorter.3mf` files remain the canonical
parts, with full credit to the original designer (see `README.md` Credits).

- [ ] Produce the quantity sheet + reorganized plate layout for Bambu Studio
- [ ] Add the kit files under `3d model/` alongside the originals
- [ ] Wire the kit into the `/build` guide and `arduino/main/BUILD.md`

## Suggested order of work

1. ~~Fixed serial buffer + oversized-line error (5)~~ ✅
2. ~~EEPROM persistence for calibration (3)~~ ✅
3. ~~Non-blocking state machine (1)~~ ✅
4. ~~Interrupt-driven IR feeding (2)~~ ✅ — the throughput win
5. Watchdog budgets per phase (7), full jam coverage (6) — partially done (whole-op watchdog + jam abort exist; per-phase budgets are implicit in each phase's timeout)
6. Concurrent/pipelined motions — last, once the machine is deterministic

## Machine build commissioning checklist

For when the physical sorter is assembled. Verify each link independently before
end-to-end tuning so a timing problem isn't mistaken for a vision or routing
problem. Software pre-reqs are noted inline.

1. **Camera / vision** (EMEET C60E 4K replacing the Logitech):
   - 4K stream at the capture crop; contour/perspective warp clean on a real
     card in the rig; no glare zone.
   - Time one full scan in the browser (capture → embed → match → UI). Compare
     with `pnpm bench:vectorize` (~380 ms DML on this machine).
   - RTX 3080 later: `VECTORIZE_DEVICE=dml` already works on NVIDIA; optional
     fp16 dtype; re-run the bench to confirm.
2. **Firmware timing** (measure, don't guess):
   - Actual feed time (hopper → module 1 IR) at the configured feeder speed.
   - Stopwatch each bin's sort path, then shrink `DELAY_*` constants safely.
   - Tune feeder speed/settle; verify no double-feed (two cards tripping IR).
3. **Pipeline** (the 2 s/card target):
   - Confirm the current serial flow is feed → scan → sort with NO overlap
     (verified in code, ~2.9–3.5 s/card) and time it on hardware.
   - Then implement the non-blocking state machine + pipeline feed (next card
     fed + scanned while the previous is being sorted). Target per-card
     ≈ scan + sort ≈ 1.7–2.2 s on shallow bins.
4. **Bundle workflow** (software now built — `custom/SETUP.md`):
   - 4-rarity bundle on bins 1–4 (or any rarity/bin mapping you set in the
     Bundle Mode panel); counts reach targets; duplicates → reject bin;
     bundle-complete pause; resume after restart. Remaining work is purely
     physical: verify the reject bin (catch-all bin 7) is where you expect and
     that bin routing lines up with the machine.
5. **Holo detection** (classifier thresholds need calibration):
   - The two-frame scan light is built (firmware LED 5 / PCA9685 ch14,
     smart skip if clearly matte). Wire the LED (see BUILD.md) and calibrate
     `FOIL_SECOND_FRAME_THRESHOLD` / `FOIL_DIFF_THRESHOLD` on real captures.
   - Collect labeled scans (manual foil toggle) during early runs; train the
     embedding classifier; verify on DBZ/One Piece foils — foil is a different
     product ID there, so detection feeds card identity, not just a badge.

## Related docs

- `custom/TCGS.md` — top-20 TCG plan, data-source status, adding games.
- `arduino/main/SERIAL_PROTOCOL.md` — current JSON contract (will grow: cancel, save/reset config, per-module jam timeouts).
- `arduino/main/BUILD.md` — wiring/BOM notes (PSU, capacitance, scan light).

## v2 machine — faster & more accurate sorting

> Full production review (materials, mass/stability, mechanism hardening,
> multi-machine architecture): **`HARDWARE_V2.md`**. The section below is the
> machine-level summary.

Ideas for a second build (or a major refit of this one). Goals: shorter
per-card time, fewer stripped parts, and sensor-confirmed motion instead of
blind timing.

### Servo upgrade: SG90 → MG90S

- **Why** — SG90 plastic gears strip under sustained pushing (the #1 field
  failure). MG90S has **metal gears + ~2.2 kg·cm torque** (vs ~1.8) at similar
  speed (~0.1 s/60°), so routes stay fast and repeatable for much longer.
- **Wiring** — pin-compatible drop-in (same PWM, 4.8–6 V). The higher stall
  current (~700 mA vs ~250 mA each) needs the servo rail's bulk capacitance
  bumped (2200 µF, see Power notes above) and the 5 V PSU sized for peak
  current, not steady state.
- **Consider also** — the R4 Minima's timers can drive up to ~12 servos
  natively; dropping the PCA9685 for direct timer PWM removes a driver stage
  and lets each servo run at its own calibration. (Keep PCA9685 for the LEDs
  + scan light.) Only worth it if the state-machine timing demands tighter
  control than the PCA9685's 1.6 kHz update gives.

### Card detection: faster, more reliable

Current: IR through-beam sensors polled every ~5 ms inside `interruptibleDelay`
while the feeder pulses — the card is only caught when a poll happens to see it,
and a full `delay()` cycle can be missed. Options for v2, best-first:

1. **Interrupt-driven edges** — `attachInterrupt` on the module-1 + hopper
   sensors (both already on interrupt-capable pins D2–D5). Stop the feeder the
   instant the beam is crossed; no polling, no missed edges. This is the
   single biggest speed win (feeder can run continuously instead of pulsed).
2. **Comparator front-end** — a Schmitt-trigger/op-amp stage (e.g. LM393)
   turns the analog sensor into a clean digital edge, eliminating the slow
   analog-transition zone where a card can sit half-detected. Cheap, bulletproof.
3. **Optical encoder on the feeder roller** — a slotted wheel + IR pair
   measures actual feed distance, so “card at module 1” is confirmed by
   distance *and* beam, not a fixed pulse time. Enables precise stop position
   and double-feed detection (encoder continues moving while the beam is
   already broken).
4. **Camera as feedback** — the scan camera already sees the card; a motion
   check in the capture region can confirm “arrived + settled” without extra
   hardware. Useful as a cross-check, not a primary sensor (slower loop).

### What stays (already in the roadmap above)

- Non-blocking state machine (section 1) — prerequisite for interrupt feeding.
- Per-phase watchdog budgets (section 7) — with faster motion, a missed edge
  must still abort safely.
- Pipelined feed (Speed items) — next card feeds while the previous routes.

### Target

With interrupt feeding + MG90S + pipelining: **~1.5–2 s/card** on shallow
bins (vs the current ~3 s baseline) with sensor-confirmed, jam-safe motion.
