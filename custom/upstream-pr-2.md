## Why
Calibration was RAM-only: every reboot reverted a tuned machine to stock
pulses. Also, holo/foil detection needs a second, differently-lit capture —
the build guide's "spare" channel 14 LED was never wired by anyone.

## What changed
- **EEPROM calibration persistence** — `{"setConfig":...}` and
  `{"setFeederConfig":...}` save to EEPROM automatically; `{"saveConfig":true}`
  persists explicitly; `{"resetConfig":true}` restores factory defaults. A
  magic/version guard ignores stale data from older firmware.
- **Scan light on LED 1 (ch0)** — the holo-detection light now uses the
  on-board LED 1 channel instead of spare channel 14: `{"led":1,"on":true}`.
  Wiring stays on the existing PCB, no spare-channel cable. (LEDs 2-4 on
  ch1-3 remain free as indicator lamps.)
- Safe defaults while uncalibrated: module pulses are all within a few µs of
  each other so a freshly-flashed board cannot over-travel and strip a gear.

## Testing
1. Flash, then `{"setConfig":{"module":1,"bottomClosed":150,...}}`.
2. Reboot — the tuned values survive (`{"readConfig":true}` or observe motion).
3. `{"led":1,"on":true}` lights LED 1 on ch0.

> Note: this branch supersedes the earlier "scan light (LED 5)" version —
> the scan light moved to LED 1/ch0 to keep the wiring on existing hardware.
