/**
 * Builds the Duel Masters dataset for import-cardset.
 *
 * Source: Latepate64/duel-masters-json (DuelMastersCards.json — 1,152 card
 * objects with printings). Images: the English Fandom wiki CDN
 * (static.wikia.nocookie.net/duelmasters) — the filename comes from the wiki's
 * `pageimage` (fetched in batches via the MediaWiki API) with a deterministic
 * `name.jpg` fallback; the CDN URL is a pure function of the filename (md5
 * path layout). Verified 200 image/webp for real cards.
 *
 * Usage (from repo root):
 *   node packages/server/scripts/datasets/build-duel-masters.mjs <repoDir> <outFile>
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const WIKI_API = "https://duelmasters.fandom.com/api.php";
const CDN_BASE = "https://static.wikia.nocookie.net/duelmasters/images";

const [, , repoDir, outFile] = process.argv;
if (!repoDir || !outFile) {
  console.error("usage: build-duel-masters.mjs <repoDir> <outFile>");
  process.exit(1);
}

const data = JSON.parse(
  readFileSync(join(repoDir, "DuelMastersCards.json"), "utf8"),
);

function cdnUrl(filename) {
  const h = createHash("md5").update(filename).digest("hex");
  return `${CDN_BASE}/${h[0]}/${h.slice(0, 2)}/${encodeURIComponent(filename)}/revision/latest`;
}

/** Fandom pageimage map (batch 50 titles per call). */
async function fetchPageImages(names) {
  const map = new Map();
  for (let i = 0; i < names.length; i += 50) {
    const batch = names.slice(i, i + 50);
    const url = `${WIKI_API}?action=query&format=json&redirects=1&prop=pageimages&piprop=name&titles=${encodeURIComponent(
      batch.join("|"),
    )}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "MagicVault/1.0" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) continue;
    const json = await res.json();
    for (const page of Object.values(json.query?.pages ?? {})) {
      if (page.title && page.pageimage) map.set(page.title, page.pageimage);
    }
  }
  return map;
}

async function main() {
  // A few dataset names are mojibake/typo'd vs the wiki titles (verified by
  // the source investigation): fix them so the wiki lookup matches.
  const fixName = (n) =>
    n
      .replaceAll("Ãœberdragon", "Überdragon")
      .replace("Hypersprint Warior", "Hypersprint Warrior");

  const pageImages = await fetchPageImages(data.cards.map((c) => fixName(c.name)));
  console.log(`pageimage map: ${pageImages.size}/${data.cards.length} names`);

  const results = [];
  let deterministic = 0;
  for (const card of data.cards) {
    const name = fixName(card.name);
    for (const p of card.printings) {
      const id = `${card.name}::${p.set}::${p.id}`;
      const setCode = p.set.match(/^(DM-\d+)/)?.[1] ?? "PROMO";
      const file =
        pageImages.get(name) ??
        (() => {
          deterministic++;
          return name.replace(/\s+/g, "_") + ".jpg";
        })();
      results.push({
        id,
        name: card.name,
        set_code: setCode,
        set_name: p.set,
        image_url: cdnUrl(file),
        rarity: String(p.rarity ?? "").toLowerCase(),
        collector_number: p.id,
        type_line: Array.isArray(card.type) ? card.type.join(" ") : card.type ?? "",
        oracle_text: card.text ?? "",
      });
    }
  }

  writeFileSync(outFile, JSON.stringify(results));
  console.log(
    `Wrote ${results.length} Duel Masters printings to ${outFile} (${deterministic} deterministic image names)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
