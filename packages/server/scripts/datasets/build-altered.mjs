/**
 * Builds the Altered TCG dataset for import-cardset.
 *
 * Source: PolluxTroy0/Altered-TCG-Card-Database (sparse clone: CARDS only).
 * One JSON-LD card file per card. Art: the repo's own EN images served from
 * raw.githubusercontent.com (the official S3 `imagePath` bucket rejects direct
 * requests with 403, so the repo images are the reliable source).
 *
 * Usage (from repo root):
 *   node packages/server/scripts/datasets/build-altered.mjs <repoDir> <outFile>
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const RAW_BASE =
  "https://raw.githubusercontent.com/PolluxTroy0/Altered-TCG-Card-Database/main/IMAGES/en";

const [, , repoDir, outFile] = process.argv;
if (!repoDir || !outFile) {
  console.error("usage: build-altered.mjs <repoDir> <outFile>");
  process.exit(1);
}

const cardsDir = join(repoDir, "CARDS", "EN");
if (!existsSync(cardsDir)) {
  console.error(`no CARDS/EN in ${repoDir}`);
  process.exit(1);
}

const results = [];
for (const setDir of readdirSync(cardsDir)) {
  const setPath = join(cardsDir, setDir);
  if (!existsSync(setPath)) continue;
  for (const sub of readdirSync(setPath)) {
    const subPath = join(setPath, sub);
    if (!existsSync(subPath)) continue;
    for (const file of readdirSync(subPath)) {
      if (!file.endsWith(".json")) continue;
      const raw = JSON.parse(readFileSync(join(subPath, file), "utf8"));
      const id = raw.reference ?? raw["@id"]?.replace("/cards/", "") ?? file.replace(".json", "");
      if (!id) continue;
      const elements = raw.elements ?? {};
      results.push({
        id,
        name: raw.name ?? "",
        set_code: raw.cardSet?.reference ?? "",
        set_name: raw.cardSet?.name ?? "",
        image_url: `${RAW_BASE}/${setDir}/${id}.jpg`,
        rarity: raw.rarity?.name?.toLowerCase() ?? "",
        collector_number: raw.collectorNumber ?? "",
        type_line: [raw.cardType?.name, ...(raw.cardSubTypes ?? []).map((s) => s.name)]
          .filter(Boolean)
          .join(" - "),
        colors: raw.mainFaction?.name ?? "",
        oracle_text: elements.MAIN_EFFECT ?? "",
      });
    }
  }
}

writeFileSync(outFile, JSON.stringify(results));
console.log(`Wrote ${results.length} Altered cards to ${outFile}`);
