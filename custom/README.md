# Custom

This folder is the home for **our** modifications to Magic Vault — everything that
makes this build different from upstream. The upstream project stays pristine on
`master`; all of our work lives on the `custom` branch.

## How this project is organized

```
custom/                  <- this folder: plans, notes, custom assets
arduino/main/main.ino    <- the firmware we modify IN PLACE (tracked by git on `custom`)
arduino/main/*.md        <- build/setup docs (also ours, tracked on `custom`)
```

**Important:** do not keep a second copy of `main.ino` in here. The firmware is
edited in place at `arduino/main/main.ino` — git on the `custom` branch is the
change tracker. This folder is for documentation and anything that doesn't
belong next to the sketch.

## Git workflow

- `master` — always mirrors upstream (`dishwasher-detergent/mault`). Never commit custom work here.
- `custom` — our changes. Sync from upstream with `git merge master` when on `custom`.

## Status

- [x] Forked to `4holdingdirectlimited/mault`, `origin` + `upstream` configured
- [x] Clone synced to upstream `a1dfa44` (main.ino unchanged upstream)
- [x] Build/setup docs added to `arduino/main/` (untracked — commit on `custom`)
- [x] Item 1: command id / ACK correlation — see `CHANGES.md`
- [x] Item 2: tooling (typecheck + firmware compile + CI) — see `CHANGES.md`
- [x] Item 3: single encode + server-hydrated card search — see `CHANGES.md`
- [x] Item 4: EEPROM calibration persistence + proto handshake — see `CHANGES.md`
- [x] Item 5: full command-id correlation + single feed path — see `CHANGES.md`
- [x] Item 6: jam detection on all modules + boot recovery — see `CHANGES.md`
- [x] Item 7: per-bin capacity (needs `db:push`) — see `CHANGES.md`
- [x] Item 8: captured-image dedupe + prune script — see `CHANGES.md`
- [x] Item 10: stage-1 watchdog / interruptible timing — see `CHANGES.md`
- [ ] Implement "faster + more robust" rework — see `PLAN.md`
