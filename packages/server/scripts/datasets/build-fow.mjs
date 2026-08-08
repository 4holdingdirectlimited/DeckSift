/**
 * Builds the Force of Will dataset for import-cardset.
 *
 * Source: Niebvelungen/TCG-Arena-FoW — cards.json (clusters → sets → cards)
 * plus image_cache.json (card id → S3 art URL, verified reachable).
 *
 * Usage (from repo root):
 *   node packages/server/scripts/datasets/build-fow.mjs <repoDir> <outFile>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [, , repoDir, outFile] = process.argv;
if (!repoDir || !outFile) {
  console.error("usage: build-fow.mjs <repoDir> <outFile>");
  process.exit(1);
}

const data = JSON.parse(
  readFileSync(join(repoDir, "cards.json"), "utf8"),
).fow;
const imageCache = JSON.parse(
  readFileSync(join(repoDir, "image_cache.json"), "utf8"),
);

const results = [];
for (const cluster of data.clusters) {
  for (const set of cluster.sets) {
    for (const card of set.cards) {
      const id = String(card.id ?? "");
      if (!id) continue;
      results.push({
        id,
        name: String(card.name ?? ""),
        set_code: set.code ?? "",
        set_name: set.name ?? "",
        image_url:
          imageCache[id] ?? `https://fowsim.s3.amazonaws.com/media/cards/${id}.jpg`,
        rarity: String(card.rarity ?? "").toLowerCase(),
        collector_number: id,
        type_line: [card.type, card.race].filter(Boolean).flat().join(" - "),
        colors: Array.isArray(card.colour) ? card.colour.join(",") : "",
        oracle_text: Array.isArray(card.abilities)
          ? card.abilities.join("\n")
          : "",
      });
    }
  }
}

writeFileSync(outFile, JSON.stringify(results));
console.log(`Wrote ${results.length} Force of Will cards to ${outFile}`);
