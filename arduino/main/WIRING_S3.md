# ESP32-S3 wiring — `ESP32-S3-DevKitC-1` (CH343 bridge)

This page is the **DeckSift wiring guide for the ESP32-S3-DevKitC-1** — the
common "ESP32-S3 Dev Module" dev board with a **CH343 USB-serial bridge** and
dual-row 38-pin headers. It is the reference for the ESP32-S3 build of
`main.ino` (DeckSift's primary controller).

> **First, identify your board.** The canonical board is the Espressif
> [ESP32-S3-DevKitC-1](https://docs.espressif.com/projects/esp-idf/en/latest/esp32s3/hw-reference/esp32s3/user-guide-devkitc-1.html)
> (ESP32-S3-WROOM-1 module). Many compatible clones exist — the wiring below
> applies to any board with the same 38-pin DevKitC-1 layout. **The silkscreen
> prints the GPIO number next to every pin — trust the silkscreen over any
> diagram**, including this one.

## Logic levels (read this before anything else)

| Item | Value |
| --- | --- |
| ESP32-S3 I/O | **3.3 V** — feeding 5 V into a GPIO can damage the chip |
| 5 V tolerant inputs? | **NO** |
| Servo signals | 5 V (correct) — the PCA9685 drives its outputs at its `V+` supply, not at logic VCC |
| PCA9685 logic VCC | 3.3 V (from the board's 3V3 pin) |
| IR sensor modules | use **3.3 V-compatible** modules, or a 1 kΩ/2 kΩ divider on their outputs if powered at 5 V |

Full details + per-board comparison: [`CONTROLLERS.md`](CONTROLLERS.md).

## Pin map used by the firmware

`board-config.h` defaults these for ESP32-S3 (all overridable at build time
with `-D<NAME>=n`):

| Macro | GPIO | Used for | DevKitC-1 header |
| --- | --- | --- | --- |
| `IR_PIN_MODULE1` | **GPIO 6** | Module 1 gate sensor (active-LOW) | J1 pin 8 |
| `IR_PIN_MODULE2` | **GPIO 7** | Module 2 gate sensor | J1 pin 9 |
| `IR_PIN_MODULE3` | **GPIO 10** | Module 3 gate sensor | J1 pin 18 |
| `IR_PIN_HOPPER` | **GPIO 11** | Hopper throat sensor | J1 pin 19 |
| `I2C_SDA` | **GPIO 8** | PCA9685 SDA | J1 pin 14 |
| `I2C_SCL` | **GPIO 9** | PCA9685 SCL | J1 pin 17 |

Why these pins: GPIO 0/3/45/46 are strapping pins (affect boot mode) and
GPIO 3 is also JTAG — the defaults work, but 6/7/10/11 avoid **every**
special-function pin and are all interrupt-capable. GPIO 8/9 are plain I²C
pins on the S3 (not to be confused with the ESP32's classic I²C pins).

## DevKitC-1 header layout (38-pin)

Two rows of 19 pins, numbered from the USB end. **J1 is the left row**
(when the USB port faces you, board text upright), **J2 the right row**.

### J1 — left header (top → bottom)

| Pin | GPIO / net | DeckSift connection |
| --- | --- | --- |
| 1 | GND | common ground |
| 2 | 3V3 | PCA9685 VCC (logic) |
| 3 | 5V | — (leave free; logic runs from 3V3) |
| 4 | GND | common ground |
| 5 | GND | common ground |
| 6 | GPIO 4 | — spare |
| 7 | GPIO 5 | — spare |
| 8 | **GPIO 6** | **IR Module 1 → OUT** |
| 9 | **GPIO 7** | **IR Module 2 → OUT** |
| 10 | GPIO 15 | — spare |
| 11 | GPIO 16 | — spare |
| 12 | GPIO 17 | — spare |
| 13 | GPIO 18 | — spare |
| 14 | **GPIO 8** | **PCA9685 SDA** |
| 15 | GPIO 3 | strapping/JTAG — do not use |
| 16 | GPIO 46 | strapping — do not use |
| 17 | **GPIO 9** | **PCA9685 SCL** |
| 18 | **GPIO 10** | **IR Module 3 → OUT** |
| 19 | **GPIO 11** | **IR Hopper → OUT** |

### J2 — right header (top → bottom)

| Pin | GPIO / net | DeckSift connection |
| --- | --- | --- |
| 1 | GPIO 12 | — spare |
| 2 | GPIO 13 | — spare |
| 3 | GPIO 14 | — spare |
| 4 | GPIO 21 | — spare |
| 5 | GPIO 47 | — spare |
| 6 | GPIO 48 | — spare |
| 7 | GPIO 35 | — spare |
| 8 | GPIO 36 | — spare |
| 9 | GPIO 37 | — spare |
| 10 | GPIO 38 | — spare |
| 11 | GPIO 39 | — spare |
| 12 | GPIO 40 | — spare |
| 13 | GPIO 41 | — spare |
| 14 | GPIO 42 | — spare |
| 15 | GPIO 2 | — spare |
| 16 | GPIO 1 | — spare |
| 17 | GPIO 0 | strapping — do not use |
| 18 | RX0 (GPIO 44) | UART0 RX — in use by the USB bridge, do not reuse |
| 19 | TX0 (GPIO 43) | UART0 TX — in use by the USB bridge, do not reuse |

Also on the board: **5V / 3V3 / GND / EN / BOOT** pads at the top near the
USB connector, the **BOOT** and **EN (reset)** buttons, and the bridge USB
port. GPIO 19/20 are the native-USB pins (behind the other USB-C on some
revisions) — don't reuse them as general I/O.

## Full wiring list

### PCA9685 servo driver (I²C)

| PCA9685 pin | Connect to | DevKitC-1 header |
| --- | --- | --- |
| `VCC` | board **3V3** (logic supply, 3.3–5 V OK) | J1 pin 2 |
| `GND` | common ground | J1 pin 1/4/5 |
| `SDA` | **GPIO 8** | J1 pin 14 |
| `SCL` | **GPIO 9** | J1 pin 17 |
| `V+` | **external 5 V PSU (4–10 A)** — the servo rail | — |
| `OE` | GND (enable always on) | — |

### IR sensors (active-LOW, module OUT pulls the pin LOW when a card is present)

| Sensor | OUT → | Power |
| --- | --- | --- |
| Module 1 gate | GPIO 6 (J1 pin 8) | 3.3 V + GND (or 5 V with a divider) |
| Module 2 gate | GPIO 7 (J1 pin 9) | 3.3 V + GND |
| Module 3 gate | GPIO 10 (J1 pin 18) | 3.3 V + GND |
| Hopper throat | GPIO 11 (J1 pin 19) | 3.3 V + GND |

The firmware enables the internal pull-ups, so an open-collector output works
with no extra resistor.

### LEDs — via PCA9685 channels (no GPIOs used)

| Channel | LED | Purpose | Wiring |
| --- | --- | --- | --- |
| ch0 | LED 1 | **Scan light** — angled holo-detection light, toggled by the web app for two-frame foil scans | PCA9685 OUT0 → LED + current-limit resistor (220–470 Ω for an indicator LED) → GND |
| ch1 | LED 2 | Green "operating" | as above |
| ch2 | LED 3 | Red "machine fault" | as above |
| ch3 | LED 4 | Orange "software/comms fault" | as above |

PCA9685 outputs are **open-drain, ~25 mA max** — fine for indicator LEDs and
a small scan LED with a resistor. For a **brighter scan light**, drive it from
the 5 V rail through a small MOSFET (e.g. 2N7000: gate ← ch0 via 220 Ω, drain
← LED−, source ← GND).

### Servos — PCA9685 channels 4–13 (SG90s, 5 V rail)

| Channel | Servo | Channel | Servo |
| --- | --- | --- | --- |
| ch4 | Module 1 bottom trapdoor | ch9 | Module 2 pusher |
| ch5 | Module 1 paddle | ch10 | Module 3 bottom trapdoor |
| ch6 | Module 1 pusher | ch11 | Module 3 paddle |
| ch7 | Module 2 bottom trapdoor | ch12 | Module 3 pusher |
| ch8 | Module 2 paddle | ch13 | **Feeder** (360° continuous rotation) |

Signal wires go to the PCA9685 OUT pins (the driver handles the 5 V signal
level from its `V+` rail). Power the servos from the **same external 5 V PSU**
that feeds `V+`.

## Power

1. **Logic:** board powered via USB (the on-board regulator makes 3.3 V for
   the chip and the PCA9685 VCC). 5 V/500 mA from USB is fine — the servos do
   **not** draw from USB.
2. **Servos:** external **5 V PSU (4–10 A)** → PCA9685 `V+`. Never power the
   servos from the board's 5V pin.
3. **Common ground (mandatory):** PSU GND → PCA9685 GND → board GND. Missing
   this is the #1 cause of twitchy servos and random resets.
4. **Bulk capacitance:** 1000–2200 µF across the servo rail is cheap insurance
   against brownouts that corrupt an in-flight routing sequence.
5. **Brownout protection** (ESP32 core): keep the default `Brownout` enabled —
   the firmware's watchdog already aborts cleanly to neutral on a fault.

## Flashing + serial

- **This board has a USB-serial bridge (CH343)** → keep the Arduino IDE
  defaults: **USB CDC On Boot: Disabled** and **Upload Mode: UART0 / Hardware
  CDC**. `Serial` maps to UART0 through the bridge; flashing and Web Serial
  both use that port. (Native-USB-only boards are the exception — see
  `CONTROLLERS.md`.)
- Board: **ESP32S3 Dev Module** · Flash Size: match your module (8/16 MB) ·
  Upload Speed: 921600.
- To force a fresh boot: hold **BOOT**, tap **EN**, release BOOT — then flash.

## Wi-Fi / OTA (this board)

With the Wi-Fi firmware build, this board also joins your LAN (mDNS
`decksift-board.local`, WebSocket port 81) and accepts Arduino IDE updates
over the network. Configure it from the browser: **Calibrate → Wi-Fi & OTA**.
See `SERIAL_PROTOCOL.md` for the commands and `BUILD.md` for the setup walkthrough.

## Quick checklist

- [ ] All IR sensor OUTs land on GPIO 6/7/10/11 (J1 pins 8/9/18/19)
- [ ] PCA9685 SDA/SCL on GPIO 8/9 (J1 pins 14/17), VCC on 3V3, never 5V
- [ ] Servo rail: PCA9685 `V+` ← external 5 V PSU; PSU GND tied to board GND
- [ ] No 5 V logic ever fed into a GPIO
- [ ] No connection on GPIO 0/3/46 (strapping) or GPIO 43/44 (UART bridge)
- [ ] LEDs on PCA9685 ch0–3 via resistors (ch0 = scan light)
