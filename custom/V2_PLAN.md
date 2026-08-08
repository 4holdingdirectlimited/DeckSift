# DeckSift v2 Plan — hardened commercial roadmap

**Date:** 2026-08-08 · **Author:** lead engineer · **Status:** living plan, supersedes the roadmap sections of `PLAN.md` / `PRODUCT.md` / `HARDWARE_V2.md` where they overlap; those remain the detailed references.

## How this plan was built

This plan synthesizes every planning input in the repo into one phased, gated
roadmap. Sources are tagged inline so a reader can go to the original:

- **[R]** `custom/RESEARCH_MARKET.md` — market research (segments, competitors, ranked wants, pain points, §6 wishlist)
- **[H]** `custom/HARDWARE_V2.md` — production-leaning hardware review + phases 0–5 + §7 measurement gate
- **[P]** `custom/PRODUCT.md` — v1 home → v2 commercial product tiers and backlog
- **[T]** `custom/TCGS.md` + `custom/TCGS_ROADMAP.md` — TCG expansion to 20 games, TCGplayer API roadmap
- **[F]** `custom/PLAN.md` — firmware roadmap (largely shipped; commissioning checklist still open)
- **[I]** implementation agent's flags (Items 63–65, `custom/CHANGES.md`)
- **[QA]** `custom/QA_REPORT.md` — independent review + residual observations

**The core discipline (unchanged from `HARDWARE_V2.md §7`):** every hardware
decision is gated on a *measured number*, not enthusiasm. Software ships first,
the single machine is commissioned and measured, and only then does money go to
v2/farm hardware.

---

## 1. Where we are today (v1 commercial-readiness snapshot)

**Software — commercially defensible now (all committed or in the reviewed working tree):**

- **11 TCGs integrated & synced** (121,864 cards one-per-unique-card; FAB 16,240 per-printing rows) — MTG, Pokémon, Yu-Gi-Oh!, Digimon, Gundam, Union Arena, Lorcana, One Piece, Star Wars: Unlimited, Flesh and Blood, Pokémon TCG Pocket. All offline-capable via local SigLIP embeddings + pgvector.
- **100 automated tests** (vitest, pure logic, CI `tests` job), 0 Critical/High findings, QA **APPROVE** for merge **[QA]**.
- **Server hardening:** `fetchWithRetry` with abort-aware backoff + bounded timeouts; one-JSON-line-per-event logger; upload downscaling for scan speed.
- **Feature surface (v1):** value/rule binning, bundle mode, set-chase, wishlist routing, digitize mode, TCGplayer CSV export, review queue, undo, backup/restore, first-run checklist, holo/misprint flags.

**Known gaps against the commercial bar [R][H]:** no unattended large-batch
autonomy, 7 bins vs the 29-bin commercial bar, unsleeved-cards-only, no
listing integration beyond CSV (TCGplayer API blocked on seller keys), no
reliability telemetry yet, and the machine itself is un-commissioned (never
measured on real card stock).

**Physical machine:** firmware complete (non-blocking state machine, interrupt
IR, EEPROM cal, Wi-Fi/WebSocket/OTA on ESP32-S3) **[F]**; the physical build +
commissioning checklist (PLAN.md "Machine build commissioning checklist") is
still open — it is the gate everything else hangs off.

---

## 2. The v2 thesis (from the research)

The research **[R]** lands on one clear wedge for DeckSift:

> **An offline, no-subscription, multi-TCG sorting + digitizing machine for
> home collectors now, card shops next — where the store's #1 want is a
> one-pass "value-sift → digitize → CSV/listable inventory" workflow.**

Why this is credible: competitors are either expensive + locked in (Roca
$20–32k + service plan, CardBot $8k + $160/mo) or software-only with a
hardware add-on (SortSwift $499/mo, 29-bin "Super Sorter"); the incumbent pain
points are jams/double-feeds, misrouting, set-sort failure, dead support, and
subscription lock-in **[R §2, §4]**. DeckSift already beats the Roca Sorter on
raw sort throughput on paper (~1,200/hr vs 500/hr) at ~1/20 the cost **[H §7]**
— but raw speed alone doesn't close a sale. The store wants: reliability,
value-sift, digitize-to-list, and support.

**v2 = v1's software and reliability story proven on one measured machine,
then the store-intake workflow, then (only where the numbers justify) more
hardware.**

---

## 3. Consolidated feature backlog

Priority = value × evidence, not effort. Effort: ●○○ hours · ●●○ a session · ●●● a project.

| # | Item | Source | Effort | Phase |
| --- | --- | --- | --- | --- |
| 1 | **Commission the first machine + measurement gate** (cards/hr, jams & double-feeds per 1,000) | [H §7][F] | ●●○ | 0 |
| 2 | **Route integration tests + startup wait-on-health** (CI-tested API routes; start script waits for `/api/health` before declaring up) | [I][QA] | ●●○ | 1 |
| 3 | **Reliability telemetry dashboard** (cards/hr, jams/1,000, error rate per session; the ROI evidence shops ask for) | [R §6][P] | ●●○ | 1 |
| 4 | **Store-intake workflow:** hopper → value-sift by threshold → digitize → TCGplayer CSV in one pass | [R §5][P] | ●●● | 2 |
| 5 | **Per-card condition photo capture** stored with each scan (grading-ready record; no AI grading) — ✅ already covered by each scan's `capturedImageUrl` (Item 70) | [R §6] | ●○○ | 2 |
| 6 | **Duplicate/overstock control** ("keep max N per card") — ✅ shipped: Scanner menu → "Max copies per card", extras route to the reject bin (Item 73) | [R §6] | ●○○ | 2 |
| 7 | **Pre-release set data** (sync new sets before release) | [R §6] | ●●○ | 2 |
| 8 | **Sort-to-ship:** import order/pull-sheet CSV → route to bins by order | [R §6][T] | ●●○ | 2 |
| 9 | **More export targets** (eBay/Shopify/ManaBox CSVs) — ✅ eBay + Shopify shipped (Item 70) | [R §6] | ●○○ | 2 |
| 10 | **TCG expansion 12 → 20 games** (see §5) — **15 done** as of Item 72 (+Altered, Force of Will, Duel Masters, Weiss Schwarz); remaining mostly blocked on *images*, not code | [T] | ●○○ each | 2/3 |
| 11 | **Firmware per-phase stall watchdogs + full jam coverage** (mid-sequence, all modules) | [F §6–7] | ●●○ | 3 |
| 12 | **TCGplayer price source + catalog match job** — 🔒 blocked at the source: TCGplayer froze new API grants (official docs, verified 2026-08); needs an account with pre-freeze keys | [T][P] | ●●● | 3 |
| 13 | **Store inventory sync + order manifest → sort-to-ship (full)** | [T] | ●●● | 3 |
| 14 | **Hardware v2 single machine** (ASA/PETG + brass inserts, MG90S, bearings, encoder, comparator) — *gated on Phase 0–1 measurements* | [H §1–4] | ●●● | 4 |
| 15 | **Multi-machine station** (`station_id`, per-station islands, 3×serial+3×camera, one GPU) | [H §5] | ●●● | 5 |
| 16 | **Faster vector search** (HNSW index or GPU offload for the embedding matcher — revisit when catalog > ~150k cards) | [I] | ●●○ | 5 |
| 17 | **Bambu Lab print-kit** (quantity sheet + reorganized plates; pure software/print-side) — ✅ shipped: `3d model/kit/` + 16-plate plan for `card_sorter_decksift.3mf` (Item 73) | [F] | ●○○ | any |

**Carried but deliberately parked** (do not build in v2 — [R §6]): AI condition
grading (capture photos now, grade later), sports cards, cloud/multi-tenant
SaaS/POS/kiosk, sleeve-tolerant feeder for all sleeves (perfect-fit first),
injection molding (gated on measured volume).

---

## 4. Phased plan

Each phase is independently shippable and has an explicit **gate** — do not
start the next phase until the gate passes.

### Phase 0 — Commission the machine (gate: measured baseline)
Build + calibrate the current v1 machine, then run the **measurement gate**
from `HARDWARE_V2.md §7`: record **cards/hour, error rate, jams per 1,000,
double-feed rate** on real card stock. Re-measure after every change.
Fix what the numbers say (feeder first — it is almost always the bottleneck).
**Gate:** baseline numbers recorded in `custom/CHANGES.md` (new Item) — these
four numbers become the KPIs every upgrade is judged against.

### Phase 1 — v1.5 commercial hardening (software; now → next)

**Done (Item 67):** 100-test suite + CI (`Item 64`), retry/timeout/logger
hardening (`Item 65`), upload downscale (`Item 63`), **route integration
tests** (health / sync sources / library search against a scratch Postgres
in CI), **startup wait-on-health** (`start-server.cmd` polls `/api/health`
and stops a half-up server on failure), and **reliability telemetry**
(`GET /api/stats` + the `/app/stats` shop-facing view: totals, throughput,
14-day series, live session block).
**Gate:** `pnpm test/typecheck/lint/build` green on fresh cache — ✅ 107/107
tests (incl. 7 route integration), typecheck/lint/build clean. API restart
procedure: `scripts/start-server.cmd` now confirms health before declaring
up (JSON log line in `server.log` proves the new code is live) **[QA §5]**.

### Phase 2 — Store-intake workflow (the commercial wedge)
Ship the highest-ROI software first — most pieces exist. **Progress (Items 70,
73):** extra exports done (eBay + Shopify in the Session Summary menu);
condition photos (#5) are effectively covered — every scan stores its captured
image (`capturedImageUrl`) on the card record; **duplicate cap (#6) shipped**
(Scanner menu → "Max copies per card", extras route to the reject bin);
multi-language scanning (Item 69) landed. **Intake mode (#4) is documented as
covered** by the existing flow — Digitize mode + value rules + Session Summary
exports already give one-pass value-sift → digitize → CSV with no sorting
setup (the Phase 2 gate's 1,000-card dry-run is the remaining validation).
Remaining: **Pre-release data (#7)** and **sort-to-ship CSV (#8)** (medium;
sort-to-ship reuses bundle/chase routing).
**Gate:** a dry-run of the full intake pipeline on one real 1,000-card bulk
box produces a clean, importable CSV; session stats recorded for the shop ROI
story.

### Phase 3 — TCG expansion 12 → 20 (15 done)
See §5. **15 games live as of Item 72** — Altered, Force of Will, Duel Masters
and Weiss Schwarz were integrated from community datasets this session. The
goal stays 20+ *functioning* games; each remaining one is ~1 day once a source
with images exists.
**Gate:** 20 games with images synced; each verified by one search + one sync.

### Phase 4 — TCGplayer price + listing (blocked at the source)
Unblocks the most-cited commercial feature (digitize → list), but TCGplayer
is **no longer granting new API access** (official docs, verified 2026-08) —
a new seller account cannot obtain keys. The only route is an account that
already holds pre-freeze keys. Until then, the 80/20 path is already built:
MTG + Yu-Gi-Oh! are priced without the API (Scryfall carries TCGplayer market
prices; YGOPRODeck's `tcgplayer_price` *is* the market price), and the
TCGplayer inventory CSV export feeds the seller portal's manual upload.
**Gate:** keys exist; catalog match accuracy ≥99% on a 500-card spot check.

### Phase 5 — Hardware v2 (one machine; gated on Phases 0–1)
Only if the measured baseline says the bottleneck is mechanical: hardened
materials/fasteners (§1), stability/mass (§2), MG90S + bearings + encoder +
comparator (§3–4), target ~1.7–2 s/card sustained, re-measured against Phase 0
**[H]**.
**Gate:** Phase 0 numbers show jams/errors dominated by mechanism, and the
upgrade moves the metric — otherwise don't spend.

### Phase 6 — Multi-machine station
`station_id` plumbing, per-station scanner islands, 3 serial + 3 cameras on
one PC, verify one GPU serves 3 machines **[H §5]**. Build the 3rd machine
only if Phase 5's numbers justify it.
**Gate:** one GPU drives 3 stations at target rate without scan-latency creep.

### Phase 7 — Scale decisions
Injection molding, service/warranty structure, commercial licensing sales
(4holdingdirectlimited) — all gated on real measured volume and Phase 2 store
adoption **[H][P]**.

---

## 5. TCG expansion path (12 → 20)

Goal: **20 functioning, currently-popular TCGs** (functioning = game row +
searchable adapter + synced with images). Architecture is done — a new game is
one ~40-line config + registration + seed row **[T]**. **Images are the gate**;
code is never the blocker.

| Game | Status / blocker | Unblock action (user) |
| --- | --- | --- |
| ✅ Altered TCG | ✅ integrated (Item 72, 3,464 cards) | — |
| ✅ Duel Masters | ✅ integrated (Item 72, 1,248 printings, Fandom wiki art) | — |
| ✅ Weiss Schwarz | ✅ integrated (Item 72, 581 cards, sim scans) | — |
| ✅ Force of Will | ✅ integrated (Item 72, 7,272 cards, S3 art) | — |
| Dragon Ball Super | Images-only repo found (`TCG-Arena-DBSFW`); no metadata JSON | Browse from phone/VPN for the card-list URL, or a community JSON export |
| Cardfight!! Vanguard | No dataset with images found | Community dataset from the Vanguard Discord |
| Final Fantasy TCG | `ffdecks.com` is a SPA; API not trivially exposed | Check DevTools → Network for a JSON cards endpoint |
| Hololive OCG | Fan DBs, no stable image-bearing JSON | Check a fan site's network requests for card JSON + image CDN |
| Shadowverse Evolve | Sim-client data has English names but **no image URLs** | Find the official card-image URL pattern in a browser |
| WIXOSS | JP-only dataset (736 cards), no images | Skip unless building a JP-focused rig |
| Battle Spirits | JP-only | Skip unless building a JP-focused rig |

Full per-game notes, verified 2026-08: `custom/TCGS_ROADMAP.md` §"Remaining
target games".

---

## 6. v2 KPI targets (what "ready for commercial use" means)

| Metric | Target | Measured by |
| --- | --- | --- |
| Sort throughput | ≥1,200/hr sustained (v2 target ~2,100/hr) | Phase 0 gate + telemetry |
| Jams | <1 per 1,000 cards | Phase 0 gate + telemetry |
| Double-feeds | <1 per 1,000 cards | Phase 0 gate |
| Identification accuracy | ≥99% on standard cards (measured, not claimed) | Review-queue stats |
| Value-sift value recall | ≥99% of cards above threshold routed to value bin | Intake dry-run |
| Catalog match (TCGplayer) | ≥99% on spot check | Phase 4 gate |
| Uptime | 24 h unattended batch, 0 crashes | Overnight soak run |

---

## 7. Decisions that need you (the owner)

1. **TCGplayer API keys** — formerly "seller account + API application";
   that path is closed (TCGplayer froze new API grants, verified 2026-08).
   Only actionable if the 4holdingdirectlimited account turns out to hold
   pre-freeze keys; otherwise this stays parked (the manual CSV path covers
   listing today).
2. **Blocked data sources** (DBS, Vanguard, FF, Hololive, SV images, WIXOSS)
   — each needs one URL/dataset from your network or a community contact
   (playbook in `TCGS_ROADMAP.md` §"Finding the needed parts").
3. ~~**Altered TCG**~~ — ✅ done (Item 72).
4. ~~**Bambu Lab print kit**~~ — ✅ shipped (Item 73, `3d model/kit/`).
5. **Commercial licensing** — v2 units are sold by license from
   4holdingdirectlimited; the plan assumes that channel stays as documented in
   `PRODUCT.md`.

## 8. Future upgrades beyond v2 scope (captured for later)

Hardware: sleeve-tolerant feeder (perfect-fit first), orientation-tolerant
reading, foil sift as a first-class pass, injection molding, bigger/stackable
bins (29-bin bar), camera-as-feedback for motion confirmation.
Software: AI condition grading (PSA-class — capture photos now), sports-card
catalog, cloud/POS/kiosk (contradicts local-first), HNSW/GPU vector search,
faster embedding models.
Business: service/warranty structure, support SLAs (Magic Sorter died on no
support — support is a feature [R §4]).
