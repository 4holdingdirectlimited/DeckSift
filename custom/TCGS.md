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
| **Lorcana** | lorcana-api.com (`api.lorcana-api.com/cards/all`) | ✅ generic config, added 2026-08 (2,694 cards, 13 sets, official Ravensburger art, search filtered client-side via `searchFilter` — the API has no name-search) — ✅ synced |
| **One Piece** | punk-records dataset (`english/index/cards_by_id.json`) | ✅ generic config, added 2026-08 (4,672 cards, official Bandai CDN art) — ✅ synced |
| **Star Wars: Unlimited** | swu-cards-json dataset (`data/v1/all-cards.json`) | ✅ generic config, added 2026-08 (9,058 cards, official FFG CDN art — note: 53 MB catalog) — ✅ synced |
| **Union Arena** | union-arena-tcg-data (`cards/en/general.json`) | ✅ generic config, added 2026-08 (541 cards, official Bandai CDN art; rarity codes stay as codes — c/u/r/sr/ur + ★ variants) — ✅ synced (363 rows in DB; catalog has 541, some share artwork) |
| **Flesh and Blood** | the-fab-cube dataset (`json/english/card-flattened.json`) | ✅ generic config, added 2026-08 (16,264 printings, image_url fields on Google Storage/S3/CloudFront — fabdb.net unreachable but its CDNs are not) — ✅ synced (16,240 rows) |
| **Pokémon TCG Pocket** | flibustier database + exchange images | ✅ generic config, added 2026-08 (3,761 cards, images resolve from the companion pokemon-tcg-exchange repo) — ✅ synced (3,761 rows) |
| **Altered TCG** | PolluxTroy0/Altered-TCG-Card-Database (repo art via raw.githubusercontent) | ✅ dataset import, added 2026-08 — 3,464 cards (search/hydration via local-DB adapter, no live API) |
| **Force of Will** | Niebvelungen/TCG-Arena-FoW (`fowsim.s3.amazonaws.com` art) | ✅ dataset import, added 2026-08 — 7,272 cards (local-DB adapter) |
| **Duel Masters** | Latepate64/duel-masters-json + Fandom wiki CDN art | ✅ dataset import, added 2026-08 — 1,248 printings (local-DB adapter) |
| **Weiss Schwarz** | JonahSMS/Weiss-Sim-Card-Data (repo scans via raw.githubusercontent) | ✅ dataset import, added 2026-08 — 581 cards (local-DB adapter) |

All games' `card_data` is populated (**15 games**, API games synced with status
`idle`; dataset games imported via `scripts/import-cardset.ts`), so library
browsing, detail hydration, and bundle/chase CSV exports work fully offline.
Live counts: MTG 54,126 · Pokémon 21,775 · Yu-Gi-Oh! 14,478 · FAB 16,240 ·
FoW 7,272 · SWU 9,051 · Altered 3,464 · One Piece 4,672 · Digimon 4,373 ·
Pokémon Pocket 3,761 · Lorcana 2,686 · DM 1,248 · Gundam 1,816 · Weiss 581 ·
Union Arena 363.

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
| 7 | Flesh and Blood | fab-cube dataset (`image_url` fields — fabdb.net itself unreachable, CDNs work) | ✅ done (2026-08, 16,240 printings synced) |
| 8 | Digimon | digimoncard.io | ✅ done |
| 9 | Star Wars Unlimited | swu-cards-json dataset (official FFG art) | ✅ done (2026-08) |
| 10 | Cardfight!! Vanguard | no reliable public API | source research needed |
| 11 | Gundam | gundam-gcg.com | ✅ done |
| 12 | Weiss Schwarz | Weiss-Sim-Card-Data (EN scans, `CardData.txt`) | ✅ done (2026-08, 581 cards) |
| 13 | Union Arena | union-arena-tcg-data dataset (official Bandai art) | ✅ done (2026-08) |
| 14 | Final Fantasy TCG | community deck sites; no clean API | source research needed |
| 15 | Hololive Official Card Game | no public API | source research needed |
| 16 | Shadowverse Evolve | sim-client data exists, no image URLs | source research needed |
| 17 | Altered TCG | Altered-TCG-Card-Database (repo art) | ✅ done (2026-08, 3,464 cards) |
| 18 | Duel Masters | duel-masters-json + Fandom wiki art | ✅ done (2026-08, 1,248 printings) |
| 19 | Force of Will | TCG-Arena-FoW (`fowsim.s3.amazonaws.com` art) | ✅ done (2026-08, 7,272 cards) |
| 20 | Dragon Ball Z (2008–) | (see Dragon Ball Super) | — |

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

## Multi-language cards

**Scanning foreign-language cards works today** — the vision matcher (SigLIP)
compares artwork, not text, so a Japanese/French/German printing of a card
with the same art embeds close to the English row and matches. Verified
2026-08-08 with a Japanese MTG printing: cosine distance 0.25 vs the English
row (match threshold 0.30). No interface changes needed — the app stays
English; foreign cards just identify correctly.

**Localized names** are stored per card when the data source provides them
cheaply, and the Library search matches them (search "Dracaufeu" to find
Charizard):

| Game | Localized names | Source |
| --- | --- | --- |
| Pokémon | ✅ fr/de/es/it/pt (20,222 cards) | TCGdex per-locale list endpoints (cheap: one paginated list per locale, no per-card fetches) |
| Altered TCG | 🟡 possible (not imported) | The dataset repo ships per-language card files (CARDS/FR, /DE, /ES, /IT) + per-language art (`allImagePath`); the EN import could be extended |
| MTG | ❌ | Scryfall `unique_artwork` bulk omits `foreign_data`; switching bulk files would change dedupe semantics |
| Yu-Gi-Oh! | ❌ | YGOPRODeck removed its localized name fields (`frname`/`dename`/…) from the API (verified 2026-08) |
| Others | ❌ | Dataset sources ship English only |

Where a source starts shipping localized names, populate them the same way:
add the field to the config's `toCard()` (`card.names`, BCP-47 keys) and
re-run `packages/server/scripts/backfill-localized-names.ts` to update
existing rows without re-embedding.

## Recommended next games

**Live tracker with per-game actions:** `custom/TCGS_ROADMAP.md` — what's
integrated, what's blocked, and what to do to unblock each remaining game.

**Integrated 2026-08 (all verified live):** the 11 API games + 4 dataset games
(Altered 3,464 · FoW 7,272 · Duel Masters 1,248 · Weiss 581) = **15 games**,
all searchable from the Library.

Still needing a data source (all re-verified 2026-08; the blocker is almost
always **images** — a dataset without art can't feed the embedding pipeline):

| Game | Status / blocker |
| --- | --- |
| Dragon Ball Super / Fusion World | images-only repo found (`TCG-Arena-DBSFW`), no metadata JSON; `dbscards.com` static |
| Cardfight!! Vanguard | no dataset with images found (community API stores its DB in Firestore) |
| Final Fantasy TCG | ffdecks is a SPA; API not trivially exposed (check DevTools → Network) |
| Hololive | fan databases only, no stable image-bearing JSON |
| Shadowverse Evolve | sim-client data has English names but **no image URLs**; official CDN pattern not found |
| WIXOSS | JP-only dataset (736 cards), no images |
| My Hero Academia / Warhammer 40K / Buddyfight | no image-bearing dataset on GitHub yet |
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

1. **API keys — currently unobtainable for new accounts.** The API is
   key-gated (public/private key → bearer token, v1.39 verified from the
   official docs). TCGplayer is **no longer granting new API access**
   (official docs, verified 2026-08 — "We are no longer granting new API
   access at this time"), so a new seller account cannot apply for keys.
   The only path forward via the API is an account that already holds keys
   from before the freeze. Everything below stays valid for when access
   reopens.
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

1. **Bulk-inventory CSV export (no API needed) — ✅ built.** The “TCGplayer
   CSV” export from a collection/digitize session — SKU-free but TCGplayer's
   portal accepts name/set/number + quantity + price + condition uploads for
   manual listing. This is the 80/20 win and needs zero API access. Also note
   the app already prices MTG + Yu-Gi-Oh! without the TCGplayer API:
   Scryfall carries TCGplayer market prices for MTG, and YGOPRODeck's
   `tcgplayer_price` field *is* the TCGplayer market price.
2. **Price source adapter:** with API keys, a `tcgplayer` price source in the
   same family as Scryfall/YGO — fills `prices.usd` for value rules + bundle
   value, cached per card. (Parked until keys exist.)
3. **Catalog match job:** resolve every synced card to a productId/SKUId and
   persist it (one-time per game, then incrementally for new sets).
4. **Full automation (optional):** store inventory sync (prices/qty via batch
   endpoints), order manifest → sort-to-ship using our bundle/chase data.

Revisit when TCGplayer reopens API applications (or an existing-key account
is available) — the scanner side (digitize mode) is already built so the
integration is additive.
