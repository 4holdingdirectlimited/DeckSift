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
| MTG | Scryfall | ✅ built-in adapter, synced |
| Gundam | gundam-gcg.com | ✅ built-in adapter |
| Pokémon | TCGdex | ✅ built-in adapter |
| **Yu-Gi-Oh!** | YGOPRODeck (`db.ygoprodeck.com/api/v7`) | ✅ generic config, endpoints verified (search + byId + images) |
| **Digimon** | digimoncard.io (`search.php`) | ✅ generic config, endpoints verified (search + bulk + images) |

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
| 4 | One Piece Card Game | community JSON (GitHub datasets); no official API | dataset import (see above) |
| 5 | Dragon Ball Super / Super Fusion World | community sites (dbscards); no official API | dataset import (see above) |
| 6 | Disney Lorcana | community APIs (lorcana-focused); none official | source research needed |
| 7 | Flesh and Blood | fabdb.net API (unreachable from this machine 2026-08) | re-verify / dataset import |
| 8 | Digimon | digimoncard.io | ✅ done |
| 9 | Star Wars Unlimited | swudb.com (site is a SPA — API unconfirmed) | verify endpoint |
| 10 | Cardfight!! Vanguard | no reliable public API | source research needed |
| 11 | Gundam | gundam-gcg.com | ✅ done |
| 12 | Weiss Schwarz | no reliable public API | source research needed |
| 13 | Union Arena | no public API (Bandai) | source research needed |
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

1. **One Piece** and **Dragon Ball Super** (user's stated targets) — needs the
   community source research; the config architecture is ready.
2. **Flesh and Blood** (fabdb) — likely the fastest add if the endpoint checks
   out.
3. Anything else from the table on demand — one config + one sync each.
