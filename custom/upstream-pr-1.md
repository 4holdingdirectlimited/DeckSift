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
