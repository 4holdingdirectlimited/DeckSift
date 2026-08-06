# Multi-TCG support plan

Goal: the sorter handles any trading card game through the same scan → match →
bin → bundle pipeline. The vision model (SigLIP) is game-agnostic; the game
differences live entirely in the **card data adapters**.

## The architecture (built, `packages/server/src/lib/card-search/`)

- **`generic.ts`** — config-driven adapter factory. One code path implements
  search, by-id lookup, and bulk sync; a game contributes only a **config**
  (URLs + field mapping). No per-game adapter files.
- **`generic-configs.ts`** — the configs. Each is ~40 lines of data.
- Per-game pieces that remain: registering the config in
  `resolve.ts` (search) + `sync-job.ts` (sync), adding image hosts to the
  proxy allowlist in `routes/card.ts`, and creating the game row in the web
  admin UI (Settings → Games) with its rarity field definitions.

## Games wired and verified (2026-08)

| Game | Source | Status |
| --- | --- | --- |
| MTG | Scryfall | ✅ built-in adapter, synced (54,009 rows, full card data) |
| Gundam | gundam-gcg.com | ✅ built-in adapter, synced (1,816 rows — card data backfilled 2026-08) |
| Pokémon | TCGdex | ✅ built-in adapter, synced (21,756 rows, full card data) |
| **Yu-Gi-Oh!** | YGOPRODeck (`db.ygoprodeck.com/api/v7`) | ✅ generic config, endpoints verified (search + byId + images) — synced (14,477 rows) |
| **Digimon** | digimoncard.io (`search.php`) | ✅ generic config, endpoints verified (search + bulk + images) — synced (4,373 rows with images; the rest of the ~9k catalog lacks usable artwork) |
| **Lorcana** | lorcana-api.com (`api.lorcana-api.com/cards/all`) | ✅ generic config, added 2026-08 (2,694 cards, 13 sets, official Ravensburger art, search filtered client-side via `searchFilter` — the API has no name-search) — sync pending |
| **One Piece** | punk-records dataset (`english/index/cards_by_id.json`) | ✅ generic config, added 2026-08 (4,672 cards, official Bandai CDN art) — sync pending |
| **Star Wars: Unlimited** | swu-cards-json dataset (`data/v1/all-cards.json`) | ✅ generic config, added 2026-08 (9,058 cards, official FFG CDN art — note: 53 MB catalog) — sync pending |
| **Union Arena** | union-arena-tcg-data (`cards/en/general.json`) | ✅ generic config, added 2026-08 (541 cards, official Bandai CDN art; rarity codes stay as codes — c/u/r/sr/ur + ★ variants) — sync pending |

All five games' `card_data` is populated, so library browsing, detail
hydration, and bundle/chase CSV exports work fully offline.

For a new game: create the game row (key must match the config's `key`:
`yugioh`, `digimon`, …), then run its sync once (bulk embed, one-time).

## No-API games: dataset import path

One Piece, Dragon Ball Super/Fusion World, and Flesh and Blood currently have
**no clean, hosted, public JSON API** (verified 2026-08 — optcgdb's API gateway
rejects direct access, official sites have no API, dbscards is a static site,
fabdb unreachable). Community sources distribute these games' card lists as
**data files** instead. The dataset importer bridges that gap:

```bash
cd packages/server
npx tsx --env-file ../../.env scripts/import-cardset.ts \
  <gameKey> <path/to/cards.json> [--map mapping.json] [--limit N]
```

Each card is normalized via a small field-mapping file (or common field-name
defaults), embedded with the local SigLIP model, and stored in `cards` with
full card data — search, binning, and bundles then work offline exactly like
the synced games. Verified end-to-end with a real YGOPRODeck export.

To onboard One Piece or DBZ: obtain a trustworthy dataset file (the community
sources are in flux — ask your local card community which one they trust, or
I can research a specific candidate on request), write the ~5-line mapping,
run the importer once.

## Top 20 TCGs and their data-source status

Ranked roughly by 2025–26 market presence; exact order shifts quarterly and
the list past #15 is contested — what matters is the config architecture makes
each of these a small, independent addition.

| # | Game | Data source | Effort |
| --- | --- | --- | --- |
| 1 | Pokémon | TCGdex | ✅ done |
| 2 | Magic: The Gathering | Scryfall | ✅ done |
| 3 | Yu-Gi-Oh! | YGOPRODeck | ✅ done |
| 4 | One Piece Card Game | punk-records GitHub dataset (official Bandai art) | ✅ done (2026-08) |
| 5 | Dragon Ball Super / Super Fusion World | community sites (dbscards); no official API | dataset import (see above) |
| 6 | Disney Lorcana | lorcana-api.com (community API, official Ravensburger artwork) | ✅ done (2026-08) |
| 7 | Flesh and Blood | fabdb.net API (unreachable from this machine 2026-08); fab-cube dataset has **no image URLs** | blocked on images — revisit if fabdb returns |
| 8 | Digimon | digimoncard.io | ✅ done |
| 9 | Star Wars Unlimited | swu-cards-json dataset (official FFG art) | ✅ done (2026-08) |
| 10 | Cardfight!! Vanguard | no reliable public API | source research needed |
| 11 | Gundam | gundam-gcg.com | ✅ done |
| 12 | Weiss Schwarz | no reliable public API (per-series sim data only) | source research needed |
| 13 | Union Arena | union-arena-tcg-data dataset (official Bandai art) | ✅ done (2026-08) |
| 14 | Final Fantasy TCG | community deck sites; no clean API | source research needed |
| 15 | Hololive Official Card Game | no public API | source research needed |
| 16 | Shadowverse Evolve | no public API | source research needed |
| 17 | Dragon Ball Z (2008–) | (see Dragon Ball Super) | — |
| 18 | MetaZoo | effectively discontinued | skip |
| 19 | Legend of the Five Rings (LCG) | not booster-based | skip |
| 20 | Warhammer 40,000 TCG / Bakugan | different formats / toy-hybrid | skip |

Notes:
- Games with **no official API** need a community-maintained bulk JSON (cards +
  images + rarity). That source is the research step; once found, the config
  lands in a day (mapping + verify + sync).
- **Foil identity**: DBZ, One Piece, and Digimon have foil/parallel variants
  that are *different product IDs*. The bulk source must list both variants;
  holo detection (scan light) then feeds card identity, not just a badge.
- **Rarity normalization**: each game's rarity codes differ (MTG
  common/uncommon/rare/mythic, YGO Common→Ghost Rare, Digimon c/u/r/sr/sec,
  One Piece C/UC/R/SR/SEC…). The `games.field_definitions` (web UI) maps each
  game's codes onto the bin rules, so bundle recipes work identically.

## Recommended next games

**Integrated 2026-08 (all verified live):** Lorcana (2,694), One Piece
(4,672), Star Wars: Unlimited (9,058), Union Arena (541) — each is a generic
config; run its sync once from Admin (Settings → Games must have a matching
game row — the seeder adds them).

Still needing a data source (all re-verified 2026-08; the blocker is almost
always **images** — a dataset without art can't feed the embedding pipeline):

| Game | Status / blocker |
| --- | --- |
| Dragon Ball Super | `dbscards.com` static; no GitHub dataset with images found |
| Flesh and Blood | fab-cube dataset is complete but **no image URLs**; `fabdb.net` unreachable |
| Cardfight!! Vanguard | no dataset with images found |
| Weiss Schwarz | only per-anime-series sim data, no unified EN catalog with images |
| Final Fantasy TCG | ffdecks is a SPA; no dataset found |
| Hololive | fan databases only, no stable image-bearing JSON |
| Shadowverse Evolve | sim-client code exists, no shipped dataset |
| Duel Masters | `duel-masters-json` has data but **no image URLs** |
| Altered TCG | per-set card DB with an IMAGES dir, but no combined file/URL pattern verified |
| WIXOSS | tiny 0-star dataset, unverified |
| MetaZoo | discontinued |

## Future: TCGplayer integration (digitize → price → list)

Investigation summary (2026-08) — this is a **plan**, not yet built. It pairs
with the scanner's **Digitize mode**: bulk-record cards, then turn that record
into priced, listable inventory.

### What the API offers (v1.39, verified)

| Area | Endpoints | Notes |
| --- | --- | --- |
| **Catalog** | categories / groups (sets) / products / SKUs / GTIN lookup / category search | Products = a unique printing; SKUs = product × condition. Search is the matching path (name + set + collector #). |
| **Pricing** | market price by product/SKU/group, buylist prices | Per-request, key-gated — **no bulk price dump** like Scryfall; needs an on-demand cache |
| **Inventory** | product lists (digital buylists) | |
| **Stores** | seller inventory (SKU qty/prices, batch updates), orders, order manifests, customers, shipping | Order manifest ≈ Roca's “Sort to Ship” |

### Requirements / blockers

1. **OAuth 2.0 with a TCGplayer seller account + API application approval.**
   The API is for sellers; keys are granted per-application. This is the
   gate — no key, no integration.
2. **Product/SKU matching.** Every synced card must be matched to a TCGplayer
   productId (then SKUId by condition). A “match to TCGplayer” sync job
   (name + set + collector number → catalog search → store productId) is the
   biggest chunk of work and the accuracy risk.
3. **Prices are per-request** — cache them (same pattern as the art cache:
   on-demand lookup, store `price_updated_at`, refresh daily).
4. **Condition grading** — TCGplayer sells by condition (Near Mint, Lightly
   Played…). Our scans don't grade; the operator sets a default condition
   (usually NM) per export.

### Suggested roadmap (low-friction first)

1. **Bulk-inventory CSV export (no API needed):** a “TCGplayer CSV” export
   from a collection/digitize session — SKU-free but TCGplayer's portal
   accepts name/set/number + quantity + price + condition uploads for manual
   listing. This is the 80/20 win and needs zero API access.
2. **Price source adapter:** with API keys, a `tcgplayer` price source in the
   same family as Scryfall/YGO — fills `prices.usd` for value rules + bundle
   value, cached per card.
3. **Catalog match job:** resolve every synced card to a productId/SKUId and
   persist it (one-time per game, then incrementally for new sets).
4. **Full automation (optional):** store inventory sync (prices/qty via batch
   endpoints), order manifest → sort-to-ship using our bundle/chase data.

Revisit when a seller account with API access exists — the scanner side
(digitize mode) is already built so the integration is additive.
