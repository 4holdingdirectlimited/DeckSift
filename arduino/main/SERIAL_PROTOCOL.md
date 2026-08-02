# Serial protocol — `main.ino`

The firmware communicates over USB serial at **9600 baud**, one JSON object per line. The web app uses the Web Serial API; anything can talk to it (Serial Monitor, scripts, etc.).

**Frame format:** newline- (`\n` or `\r`) terminated JSON. Lines longer than 256 characters are discarded.

## Boot

On reset the board replies:

```json
{"status":"ready"}
```

## Commands

### Route a card

```json
{"bin": 1}
```

Runs the full feed + routing sequence. `bin` must be 1–7:

| Bin | Route |
| --- | --- |
| 1 | Module 1: open paddle, push **left** |
| 2 | Module 1: open paddle, push **right** |
| 3 | Module 1 bottom open → Module 2, push **left** |
| 4 | Module 1 bottom open → Module 2, push **right** |
| 5 | M1 → M2 → Module 3, push **left** |
| 6 | M1 → M2 → Module 3, push **right** |
| 7 | All bottoms open (catch-all) |

On success:

```json
{"status":"routed","bin":1}
```

On failure (hopper empty / timeout), an error is emitted and all servos return to neutral:

```json
{"error":"empty: feeder hopper is out of cards","empty":true}
{"error":"timeout: feeder did not deliver card to module 1","empty":false}
{"error":"timeout: no card detected at module 2"}
{"error":"timeout: no card detected at module 3"}
```

### Mechanical test

```json
{"test": true}
```

Opens every bottom and paddle, sweeps all pushers left then right, resets to neutral, spins the feeder ~500 ms, cycles the 4 LED channels. Replies:

```json
{"status":"test_complete"}
```

### Reset to neutral

```json
{"neutral": true}
```

```json
{"status":"ok"}
```

### Flush the device

```json
{"clearDevice": true}
```

Opens every module's bottom trapdoor at once so any card resting in the mechanism drops through to the catch-all, then returns to neutral. Does **not** run the feeder (unlike `{"bin": 7}`). Replies:

```json
{"status":"cleared"}
```

### LEDs (channels 0–3, reserved for future builds)

```json
{"led": 1, "on": true}
```

`led` is 1–4. Replies:

```json
{"status":"ok","led":1,"on":true}
```

### Move a single servo — named position

```json
{"servo":"paddle","module":1,"position":"open"}
```

`servo`: `bottom`, `paddle`, or `pusher`. `module`: 1–3. `position`:
- bottom/paddle: `open` or `closed`
- pusher: `left`, `neutral`, or `right`

Replies after a 200 ms settle:

```json
{"status":"ok","servo":"paddle","module":1}
```

### Move a single servo — raw PWM (calibration preview)

```json
{"servo":"bottom","module":1,"value":220}
```

Writes the raw PWM pulse (clamped to 120–490) directly. Replies:

```json
{"status":"ok","servo":"bottom","module":1}
```

### Set module config (RAM only)

```json
{"setConfig":{
  "module":1,
  "bottomClosed":150,"bottomOpen":307,
  "paddleClosed":150,"paddleOpen":307,
  "pusherLeft":150,"pusherNeutral":307,"pusherRight":460
}}
```

All fields optional — omitted ones keep their current value. Replies:

```json
{"status":"ok","module":1}
```

### Run the feeder

```json
{"feeder": true}
```

Feeds until the module 1 IR detects a card, the hopper reads empty, or the feed duration elapses. Replies:

```json
{"status":"ok","detected":true,"empty":false}
```

### Feeder raw PWM (calibration preview, no auto-stop)

```json
{"feederValue": 400}
```

```json
{"status":"ok"}
```

### Stop the feeder

```json
{"feederStop": true}
```

Cuts the PWM signal entirely (the only reliable way to stop a 360° servo). Replies:

```json
{"status":"ok"}
```

### Set feeder config

```json
{"setFeederConfig":{
  "speed":400,
  "duration":3000,
  "pulseDuration":80,
  "pauseDuration":50,
  "settleDuration":150
}}
```

- `speed` — PWM pulse for forward motion
- `duration` — overall timeout (ms) before giving up
- `pulseDuration` — ms to run the motor per pulse (0 = continuous feed, no pulsing)
- `pauseDuration` — ms to pause between pulses (IR checked after each stop)
- `settleDuration` — ms to keep feeding after the IR first sees the card so it fully enters the module 1 mechanism

Replies:

```json
{"status":"ok"}
```

### Read IR sensors

```json
{"readIR": true}
```

Replies (booleans are `true` = card present):

```json
{"status":"ok","ir":[false,false,false],"hopper":true}
```

`ir[0..2]` = modules 1–3, `hopper` = cards remain in the feeder stack.

## Events & errors

The firmware can emit these without a request:

| Message | Meaning |
| --- | --- |
| `{"status":"ready"}` | Boot complete |
| `{"error":"jam","module":1}` | A card has sat at module 1's sensor for > 20 s with no routing command in progress (idle-time jam watch) |
| `{"error":"invalid JSON"}` | Line failed to parse |
| `{"error":"unknown command"}` | Valid JSON but no recognized field |
| `{"error":"bin must be 1-7"}` / `{"error":"module must be 1-3"}` / `{"error":"servo must be bottom, paddle, or pusher"}` / `{"error":"invalid position"}` / `{"error":"led must be 1 to 4"}` | Bad arguments |

## Notes

- All configuration (`setConfig`, `setFeederConfig`) is **RAM-only** — it resets on reboot. Defaults are compiled into the sketch (see `BUILD.md` → Firmware default values).
- `runFeeder()` checks the module 1 sensor **before** the hopper sensor, so the last card in an empty hopper still routes correctly.
- The jam watch only runs between commands — routing/feeding blocks `loop()` for their duration.
