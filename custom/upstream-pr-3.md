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
