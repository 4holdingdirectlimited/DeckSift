# Custom

This folder is the home for **our** modifications to DeckSift — everything
that makes this build different from the upstream MAULT project. The upstream
project is tracked as the `upstream` git remote (`dishwasher-detergent/mault`);
all of our work lives on the `custom` branch (the repo default).

## How this project is organized

```
custom/                  <- this folder: our docs (CHANGES, SETUP, TCGS, PLAN)
arduino/main/main.ino    <- the firmware we modify IN PLACE (tracked by git on `custom`)
arduino/main/*.md        <- build/setup docs (also ours, tracked on `custom`)
```

**Important:** do not keep a second copy of `main.ino` in here. The firmware is
edited in place at `arduino/main/main.ino` — git on the `custom` branch is the
change tracker. This folder is for documentation and anything that doesn't
belong next to the sketch.

## Docs in this folder

| File | What it is |
| --- | --- |
| `CHANGES.md` | **Every modification vs upstream**, cumulative, in revert order (currently items 1–58) |
| `SETUP.md` | The local runbook: stack URLs, start/stop, first-run setup, bundle/chase/wishlist modes, bin capacities, value sorting, sync pacing |
| `TCGS.md` | Multi-TCG architecture, top-20 TCG data-source status, adding a new game |
| `PLAN.md` | Firmware roadmap (state machine, pipelining, watchdogs) + machine-build commissioning checklist |
| `HARDWARE_V2.md` | Production-leaning hardware review: materials/manufacturing, stability/mass, mechanism hardening, and the 3-machine/1-PC multi-machine plan |
| `PRODUCT.md` | Product strategy (v1 home → v2 commercial), adoption drivers, and the value-vs-effort feature backlog |

## Git workflow

- `custom` — the only active branch (also the GitHub default). All DeckSift
  work lives here.
- `upstream` — a read-only remote pointing at `dishwasher-detergent/mault`;
  `git fetch upstream` then `git merge upstream/master` (or selective
  file-level integration — see `CHANGES.md` Item 50) brings in anything new.
- **Keeping the fork banner tidy:** when GitHub shows "N commits behind"
  (upstream advanced), record their history without adopting their code:
  `git merge -s ours upstream/master -m "Sync with upstream history"` then
  push. Behind drops to 0; none of upstream's file content changes (their
  useful changes are still integrated selectively per `CHANGES.md`).
- There is no `master` branch in this repo — the pre-rename work line that
  briefly lived there was fully superseded by `custom` and deleted.

## Status

All modifications are documented in `CHANGES.md` (items 1–58). The headline
deliverables, all on the `custom` branch:

- **Fully local, no logins** — removed hosted Neon, Supabase-style auth, and
  better-auth; single-user local build with a portable local PostgreSQL
  (item 12–13)
- **Local-first everything** — disk-cached card art + sync catalogs (item 14,
  37), local card hydration (item 15), on-device SigLIP with optional DirectML
  GPU acceleration (item 16)
- **Multi-TCG** — config-driven adapters for MTG, Yu-Gi-Oh!, Digimon, Gundam,
  Pokémon + dataset importer for no-API games (item 19–20, 23, 27)
- **Seller/collector features** — value-based binning (21), bundle mode with
  holo/duplicate toggles + value (24, 29, 31), per-bin capacity + bin status
  (7, 30), set-chase mode (35), wishlist routing (36), export CSV / duplicates /
  set completeness (32–34)
- **Holo detection** — two-frame scan light + heuristic classifier (17–18),
  needs threshold calibration on the real rig (`PLAN.md`)
- **Firmware** — command-id ACK correlation, jam detection on all modules,
  boot recovery, EEPROM calibration persistence, stage-1 watchdog
  (1, 4–6, 10); full non-blocking state machine + interrupt-driven IR
  feeding delivered (49); pipeline feed (start next card while the
  previous one is still routing) still planned (`PLAN.md`)
- **Tooling & CI** — typecheck, firmware compile, CI checks (2)

Machine-specific operational details live in `SETUP.md`.
