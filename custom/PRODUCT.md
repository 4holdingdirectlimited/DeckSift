# Product strategy — v1 (home) → v2 (commercial)

Two product tiers, one codebase. **v1 is the adoption vehicle; v2 is the
hardened commercial build.** Everything in v2 is measured/justified by v1
usage first (see `HARDWARE_V2.md` for the measurement gate).

## Positioning

| | v1 — “Home Sorter” | v2 — “Pro / Commercial” |
| --- | --- | --- |
| Who | Home collectors/sellers, hobbyists | Card shops, bulk buyers, small production |
| Hardware | Current machine: PLA/PETG, SG90, ~$250 parts | Hardened: ASA/steel base, MG90S + bearings, sleeve-tolerant, ~$1k+ parts |
| Software | Same app, local, free | Same app + multi-machine, digitize/listing workflows, support |
| Adoption goal | **Get it into homes first** — trust, fun, correct | Sell units + service, justify the $ premium |
| Price | Open/self-build | Kit or assembled |

**Why v1 first:** v1 adoption is what funds v2 — community calibration data
(foil labels), real-world feedback, a proven throughput baseline, and word of
mouth. v2's premium is only believable once v1 works flawlessly at home.

## What v1 needs to be (adoption drivers)

1. **Correctness > speed** — a home user forgives slowness, not misroutes.
2. **Trust/visibility** — they can see what the machine did and undo it.
3. **Easy setup** — from box to first successful sort in an afternoon.
4. **Fun feedback** — sounds, stats, progress.
5. **No surprises** — clear errors, safe pauses, obvious bin status.

## Feature backlog (value vs effort)

Legend: effort ●○○ = tiny (hours) · ●●○ = a session · ●●● = a project.
✅ = built · 🔜 = next · 🧰 = v2/optional

### Setup & trust (highest value for adoption)

| Feature | What | Effort | Status |
| --- | --- | --- | --- |
| First-run checklist | Guided: connect camera → Arduino → calibrate → sync → first scan | ●●○ | ✅ built |
| Undo last scan | Remove the most recent record (fix by hand if misrouted) | ●○○ | ✅ built |
| Match/no-match sounds | Distinct chime vs low tone so you know without looking | ●○○ | ✅ built |
| Match confidence badge | Show distance/quality on each scanned card | ●○○ | ✅ built |
| Scan stats (value, sets, rares) | Already computed — surface it better (sidebar) | ●○○ | ✅ part |
| Backup/restore | `pg_dump` script wrapper — one command, full safety net | ●○○ | ✅ built (`scripts/backup-db.mjs`) |
| Collection CSV import | Import ManaBox/TCGplayer list → “owned” data feeds chase/set-completeness instantly | ●●○ | ✅ built |
| Review queue | Low-confidence matches pause for a yes/no instead of auto-routing | ●●○ | 🧰 |

### Value & commerce (bridge to v2)

| Feature | What | Effort | Status |
| --- | --- | --- | --- |
| TCGplayer CSV export | Inventory CSV for the seller portal | ●○○ | ✅ built |
| Bundle SKU + inventory + CSV | Traceable bundle records | ●●○ | ✅ built |
| Total collection value | Per-session + per-collection totals | ●○○ | ✅ part |
| Condition field | Per-scan condition for TCG export (defaults NM) | ●●○ | ✅ built |
| TCGplayer price source | Needs seller API access (TCGS.md roadmap) | ●●● | 🧰 |

### Everyday QoL

| Feature | What | Effort | Status |
| --- | --- | --- | --- |
| Keyboard shortcuts | Space = pause/resume, S = scan, Z = undo | ●○○ | ✅ built |
| Digitize mode | Record without sorting | ●○○ | ✅ built |
| Orientation tolerance | Auto-upright flipped cards | ●○○ | ✅ built |
| Feeder “clear” button | Quick jam-recovery without full recalibration | ●○○ | 🔜 |
| Session timer pause on bin-full | Already pauses — make the reason obvious in the overlay | ●○○ | ✅ part |
| Per-set completeness % on scan | “7/40 of this set” toast when set is detected | ●○○ | 🧰 |

## Quick wins I can build next (your pick)

1. **Match confidence badge** on scanned cards (distance → colored dot) — tiny,
   huge trust boost. — ✅ built (Item 47)
2. **Keyboard shortcuts** (pause/scan/undo) — tiny. — ✅ built (Item 47)
3. **Backup/restore script** — one-command `pg_dump`/`pg_restore` wrapper,
   tiny, big peace of mind. — ✅ built (Item 47)
4. **Collection CSV import** — medium, but it unlocks chase mode + set
   completeness for people with existing collections (strong adoption hook).
   — ✅ built (Item 47)
