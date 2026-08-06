# Controllers — wiring, power, and support status

One firmware sketch (`main.ino` + `board-config.h`) runs on several
controllers. This page is the honest wiring guide per board: **compiling is
not the same as being wired right**, and the 3.3 V boards need different
connections than the 5 V Arduino.

> **ESP32-S3 DevKitC-1 owners:** a complete pin-by-pin wiring guide for the
> common CH343-bridged dev board is in [`WIRING_S3.md`](WIRING_S3.md) — header
> layout, PCA9685, IR sensors, LEDs, power, and flashing.

## Support status (be honest about what's verified)

| Board | Compiles | Flashing docs | Wiring verified on hardware |
| --- | --- | --- | --- |
| **ESP32-S3** | ✅ (CI + local) | ✅ (`README.md` → ESP32-S3 settings) | ⚠️ Partially — flashed + protocol + EEPROM persistence verified on a CH343 dev board; full machine wiring not commissioned |
| **Arduino Uno R4 Minima** | ✅ (CI + local) | ✅ | ✅ — the original reference build |
| **RP2040 / Pico** | ✅ (local) | — | ❌ not wired/commissioned |
| **STM32 (GenF4)** | ✅ (local) | — | ❌ not wired/commissioned |

Until a board has been wired and a full calibration run completed, treat
machines on it as **experimental** — the sketch is portable, but the machine
wiring has only been proven on the Uno R4. The ESP32-S3 has been verified
flashing + speaking the protocol + persisting calibration on a real dev
board (see below).

## The one thing that matters most: logic levels

| Board | I/O voltage | 5 V tolerant inputs? |
| --- | --- | --- |
| Arduino Uno R4 Minima | 5 V | Yes (it *is* 5 V) |
| **ESP32-S3** | **3.3 V** | **NO — feeding 5 V into a GPIO can damage the chip** |
| RP2040 / Pico | 3.3 V | NO |
| STM32 (GenF4) | 3.3 V | NO (check the specific part; many are not) |

Consequences for the machine wiring:

1. **IR sensors** — use 3.3 V-compatible IR sensor modules (most modern
   modules accept 3.3–5 V). If yours is powered at 5 V, its *output* is also
   5 V → add a voltage divider (two resistors, e.g. 1 kΩ / 2 kΩ) or a level
   shifter between the sensor OUT and the board's GPIO. The firmware reads
   them with internal pull-ups at the board's I/O voltage, so a 3.3 V module
   works unchanged.
2. **Servo signals stay 5 V (correct)** — the PCA9685's PWM outputs are
   driven at its `V+` supply (the external 5 V PSU), not at logic VCC. So the
   SG90s get proper 5 V signals regardless of the controller. **Do not** feed
   the PCA9685's outputs back into the controller.
3. **PCA9685 logic** — power `VCC` from the board's 3.3 V on a 3.3 V
   controller (the PCA9685 logic is 3.3–5 V), keep `V+` on the external 5 V
   PSU for the servos, and tie the PSU ground to the board ground AND the
   PCA9685 ground (common ground is mandatory — the #1 cause of twitchy
   servos).

## Pin map differences

`board-config.h` defaults the IR pins to GPIO 2–5 (valid on every board) and
the PCA9685 I2C to the board's default `Wire` pins — except ESP32-S3, where
I2C is explicitly GPIO 8 (SDA) / 9 (SCL). Every pin is overridable at build
time with `-D<NAME>=n`:

| Macro | Uno R4 | ESP32-S3 (default) | ESP32-S3 (recommended build) | Pico | STM32 |
| --- | --- | --- | --- | --- | --- |
| `IR_PIN_MODULE1` | D2 | 2 | **6** | 2 | your pins |
| `IR_PIN_MODULE2` | D3 | 3 | **7** | 3 | ↑ |
| `IR_PIN_MODULE3` | D4 | 4 | **10** | 4 | ↑ |
| `IR_PIN_HOPPER` | D5 | 5 | **11** | 5 | ↑ |
| `I2C_SDA` | A4 (default) | 8 | 8 | default | your pins |
| `I2C_SCL` | A5 (default) | 9 | 9 | default | ↑ |

Why the recommended ESP32-S3 pins: GPIO 3 is the JTAG pin and GPIO 0/3/45/46
are strapping pins on the S3 — the defaults work as inputs, but the
recommended set (6/7/10/11) avoids every special-function pin and is fully
interrupt-capable.

Example override (PlatformIO):

```ini
build_flags =
  -DIR_PIN_MODULE1=6 -DIR_PIN_MODULE2=7 -DIR_PIN_MODULE3=10 -DIR_PIN_HOPPER=11
```

(Arduino IDE: Tools → "Extra flags for build" / `-D` entries, or edit the
`#ifndef` defaults in `board-config.h`.)

## Power

- **External 5 V PSU (4–10 A)** into PCA9685 `V+` — the servo rail. The
  SG90s can pull 250 mA each and the feeder more; the USB 5 V on a dev board
  is not enough for 10 servos.
- ESP32-S3 dev boards: power the logic from USB (5 V) — the on-board LDO
  makes 3.3 V for the chip and the PCA9685 VCC.
- Common ground: PSU GND → PCA9685 GND → board GND. Always.
- Bulk capacitance (1000–2200 µF) on the servo rail is cheap insurance
  against brownouts that corrupt an in-flight sequence.

## Boot / serial notes

- **ESP32-S3 — two serial paths**, pick the one your board actually exposes:
  - **USB-serial bridge (CH340/CH343/CP2102) — the common dev board**: keep
    the Arduino IDE defaults (**USB CDC On Boot: Disabled**) so `Serial` maps
    to UART0 through the bridge. Flash + Web Serial both use that port.
    Verified on a CH343 dev board.
  - **Native USB only** (no bridge chip): enable **USB CDC On Boot** so
    `Serial` maps to the native USB port.
- **ESP32-S3 — Wi-Fi / WebSocket / OTA (optional, additive):** with saved
  credentials the firmware joins your LAN (mDNS `decksift-board.local`,
  WebSocket port 81) and accepts Arduino IDE network updates. The browser can
  then drive the machine over Wi-Fi instead of USB. Configure from the app at
  Calibrate → **Wi-Fi & OTA**; protocol details in `SERIAL_PROTOCOL.md`.
  Boards without Wi-Fi (Uno R4, Pico, STM32) are unaffected.
- **RP2040 / STM32**: native USB CDC enumerates as a serial port — no extra
  settings. STM32 "USB on Boot" is enabled by default on most generic boards.
- Uno R4: real EEPROM, no special settings.
- The firmware waits up to 5 s for the USB serial to enumerate, then proceeds
  — a headless power-on won't hang.

## Adding a new board

1. Add its `ARDUINO_ARCH_*` branch to `board-config.h` (EEPROM init, I2C
   pins, interrupt attach).
2. Compile it locally (`arduino-cli compile --fqbn <core>:<board>`).
3. Add a row to the support table above — and only mark wiring "verified"
   after a real machine has been calibrated on it.
