# DeckSift — Arduino firmware & build docs (`arduino/main`)

This folder contains the firmware and build documentation for the **DeckSift TCG card sorter** — a hopper-fed, Arduino-driven machine that physically routes scanned trading cards into one of seven bins.

| File | Purpose |
| --- | --- |
| `main.ino` | The firmware — **one universal sketch** that runs on several boards (see below). |
| `board-config.h` | Board abstraction: EEPROM init, I2C pins, interrupt attach, IR pin defaults. |
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

## Supported boards (universal firmware)

One sketch, several controllers — `board-config.h` hides the small
differences (EEPROM emulation, I2C pins, interrupt attach), so you just pick
the board in the Arduino IDE / PlatformIO and flash:

| Board | Status | Notes |
| --- | --- | --- |
| **ESP32-S3** | ✅ Compiles + flashing docs; ⚠️ wiring not yet commissioned | DeckSift's primary going forward. Flashing settings below; wiring/power/logic-level guide in `CONTROLLERS.md`. |
| **Arduino Uno R4 Minima** | ✅ Reference build (compiles + wired) | The original controller; real EEPROM. |
| **RP2040 / Pico** | ✅ Compiles (3 % flash); ❌ not commissioned | Flash-emulated EEPROM (`EEPROM.begin`). See `CONTROLLERS.md` before wiring. |
| **STM32** | ✅ Compiles (GenF4); ❌ not commissioned | Flash-emulated EEPROM. See `CONTROLLERS.md` before wiring. |
| **Classic Uno/Nano** | ⚠️ Too little RAM | Sketch needs ~6 KB SRAM; the ATmega328P has 2 KB. |

> ⚠️ **Compiling ≠ supported.** Until a board has been wired and fully
> calibrated, treat it as experimental — the sketch is portable, but the
> machine wiring is only proven on the Uno R4. Read **`CONTROLLERS.md`**
> (logic levels, pins, power) before building a non-Uno machine.

## Flashing the firmware

1. Install the **Arduino IDE** (or arduino-cli).
2. Install the required libraries via **Library Manager**:
   - **ArduinoJson**
   - **Adafruit PWM Servo Driver** (also pulls in Adafruit BusIO)
3. Select your board + COM port (settings below), open and upload `main.ino`.
4. Open the **Serial Monitor at 9600 baud** — after the board resets you should see:

   ```json
   {"status":"ready"}
   ```

5. In the web app, connect the controller via **Web Serial**, then calibrate at `/app/calibrate` (see `BUILD.md` → Calibrate from the app).

### ESP32-S3 — recommended Tools menu settings

These matter on real hardware (Web Serial needs a native USB serial port):

| Setting | Value | Why |
| --- | --- | --- |
| Board | **ESP32S3 Dev Module** | Generic S3 board |
| USB CDC On Boot | **Enabled** | Exposes the native USB serial port the browser's Web Serial connects to |
| USB Firmware On Boot | **Disabled** (default) | |
| Upload Mode | **UART0 / Hardware CDC** | UART0 needs a USB-serial chip (e.g. the dev kit's CP2102); Hardware CDC flashes over the native port |
| Flash Size | **16 MB** (if your module has it) or **8 MB** | Match your module's flash — larger = more room for OTA later |
| Partition Scheme | **Default 4 MB with spiffs** (fine) | The sketch is ~350 KB; any scheme works |
| CPU Frequency | **240 MHz** | Default |
| I2C pins | GPIO **8** (SDA) / **9** (SCL) | PCA9685 bus — override with `-DI2C_SDA=n` if your wiring differs |
| Upload Speed | **921600** | Faster flashing |

Equivalent `platformio.ini` (PlatformIO):

```ini
[env:esp32s3]
platform = espressif32
board = esp32-s3-devkitc-1
framework = arduino
build_flags =
  -DARDUINO_USB_CDC_ON_BOOT=1
  -DI2C_SDA=8
  -DI2C_SCL=9
monitor_speed = 9600
```

> Uno R4 / RP2040 / STM32 need no special settings — Web Serial works via
their built-in USB serial.

## Quick test after first power-on

With the external servo supply connected, send over serial:

```json
{"test": true}
```

This cycles every bottom and paddle open, sweeps all pushers left then right, resets to neutral, briefly spins the feeder, and replies `{"status":"test_complete"}`.

## Pin and channel summary (full details in `BUILD.md`)

- **IR sensors** (active-LOW, internal pull-up): Module 1 gate → `D2`, Module 2 gate → `D3`, Module 3 gate → `D4`, Hopper throat → `D5`
- **PCA9685** I²C to Arduino `SDA`/`SCL`, logic `VCC` → `5V`, `GND` → `GND`
- **PCA9685 channels**: `0` = LED 1 (scan light), `1` = LED 2 (green, operating), `2` = LED 3 (red, fault), `3` = LED 4 (orange, comms fault), `4–6` = Module 1 (bottom, paddle, pusher), `7–9` = Module 2, `10–12` = Module 3, `13` = Feeder, `14–15` spare
- **Servo power**: external 5 V PSU (4–10 A) into PCA9685 `V+`, with the PSU ground tied to **both** PCA9685 `GND` and Arduino `GND` (common ground is mandatory)

## Webcam

Primary: **EMEET C60E 4K** — the higher resolution gives holo detection and
the embeddings more detail to work with. Recommended: autofocus off (fixed
focus on the scan plane), 1080p or 4K capture, moderate and consistent
lighting.

The original build used a Logitech C920 (Auto Focus: Off · Focus: 50% · Auto
Exposure: On · Low Light Compensation: On · Auto White Balance: On ·
Brightness: 140 · Contrast: 140 · Saturation: 160 · Sharpness: 130).
