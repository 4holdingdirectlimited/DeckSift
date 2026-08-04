# DeckSift — Arduino firmware & build docs (`arduino/main`)

This folder contains the firmware and build documentation for the **DeckSift TCG card sorter** — a hopper-fed, Arduino-driven machine that physically routes scanned trading cards into one of seven bins.

| File | Purpose |
| --- | --- |
| `main.ino` | The firmware. Flashes to an Arduino Uno R4 Minima. |
| `BUILD.md` | Complete build guide: bill of materials, wiring, assembly, first power-on, calibration. |
| `SERIAL_PROTOCOL.md` | JSON command/response reference for talking to the firmware over USB serial. |

> Upstream source (the machine's original design): [github.com/dishwasher-detergent/mault](https://github.com/dishwasher-detergent/mault) · interactive build guide: [mault.xyz/build](https://mault.xyz/build) · 3D models: `3d model/Card Sorter.f3d` (Fusion 360) and `3d model/card_sorter.3mf` (slicer-ready) in the upstream repo. The firmware here is DeckSift's modified version of that base.

## What the machine does

A hopper feeds cards one at a time through three stacked routing modules. Each module can drop a card into one of two side bins (via a paddle gate and pusher) or pass it down to the next module (via a bottom trapdoor). Bin 7 is a catch-all with all three trapdoors open:

| Module | Bins |
| --- | --- |
| Module 1 | Bin 1, Bin 2 |
| Module 2 | Bin 3, Bin 4 |
| Module 3 | Bin 5, Bin 6 |
| (catch-all) | Bin 7 |

Each module has **3 positional SG90 servos** (bottom trapdoor, paddle gate, pusher) plus an **IR sensor**; a **continuous-rotation SG90** runs the feeder. All servos are driven by one **PCA9685** over I²C. The web app sends `{"bin": N}` over USB serial and the Arduino runs the full routing sequence.

## Flashing the firmware

1. Install the **Arduino IDE** (or arduino-cli).
2. Install the required libraries via **Library Manager**:
   - **ArduinoJson**
   - **Adafruit PWM Servo Driver** (also pulls in Adafruit BusIO)
3. Select board **Arduino Uno R4 Minima** and the correct COM port.
4. Open and upload `main.ino` from this folder.
5. Open the **Serial Monitor at 9600 baud** — after the board resets you should see:

   ```json
   {"status":"ready"}
   ```

6. In the web app, connect the Arduino via **Web Serial**, then calibrate at `/app/calibrate` (see `BUILD.md` → Calibrate from the app).

## Quick test after first power-on

With the external servo supply connected, send over serial:

```json
{"test": true}
```

This cycles every bottom and paddle open, sweeps all pushers left then right, resets to neutral, briefly spins the feeder, and replies `{"status":"test_complete"}`.

## Pin and channel summary (full details in `BUILD.md`)

- **IR sensors** (active-LOW, internal pull-up): Module 1 gate → `D2`, Module 2 gate → `D3`, Module 3 gate → `D4`, Hopper throat → `D5`
- **PCA9685** I²C to Arduino `SDA`/`SCL`, logic `VCC` → `5V`, `GND` → `GND`
- **PCA9685 channels**: `0–3` = LEDs 1–4, `4–6` = Module 1 (bottom, paddle, pusher), `7–9` = Module 2, `10–12` = Module 3, `13` = Feeder, `14` = **scan light** (LED 5, the angled holo-detection light)
- **Servo power**: external 5 V PSU (4–10 A) into PCA9685 `V+`, with the PSU ground tied to **both** PCA9685 `GND` and Arduino `GND` (common ground is mandatory)

## Webcam

Primary: **EMEET C60E 4K** — the higher resolution gives holo detection and
the embeddings more detail to work with. Recommended: autofocus off (fixed
focus on the scan plane), 1080p or 4K capture, moderate and consistent
lighting.

The original build used a Logitech C920 (Auto Focus: Off · Focus: 50% · Auto
Exposure: On · Low Light Compensation: On · Auto White Balance: On ·
Brightness: 140 · Contrast: 140 · Saturation: 160 · Sharpness: 130).
