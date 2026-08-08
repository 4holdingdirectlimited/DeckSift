/**
 * Builds the Weiss Schwarz dataset for import-cardset.
 *
 * Source: JonahSMS/Weiss-Sim-Card-Data — per-series CardData.txt (a custom
 * line format) with real EN card scans stored in the repo (served via
 * raw.githubusercontent.com). Image matching is series-specific (RWBY uses
 * RWBY_WX03_001.jpg, Kantai KC_S25_E001.jpg, Quintuplets 5HY_W101_001.jpg,
 * Log Horizon LH_SE20_E01.jpg), so each card's image is found by scanning the
 * repo's image files for one whose basename ends with `_<set>_<number>.jpg`.
 *
 * Usage (from repo root):
 *   node packages/server/scripts/datasets/build-weiss.mjs <repoDir> <outFile>
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RAW_BASE =
  "https://raw.githubusercontent.com/JonahSMS/Weiss-Sim-Card-Data/main";

const [, , repoDir, outFile] = process.argv;
if (!repoDir || !outFile) {
  console.error("usage: build-weiss.mjs <repoDir> <outFile>");
  process.exit(1);
}

/** Collect every image file's repo-relative path. */
function collectImages(dir, base) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    const rel = join(base, entry.name).replace(/\\/g, "/");
    if (entry.isDirectory()) out.push(...collectImages(full, rel));
    else if (/\.(jpg|jpeg|png|webp)$/i.test(entry.name)) out.push(rel);
  }
  return out;
}

function parseCardData(file) {
  const cards = [];
  let current = null;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = trimmed.match(/^Character:\s*(\S+)\/([A-Z0-9]+)-([A-Z]?\d+)$/i);
    if (m) {
      if (current) cards.push(current);
      current = { code: `${m[1]}/${m[2]}-${m[3]}`, name: "", set: m[2].toUpperCase(), number: m[3] };
      continue;
    }
    if (current && /^Name\s/i.test(trimmed)) {
      current.name = trimmed.replace(/^Name\s+/, "").trim();
    }
  }
  if (current) cards.push(current);
  return cards;
}

const images = collectImages(repoDir, "");
const imageIndex = new Map();
for (const rel of images) {
  const base = rel.split("/").pop().replace(/\.(jpg|jpeg|png|webp)$/i, "");
  imageIndex.set(base.toLowerCase(), rel);
}

const results = [];
let matched = 0;
const seriesDirs = readdirSync(repoDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

for (const series of seriesDirs) {
  const seriesPath = join(repoDir, series);
  const txtFiles = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name === "CardData.txt") txtFiles.push(full);
    }
  };
  walk(seriesPath);

  for (const txt of txtFiles) {
    for (const card of parseCardData(txt)) {
      if (!card.name) continue;
      // Match image: basename ends with `_<set>_<number>` (plain, not SP/SSP).
      const key = `_${card.set}_${card.number}`.toLowerCase();
      const rel = Array.from(imageIndex.entries()).find(
        ([k]) => k.endsWith(key) && !/sp|ssp$/i.test(k),
      )?.[1];
      if (!rel) continue;
      matched++;
      results.push({
        id: card.code,
        name: card.name,
        set_code: card.set,
        image_url: `${RAW_BASE}/${rel}`,
        rarity: "",
        collector_number: card.number,
        type_line: "Character",
      });
    }
  }
}

writeFileSync(outFile, JSON.stringify(results));
console.log(`Wrote ${results.length} Weiss Schwarz cards to ${outFile} (${matched} with images)`);
