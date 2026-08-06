# Serial protocol — `main.ino`

The firmware communicates over USB serial at **9600 baud**, one JSON object per line. The web app uses the Web Serial API; anything can talk to it (Serial Monitor, scripts, etc.).

On ESP32-S3 boards the same protocol is also served over a **WebSocket on port 81** when Wi-Fi is configured (see [Wi-Fi / WebSocket transport](#wi-fi--websocket-transport-esp32-s3-only) below) — both transports speak the same JSON, so the web app can drive the machine over USB or Wi-Fi interchangeably.

**Frame format:** newline- (`\n` or `\r`) terminated JSON. Lines longer than 256 characters are discarded.

## Wi-Fi / WebSocket transport (ESP32-S3 only)

The ESP32 firmware build can join your LAN and serve the identical JSON protocol over a WebSocket:

- **Configure once:** send `{"wifi":{"ssid":"…","password":"…"}}` (usually over USB on first setup). The credentials are stored in EEPROM and the board joins the network on every boot.
- **Address:** the board registers mDNS as `decksift-board.local` and listens for WebSockets on **port 81** — `ws://decksift-board.local:81` (use the IP if mDNS isn't available). Change `WIFI_HOSTNAME` in the sketch per machine for multi-rig setups.
- **Handshake:** when a WebSocket client connects, the firmware sends the same `{"status":"ready","proto":2}` boot line it sends on USB reset, so the web app's connect flow (ready → protocol check → mechanical test) is identical on both transports.
- **Replies:** every line the firmware emits (command replies, boot ready, async jam alerts) goes to USB serial **and** is broadcast to any connected WebSocket client. Id-correlated replies keep the two transports unambiguous.
- **OTA:** with Wi-Fi configured, the Arduino IDE can flash updates over the network (Sketch → Upload Using a Network Port). The orange comms LED is lit during an OTA update.
- **Not breaking USB:** boards without Wi-Fi (Uno R4, Pico, STM32) compile without this section; the USB flow is unchanged.

## Command ids (request/response correlation)

Every command may carry an optional numeric `"id"` field. When present, the firmware echoes it on **every reply to that command**:

```json
{"bin": 3, "id": 17}
{"status":"routed","bin":3,"id":17}
```

The web app uses this to correlate responses to requests instead of assuming "the next line is the answer". Messages that are **not** replies to a command — the boot `{"status":"ready"}` line and asynchronous `{"error":"jam",...}` alerts — never carry an id, so they can never be mistaken for a command's response.

Commands without an `id` are answered without one (backward compatible).

## Boot

On reset the board replies with its status and the protocol version (used by
the web app to detect app/firmware mismatches):

```json
{"status":"ready","proto":2}
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

### Liveness check

```json
{"ping": true}
```

Replies immediately — the web app uses this as a heartbeat to detect a hung
or unresponsive board within seconds:

```json
{"status":"pong"}
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

### LEDs (channels 0–3)

```json
{"led": 1, "on": true}   // LED 1 = scan light (ch0)
{"led": 2, "on": true}   // LED 2 = green “operating” (ch1)
{"led": 3, "on": true}   // LED 3 = red “machine fault” (ch2)
{"led": 4, "on": true}   // LED 4 = orange “software/comms fault” (ch3)
```

`led` is 1–4, mapped to channels 0–3.

- **LED 1 (ch0) — scan light** — the angled holo-detection light, driven by
  the web app for two-frame foil scans (frame with light off → toggle → frame
  with light on).
- **LEDs 2–4 (ch1–3) — status lamps** — the firmware drives these itself
  (green while an operation runs, red on jam/timeout/fault, orange on bad
  JSON or an oversized line). The web app mirrors the same state in the UI
  and re-asserts it over serial.

Replies:

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

**Queued feed (pipelining):** if a feed arrives while another operation is
running, the firmware queues it and replies **only when the queued feed
completes** (with the original command id) — so the caller sees the card
arrive rather than a "busy" error. This is what lets the web app request the
next card while the current one is still being routed.

```json
{"cancelFeed": true}
```

Drops a still-pending queued feed (used when routing fails so the next card
must not be pulled). Does not stop a feed already in flight. Replies
`{"status":"ok"}`.

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

### Set routing timing (delays, persisted with saveConfig)

```json
{"setTimingConfig":{
  "cardEnterMs":300,
  "paddleMs":300,
  "pushMs":600
}}
```

Runtime-tunable replacements for the old compile-time `DELAY_*` constants:
- `cardEnterMs` — time for the card to settle after the target bottom opens (50–2000)
- `paddleMs` — time for the paddle to engage (50–2000)
- `pushMs` — time for the pusher to complete its stroke (100–3000)

Values are clamped to the bounds above and echoed back in the reply:

```json
{"status":"ok","timing":{"cardEnterMs":300,"paddleMs":300,"pushMs":600}}
```

Send `{"saveConfig": true}` afterwards to persist across reboots.

### Save config to EEPROM

```json
{"saveConfig": true}
```

Persists the current module + feeder config to EEPROM so a reboot (e.g. a
power blip mid-run) restores the tuned values. Note that `setConfig` and
`setFeederConfig` already save automatically. Replies:

```json
{"status":"saved"}
```

### Reset config

```json
{"resetConfig": true}
```

Restores factory defaults in RAM and EEPROM and returns all servos to
neutral. Replies:

```json
{"status":"reset"}
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

### Configure Wi-Fi (ESP32-S3 only)

```json
{"wifi":{"ssid":"MyWiFi","password":"secret"}}
```

Stores the credentials in EEPROM and joins the network in the background
(safe while the machine is running). `ssid` must be 1–32 chars, `password`
≤ 63 chars. Replies:

```json
{"status":"ok","wifi":{"saved":true,"ssid":"MyWiFi"}}
```

Once connected the firmware announces its address over both transports:

```json
{"status":"wifi","ip":"192.168.1.50"}
```

### Read Wi-Fi status (ESP32-S3 only)

```json
{"getWifi": true}
```

Replies with the saved network and current connection state:

```json
{"status":"ok","wifi":{"ssid":"MyWiFi","connected":true,"ip":"192.168.1.50","hostname":"decksift-board","wsPort":81}}
```

### Forget Wi-Fi (ESP32-S3 only)

```json
{"wifiForget": true}
```

Erases the credentials from EEPROM and disconnects from the network. Replies `{"status":"ok"}`.

## Events & errors

The firmware can emit these without a request:

| Message | Meaning |
| --- | --- |
| `{"status":"ready","proto":2}` | Boot complete — `proto` is the protocol version the app uses to detect mismatches |
| `{"error":"jam","module":N}` | A card has sat at module N's (1–3) sensor for > 20 s with no routing command in progress (idle-time jam watch) |
| `{"error":"recovered","module":N}` | Emitted once on boot if a card was already resting at module N's sensor (e.g. power loss mid-run) |
| `{"error":"aborted: jam detected","aborted":true}` | An operation was aborted mid-way (jam reported or watchdog deadline) and all servos returned to neutral |
| `{"error":"invalid JSON"}` | Line failed to parse |
| `{"error":"unknown command"}` | Valid JSON but no recognized field |
| `{"error":"bin must be 1-7"}` / `{"error":"module must be 1-3"}` / `{"error":"servo must be bottom, paddle, or pusher"}` / `{"error":"invalid position"}` / `{"error":"led must be 1 to 4"}` / `{"error":"ssid must be 1-32 characters"}` / `{"error":"password must be at most 63 characters"}` | Bad arguments |

## Notes

- **Transports:** every line goes to USB serial; on ESP32 with Wi-Fi it is also
  broadcast to WebSocket clients (port 81, mDNS `decksift-board.local`). See
  the [Wi-Fi section](#wi-fi--websocket-transport-esp32-s3-only) at the top.
- Motion waits are **interruptible** — the jam watch runs *during* operations
  (not just between them), and each command has a watchdog budget
  (`commandGuardStart`). On a jam or deadline the operation aborts to neutral
  with `{"error":"aborted: jam detected","aborted":true}`.
- Configuration (`setConfig`, `setFeederConfig`) is persisted to **EEPROM** —
  both apply to RAM *and* save, so a reboot restores the tuned values.
  `{"saveConfig": true}` and `{"resetConfig": true}` manage persistence
  explicitly. Stored data is version-guarded: if the firmware's config layout
  changes (or a servo swap invalidates old values), stale data is ignored and
  factory defaults are used.
- `runFeeder()` checks the module 1 sensor **before** the hopper sensor, so the last card in an empty hopper still routes correctly.
- The jam watch only runs between commands — routing/feeding blocks `loop()` for their duration.
