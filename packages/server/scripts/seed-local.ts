/**
 * First-run setup for the fully-local single-user build.
 *
 * Creates the game rows (keys must match the server adapters), a default
 * collection, and an active bin set so the app is usable without clicking
 * through Settings → Games / Collections / Bins.
 *
 * Idempotent — safe to re-run; it upserts games by key and only creates the
 * collection / bin set when none exist yet.
 *
 * Usage (from packages/server):
 *   npx tsx --env-file ../../.env scripts/seed-local.ts
 */
import { eq, sql } from "drizzle-orm";
import { db } from "../src/db";
import {
  bins,
  binSets,
  bundleConfigs,
  collections,
  games,
} from "../src/db/schema";
import {
  BIN_COUNT,
  computeAllBinCapacities,
  createDefaultCatchAllOnlyBins,
  FIELD_DEFINITIONS,
  type BundleTarget,
  type FieldMeta,
} from "@magic-vault/shared";

const LOCAL_ORG_ID = "local-org";

interface GameSeed {
  key: string;
  name: string;
  dataSourceUrl: string;
  /** Rarity values as produced by the adapter (lowercased). */
  rarities: string[];
}

const GAMES: GameSeed[] = [
  {
    key: "mtg",
    name: "Magic: The Gathering",
    dataSourceUrl: "https://api.scryfall.com/cards",
    rarities: ["common", "uncommon", "rare", "mythic"],
  },
  {
    key: "yugioh",
    name: "Yu-Gi-Oh!",
    dataSourceUrl: "https://db.ygoprodeck.com/api/v7/cardinfo.php",
    rarities: ["common", "rare", "super rare", "ultra rare", "secret rare"],
  },
  {
    key: "digimon",
    name: "Digimon Card Game",
    dataSourceUrl:
      "https://digimoncard.io/api-public/search?series=Digimon%20Card%20Game",
    rarities: [
      "common",
      "uncommon",
      "rare",
      "super rare",
      "secret rare",
      "ultra rare",
      "promo",
    ],
  },
  {
    key: "gundam",
    name: "Gundam Card Game",
    dataSourceUrl: "https://api.gcgapi.com/v1/cards",
    rarities: [
      "common",
      "uncommon",
      "rare",
      "super rare",
      "ultra rare",
      "legend rare",
      "promo",
      "common+",
      "uncommon+",
      "rare+",
      "super rare+",
      "ultra rare+",
      "legend rare+",
    ],
  },
  {
    key: "pokemon",
    name: "Pokémon",
    dataSourceUrl: "https://api.tcgdex.net/v2/en/cards",
    rarities: [
      "common",
      "uncommon",
      "rare",
      "double rare",
      "ultra rare",
      "illustration rare",
      "special illustration rare",
      "hyper rare",
    ],
  },
  {
    key: "lorcana",
    name: "Disney Lorcana",
    dataSourceUrl: "https://api.lorcana-api.com/cards/all",
    rarities: [
      "common",
      "uncommon",
      "rare",
      "super rare",
      "legendary",
      "epic",
      "enchanted",
      "iconic",
    ],
  },
  {
    key: "onepiece",
    name: "One Piece Card Game",
    dataSourceUrl:
      "https://raw.githubusercontent.com/buhbbl/punk-records/main/english/index/cards_by_id.json",
    rarities: [
      "common",
      "uncommon",
      "rare",
      "super rare",
      "secret rare",
      "treasure rare",
      "special",
      "leader",
      "promo",
    ],
  },
  {
    key: "starwars",
    name: "Star Wars: Unlimited",
    dataSourceUrl:
      "https://raw.githubusercontent.com/Team-Zura/swu-cards-json/main/data/v1/all-cards.json",
    rarities: ["common", "uncommon", "rare", "legendary", "special"],
  },
  {
    key: "unionarena",
    name: "Union Arena",
    dataSourceUrl:
      "https://raw.githubusercontent.com/apitcg/union-arena-tcg-data/main/cards/en/general.json",
    rarities: [
      "c",
      "u",
      "r",
      "sr",
      "ur",
      "c★",
      "u★",
      "r★",
      "sr★",
      "sr★★",
      "sr★★★",
    ],
  },
  {
    key: "fab",
    name: "Flesh and Blood",
    dataSourceUrl:
      "https://raw.githubusercontent.com/the-fab-cube/flesh-and-blood-cards/main/json/english/card-flattened.json",
    rarities: [
      "common",
      "rare",
      "super rare",
      "majestic",
      "legendary",
      "fabled",
      "token",
      "basic",
      "marvel",
      "promo",
    ],
  },
  {
    key: "pokemonpocket",
    name: "Pokémon TCG Pocket",
    dataSourceUrl:
      "https://raw.githubusercontent.com/flibustier/pokemon-tcg-pocket-database/main/dist/cards.json",
    rarities: [
      "common",
      "uncommon",
      "rare",
      "double rare",
      "art rare",
      "super rare",
      "special art rare",
      "immersive rare",
      "crown rare",
      "shiny",
      "shiny super rare",
    ],
  },
];

/** FIELD_DEFINITIONS with the rarity options replaced for the given game. */
function fieldDefinitionsFor(game: GameSeed): FieldMeta[] {
  return FIELD_DEFINITIONS.map((field) => {
    if (field.field !== "rarity") return field;
    return {
      ...field,
      options: game.rarities.map((value) => ({
        value,
        label: value
          .split(" ")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" "),
      })),
    };
  });
}

async function seedGames(): Promise<void> {
  for (const game of GAMES) {
    const fieldDefinitions = fieldDefinitionsFor(game);
    const [row] = await db
      .insert(games)
      .values({
        key: game.key,
        name: game.name,
        dataSourceUrl: game.dataSourceUrl,
        fieldDefinitions,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: games.key,
        set: {
          name: game.name,
          dataSourceUrl: game.dataSourceUrl,
          fieldDefinitions,
          isActive: true,
          updatedAt: new Date(),
        },
      })
      .returning({ id: games.id, key: games.key });
    console.log(`  game ${row.key}: ${row.id}`);
  }
}

async function seedCollection(): Promise<void> {
  const existing = await db
    .select({ id: collections.id })
    .from(collections)
    .where(eq(collections.orgId, LOCAL_ORG_ID))
    .limit(1);
  if (existing.length > 0) {
    console.log("  collection: already exists, skipping");
    return;
  }
  const [mtg] = await db
    .select({ id: games.id, guid: games.guid })
    .from(games)
    .where(eq(games.key, "mtg"))
    .limit(1);
  const [row] = await db
    .insert(collections)
    .values({
      name: "My Collection",
      isActive: true,
      gameId: mtg?.id ?? null,
      orgId: LOCAL_ORG_ID,
    })
    .returning({ id: collections.id });
  console.log(`  collection created: id=${row.id} (mtg)`);
}

async function seedBinSet(): Promise<void> {
  const existing = await db
    .select({ id: binSets.id })
    .from(binSets)
    .where(eq(binSets.orgId, LOCAL_ORG_ID))
    .limit(1);
  if (existing.length > 0) {
    console.log("  bin set: already exists, skipping");
    return;
  }
  const [mtg] = await db
    .select({ id: games.id })
    .from(games)
    .where(eq(games.key, "mtg"))
    .limit(1);
  const defaultBins = createDefaultCatchAllOnlyBins();
  const capacities = computeAllBinCapacities();
  const [set] = await db
    .insert(binSets)
    .values({
      name: "Default 7 Bins",
      isActive: true,
      gameId: mtg?.id ?? null,
      orgId: LOCAL_ORG_ID,
    })
    .returning({ id: binSets.id });
  await db.insert(bins).values(
    defaultBins.map((b) => ({
      binNumber: b.binNumber,
      rules: b.rules,
      isCatchAll: b.isCatchAll,
      // Overflow protection: capacity derived from the physical bin heights
      // (155/110/65/60 mm) and average card thickness (0.3 mm).
      maxCapacity: capacities[b.binNumber] ?? 0,
      binSet: set.id,
      orgId: LOCAL_ORG_ID,
    })),
  );
  console.log(
    `  bin set created: id=${set.id} with ${BIN_COUNT} bins (bin ${BIN_COUNT} = catch-all), capacities=${JSON.stringify(capacities)}`,
  );
}

// A ready-made 15/15/5/5 MTG bundle (rarity names match Scryfall). Edit or
// delete it in the UI — it's just a starting point. Per-game rarities differ
// (YGO/Digimon use e.g. "super rare"), so this default targets the MTG names.
async function seedBundleConfig(): Promise<void> {
  const existing = await db
    .select({ id: bundleConfigs.id })
    .from(bundleConfigs)
    .where(eq(bundleConfigs.orgId, LOCAL_ORG_ID))
    .limit(1);
  if (existing.length > 0) {
    console.log("  bundle config: already exists, skipping");
    return;
  }
  const targets: BundleTarget[] = [
    { rarity: "common", count: 15, binNumber: 1 },
    { rarity: "uncommon", count: 15, binNumber: 2 },
    { rarity: "rare", count: 5, binNumber: 3 },
    { rarity: "mythic", count: 5, binNumber: 4 },
  ];
  const [row] = await db
    .insert(bundleConfigs)
    .values({
      name: "Standard Bundle (15/15/5/5)",
      targets,
      rejectBinNumber: 7,
      gameKey: "mtg",
      isActive: true,
      orgId: LOCAL_ORG_ID,
    })
    .returning({ id: bundleConfigs.id });
  console.log(`  bundle config created: id=${row.id} (MTG rarities, reject → bin 7)`);
}

async function main(): Promise<void> {
  console.log("Seeding local database…");
  console.log("Games:");
  await seedGames();
  console.log("Collection:");
  await seedCollection();
  console.log("Bin set:");
  await seedBinSet();
  console.log("Bundle config:");
  await seedBundleConfig();
  console.log(
    "Done. Next: open http://localhost:5173/app and run a card sync in Admin.",
  );
  // Keep the pool alive long enough for the writes to flush.
  await sql`select 1`;
  process.exit(0);
}

void main();
