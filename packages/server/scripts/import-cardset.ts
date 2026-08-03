/**
 * Import a card dataset file into the local cards table.
 *
 * Some TCGs (One Piece, Dragon Ball Super/Fusion World, …) have no clean,
 * hosted JSON API — community sources distribute card lists as data files.
 * This script ingests such a file: each card is normalized via a field
 * mapping, its art is embedded with the local SigLIP model (same path as the
 * sync job), and the row is stored in `cards` with card_data so hydration,
 * search, and binning all work offline.
 *
 * Usage (from packages/server):
 *   npx tsx --env-file ../../.env scripts/import-cardset.ts <gameKey> <cards.json> [--map map.json] [--limit N]
 *
 * The dataset file must be a JSON array of card objects. Without --map it
 * tries common field names (id/name/set_code|set/image_url|image/rarity).
 * A mapping file uses dotted field paths, e.g.:
 *   {
 *     "id": "productId",
 *     "name": "name",
 *     "setCode": "set",
 *     "imageTemplate": "https://example.com/cards/{id}.jpg",
 *     "rarity": "rarity",
 *     "typeLine": "type"
 *   }
 * `imageUrl` (a field path) and `imageTemplate` (with {id} placeholder) are
 * interchangeable.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { db } from "../src/db";
import { cardImageVectors } from "../src/db/schema";
import { baseCard, imageUris } from "../src/lib/card-search/generic";
import type { PlayingCard } from "@magic-vault/shared";
import { vectorizeImageFromBuffer } from "../src/lib/vectorize";

interface Mapping {
  id?: string;
  name?: string;
  setCode?: string;
  imageUrl?: string;
  imageTemplate?: string;
  rarity?: string;
  typeLine?: string;
  colors?: string;
  oracleText?: string;
  collectorNumber?: string;
}

function getPath(obj: Record<string, unknown>, path: string | undefined): unknown {
  if (!path) return undefined;
  let cur: unknown = obj;
  for (const key of path.split(".")) {
    if (cur && typeof cur === "object" && key in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return cur;
}

function toCard(raw: Record<string, unknown>, m: Mapping): PlayingCard {
  const id = String(getPath(raw, m.id) ?? "");
  const imageUrl =
    (m.imageUrl ? String(getPath(raw, m.imageUrl) ?? "") : "") ||
    (m.imageTemplate ? m.imageTemplate.replace("{id}", id) : "");
  const card = baseCard();
  card.id = id;
  card.oracle_id = id;
  card.name = String(getPath(raw, m.name) ?? "");
  card.set = String(getPath(raw, m.setCode) ?? "");
  card.set_id = card.set;
  card.collector_number = String(getPath(raw, m.collectorNumber) ?? card.set);
  card.rarity = String(getPath(raw, m.rarity) ?? "").toLowerCase();
  card.type_line = String(getPath(raw, m.typeLine) ?? "");
  card.oracle_text = String(getPath(raw, m.oracleText) ?? "") || undefined;
  const color = getPath(raw, m.colors);
  card.colors = Array.isArray(color)
    ? color.map(String)
    : color
      ? [String(color)]
      : [];
  card.color_identity = card.colors;
  card.image_uris = imageUris(imageUrl || undefined);
  return card;
}

function parseArgs(argv: string[]): { gameKey: string; file: string; map?: string; limit?: number } {
  const positional = argv.filter((a) => !a.startsWith("--"));
  const flag = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : undefined;
  };
  return {
    gameKey: positional[0] ?? "",
    file: positional[1] ?? "",
    map: flag("map"),
    limit: flag("limit") ? parseInt(flag("limit")!, 10) : undefined,
  };
}

async function main(): Promise<void> {
  const { gameKey, file, map, limit } = parseArgs(process.argv.slice(2));
  if (!gameKey || !file) {
    console.error("Usage: import-cardset.ts <gameKey> <cards.json> [--map map.json] [--limit N]");
    process.exit(1);
  }
  const filePath = join(process.cwd(), file);
  if (!existsSync(filePath)) {
    console.error(`Dataset not found: ${filePath}`);
    process.exit(1);
  }

  const mapping: Mapping = map
    ? (JSON.parse(readFileSync(join(process.cwd(), map), "utf8")) as Mapping)
    : {
        id: "id",
        name: "name",
        setCode: "set_code",
        imageUrl: "image_url",
        rarity: "rarity",
      };

  const cards = JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>[];
  const slice = limit ? cards.slice(0, limit) : cards;
  console.log(`Importing ${slice.length} of ${cards.length} cards for game key "${gameKey}"...`);

  let processed = 0;
  let skipped = 0;
  let errors = 0;
  for (const raw of slice) {
    const card = toCard(raw, mapping);
    if (!card.id) {
      skipped++;
      continue;
    }
    // Resolve the raw art URL directly from the mapping (image_uris holds the
    // proxied UI URL, not the fetchable source).
    const id = card.id;
    const imageUrl =
      (mapping.imageUrl ? String(getPath(raw, mapping.imageUrl) ?? "") : "") ||
      (mapping.imageTemplate
        ? mapping.imageTemplate.replace("{id}", id)
        : "");
    if (!imageUrl) {
      skipped++;
      continue;
    }
    try {
      const res = await fetch(imageUrl, {
        headers: { "User-Agent": "MagicVault/1.0" },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`image fetch ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      const embedding = await vectorizeImageFromBuffer(buffer);
      await db
        .insert(cardImageVectors)
        .values({
          scryfallId: card.id,
          gameKey,
          name: card.name,
          setCode: card.set,
          embedding,
          cardData: card,
        })
        .onConflictDoNothing();
      processed++;
      if (processed % 50 === 0) console.log(`  ${processed} embedded...`);
    } catch (err) {
      errors++;
      console.error(`  error ${card.name} (${card.id}): ${err instanceof Error ? err.message : err}`);
    }
  }
  console.log(`Done. Processed: ${processed}, Skipped: ${skipped}, Errors: ${errors}`);
  process.exit(0);
}

void main();
