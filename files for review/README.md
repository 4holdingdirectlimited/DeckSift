# Files for review

Upstream (`dishwasher-detergent/mault`) files copied from `master` for
review before integration into DeckSift (see `custom/CHANGES.md` Item 54).

| File | What it is | Verdict |
| --- | --- | --- |
| `upstream-main.ino` | Upstream's current firmware (5 commits newer than our fork base: more logging, debugging changes, safer default servo values) | Partially adopted: the **safe small-travel servo defaults** + feeder speed were merged into our firmware. The extra `Serial.println` logging is noise in our hardened build — reviewed, not needed. |
| `upstream-use-serial.tsx` | Adds a `console.log` of every command sent | Adopted (1 line) — pairs with our existing received-line trace. |
| `upstream-use-feeder-config.tsx` | Toast when the pre-test feeder config push is rejected | Not adopted: uses upstream's older `receiveResponse()` serial API; our id-correlated layer already surfaces these errors. |
| `upstream-use-module-configs.tsx` | Toast when the pre-test module config push is rejected | Same as above — not adopted. |
| `upstream-README.md` | Upstream README (incl. new Licensing section: software MIT, 3D models CC BY-NC-SA 4.0) | Licensing note adopted; `3d model/LICENSE` copied into our repo. |

The 3D model revision (`card_sorter.3mf`) that sat here was integrated as
`3d model/card_sorter_decksift.3mf` (ours, `_decksift` suffix) alongside the
original `3d model/card_sorter.3mf` (upstream, CC BY-NC-SA 4.0).
