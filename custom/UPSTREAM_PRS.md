# Upstream pull requests — status & ready-to-paste descriptions

Three firmware PRs back to the original project
(`dishwasher-detergent/mault`). All are **open, rebased onto the latest
upstream master, and MERGEABLE**. All three use **LED 1 (ch0) as the scan
light** — no spare-channel LED 5 wiring — and upstream's own master has since
moved to LED 1 too, so the PRs align with the maintainer's direction.

| PR | Branch | Status |
| --- | --- | --- |
| [#4](https://github.com/dishwasher-detergent/mault/pull/4) | `pr/fw-robustness` | OPEN · MERGEABLE |
| [#5](https://github.com/dishwasher-detergent/mault/pull/5) | `pr/fw-config` | OPEN · MERGEABLE · title updated to "scan light (LED 1)" |
| [#6](https://github.com/dishwasher-detergent/mault/pull/6) | `pr/fw-state-machine` | OPEN · MERGEABLE |

Each branch was rebased onto `upstream/master` (61c67e7) with our exact
firmware content, so each PR's diff is a clean reviewable change set.

The full PR bodies (for updates or re-opening) live in:

- `custom/upstream-pr-1.md` — PR #4 (fw-robustness)
- `custom/upstream-pr-2.md` — PR #5 (fw-config)
- `custom/upstream-pr-3.md` — PR #6 (fw-state-machine)

---

## PR 1 — `pr/fw-robustness`

Harden firmware: id-correlated replies, fixed serial buffer, all-module jam
watch, boot recovery. Body: `custom/upstream-pr-1.md`.

## PR 2 — `pr/fw-config`

Persist servo calibration to EEPROM and add a scan light (LED 1). Supersedes
the earlier "scan light (LED 5)" version — the scan light moved to LED 1/ch0
to keep the wiring on existing hardware. Body: `custom/upstream-pr-2.md`.

## PR 3 — `pr/fw-state-machine`

Rebuild firmware as a non-blocking state machine with interrupt-driven
feeding. Includes the robustness fixes and the config persistence + scan
light from the sibling PRs, so this branch is the complete modern firmware.
Body: `custom/upstream-pr-3.md`.

---

## Opening with `gh` (once authenticated)

```bash
gh pr create --repo dishwasher-detergent/mault \
  --head 4holdingdirectlimited:pr/fw-robustness --base master \
  --title "Harden firmware: id-correlated replies, fixed serial buffer, all-module jam watch, boot recovery" \
  --body-file custom/upstream-pr-1.md

gh pr create --repo dishwasher-detergent/mault \
  --head 4holdingdirectlimited:pr/fw-config --base master \
  --title "Persist servo calibration to EEPROM and add a scan light (LED 1)" \
  --body-file custom/upstream-pr-2.md

gh pr create --repo dishwasher-detergent/mault \
  --head 4holdingdirectlimited:pr/fw-state-machine --base master \
  --title "Rebuild firmware as a non-blocking state machine with interrupt-driven feeding" \
  --body-file custom/upstream-pr-3.md
```
