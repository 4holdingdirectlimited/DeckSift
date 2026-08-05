# Build guide — DeckSift card sorter

Parts list and assembly instructions for the physical sorting unit: a hopper feeds cards one at a time through three stacked routing modules, each capable of dropping a card into one of two side bins or passing it down to the next module — seven bins total, driven by an Arduino Uno R4 Minima over I²C.

- **Firmware:** `arduino/main/main.ino` — **one universal sketch** for multiple boards (`board-config.h` abstracts EEPROM, I2C pins and interrupts). Tested targets: **Arduino Uno R4 Minima** and **ESP32-S3** (the DeckSift primary going forward — more flash/RAM headroom and native-USB Web Serial). Also compiles for RP2040/Pico and STM32 with no sketch changes.
- **Enclosure:** `3d model/Card Sorter.f3d` (Fusion 360 source) or `3d model/card_sorter.3mf` (mesh, slicer-ready) — the original design by dishwasher-detergent. DeckSift's revised parts live alongside as `3d model/card_sorter_decksift.3mf` — both files are the same machine; use whichever matches your print setup. 3D files are CC BY-NC-SA 4.0 (see `3d model/LICENSE`).
- **Calibration:** `/app/calibrate` in the web app
- **Photo references:** the original interactive guide at [mault.xyz/build](https://mault.xyz/build) shows assembly photos for most steps (`/instructions/*.jpg` in the repo)
- **Revised print kit (planned):** DeckSift will add a Bambu Lab quantity kit that organizes the same parts for faster, more efficient printing than the original layout — see `custom/PLAN.md`. The repo currently carries the original `3d model/` files only.

---

## 1. Bill of materials

Quantities match the firmware exactly — 3 modules × 3 servos, 1 feeder, 4 IR sensors, and the PCA9685's 16 channels: 10 servos, 4 LED channels (0–3), and channel 14 for the optional scan light.

### Electronics

| Qty | Part | Notes |
| --- | --- | --- |
| 1 | White LED + 100–220 Ω resistor (scan light) | Optional but recommended for holo detection — wired to PCA9685 ch0 (firmware LED 1). See “Scan light” wiring below. |
| 1 | Arduino Uno R4 Minima (ABX0080) | Runs `main.ino`; USB connection to the host computer for Web Serial |
| 1 | Adafruit PCA9685 16-channel 12-bit PWM/servo driver | I²C servo driver — drives all 10 servos |
| 9 | SG90 micro servo, positional (180°) | 3 per module × 3 modules — bottom trapdoor, paddle gate, pusher |
| 1 | SG90 servo, modified for continuous rotation | Feeder — drives cards out of the hopper into module 1 |

### Sensing

| Qty | Part | Notes |
| --- | --- | --- |
| 4 | Reflective/obstacle IR sensor module (3-pin: VCC, GND, digital OUT) | One at the gate of modules 1, 2, 3, plus one in the hopper throat |

### Power

| Qty | Part | Notes |
| --- | --- | --- |
| 1 | 5 V regulated power supply, 4–10 A | Dedicated servo bus power into the PCA9685 `V+` terminal — **do not power 10 servos off the Arduino's onboard 5 V** |
| 1 | USB-A–to–USB-C cable | Arduino Uno R4 Minima ↔ host computer |
| 1 | DC barrel jack or screw-terminal pigtail | Adapts the PSU output to the PCA9685's `V+` / `GND` terminal |

### Structural

| Qty | Part | Notes |
| --- | --- | --- |
| 1 set | 3D-printed enclosure & module housings | Print from `card_sorter.3mf` (mesh, slicer-ready) or `Card Sorter.f3d` (Fusion 360 source) |
| — | PLA or PETG filament | Quantity per your slicer's estimate for the model above |
| 6 | G20 o-ring | Fitted onto the feeder roller for grip on the card face |

### Fasteners & wiring supplies

| Qty | Part | Notes |
| --- | --- | --- |
| 22 | M3×6 screw | 14 attach each bin base to the housing; 8 attach the base panels to the base |
| 8 | M3 nut | Paired with the base panel M3×6 screws |
| 2 | M3×8 screw | Attaches the hopper tube |
| 33 | M2×4 screw (11 per module) | Per module: flapper (bottom/sides), pusher arms, and IR sensor mounts |
| 8 | M2×6 screw | Mounts the Arduino and PCA9685 servo driver board to the base panels |
| 10 | Servo horn screw (included with servos) | Secures the horn to the shaft |
| 1 roll | 22–26 AWG hookup wire | IR sensor wiring |
| ~50 | Dupont connectors | Only needed if connecting your own connectors to the IR sensor wires; otherwise solder directly to the sensor pads |

---

## 2. Wiring

Everything hangs off one I²C bus (PCA9685) and four digital input pins (IR sensors). The PCA9685's logic side runs off the Arduino's 5 V; its `V+` servo rail must come from the external supply, and **that supply's ground must be tied back to the Arduino's ground** — a floating servo ground is the most common reason a freshly wired unit won't move.

### I²C bus

| PCA9685 pin | Arduino Uno R4 Minima |
| --- | --- |
| `SDA` | `SDA` |
| `SCL` | `SCL` |
| `VCC` (logic) | `5V` |
| `GND` | `GND` |

### Servo power

| From | To |
| --- | --- |
| External 5 V PSU, `+` | PCA9685 `V+` terminal block |
| External 5 V PSU, `−` | PCA9685 `GND` terminal block **and** Arduino `GND` |

### IR sensors

All four read **active-LOW** (pin goes low when a card is present) using the Arduino's internal pull-up — wire the sensor's digital `OUT` straight to the pin, no external pull-up resistor needed.

| Sensor | Arduino pin |
| --- | --- |
| Module 1 gate | `D2` |
| Module 2 gate | `D3` |
| Module 3 gate | `D4` |
| Hopper throat | `D5` |

### PCA9685 channel map

| Ch. | Assignment |
| --- | --- |
| 0 | **LED 1 — scan light** (firmware `{"led":1,"on":bool}`) — angled holo-detection light |
| 1 | LED 2 — green “operating” indicator (firmware-driven) |
| 2 | LED 3 — red “machine fault” indicator (firmware-driven) |
| 3 | LED 4 — orange “software/comms fault” indicator (firmware-driven) |
| 4 | Module 1 — bottom |
| 5 | Module 1 — paddle |
| 6 | Module 1 — pusher |
| 7 | Module 2 — bottom |
| 8 | Module 2 — paddle |
| 9 | Module 2 — pusher |
| 10 | Module 3 — bottom |
| 11 | Module 3 — paddle |
| 12 | Module 3 — pusher |
| 13 | Feeder (continuous rotation) |
| 14 | Spare |
| 15 | Spare |

### Scan light

The scan light is a white LED mounted at an **angle to the card** (roughly
30–45° off the camera axis) so its reflection grazes the foil surface. The web
app toggles it (firmware LED 1 / PCA9685 ch0) between two captures: a frame
with the light off, then a frame with it on. Holo cards change **color**
between the frames (diffraction grating); matte cards only get brighter. The
light-on frame is also the better-lit image for card matching itself.

Wiring (PCA9685 outputs are open-drain — they sink current, so the LED sits
between `V+` and the channel pin):

| From | To |
| --- | --- |
| PCA9685 `V+` | LED anode (via 100–220 Ω resistor) |
| PCA9685 ch14 (`OE`-side output) | LED cathode |

A single high-brightness white LED is fine on the channel directly (≈25 mA).
For a bigger light bar, drive it through a small N-channel MOSFET on the same
pin. Keep the LED beam off the camera lens to avoid glare in the scan region.

---

## 3. Assembly

Eight phases, structural work first.

### Phase 1 — Print the structural parts

1. Slice and print the enclosure and three module housings from `card_sorter.3mf` (or re-export from `Card Sorter.f3d`).
   - PLA is fine for the housings; PETG if the unit will sit somewhere warm.
2. Dry-fit each module housing before inserting any electronics — sand or adjust any tight servo pockets now. *(Photos: `top_down_view_device.jpg`, `corner_view_device.jpg`, `front_view_device.jpg`)*
3. Mount the Arduino and PCA9685 servo driver board to the base panels with 8 M2×6 screws.
4. Attach the base panels to the base with 8 M3×6 screws and 8 M3 nuts.
   - Do this **after** the Arduino and PCA9685 are mounted to the panels — the boards are much harder to reach once the panels are on the base.

### Phase 2 — Mount the servos

1. Install the bottom, paddle, and pusher servo into each of the 3 module housings (9 servos total).
   - Center each servo at its neutral pulse before screwing down the horn, so mechanical range matches the firmware's open/closed travel. *(Photo: `top_down_view_module.jpg`)*
2. Attach the bottom flapper to the bottom servo's horn with M2×4 screws, servo held at its closed pulse so the flapper seats flush across the card path.
   - This is the trapdoor a card falls through to reach the next module, or the current one on a match. *(Photo: `bottom_paddle.jpg`)*
3. Before attaching anything, command each paddle servo through its full range to confirm the linkage can reach fully open without binding. Then, with the servo held at its closed position, attach the left and right flapper to the shared linkage with M2×4 screws (one pair per module) so both sit flush and even.
   - One paddle servo drives both flappers together — they open and close as a pair, not independently. Fit the flappers closed first; the exact open-position pulse gets fine-tuned later from the Module Calibration Grid. *(Photo: `side_paddles.jpg`)*
4. Before fitting the arm, sweep the pusher servo through its full left-to-right range and find its true mechanical middle. With the servo held at that middle position, attach the card pusher arm to the horn with M2×4 screws so it sits centered between the left and right bins.
   - Fitting the arm off-center biases the push distance to one side — the exact left/right pulses get fine-tuned later from the Module Calibration Grid. *(Photo: `pusher_arms.jpg`)*
5. Fit 6 G20 o-rings onto the feeder roller.
   - These give the roller grip on the card face — space them evenly along the roller's length.
6. Attach the roller to the feeder module. *(Photo: `feeder_roller.jpg`)*
7. Install the continuous-rotation feeder servo to the roller, at the base of the hopper. *(Photo: `feeder_servo.jpg`)*
8. Attach the wall piece to the tube that guides cards from the hopper to the feeder roller.
   - When mounting the wall, attach it to the feeder module first, then put 2 cards below the wall and slide it down before tightening it into place. *(Photo: `feeder_tube_wall.jpg`)*

### Phase 3 — Mount the IR sensors

1. Fix one IR sensor at the gate of each module (1, 2, 3), aimed across the card path. *(Photo: `ir_sensor.jpg`)*
2. Fix the fourth IR sensor in the hopper throat, just above the feeder.
   - This one tells the feeder when the hopper is empty — placement matters more than the module sensors.

### Phase 4 — Wire the electronics

1. Wire the PCA9685 to the Arduino's I²C bus (`SDA`/`SCL`) and `5V`/`GND` for logic power. (See Wiring section above.)
2. Wire all 10 servos into PCA9685 channels 0–13 per the channel map.
   - There are wire channels, that use zip ties, in the side of the base to help keep everything neat.
3. Wire the 4 IR sensors to `D2`–`D5`.
   - For the power and ground, you will have to combine 4 wires into one, either with a breadboard or by twisting and soldering them together.
4. Bring the external 5 V supply into the PCA9685 `V+`/`GND` terminal, and tie its ground to the Arduino's ground.
   - Skipping the common ground is the #1 cause of servos that twitch but never move correctly.

### Phase 5 — Flash the firmware

1. In the Arduino IDE, install the **ArduinoJson** and **Adafruit PWM Servo Driver** libraries (Library Manager → search each by name).
2. Select board **Arduino Uno R4 Minima**, select the correct port, then upload `arduino/main/main.ino`.
3. Open the Serial Monitor at 9600 baud and confirm you see `{"status":"ready"}` after the board resets.

### Phase 6 — First power-on test

1. With the external servo supply connected, send `{"test": true}` over serial.
   - Cycles every bottom and paddle open, sweeps all pushers left then right, resets to neutral, then briefly spins the feeder.
2. Watch each module during the test — confirm nothing binds or grinds at the end of its travel.
   - If a servo strains at open or closed, its housing cutout likely needs adjusting before calibration.

### Phase 7 — Calibrate from the app

1. Connect the Arduino to the app via Web Serial, then open `/app/calibrate`.
2. **Module Calibration Grid** — set the open/closed pulse for each bottom and paddle, and left/neutral/right for each pusher, module by module.
3. **Feeder Calibration Panel** — tune feed speed, pulse/pause timing, and settle duration against your actual hopper.
4. **IR Sensor Panel** — verify all 4 sensors report present/absent correctly with a card in hand.
5. **Bin Routing Controls** — send a test card to each of the 7 bins in turn and confirm it lands correctly.

### Phase 8 — Load and run

1. Load the hopper and confirm the feeder stops pulsing once the hopper IR reads empty.
2. Run a full scan-to-bin pass end to end before leaving the unit unattended.

---

## 4. Firmware default values (for reference)

| Parameter | Default |
| --- | --- |
| Module servo pulses (all modules) | bottom/paddle closed `150`, open `307`; pusher left `150`, neutral `307`, right `460` |
| Feeder config | speed `400`, duration `3000 ms`, pulse `80 ms`, pause `50 ms`, settle `150 ms` |
| Routing delays | card-enter `300 ms`, paddle `300 ms`, push `600 ms` |
| IR wait timeout | `3000 ms` |
| Module 1 jam alert timeout | `20000 ms` |
| PWM clamp (setServoPosition) | `120–490` |

Pulses are calibrated per-installation from the app — the values above are only starting points.

## 5. Webcam (reference, Logitech C920)

Auto Focus: Off · Focus: 50% · Auto Exposure: On · Low Light Compensation: On · Auto White Balance: On · Brightness: 140 · Contrast: 140 · Saturation: 160 · Sharpness: 130

## 6. Need help?

- Interactive guide with photos: https://mault.xyz/build
- Upstream repo & issues: https://github.com/dishwasher-detergent/mault
