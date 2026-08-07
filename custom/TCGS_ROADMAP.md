# TCG integration roadmap & data-source tracker

**Goal: 20 functioning, currently-popular TCGs.** A game is "functioning" when
its game row exists, the adapter can search, and the sync can populate the
card database with **images** (images are the hard requirement — the SigLIP
embedding pipeline can't work without card art).

**Current count: 11 integrated, 4 syncing now.** Adding a game = one config in
`packages/server/src/lib/card-search/generic-configs.ts` + registration in
`resolve.ts` / `sync-job.ts` / the image allowlist in `routes/card.ts` + a seed
row in `packages/server/scripts/seed-local.ts`. The seeder is idempotent
(`cd packages/server && npx tsx --env-file ../../.env scripts/seed-local.ts`).

## ✅ Integrated (11)

| # | Game | Source | Cards | Images | Sync |
| --- | --- | --- | --- | --- | --- |
| 1 | MTG | Scryfall | 54,009 | ✅ | ✅ done |
| 2 | Pokémon | TCGdex | 21,756 | ✅ | ✅ done |
| 3 | Yu-Gi-Oh! | YGOPRODeck | 14,477 | ✅ | ✅ done |
| 4 | Digimon | digimoncard.io | 4,373 | ✅ | ✅ done |
| 5 | Gundam | gundam-gcg.com | 1,816 | ✅ | ✅ done |
| 6 | Union Arena | apitcg/union-arena-tcg-data | 541 | ✅ | ✅ done |
| 7 | Disney Lorcana | lorcana-api.com | 2,694 | ✅ | ✅ done |
| 8 | One Piece | buhbbl/punk-records | 4,672 | ✅ | 🔄 running |
| 9 | Star Wars: Unlimited | Team-Zura/swu-cards-json | 9,058 | ✅ | ⏳ queued |
| 10 | Flesh and Blood | the-fab-cube/flesh-and-blood-cards | 16,264 printings | ✅ | 🔄 re-syncing (per-printing rarity) |
| 11 | Pokémon TCG Pocket | flibustier/pokemon-tcg-pocket-database | 3,761 | ✅ | ⏳ queued |

Notes: FAB images come from the dataset's `image_url` fields (Google
Storage/S3/CloudFront CDNs — fabdb.net itself is unreachable from this
machine, but its CDNs are not). FAB syncs **one row per printing**
(`printing_unique_id`), so a card reprinted across sets keeps its per-set
rarity and art — cards with identical art across printings embed the same
(scan matching picks any row; the rarity shown is that printing's).
SWU/FAB catalogs are 39–53 MB, so the first search per 15-min cache window
is slow; Pocket images resolve 1:1 from the companion pokemon-tcg-exchange
repo.

## 🎯 Remaining target games — deep research (verified 2026-08)

Each row lists the best source options found, what's blocking, and a concrete
**action you can take**.

| Game | Source options found | Blocker | What to do |
| --- | --- | --- | --- |
| **Dragon Ball Super** | Official `en.dbs-card.com` (has a card DB with art) | Unreachable from this machine (connection fails — likely geo/WAF); `dbscards.com` is a static GoDaddy site; no GitHub dataset with images found | Try `en.dbs-card.com` from another network/VPN and open its card list — if it loads, I can scrape it into a dataset. Check the JP site `dbs-card.com`. Ask the DBS Discord/Reddit for a maintained JSON export |
| **Cardfight!! Vanguard** | Official `en.cf-vanguard.com` (responds, but root/cardlist 404 from here) | Region/WAF path-gated; no GitHub dataset with images found | Browse the official site in a browser to find the working card-DB URL (I need just the real path), or find a community dataset on the Vanguard Discord |
| **Weiss Schwarz** | Official `en.ws-tcg.com` (responds, root 404); only per-anime-series sim data on GitHub (JonahSMS/Weiss-Sim-Card-Data — fragmented, no unified EN catalog) | No unified image-bearing EN catalog found | Same as Vanguard: find the official card-list URL, or a community "all sets" JSON. The sim data could be merged if images are added |
| **Final Fantasy TCG** | `ffdecks.com` (deck site, SPA — may have an internal API); official `ff-tcg.com` unreachable from here | No dataset found | Open ffdecks.com and check DevTools → Network for a JSON cards endpoint; report the URL and I'll wire it |
| **Hololive OCG** | Fan DBs (H2KFORGIVEN/hololive-cardgame-fanmade; ChinGuang/hololive-tcg-model) | Fan sites are interactive, no stable image-bearing JSON verified | Check the fan practice site's network requests for a card JSON + image CDN |
| **Shadowverse Evolve** | anthonychian/shadowverse-client (33★ simulator — card data lives in its `server/` or `api/` dir) | Data is embedded in app code, not shipped as a clean JSON | Clone the repo and look for a cards JSON/SQL dump; if found, I'll map it |
| **Altered TCG** | PolluxTroy0/Altered-TCG-Card-Database (per-set, per-faction files + an IMAGES dir); official `api.altered.gg` dead | Fragmented — no single combined file or verified image URL pattern | If you want it, I can consolidate the per-set JSON + image dir into a single dataset file (needs a one-time local build step) |
| **Duel Masters** | Latepate64/duel-masters-json (26★ — complete data) | **No image URLs** in the dataset; no reachable image host found | Find the official/community image CDN (dm-wiki, takaratomy) and give me the URL pattern — data side is ready |
| **WIXOSS** | yyasakura/WIXOSS-CARDS-JSON (tiny, unverified) | Unverified quality; no images | Only worth it if you care about WIXOSS; verify the dataset + find images |
| **Battle Spirits** | None (JP-only) | No English source | Skip unless you're building a JP-focused rig |

## 🚫 Skipped (per earlier analysis)

MetaZoo (discontinued), Legend of the Five Rings (not booster-based), Warhammer
40K TCG / Bakugan (different formats), One Piece's `optcg-api` REST API
(key-gated — **free on request**, would add prices + fresher data if you want
to email the author per that repo's README).

## 🔧 Finding the "needed parts" — general playbook

1. **Images are the gate.** A dataset without art is useless to us. If you find
   a card *list*, look for its image CDN (often `cdn.<game>.com` or
   `storage.googleapis.com`). One working image URL = a pattern I can use for
   the whole game.
2. **Official sites that block this machine** (`en.dbs-card.com`,
   `en.cf-vanguard.com`, `en.ws-tcg.com`, `ff-tcg.com`) often work from a
   phone/browser/VPN. Just get me the real card-list URL and whether images are
   predictable — I'll handle the rest (including a scraper if needed).
3. **Community datasets:** game-specific Discords/Reddits usually have someone
   maintaining a JSON export (that's where punk-records, swu-cards-json, and
   fab-cube came from). Ask for "card data + images JSON" — most maintainers
   are happy to share.
4. **The Wayback Machine** (`web.archive.org`) can surface old card-DB pages
   and their API paths if a site changed.
5. **Keep the tracker honest:** every claim above was verified by direct
   probing on this machine today (2026-08). When you take an action, update the
   row — I can re-verify and integrate the moment a source becomes available.
