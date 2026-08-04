# Hardware v2 — production-leaning review & multi-machine plan

This document reviews the physical sorter as it stands and lays out a v2 path
toward **small-scale production**: a sturdier, faster, more reliable machine,
and — long term — running **three machines + three cameras off one computer**,
concurrently, instead of building one bigger machine.

Current machine (v1) baseline, from `arduino/main/BUILD.md`:

- 3 stacked routing modules × 3 **SG90** servos (trapdoor, paddle, pusher) + 1
  continuous-rotation SG90 feeder — all on one PCA9685
- 4 reflective IR sensors (hopper throat + one per module gate), polled in
  firmware
- PLA/PETG printed structure, M2/M3 screws into plastic, 5 V 4–10 A PSU
- Routing delays: card-enter 300 ms · paddle 300 ms · push 600 ms (~3 s/card)

Companion docs: `PLAN.md` (firmware roadmap — non-blocking state machine,
interrupt feeding, watchdogs, the v2 servo/detection notes) and this page's
"Software" section for multi-machine support.

---

## 1. Material & manufacturing — from one-off prints to production

### 1.1 Material choice per part

PLA is fine for a hobby prototype but wrong for production: it creeps under
constant servo load, softens in a warm room (a card sorter near a window or a
laptop exhaust is plenty), and is brittle at the thin bosses around servo
screws. What to use instead:

| Material | Creep | Heat | Toughness | Print ease | Verdict for us |
| --- | --- | --- | --- | --- | --- |
| PLA | poor | poor (~55 °C) | brittle | easiest | keep for prototype only |
| PETG | ok | ok (~80 °C) | good | easy (no enclosure needed) | **minimum viable production material** |
| ABS | ok | good (~100 °C) | good | needs enclosed printer + fumes | good for housings; overkill on ease |
| ASA | ok | good | good | like ABS, UV-stable | best drop-in for ABS without the UV worry |
| Nylon / PA-CF | great | great | very tough | hard (drying, warping) | only for wear parts / arms |
| Injection mold | best | — | — | one-time tooling cost | the real production step (see 1.3) |

**Recommended v2 material map:**
- **Module housings + base:** ASA (or PETG if no enclosed printer). ASA prints
  like ABS, resists heat/creep/UV, and stays dimensionally stable under servo
  loads.
- **Pusher arms, flapper linkages, feeder roller core:** PETG or nylon — these
  take the most force.
- **Bearing/shaft bosses:** design in seats for brass heat-set inserts and
  press-fit bearings rather than printing the hole itself (see §3).
- **Print settings for production parts:** ≥4 perimeters, ≥40 % infill
  (gyroid), 0.2 mm layer height, **anneal PETG/ASA** after printing (bed- or
  oven-based) to relieve layer stress and improve interlayer strength.

### 1.2 Fasteners & assembly quality

The v1 BOM is 22× M3 + 33× M2 self-tapping into plastic. That's the classic
field-failure point — screws strip on the second rebuild.

- **Heat-set brass inserts (M2/M3)** in every screw boss the firmware touches
  (servo mounts, module stacking, base panels). Machines get torn down for
  calibration/jams; threaded inserts survive it.
- **Thread-locker** (blue Loctite) on servo-horn screws and any M3 that holds
  a moving part.
- **Cable management as a first-class feature:** a v2 base has a cable
  channel per module and a single connector (e.g. 2× IDC or a small
  Molex/Phoenix connector) per module so a module can be swapped in the field
  without re-wiring 10 servos. This is the difference between "one-off" and
  "serviceable in production".

### 1.3 Real production: injection molding

If we ever run, say, 10+ units, the **module housing is the part to mold**
(one housing × 3 per machine = high volume, moderately complex, consistent
dimensions beat every printed part). The base plate can stay laser-cut sheet
metal. Rule of thumb: injection molding starts to win when you need ≥ several
hundred of a part and the design is frozen. Until then, ASA/PETG printing +
brass inserts is the pragmatic step.

---

## 2. Stability & mass — the free throughput upgrade

A light PLA machine **shakes** at the moment a servo slams a pusher across.
That vibration does three bad things at higher speed: IR sensors get false
edges, the camera image blurs/rolls during the capture window, and card
settling takes longer because the stack is still ringing. A stable base fixes
all three — it's the cheapest way to shorten `DELAY_*` times.

**v2 stability plan:**
- **Mass under the machine, not on it:** a 6 mm laser-cut steel base plate
  (≈300×300 mm ≈ **4 kg**) or a paving-slab/plywood sandwich bolted to the
  printed base. Target ≥3–4 kg of dead weight below the modules.
- **Sorbothane / soft-silicone feet** (not hard rubber) under the plate, sized
  for the mass — decouples the machine from the desk and damps servo
  transients. Hard feet just pass the vibration through.
- **One rigid spine:** bolt the 3 modules to a single aluminum backplate
  (3–4 mm) instead of stacking each module on the plastic of the one below.
  Eliminates cumulative flex, keeps the card path straight, and keeps the
  camera mount rigid.
- **Lower the center of gravity:** put the PSU and Arduino under the base
  plate, not beside the machine.
- **Camera mount on the machine, not the desk:** a rigid arm off the
  backplate keeps the scan region fixed relative to the card plane; vibration
  is then common-mode (card and camera move together) and the capture stays
  sharp.

**Result:** with the mass + damping in place, `DELAY_CARD_ENTER` and the
settle times can be measured and shortened safely — the machine stops shaking
before the card does.

---

## 3. Mechanism hardening (the parts that wear)

- **Servos → MG90S** (metal gears, ~2.2 kg·cm): survives sustained pushing,
  pin-compatible (see `PLAN.md` v2 section for current draw/capacitance
  notes). For the pusher specifically, consider a metal-gear **MG996R**-class
  servo if the arm needs more authority — only where measured torque demands
  it, since they draw ~1 A each.
- **Bearings, not plastic-on-plastic:** the paddle linkage and pusher arm
  pivot on printed holes today. v2 seats **brass bushings or 623/624
  ball bearings** in those pivots. Result: consistent motion, no
  print-tolerance binding, and no hole-wear over thousands of cycles.
- **Metal pin through the flappers:** the shared paddle linkage is a
  screw-in-plastic joint; v2 uses a steel dowel pin + bearings so both
  flappers track evenly for the machine's lifetime.
- **Feeder (the real throughput bottleneck):** the G20 o-ring roller works but
  slips and double-feeds on glossy cards.
  - v2: a **silicone pinch roller** with an adjustable gap (two rollers, one
    driven) — precise single-card separation, better on foils.
  - Add a small **hopper agitator** (a servo wiggle or vibrator) so cards
    don't bridge at the throat.
  - An **encoder on the feeder** (slotted wheel + IR pair) measures feed
    distance — stop position becomes sensor-confirmed, and a second card
    feeding is detectable (encoder keeps moving while the beam is still
    broken).
- **Card path:** radiused guides, anti-static brushes at the hopper (foil
  cards + dry air = static cling), and a replaceable wear strip where the
  pusher face contacts cards.

---

## 4. Sensing & control for production reliability

Recap + production additions on top of `PLAN.md`:

1. **Interrupt-driven IR edges** (both `PLAN.md` and v2) — no polling, no
   missed edges; lets the feeder run continuously.
2. **Comparator front-end** (LM393) on the IR sensors — clean digital edges,
   immune to the sensor's analog transition zone.
3. **Confirm motion by sensor, not timer** — every phase completes on an edge
   or a watchdog budget, never on a fixed blind delay. This is what makes
   "faster" also mean "safer".
4. **Jam/EOF feedback:** module gate sensors already exist; wire the hopper
   sensor to also flag "empty hopper" to the operator (it does today) and add
   a **card-confirmed-at-bin** check where cheap (a fifth sensor per module
   isn't needed — the gate sensor + pusher position is enough).
5. **E-stop + cover interlock** for unattended production runs — a hard stop
   that also tells the app "machine halted, clear me".

---

## 5. Multi-machine: 3 machines, 1 computer

Long-term goal: sync + run **three machines and three cameras off the same
PC**, concurrently, sharing one card library — instead of a bigger single
machine.

### 5.1 Physical / electrical

| Concern | v1 (1 machine) | v2 (3 machines) |
| --- | --- | --- |
| USB | 1× serial + 1× camera | **Powered USB 3 hub**; 3× serial (Web Serial supports multiple ports) + 3× cameras |
| Camera bandwidth | 4K single | 3× **1080p MJPEG** (~4K over USB on three UVC cameras saturates the bus and starves the GPU-adjacent pipelines). 1080p is ample for card ID + holo |
| Servo power | 1× 5 V 4–10 A | **Per-machine 5 V PSU** (fault isolation; one dead rail doesn't take down the farm). 30+ MG90S servos across 3 rails |
| Control | 1× Uno R4 | 1× Uno R4 per machine — each is a self-contained sorter brain; the PC is the orchestrator |
| Vision | 1× EMEET C60E | 1× camera per machine on a rigid arm; per-machine scan-region calibration |

### 5.2 Software architecture (the real work)

Today the app assumes one machine: a single serial provider, a single camera,
a single active bundle run, org-scoped bins/scans. Multi-machine needs a
**station** concept:

- **`station_id` on the machine-facing entities** — scans, bin status, bundle
  runs (bundle **configs stay shared**: all machines can run the same
  recipe). Physical bins are per-machine; the card library, collections, and
  rules are shared.
- **One server, per-station state:** scan uploads carry `stationId`; the
  routing pipeline (`use-scanned-cards.tsx`) becomes a per-station instance —
  3 serial providers, 3 cameras, 3 bin-status strips, 3 bundle runs. A
  station switcher in the UI (or a 3-column "farm" layout on one screen).
- **The GPU is the shared bottleneck — and it's fine:** one SigLIP session
  embeds serially at ~0.4 s/card (DirectML). 3 machines at 2 s/card need
  ~1.5 embeds/s — under the ~2.5/s the single model sustains, so one GPU
  serves all three. Embeddings just queue; the sync's scan-aware pacing
  already keeps the desktop usable.
- **DB:** add `station_id` to scans + bundle runs (nullable — single-machine
  installs unaffected). No new tables otherwise.
- **Networking:** everything stays local (USB), no changes to sync/library.

### 5.3 Throughput math

| Config | Per-card | Per machine / hr | Farm / hr | 8-h shift |
| --- | --- | --- | --- | --- |
| v1 (current) | ~3 s | ~1,200 | 3× = 3,600 | ~29k |
| v2 (interrupt feed + MG90S + pipelined) | ~1.7 s | ~2,100 | 3× = 6,300 | ~50k |
| v2 with shorter bins (3-bin configs) | ~1.4 s | ~2,500 | 3× = 7,500 | ~60k |

So a 3-machine v2 farm sorts a **100,000-card backlog in ~2 shifts** — that's
small-scale production territory (a local game store's bulk buy-in, a
collection liquidation, etc.) without a conveyor-belt machine.

---

## 6. Phased roadmap

- **Phase 0 — finish v1 firmware** (from `PLAN.md`): non-blocking state
  machine, interrupt feeding, watchdogs. Proven on the current machine before
  any new hardware. *(This also de-risks every later phase — the same firmware
  runs on v2.)*
- **Phase 1 — v2 prototype (one machine):** MG90S + bushings/bearings + steel
  base plate + sorbothane feet + ASA/PETG print + brass inserts. Re-measure
  the route timing; target **~1.7–2 s/card** sustained, jam-free, 10,000+
  cycles without a stripped part.
- **Phase 2 — station software:** `station_id` plumbing, per-station scanner
  islands, 3 serial + 3 cameras on one PC. Verify one GPU serves 3 machines.
- **Phase 3 — farm it out:** 3 machines running concurrently (phase 1 built
  3×), injection-molded housings if volume justifies it, and a daily ops
  routine (hopper load, bin empty, CSV export per machine).

Each phase is independently shippable; Phase 0 and 2 are pure software, Phases
1 and 3 are hardware.
