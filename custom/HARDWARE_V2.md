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

## 7. vs commercial machines (the Roca question)

*“Could three upgraded units perform like a ~$25–30k Roca?”* — now we can
answer it with real numbers, because TCGplayer publishes the specs:

| Machine | Cost | Capacity | Throughput | Notes |
| --- | --- | --- | --- | --- |
| **Roca Sorter** | ~$25k | 1,000-card batch | **Sort 500/hr · Sift 725/hr** | Alphabetizes + digitizes; ~2 h per 1,000-card batch; over 50 programmed sorts; **Yu-Gi-Oh! needs a separate machine** (different card size) |
| Roca Sorter Max | ~$40k | 3,000-card run | Sort 300/hr · Sift 450/hr | Same, bigger batch |
| Roca Sifter | ~$2–3k | single/stream | **1,800/hr sift** | Compact add-on: reads cards **in premium sleeves**, separates foil/non-foil, any orientation; designed to feed the Sorter |

### The headline: we're already faster on raw sorting

| Config | Cards/hr (sort) | vs Roca Sorter |
| --- | --- | --- |
| Our v1 (current, ~3 s/card) | **~1,200** | **2.4×** |
| Our v2 (one machine, ~1.7 s/card) | **~2,100** | **4.2×** |
| Our 3× v2 farm | **~6,300** | **~12.6×** |

**So on raw “put these cards in those bins” throughput, one of our v1 machines
already beats the $25k Roca Sorter, and the farm is an order of magnitude
ahead.** Roca's price buys *other* capabilities, not speed. Where Roca genuinely
wins:

1. **Alphabetizing & full inventory ordering** — Roca sorts a batch into a
   complete, sell-ready order (we route to 7 bins).
2. **Digitization + TCGplayer integration** — every card read to a database
   and listable in one workflow (we record scans, but don't list).
3. **Sleeved-card handling** (Sifter) — reads cards *in premium sleeves*; we
   require unsleeved cards.
4. **Foil sifting at scale** — Sifter's foil separation is industry-proven; our
   holo detection is still in calibration.
5. **Unattended batch runs** — load 1,000, walk away for 2 h. Ours wants a
   hopper re-load and bin-empty roughly every ~500–1,500 cards.
6. **Orientation tolerance** — Roca reads cards in any orientation; our scan
   region expects a fixed orientation (feeder-straightened).
7. **Service/warranty + dedicated support.**

And where **we** win beyond cost:

- **One machine, all games** — Roca requires a *separate $25k unit* for YGO;
  our single unit handles MTG/YGO/Pokémon/Digimon/Gundam (and any added TCG)
  by changing the collection.
- **Cost:** ~$1k/machine → ~$3–5k for the 3-machine farm vs $25–75k of Roca
  hardware (Sorter + Max + Sifter + YGO unit).
- **No subscriptions or lock-in** — Roca sells a Software & Service Plan;
  ours is local and free forever.
- **Directed sorting tools Roca lacks:** bundle mode (Roca has “Pack Creator”,
  comparable), set-chase, wishlist routing, per-card value rules, per-bin
  capacity management.

### What to borrow from Roca (the “similar tools” worth copying)

- **Sleeve-tolerant feeding** — a feeder that handles sleeved cards would let
  us sort inventory without unsleeving. Big workflow win for a store.
- **Orientation-tolerant reading** — relax the scan-region constraint (or add
  a rotation-tolerant crop) so cards needn't be perfectly aligned.
- **Foil sift as a first-class mode** — a dedicated “foil / non-foil” sift
  pass (our two-frame holo detection, run as a pure sift) mirrors the Sifter.
- **Batch digitization** — a “digitize this hopper” mode that scans + records
  every card without sorting (feeds the library + collection DB).

### Honest verdict

For **bins, bundles, chase sets, and value/rule sorting**, three of our
machines beat a $25k Roca on throughput by ~10× and on cost by ~5–10×. What
Roca buys that we don't have is *complete inventory digitization +
alphabetization + sleeved-card handling + unattended autonomy* — those are
feature gaps, not speed gaps, and the top two (sleeve feed, digitize mode)
are on the v2 ideas list above.

### The measurement gate (do this before believing any of the above)

All of section 7 assumes the current machine is tuned and *measured*. Before
spending on v2/multi-machine:

1. Finish the v1 firmware (state machine + interrupt feeding — `PLAN.md`).
2. Run the first machine on real card stock and record **cards/hour, error
   rate, jams per 1,000 cards, and double-feed rate**. These four numbers are
   the baseline every upgrade is judged against (and the honest test of the
   1,200/hr claim above).
3. Try the cheapest upgrades first (stability base, feeder tweaks) and
   re-measure — only spend on MG90S/bearings/encoders where the baseline says
   the bottleneck actually is.
4. Only then decide the farm: the numbers will tell you if 3 machines buy you
   the Roca-class throughput at 1/10 the cost — or where the gaps make it not
   worth it for your actual workloads.

---

## 8. Phased roadmap (revised)

Priority order is deliberate: **software first, then tune the single machine,
measure it, and only then spend on v2/farm hardware.**

- **Phase 0 — finish v1 firmware + current software** (from `PLAN.md`):
  non-blocking state machine, interrupt feeding, watchdogs, plus any remaining
  app work. Nothing else happens until the first machine runs the whole
  scan → route → bin pipeline reliably.
- **Phase 1 — build + tune the first machine:** assemble it, calibrate,
  then run the **measurement gate** (§7): cards/hour, error rate, jams and
  double-feeds per 1,000. Fix what the numbers say is broken (feeder first —
  it is almost always the bottleneck). Re-measure after every change.
- **Phase 2 — cheap upgrades, measured:** stability base + sorbothane feet,
  feeder tweaks — the low-cost changes that shorten the blind routing delays.
  Re-measure. Only the bottlenecks that survive this get the expensive
  treatment (MG90S, bearings, comparator/encoder) in Phase 3.
- **Phase 3 — v2 prototype (one machine):** the hardened parts from §1–§4
  (ASA/PETG + brass inserts, bearings, pinch roller, encoder, comparator).
  Target **~1.7–2 s/card** sustained. Re-measure against the Phase 2 numbers;
  if the upgrade didn't move the metric, don't replicate it three times.
- **Phase 4 — station software:** `station_id` plumbing, per-station scanner
  islands, 3 serial + 3 cameras on one PC; verify one GPU serves 3 machines.
- **Phase 5 — the farm:** 3 machines running concurrently (build the third
  machine only if Phase 3's numbers justify it), injection-molded housings if
  volume is real, daily ops routine (hopper load, bin empty, per-machine CSV
  export).

Each phase is independently shippable; Phases 0, 2 and 4 are mostly software
or cheap, and every hardware decision is gated on a measured number rather
than enthusiasm.
