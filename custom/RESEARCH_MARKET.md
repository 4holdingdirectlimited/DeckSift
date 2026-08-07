# DeckSift — Market Research: The Card-Sorting / Card-Organizing Space

**Date:** 2026-08-08 · **Author:** research agent · **Purpose:** input for commercial-readiness decisions (v1 home → v2 shop/bulk)

## Method & verification honesty

- ✅ **Verified by direct fetch** during this research (URLs at bottom): Roca official specs, Roca Sifter coverage (2 outlets), commercial-sorter roundup, TCG Machines, CardMill, CardBot, Magic Sorter, GlideSorter, SortSwift, TCG market-size reports, TCGplayer GMV.
- 🟡 **Search-snippet verified** (Brave/DuckDuckGo results; forums like Reddit block direct fetch): the Reddit dealer reviews, shop-owner wish lists, TCGplayer scanner complaints, TCG Machines support KB.
- ⚠ **From model knowledge, not re-verified here:** eBay-flipper and tournament-grinder behaviors, BinderPOS details, scan-app details (ManaBox/Delver Lens). Flagged inline.
- [repo] = claims from DeckSift's own docs (`HARDWARE_V2.md §7`, `PRODUCT.md`, `README.md`), not independent market data.

## Market context (why this space is worth serving)

| Metric | Figure | Source |
| --- | --- | --- |
| TCG market size 2025 | $7.8B (R&M) / $8.4B (GMI) / $13.3B (Mordor) — range across firms | [11][12][13][14] |
| Growth | ~7–10% CAGR to $11.8–24.4B by 2030–31 | [11][12][13][14] |
| TCGplayer marketplace GMV | ~$1.1B in 2025, +50% YoY | [16] |
| Grading volume | 16.8M non-sports/TCG cards graded in 2025, **+95% vs 2024** | [15] |
| ⚠ Broader "trading cards" (incl. sports) | ~$44B, "expected ~$100B by 2027" (Wikipedia, dated/uncited) | [17] |

Takeaway: the TCG slice is a multi-billion, high-growth market; TCGplayer alone moved ~$1.1B in 2025. Grading growth signals value-awareness — and therefore demand for inventory/valuation tools. ⚠ Exact figures vary wildly by research firm; use ranges, don't quote one number.

## 1. Market segments — who buys sorters/organizers

| Segment | Who | Needs / wants (with evidence) |
| --- | --- | --- |
| **Card shops (LGS)** | Stores selling singles, buying collections at counter | Sort by **set** ("this means lots of bins"), **self-feed** ("let it loose on 50k cards every night"), **value sift** (separate bin for 50¢+ cards), gentle handling, programmability [19]. Roca pitch: "1,000 cards in 2 hours, 80% labor savings" [1]; "equivalent of one or two more full-time employees" [1]. CardBot stores scan customer collections as a paid service [7]. 20,000 cards/day is normal for a big store [5]. **Wants: reliability, support, ROI math, low noise/footprint, portability to shows** [7]. |
| **Online sellers / flippers (TCGplayer/eBay)** | Individuals + storefronts listing singles | Bulk-digitize → price → list pipeline. "I need to list like 10k cards" — scanner apps that import straight to TCGplayer [22]. Sifter marketing math: 5,000-card lot in <3h vs "a full day by hand" [2]. Needs: accuracy (99.9% is sold as an add-on [10]), condition defaults, CSV/listing export, autopricing, multi-marketplace sync [10]. New-seller economics are real ($29k/31 days reported) [18]. |
| **Bulk buyers / collection liquidators** | Buy storage-lot collections, flip volume | Process 200k cards/year [18]; pull hidden value out of bulk ("catch lower value cards that would have been set to the side") [7]; make an accurate buy offer quickly ("someone brings in a 660 [card box]… accurate offer in ~45 minutes") [7]. Needs: **value sift above all**, duplicates handling [5], unattended overnight batches [18][19]. |
| **Home collectors** | Casual-to-serious collections (25k+ cards) | Want cataloging "without costing a huge sum up front or a hefty monthly fee" [18]. CardMill's whole pitch: everyday collector, no recurring fees [6]. Needs: price, gentle handling, CSV export to their trackers (Moxfield/Archidekt/TCGplayer) [6], offline/private ⚠ (DeckSift differentiator), set-completeness/chase [repo]. |
| **Tournament grinders** ⚠ (inference, thin evidence) | Competitive players with big trade binders | Value **condition preservation** (they play with these cards), fast decklist/trade-binder inventory, staple tracking. Evidence is indirect — card condition is a core value driver [17]. Lower willingness to pay; likely adopt via home-collector tier. |

Segment sizing ⚠ (inference): LGS ≈ tens of thousands of stores worldwide, but a tiny fraction buys $8k–40k machines (CardBot: 100+ stores [7]); the addressable *home* market is orders of magnitude larger but price-sensitive (DIY projects at $200–800 [4]; CardMill at $500–720 [6]).

## 2. Competitor & adjacent landscape

### 2a. Physical sorters — commercial

| Machine | Price | Throughput | Strengths | Weaknesses / complaints |
| --- | --- | --- | --- | --- |
| **Roca Sorter** (TCGplayer) | ~$20–25k [4] (official: financing/plan) [1] | Sort 500/hr, sift 725/hr [1] | Alphabetizes 1,000 cards; 50+ programmed sorts; Pack Creator; **Sort-to-Ship** (order CSV → order piles); TCGplayer digitization; support [1] | Slow per-card; **separate machine required for Yu-Gi-Oh!** (different size) [1]; software & service plan; expensive [1][4] |
| **Roca Sorter Max** | ~$32k+ [4] | Sort 300/hr [1] | 3,000-card batch [1] | Slower per card, pricier [1][4] |
| **Roca Sifter** (2026) | $799 + ~$300/yr service (needs TCGplayer seller account + internet) [2][3] | **1,800/hr** [2][3] | 400-card hopper, reads premium sleeves, foil detection, any orientation; Sept 2026 (already booked out) [1][2][3] | 3 bins only [2]; subscription [2]; launch games = 4 (MTG/Pokémon/Lorcana/One Piece) [3]; unreviewed hardware [2] |
| **PhyzBatch-9000** (TCG Machines) | n/a (contact; likely lease) ⚠ | ~1,000/hr [4]; stores run 20k/day [5] | Foil detection (patent pending), remove-duplicates, continuous load/unload mid-sort, pre-release set data, 500M+ cards counted [5] | Support KB admits misrouting when DB is stale ("Cards are Sorting to the Wrong Bin" → run update) [20]; beta-period hardware troubles noted by a customer [5] |
| **CardBot** (CardCastle) | $8,000 + $160/mo (or $1,600/yr); +$60/mo per extra unit [7] | "1,000s/day" [7] (roundup: ~$250/mo lease + ~$145/mo software [4]) | Suction-cup pickup, quiet/compact, counter-friendly, inventory software included, used by 100+ stores, 2M+ cards/mo [7] | Subscription-locked; $8k + monthly is steep for small shops [7][4] |
| **Magic Sorter** (Fabbrica Binaria) | n/a (subscription SaaS) [9] | n/a ⚠ | Vacuum pickup, 7" touchscreen, plugin system, CSV with CardMarket/TCGplayer prices, 3D-printable spare parts [9] | **Dealer review (2 yrs in): set sort "basically non-functional, ruined cards most frequently"; support died at month 6, machine now a paperweight; 1,000-card cap blocks overnight runs** [18] |

### 2b. Physical sorters — consumer / DIY-adjacent

| Machine | Price | Throughput | Notes |
| --- | --- | --- | --- |
| **CardMill** (Kickstarter) | $500 Starter / $720 Heavy [6] | ~300/hr now, targeting ~600/hr [6] | 300-card hopper (800 w/ extension); **no recurring fees** (explicit anti-subscription pitch); 5,000+ units backed; **internet required**; TCGplayer pricing; CSV export [6] |
| **GlideSorter** (in development) | ~€1,500 DIY kit [8] | 25–30/min claimed (~1,500–1,800/hr) [8] | 6 bins + unknown; **offline on-device recognition**; 400-card feeder [8] — closest philosophical competitor to DeckSift |
| **DIY (Lego+RPi, Instructables, MAULT/DeckSift upstream)** | $200–800 [4] | 100–1,500/hr [4] | MAULT on MakerWorld is DeckSift's own upstream [repo]; hobby projects die on **card handling** ("foils with extreme curving… suction picks up multiple cards") [19] |

### 2c. Software-only / adjacent (the "TeraBox" question)

- **SortSwift** — the fastest-moving software play: free→$499/mo, 26+ TCGs, "99.9% accuracy" add-on, autopricing engine (535k prices/12h), 9 marketplace syncs, POS/buylist/kiosk, **and an optional 29-bin "Super Sorter" hardware at 3,200/hr** [10]. Software-first, hardware optional — the exact inverse of DeckSift's posture.
- **TCGplayer Scan & Identify** — phone/desktop scanner feeding TCGplayer listings; has a "Card Rejection Threshold" (conservative/standard) showing accuracy/rejection is a tuned tradeoff [21]; users report flaky accuracy ("works five cards, refuses the next five; adds multiple copies on its own") [22].
- ⚠ **ManaBox / Delver Lens / Collectr / BinderPOS** — scan-and-track apps (knowledge; not re-verified). ManaBox is repeatedly recommended over TCGplayer's scanner [22].
- **"TeraBox":** no TCG inventory product by that name could be found. In TCG circles the term is (a) the Pokémon "Tera Box" deck archetype and (b) a cloud-storage service. **Treat the task's "TeraBox" as misattributed; the real adjacent tools are the software platforms above.** (Uncertain — verified only by search, not exhaustive.)

### 2d. What incumbents do poorly (directly relevant to DeckSift)

Subscriptions/lock-in everywhere (Roca service plan [1][2], CardBot $160/mo [7], Magic Sorter SaaS [9]); Sifter even **requires a seller account + internet** [2]. CardMill and GlideSorter both market against this. ⚠ Multi-TCG is rare (Roca needs a separate machine for YGO [1]; Sifter launched with 4 games [3]) — DeckSift's 11-game single machine is a genuine edge [repo].

## 3. Feature wants ranked by value

Rank = value × frequency of being named in research. (D = DeckSift status per repo docs.)

| # | Want | Why it ranks | Evidence | D |
| --- | --- | --- | --- | --- |
| 1 | **Reliability / never damage cards** | Shops refuse machines that risk $50k collections; "make damage so rare you warranty it" | [19][18] | v2 hardening, jam watchdog [repo] |
| 2 | **Accuracy of identification** | Mis-ID = mispriced inventory; 99.9% is a *paid add-on* elsewhere | [10][22][20] | SigLIP+pgvector, confidence badge, review queue [repo] |
| 3 | **Value sift (price threshold bins)** | The #1 commercial use: "pull every card worth 50¢+ out of bulk" | [19][7][1][5] | Price rules + reject bin [repo] |
| 4 | **Digitization → listing export** | Inventory is the product for sellers; CSV → TCGplayer is table stakes | [2][10][6][1] | CSV + TCGplayer CSV built; API blocked [repo] |
| 5 | **Throughput (cards/hr)** | Labor-cost math is everything: 1,800/hr Sifter vs 500/hr Roca Sorter | [1][2][4][10] | ~1,200/hr claimed v1 [repo] |
| 6 | **Unattended batch + capacity** | "Run overnight, wake up to sorted cards"; 1,000-card cap criticized | [18][19][5] | Needs hopper/bin re-loads [repo] |
| 7 | **Set sorting with many bins** | Most-time-consuming sort; Magic Sorter failed it; Super Sorter has **29 bins** | [18][10][19] | 7 bins; per-set chase [repo] |
| 8 | **Foil/parallel detection** | Foils are different product IDs in OP/DBZ/Digimon; industry-first marketing | [5][2][repo] | Two-frame scan light [repo] |
| 9 | **Condition handling** | Condition drives price (NM vs LP); sellers grade manually today | [17][repo] | Condition field (defaults NM) [repo] |
| 10 | **Data ownership & privacy** | Cloud/seller-account requirements are a growing objection; offline is a sellable wedge | [2][6][8] | Fully local [repo] |
| 11 | **Multi-machine / station ops** | Big stores run 3–5 machines; one software drives the farm | [5][repo] | v2 plan [repo] |
| 12 | **Misprint/error detection** | Error cards are valuable; rare but high-stakes | [repo] | Amber flag built [repo] |

## 4. Pain points (common failures & complaints)

| Pain | What users say | Source |
| --- | --- | --- |
| **Jams / double-feeds** | "Since it runs on rollers, it will definitely jam at some point." Card handling is the hardest problem (curved foils, 1,000-card stacks, suction grabbing multiples) | [19] |
| **Misrouting / wrong bin** | PhyzBatch KB: "Cards are Sorting to the Wrong Bin" (stale DB); wrong-TCG-setting → everything "Unidentified" | [20] |
| **Flaky scanning** | TCGplayer scanner: "hit or miss… works five cards, refuses the next five, adds multiple copies on its own" | [22] |
| **Set-sort failure + card damage** | Magic Sorter: set sort "basically non-functional, ruined cards most frequently" | [18] |
| **Support death / no service** | Magic Sorter: vendor unresponsive from month 6; machine became a paperweight; owner begged for a third-party engineer | [18] |
| **Cost & ROI skepticism** | LGS: "cheaper than hiring a 17-year-old"; damage-liability; lease deposits; $22/day profit math doesn't cover a machine; Magic Sorter broke even at 6 months *only* because owner's own time was expensive | [19][18][4] |
| **Capacity limits** | 300–1,000 card hoppers can't run overnight; store wants 50k/night self-feed | [18][19][6][2] |
| **Subscription / account lock-in** | Sifter needs TCGplayer seller account + internet + $300/yr; CardBot $160/mo; Magic Sorter SaaS | [2][7][9] |
| **Calibration / setup** | PhyzBatch KB ships setup guides for "wrong setting" mistakes; DIY reviews call calibration the recurring chore ⚠ | [20] |

## 5. Implications for DeckSift's commercial readiness

**Where DeckSift already wins (per [repo] + this research):** cost (~$1k machine vs $8k–40k), multi-TCG on one machine (Roca needs a separate unit for YGO), no subscriptions, offline/privacy, raw sort throughput (~1,200/hr claimed vs Roca's 500 [repo][1]), value/set-chase/wishlist/bin rule flexibility (Roca's Pack Creator is the nearest comparable [1]).

**What matters most for a card shop (v2), in order:**
1. **Value-sift + digitize as a first-class workflow** — the single most-cited commercial want [19][7][1]. Software: make "sift by price threshold" a one-click mode with a clear bulk-inventory output (have the pieces: price rules, digitize mode, CSV; wire them into one "store intake" flow).
2. **Listing integration beyond CSV** — TCGplayer seller API (OAuth) is the gate [repo]; the research says listing is what makes machines pay for themselves [2][10]. Priority even though it's the hardest.
3. **Reliability telemetry + support** — shops forgive early hardware bugs if support is fast (every positive testimonial names support: [5][7]); Magic Sorter died on *no support* [18]. The measurement gate (cards/hr, jam rate, double-feeds per 1,000) in `HARDWARE_V2.md §7` [repo] is exactly the right first step.
4. **Unattended/large-batch capacity** — hopper extension and bigger bins directly answer the "overnight run" complaint [18][19].
5. **Condition capture** — sellers currently grade by hand; even a per-card photo + manual NM/LP/HP field per bin-rule would beat the status quo [17][repo].

**What matters most for home users (v1):** price/affordability, "no subscriptions" (market the *absence* of the $300/yr + seller-account requirements [2]), gentle handling, quick setup/calibration, export to their existing trackers (ManaBox/TCGplayer CSV import/export both directions), fun/set-completeness. Correctness over speed [repo].

**Honest gaps the research surfaced:** 7 bins vs 29-bin Super Sorter [10]; sleeved-card handling (Sifter does it [2]; CardMill only perfect-fits [6]); orientation tolerance beyond flip (Sifter reads any orientation [2]); 99.9%-accuracy marketing is a benchmark DeckSift must *measure* against, not claim [10]; "TeraBox"-type software adjacency means DeckSift should keep the CSV/export door open rather than build a POS.

## 6. Future-upgrade wishlist (marked in/out of scope)

**In scope (software, v1/v2):**
- Store "intake mode": hopper → value-sift by threshold → digitize → CSV/TCGplayer export in one pass. [in scope — highest ROI]
- TCGplayer price source + listing API (blocked on seller-account keys; CSV path first). [in scope, blocked]
- Per-card condition photo capture stored with each scan (grading-ready record, no AI grading). [in scope — small]
- Duplicate/overstock control ("keep max N copies per card" — PhyzBatch feature [5]). [in scope — small]
- Pre-release set data support (match PhyzBatch's "sort new sets before release" [5]). [in scope — medium]
- Sort-to-ship: import order/pull-sheet CSV → route to bins by order (copy Roca's "Sort to Ship" [1]). [in scope — medium]
- Export to eBay/Shopify/ManaBox CSVs beyond TCGplayer. [in scope — small]
- Shop reports: cards/hr, jams/1,000, labor-hours saved, estimated $ saved (the ROI evidence shops ask for [7][19]). [in scope — small]
- Multi-machine station software (already in v2 plan [repo]). [in scope — v2]
- More bins / bin-stacking hardware mod (29-bin is the commercial bar [10]). [in scope — v2 hardware]

**Out of scope (flag for later, don't build now):**
- AI condition grading (PSA-class) — separate tech; capture images now, grade later. [out of scope]
- Sports cards — different catalog/market. [out of scope]
- Cloud/multi-tenant SaaS, marketplace POS/kiosk, buylist portal — contradicts DeckSift's local-first identity; SortSwift owns that lane. [out of scope]
- Injection molding / full production tooling — gated on measured volume [repo]. [out of scope until v2 gate]
- Sleeved-card feeder for all sleeves — hardware R&D; perfect-fit first is CardMill's compromise [6]. [out of scope for v1]

## Sources

Verified by direct fetch: [1] seller.tcgplayer.com/roca · [2] nerdbeak.com/news/tcgplayer-roca-sifter-card-sorting-robot-march-2026 · [3] techraptor.net/tabletop/news/tcgplayer-announces-new-compact-roca-sifter-card-sorting-device-for-hobby-stores-and · [4] cardsellertools.com · [5] tcgmachines.com · [6] cardmill.com · [7] cardcastle.co/cardbot · [8] glidesorter.com · [9] magic-sorter.com · [10] sortswift.com · [11] mordorintelligence.com (TCG market report) · [12] researchandmarkets.com / finance.yahoo.com (TCG market) · [13] gminsights.com (TCG market) · [14] verifiedmarketresearch.com (TCG market) · [15] businessresearchinsights.com (grading volume) · [16] gripsintelligence.com/insights/retailers/tcgplayer.com · [17] en.wikipedia.org/wiki/Trading_card

Search-snippet verified (forums/KB block direct fetch): [18] reddit.com/r/mtgfinance — "Comparison of card sorting machines on the market" (Magic Sorter owner review, Sep 2022; seller threads) · [19] reddit.com/r/magicTCG — "Card Sorting Machine & Game Tracker" (Nov 2014, Timevaultgames needs; "Why are there no card sorting machines", Apr 2018) · [20] support.tcgmachines.com KB — sorting guide, wrong-bin article · [21] help.tcgplayer.com — "How Scan & Identify Technology Works" (rejection threshold) · [22] reddit.com/r/mtgfinance — "Am I doing something wrong or is the TCGPlayer scanner just not that good?" (Feb 2026)

Repo-internal: [23] `custom/HARDWARE_V2.md §7` (Roca comparison), `custom/PRODUCT.md`, `README.md` — DeckSift capabilities/claims.
