# DeckSift Bambu Lab print kit

A quantity kit for the printable side of the machine, organized for faster,
more efficient Bambu Studio print batches (fewer color/material changes,
better bed utilization). The geometry is **identical** to the original parts —
this kit only reorganizes them.

## Files

| File | What it is |
| --- | --- |
| `QUANTITY_SHEET.md` | One machine's printable parts as a tick-box checklist, with filament/settings notes |
| `PLATES.md` | The 16-plate print plan for `card_sorter_decksift.3mf` |

## The 3MFs

- `3d model/card_sorter.3mf` — the original design (dishwasher-detergent),
  mesh, slicer-ready.
- `3d model/card_sorter_decksift.3mf` — DeckSift's revised parts file,
  print-optimized: **30 unique objects across 16 plates** (plate previews are
  embedded as `Metadata/plate_N.png`). Use this one with this kit.

Both files are the same machine — pick whichever matches your print setup.
3D files are CC BY-NC-SA 4.0 (`3d model/LICENSE`); full credit to the
original designer (see repo README Credits).

## Workflow

1. Open `card_sorter_decksift.3mf` in Bambu Studio.
2. Walk the 16 plates in order; tick the functional groups in
   `QUANTITY_SHEET.md` as you print.
3. Assemble per `arduino/main/BUILD.md` (structural → servos → sensors →
   wiring → firmware → calibrate).

## Notes

- The 3MF objects are unnamed meshes — the sheet groups parts by machine
  role, so keep the plate preview open while printing.
- PLA for housings; PETG if warm. 0.2 mm layers, 15–20 % infill (solid where
  the preview shows pads).
