/**
 * Backfills localized card names into existing synced rows without re-embedding.
 *
 * The sync stores one row per card and (onConflictDoNothing) never updates an
 * existing row, so a code change that adds fields to card_data doesn't reach
 * rows synced before it. This script re-runs the localized-name list fetch
 * (fr/de/es/it/pt via TCGdex's cheap per-locale list endpoints) and writes
 * just the `names` map into card_data via jsonb_set — embeddings and
 * everything else are untouched.
 *
 * Run from packages/server:
 *   npx tsx --env-file ../../.env scripts/backfill-localized-names.ts
 */
import { Pool } from "pg";
import {
  fetchLocalizedNameMaps,
  POKEMON_DEFAULT_URL,
  POKEMON_HEADERS,
} from "../src/lib/pokemon/search";

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

async function main() {
  console.log("Fetching Pokémon localized name lists (fr/de/es/it/pt)...");
  const names = await fetchLocalizedNameMaps(POKEMON_DEFAULT_URL);
  console.log(`Got localized names for ${names.size} cards.`);

  const updateSql = `UPDATE cards
       SET card_data = jsonb_set(card_data, '{names}', $2::jsonb)
     WHERE game_key = 'pokemon' AND scryfall_id = $1
       AND (card_data->'names') IS DISTINCT FROM $2::jsonb`;

  let updated = 0;
  let withNames = 0;
  let processed = 0;
  for (const [id, localized] of names) {
    const clean = Object.fromEntries(
      Object.entries(localized).filter(([, v]) => v),
    );
    if (Object.keys(clean).length === 0) continue;
    withNames++;
    const result = await pool.query(updateSql, [id, JSON.stringify(clean)]);
    updated += result.rowCount ?? 0;
    processed++;
    if (processed % 5000 === 0) {
      console.log(`...${processed}/${names.size} (${updated} rows updated)`);
    }
  }

  console.log(
    `Done: ${withNames} cards carry localized names, ${updated} rows updated.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => pool.end());
