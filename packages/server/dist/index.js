"use strict";
var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/index.ts
var import_node_server = require("@hono/node-server");
var import_hono10 = require("hono");
var import_cors = require("hono/cors");

// src/routes/admin.ts
var import_drizzle_orm5 = require("drizzle-orm");
var import_hono = require("hono");
var import_streaming = require("hono/streaming");

// src/db/index.ts
var import_pg = require("pg");
var import_drizzle_orm2 = require("drizzle-orm");
var import_node_postgres = require("drizzle-orm/node-postgres");

// src/db/schema.ts
var schema_exports = {};
__export(schema_exports, {
  binRelations: () => binRelations,
  binSetAudit: () => binSetAudit,
  binSetRelations: () => binSetRelations,
  binSets: () => binSets,
  bins: () => bins,
  cardImageVectors: () => cardImageVectors,
  collectionCards: () => collectionCards,
  collectionCardsRelations: () => collectionCardsRelations,
  collectionRelations: () => collectionRelations,
  collections: () => collections,
  feederConfigAudit: () => feederConfigAudit,
  feederConfigs: () => feederConfigs,
  games: () => games,
  moduleConfigAudit: () => moduleConfigAudit,
  moduleConfigs: () => moduleConfigs,
  notificationSettings: () => notificationSettings,
  orgSettings: () => orgSettings
});
var import_drizzle_orm = require("drizzle-orm");
var import_rls = require("drizzle-orm/neon/rls");
var import_pg_core = require("drizzle-orm/pg-core");
var import_relations = require("drizzle-orm/relations");
var vector = (0, import_pg_core.customType)({
  dataType() {
    return "vector(768)";
  },
  toDriver(value) {
    return JSON.stringify(value);
  },
  fromDriver(value) {
    return JSON.parse(value);
  }
});
var orgRls = (orgId) => import_drizzle_orm.sql`(${orgId} = (current_setting('request.jwt.claims', true)::json ->> 'org_id')) AND auth_is_org_member(${orgId})`;
var cardImageVectors = (0, import_pg_core.pgTable)(
  "cards",
  {
    id: (0, import_pg_core.serial)().primaryKey(),
    guid: (0, import_pg_core.uuid)("guid").defaultRandom(),
    scryfallId: (0, import_pg_core.text)("scryfall_id").notNull(),
    gameKey: (0, import_pg_core.text)("game_key").notNull().default("mtg"),
    name: (0, import_pg_core.text)("name").notNull(),
    setCode: (0, import_pg_core.text)("set_code").notNull(),
    embedding: vector("embedding").notNull(),
    createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow().notNull(),
    updatedAt: (0, import_pg_core.timestamp)("updated_at").defaultNow().notNull()
  },
  (table) => [
    // Per-game uniqueness: sync jobs run per game key, and the same scryfall
    // id could theoretically exist under another game's namespace. A global
    // unique on scryfall_id alone would silently swallow per-game conflicts
    // (sync-job uses onConflictDoNothing and would report them as processed).
    (0, import_pg_core.unique)("cards_game_key_scryfall_id_idx").on(table.gameKey, table.scryfallId),
    // Vector search in routes/card.ts does `WHERE game_key = ... AND
    // embedding <=> ? < 0.3 ORDER BY embedding <=> ?` over the whole table —
    // a sequential scan per scan request without these.
    (0, import_pg_core.index)("cards_game_key_idx").on(table.gameKey),
    (0, import_pg_core.index)("cards_embedding_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops")
    ),
    (0, import_rls.crudPolicy)({
      role: import_rls.authenticatedRole,
      read: true,
      modify: false
    })
  ]
).enableRLS();
var games = (0, import_pg_core.pgTable)(
  "games",
  {
    id: (0, import_pg_core.serial)().primaryKey(),
    guid: (0, import_pg_core.uuid)("guid").defaultRandom(),
    key: (0, import_pg_core.text)("key").notNull(),
    name: (0, import_pg_core.text)("name").notNull(),
    dataSourceUrl: (0, import_pg_core.text)("data_source_url").notNull(),
    fieldDefinitions: (0, import_pg_core.jsonb)("field_definitions").notNull(),
    isActive: (0, import_pg_core.boolean)("is_active").notNull().default(true),
    createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow().notNull(),
    updatedAt: (0, import_pg_core.timestamp)("updated_at").defaultNow().notNull()
  },
  (table) => [
    (0, import_pg_core.unique)("games_key_idx").on(table.key),
    (0, import_pg_core.unique)("games_guid_idx").on(table.guid),
    (0, import_rls.crudPolicy)({
      role: import_rls.authenticatedRole,
      read: true,
      modify: false
    })
  ]
).enableRLS();
var binSets = (0, import_pg_core.pgTable)(
  "bin_sets",
  {
    id: (0, import_pg_core.serial)().primaryKey(),
    guid: (0, import_pg_core.uuid)("guid").defaultRandom(),
    name: (0, import_pg_core.text)("name").notNull(),
    isActive: (0, import_pg_core.boolean)("is_active").notNull().default(false),
    gameId: (0, import_pg_core.integer)("game_id").references(() => games.id),
    orgId: (0, import_pg_core.text)("org_id").notNull(),
    createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow().notNull(),
    updatedAt: (0, import_pg_core.timestamp)("updated_at").defaultNow().notNull()
  },
  (table) => [
    (0, import_pg_core.unique)("bin_sets_guid_idx").on(table.guid),
    (0, import_rls.crudPolicy)({
      role: import_rls.authenticatedRole,
      read: orgRls(table.orgId),
      modify: orgRls(table.orgId)
    })
  ]
).enableRLS();
var bins = (0, import_pg_core.pgTable)(
  "bins",
  {
    id: (0, import_pg_core.serial)().primaryKey(),
    guid: (0, import_pg_core.uuid)("guid").defaultRandom(),
    rules: (0, import_pg_core.jsonb)("rules").notNull(),
    isCatchAll: (0, import_pg_core.boolean)("is_catch_all").notNull().default(false),
    maxCapacity: (0, import_pg_core.integer)("max_capacity").notNull().default(0),
    binNumber: (0, import_pg_core.integer)("bin_number").notNull(),
    binSet: (0, import_pg_core.integer)("bin_set").notNull().references(() => binSets.id),
    orgId: (0, import_pg_core.text)("org_id").notNull(),
    createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow().notNull(),
    updatedAt: (0, import_pg_core.timestamp)("updated_at").defaultNow().notNull()
  },
  (table) => [
    (0, import_pg_core.unique)("bins_guid_idx").on(table.guid),
    // FK lookups: _snapshotBinSet and delete/update paths filter by bin_set.
    (0, import_pg_core.index)("bins_bin_set_idx").on(table.binSet),
    (0, import_rls.crudPolicy)({
      role: import_rls.authenticatedRole,
      read: orgRls(table.orgId),
      modify: orgRls(table.orgId)
    })
  ]
).enableRLS();
var moduleConfigs = (0, import_pg_core.pgTable)(
  "module_configs",
  {
    id: (0, import_pg_core.serial)().primaryKey(),
    guid: (0, import_pg_core.uuid)("guid").defaultRandom(),
    moduleNumber: (0, import_pg_core.integer)("module_number").notNull(),
    orgId: (0, import_pg_core.text)("org_id").notNull(),
    // Defaults mirror DEFAULT_CALIBRATION in @magic-vault/shared so a row
    // inserted without an explicit payload matches what the UI/firmware expect
    // (previously the DB defaults disagreed with the shared constants and
    // would drive the sorter to wrong positions).
    bottomClosed: (0, import_pg_core.integer)("bottom_closed").notNull().default(400),
    bottomOpen: (0, import_pg_core.integer)("bottom_open").notNull().default(150),
    paddleClosed: (0, import_pg_core.integer)("paddle_closed").notNull().default(420),
    paddleOpen: (0, import_pg_core.integer)("paddle_open").notNull().default(150),
    pusherLeft: (0, import_pg_core.integer)("pusher_left").notNull().default(150),
    pusherNeutral: (0, import_pg_core.integer)("pusher_neutral").notNull().default(230),
    pusherRight: (0, import_pg_core.integer)("pusher_right").notNull().default(300),
    createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow().notNull(),
    updatedAt: (0, import_pg_core.timestamp)("updated_at").defaultNow().notNull()
  },
  (table) => [
    (0, import_pg_core.unique)("module_configs_org_module_idx").on(table.orgId, table.moduleNumber),
    (0, import_rls.crudPolicy)({
      role: import_rls.authenticatedRole,
      read: orgRls(table.orgId),
      modify: orgRls(table.orgId)
    })
  ]
).enableRLS();
var feederConfigs = (0, import_pg_core.pgTable)(
  "feeder_configs",
  {
    id: (0, import_pg_core.serial)().primaryKey(),
    guid: (0, import_pg_core.uuid)("guid").defaultRandom(),
    orgId: (0, import_pg_core.text)("org_id").notNull(),
    // Defaults mirror DEFAULT_FEEDER_CALIBRATION in @magic-vault/shared.
    speed: (0, import_pg_core.integer)("speed").notNull().default(250),
    duration: (0, import_pg_core.integer)("duration").notNull().default(3e3),
    pulseDuration: (0, import_pg_core.integer)("pulse_duration").notNull().default(80),
    pauseDuration: (0, import_pg_core.integer)("pause_duration").notNull().default(0),
    settleDuration: (0, import_pg_core.integer)("settle_duration").notNull().default(500),
    createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow().notNull(),
    updatedAt: (0, import_pg_core.timestamp)("updated_at").defaultNow().notNull()
  },
  (table) => [
    (0, import_pg_core.unique)("feeder_configs_org_idx").on(table.orgId),
    (0, import_rls.crudPolicy)({
      role: import_rls.authenticatedRole,
      read: orgRls(table.orgId),
      modify: orgRls(table.orgId)
    })
  ]
).enableRLS();
var collections = (0, import_pg_core.pgTable)(
  "collections",
  {
    id: (0, import_pg_core.serial)().primaryKey(),
    guid: (0, import_pg_core.uuid)("guid").defaultRandom(),
    name: (0, import_pg_core.text)("name").notNull(),
    isActive: (0, import_pg_core.boolean)("is_active").notNull().default(false),
    gameId: (0, import_pg_core.integer)("game_id").references(() => games.id),
    orgId: (0, import_pg_core.text)("org_id").notNull(),
    createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow().notNull(),
    updatedAt: (0, import_pg_core.timestamp)("updated_at").defaultNow().notNull()
  },
  (table) => [
    (0, import_pg_core.unique)("collections_guid_idx").on(table.guid),
    (0, import_rls.crudPolicy)({
      role: import_rls.authenticatedRole,
      read: orgRls(table.orgId),
      modify: orgRls(table.orgId)
    })
  ]
).enableRLS();
var collectionCards = (0, import_pg_core.pgTable)(
  "collection_cards",
  {
    id: (0, import_pg_core.serial)().primaryKey(),
    guid: (0, import_pg_core.uuid)("guid").defaultRandom(),
    collectionId: (0, import_pg_core.integer)("collection_id").notNull().references(() => collections.id, { onDelete: "cascade" }),
    scryfallId: (0, import_pg_core.text)("scryfall_id").notNull(),
    card: (0, import_pg_core.jsonb)("card").notNull(),
    scannedAt: (0, import_pg_core.timestamp)("scanned_at").notNull(),
    binNumber: (0, import_pg_core.integer)("bin_number"),
    capturedImageDataUrl: (0, import_pg_core.text)("captured_image_data_url"),
    isFoil: (0, import_pg_core.boolean)("is_foil").notNull().default(false),
    isDownloaded: (0, import_pg_core.boolean)("is_downloaded").notNull().default(false),
    alternativeMatches: (0, import_pg_core.jsonb)("alternative_matches"),
    orgId: (0, import_pg_core.text)("org_id").notNull(),
    createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow().notNull()
  },
  (table) => [
    (0, import_pg_core.unique)("collection_cards_guid_idx").on(table.guid),
    // Per-collection card list + cascade deletes filter by collection_id on
    // every scan session load and clear.
    (0, import_pg_core.index)("collection_cards_collection_id_idx").on(table.collectionId),
    (0, import_pg_core.index)("collection_cards_scryfall_id_idx").on(table.scryfallId),
    (0, import_rls.crudPolicy)({
      role: import_rls.authenticatedRole,
      read: orgRls(table.orgId),
      modify: orgRls(table.orgId)
    })
  ]
).enableRLS();
var notificationSettings = (0, import_pg_core.pgTable)(
  "notification_settings",
  {
    id: (0, import_pg_core.serial)().primaryKey(),
    guid: (0, import_pg_core.uuid)("guid").defaultRandom(),
    orgId: (0, import_pg_core.text)("org_id").notNull(),
    discordWebhookUrl: (0, import_pg_core.text)("discord_webhook_url"),
    createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow().notNull(),
    updatedAt: (0, import_pg_core.timestamp)("updated_at").defaultNow().notNull()
  },
  (table) => [
    (0, import_pg_core.unique)("notification_settings_org_idx").on(table.orgId),
    (0, import_rls.crudPolicy)({
      role: import_rls.authenticatedRole,
      read: orgRls(table.orgId),
      modify: orgRls(table.orgId)
    })
  ]
).enableRLS();
var orgSettings = (0, import_pg_core.pgTable)(
  "org_settings",
  {
    id: (0, import_pg_core.serial)().primaryKey(),
    guid: (0, import_pg_core.uuid)("guid").defaultRandom(),
    orgId: (0, import_pg_core.text)("org_id").notNull(),
    primaryColor: (0, import_pg_core.text)("primary_color"),
    scannerLayout: (0, import_pg_core.text)("scanner_layout"),
    discordWebhookUrl: (0, import_pg_core.text)("discord_webhook_url"),
    discordNotifyOnScan: (0, import_pg_core.boolean)("discord_notify_on_scan").notNull().default(false),
    scanCoverage: (0, import_pg_core.integer)("scan_coverage"),
    scanOffsetX: (0, import_pg_core.integer)("scan_offset_x"),
    scanOffsetY: (0, import_pg_core.integer)("scan_offset_y"),
    createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow().notNull(),
    updatedAt: (0, import_pg_core.timestamp)("updated_at").defaultNow().notNull()
  },
  (table) => [
    (0, import_pg_core.unique)("org_settings_org_idx").on(table.orgId),
    (0, import_rls.crudPolicy)({
      role: import_rls.authenticatedRole,
      read: orgRls(table.orgId),
      modify: orgRls(table.orgId)
    })
  ]
).enableRLS();
var binSetAudit = (0, import_pg_core.pgTable)(
  "bin_set_audit",
  {
    id: (0, import_pg_core.serial)().primaryKey(),
    guid: (0, import_pg_core.uuid)("guid").defaultRandom(),
    binSetGuid: (0, import_pg_core.text)("bin_set_guid").notNull(),
    snapshot: (0, import_pg_core.jsonb)("snapshot").notNull(),
    orgId: (0, import_pg_core.text)("org_id").notNull(),
    createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow().notNull()
  },
  (table) => [
    (0, import_pg_core.unique)("bin_set_audit_guid_idx").on(table.guid),
    (0, import_rls.crudPolicy)({
      role: import_rls.authenticatedRole,
      read: orgRls(table.orgId),
      modify: orgRls(table.orgId)
    })
  ]
).enableRLS();
var moduleConfigAudit = (0, import_pg_core.pgTable)(
  "module_config_audit",
  {
    id: (0, import_pg_core.serial)().primaryKey(),
    guid: (0, import_pg_core.uuid)("guid").defaultRandom(),
    moduleNumber: (0, import_pg_core.integer)("module_number").notNull(),
    orgId: (0, import_pg_core.text)("org_id").notNull(),
    bottomClosed: (0, import_pg_core.integer)("bottom_closed").notNull(),
    bottomOpen: (0, import_pg_core.integer)("bottom_open").notNull(),
    paddleClosed: (0, import_pg_core.integer)("paddle_closed").notNull(),
    paddleOpen: (0, import_pg_core.integer)("paddle_open").notNull(),
    pusherLeft: (0, import_pg_core.integer)("pusher_left").notNull(),
    pusherNeutral: (0, import_pg_core.integer)("pusher_neutral").notNull(),
    pusherRight: (0, import_pg_core.integer)("pusher_right").notNull(),
    createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow().notNull()
  },
  (table) => [
    (0, import_pg_core.unique)("module_config_audit_guid_idx").on(table.guid),
    (0, import_rls.crudPolicy)({
      role: import_rls.authenticatedRole,
      read: orgRls(table.orgId),
      modify: orgRls(table.orgId)
    })
  ]
).enableRLS();
var feederConfigAudit = (0, import_pg_core.pgTable)(
  "feeder_config_audit",
  {
    id: (0, import_pg_core.serial)().primaryKey(),
    guid: (0, import_pg_core.uuid)("guid").defaultRandom(),
    orgId: (0, import_pg_core.text)("org_id").notNull(),
    speed: (0, import_pg_core.integer)("speed").notNull(),
    duration: (0, import_pg_core.integer)("duration").notNull(),
    pulseDuration: (0, import_pg_core.integer)("pulse_duration").notNull(),
    pauseDuration: (0, import_pg_core.integer)("pause_duration").notNull(),
    settleDuration: (0, import_pg_core.integer)("settle_duration").notNull(),
    createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow().notNull()
  },
  (table) => [
    (0, import_pg_core.unique)("feeder_config_audit_guid_idx").on(table.guid),
    (0, import_rls.crudPolicy)({
      role: import_rls.authenticatedRole,
      read: orgRls(table.orgId),
      modify: orgRls(table.orgId)
    })
  ]
).enableRLS();
var binSetRelations = (0, import_relations.relations)(binSets, ({ many, one }) => ({
  bins: many(bins),
  game: one(games, {
    fields: [binSets.gameId],
    references: [games.id]
  })
}));
var binRelations = (0, import_relations.relations)(bins, ({ one }) => ({
  binSet: one(binSets, {
    fields: [bins.binSet],
    references: [binSets.id]
  })
}));
var collectionRelations = (0, import_relations.relations)(collections, ({ many }) => ({
  cards: many(collectionCards)
}));
var collectionCardsRelations = (0, import_relations.relations)(
  collectionCards,
  ({ one }) => ({
    collection: one(collections, {
      fields: [collectionCards.collectionId],
      references: [collections.id]
    })
  })
);

// src/db/index.ts
var pool = new import_pg.Pool({ connectionString: process.env.DATABASE_URL });
var db = (0, import_node_postgres.drizzle)(pool, { schema: schema_exports });
async function authQuery(jwtClaims, callback) {
  return db.transaction(async (tx) => {
    await tx.execute(
      import_drizzle_orm2.sql`SELECT set_config('request.jwt.claims', ${jwtClaims}, true)`
    );
    return callback(tx);
  });
}

// src/lib/sync-job.ts
var import_drizzle_orm4 = require("drizzle-orm");

// ../shared/src/interfaces/module-configs.interface.ts
var DEFAULT_CALIBRATION = {
  bottomClosed: 400,
  bottomOpen: 150,
  paddleClosed: 420,
  paddleOpen: 150,
  pusherLeft: 150,
  pusherNeutral: 230,
  pusherRight: 300
};
var DEFAULT_FEEDER_CALIBRATION = {
  speed: 250,
  duration: 3e3,
  pulseDuration: 80,
  pauseDuration: 0,
  settleDuration: 500
};

// ../shared/src/constants/scryfall.constant.ts
var QUERY_MIN_LENGTH = 2;
var CLOSE_MATCH_DELTA = 0.05;

// ../shared/src/constants/sort-bins.constant.ts
var BIN_COUNT = 7;
var FIELD_DEFINITIONS = [
  {
    field: "rarity",
    label: "Rarity",
    type: "enum",
    path: "rarity",
    operators: [
      { value: "in", label: "is any of" },
      { value: "not_in", label: "is none of" },
      { value: "equals", label: "equals" },
      { value: "not_equals", label: "does not equal" }
    ],
    options: [
      { value: "common", label: "Common" },
      { value: "uncommon", label: "Uncommon" },
      { value: "rare", label: "Rare" },
      { value: "mythic", label: "Mythic" },
      { value: "special", label: "Special" },
      { value: "bonus", label: "Bonus" }
    ]
  },
  {
    field: "color_identity",
    label: "Color Identity",
    type: "set",
    path: "color_identity",
    operators: [
      { value: "contains_any", label: "contains any of" },
      { value: "contains_all", label: "contains all of" },
      { value: "contains_none", label: "contains none of" },
      { value: "equals", label: "is exactly" }
    ],
    options: [
      { value: "W", label: "White" },
      { value: "U", label: "Blue" },
      { value: "B", label: "Black" },
      { value: "R", label: "Red" },
      { value: "G", label: "Green" }
    ]
  },
  {
    field: "type_line",
    label: "Type Line",
    type: "string",
    path: "type_line",
    operators: [
      { value: "contains", label: "contains" },
      { value: "not_contains", label: "does not contain" },
      { value: "equals", label: "equals" },
      { value: "not_equals", label: "does not equal" }
    ]
  },
  {
    field: "set",
    label: "Set Code",
    type: "string",
    path: "set",
    operators: [
      { value: "equals", label: "equals" },
      { value: "not_equals", label: "does not equal" },
      { value: "in", label: "is any of" },
      { value: "not_in", label: "is none of" }
    ]
  },
  {
    field: "price_usd",
    label: "Price (USD)",
    type: "numeric",
    path: "prices.usd",
    operators: [
      { value: "gt", label: "greater than" },
      { value: "gte", label: "greater than or equal" },
      { value: "lt", label: "less than" },
      { value: "lte", label: "less than or equal" },
      { value: "equals", label: "equals" }
    ]
  },
  {
    field: "cmc",
    label: "Mana Value",
    type: "numeric",
    path: "cmc",
    operators: [
      { value: "equals", label: "equals" },
      { value: "gt", label: "greater than" },
      { value: "gte", label: "greater than or equal" },
      { value: "lt", label: "less than" },
      { value: "lte", label: "less than or equal" }
    ]
  },
  {
    field: "name",
    label: "Name",
    type: "string",
    path: "name",
    operators: [
      { value: "contains", label: "contains" },
      { value: "not_contains", label: "does not contain" },
      { value: "equals", label: "equals" },
      { value: "not_equals", label: "does not equal" }
    ]
  },
  {
    field: "description",
    label: "Description",
    type: "string",
    path: "oracle_text",
    operators: [
      { value: "contains", label: "contains" },
      { value: "not_contains", label: "does not contain" },
      { value: "equals", label: "equals" },
      { value: "not_equals", label: "does not equal" }
    ]
  }
];

// ../shared/src/evaluate-bin.ts
function getByPath(card, path) {
  return path.split(".").reduce((value, key) => {
    if (value && typeof value === "object" && key in value) {
      return value[key];
    }
    return void 0;
  }, card);
}

// ../shared/src/scryfall.ts
function getCardImageUris(card) {
  return card.image_uris ?? card.card_faces?.[0]?.image_uris;
}
function getCardFaceName(card) {
  return card.card_faces?.[0]?.name ?? card.name;
}

// src/lib/gundam/search.ts
var GUNDAM_DEFAULT_URL = "https://api.gcgapi.com/v1/cards";
var GUNDAM_HEADERS = {
  "User-Agent": "MagicVault/1.0",
  Accept: "application/json"
};
var NOT_LEGAL = {
  standard: "not_legal",
  future: "not_legal",
  historic: "not_legal",
  timeless: "not_legal",
  gladiator: "not_legal",
  pioneer: "not_legal",
  modern: "not_legal",
  legacy: "not_legal",
  pauper: "not_legal",
  vintage: "not_legal",
  penny: "not_legal",
  commander: "not_legal",
  oathbreaker: "not_legal",
  standardbrawl: "not_legal",
  brawl: "not_legal",
  alchemy: "not_legal",
  paupercommander: "not_legal",
  duel: "not_legal",
  oldschool: "not_legal",
  premodern: "not_legal",
  predh: "not_legal"
};
function proxiedImageUrl(url) {
  return `/api/cards/image-proxy?url=${encodeURIComponent(url)}`;
}
function normalizeGundamCard(raw) {
  const id = String(raw.product_id ?? raw.card_number ?? "");
  const image = raw.image_url ? proxiedImageUrl(raw.image_url) : "";
  const setCode = raw.set_code ?? "";
  const collectorNumber = String(raw.card_number ?? id).split("-").pop() ?? "";
  const colors = raw.color ? [raw.color] : [];
  const keywords = Array.isArray(raw.keyword_effects) ? raw.keyword_effects.map((k) => k.keyword).filter(Boolean) : [];
  return {
    object: "card",
    id,
    oracle_id: id,
    name: raw.name ?? "",
    lang: "en",
    released_at: "",
    uri: raw.detail_url ?? "",
    scryfall_uri: raw.detail_url ?? "",
    layout: "normal",
    highres_image: true,
    image_status: "highres_scan",
    image_uris: image ? {
      small: image,
      normal: image,
      large: image,
      png: image,
      art_crop: image,
      border_crop: image
    } : void 0,
    cmc: typeof raw.cost === "number" ? raw.cost : 0,
    type_line: raw.card_type ?? "",
    oracle_text: raw.effect || void 0,
    power: raw.ap != null ? String(raw.ap) : void 0,
    toughness: raw.hp != null ? String(raw.hp) : void 0,
    colors,
    color_identity: colors,
    keywords,
    legalities: NOT_LEGAL,
    games: [],
    reserved: false,
    game_changer: false,
    foil: false,
    nonfoil: true,
    finishes: ["nonfoil"],
    oversized: false,
    promo: false,
    reprint: false,
    variation: false,
    set_id: setCode,
    set: setCode,
    set_name: raw.set_name || setCode,
    set_type: "expansion",
    set_uri: "",
    set_search_uri: "",
    scryfall_set_uri: "",
    rulings_uri: "",
    prints_search_uri: "",
    collector_number: collectorNumber,
    digital: false,
    rarity: (raw.rarity ?? "").toLowerCase(),
    artist: "",
    artist_ids: [],
    border_color: "black",
    frame: "2015",
    full_art: false,
    textless: false,
    booster: false,
    story_spotlight: false,
    prices: {
      usd: null,
      usd_foil: null,
      usd_etched: null,
      eur: null,
      eur_foil: null,
      tix: null
    }
  };
}
function extractRows(json) {
  if (Array.isArray(json)) return json;
  if (json && typeof json === "object" && Array.isArray(json.data)) {
    return json.data;
  }
  return [];
}
function extractOne(json) {
  if (json && typeof json === "object" && "data" in json && json.data) {
    return json.data;
  }
  return json ?? null;
}
async function Search(query, baseUrl = GUNDAM_DEFAULT_URL) {
  if (!query || query.trim().length < QUERY_MIN_LENGTH) {
    return {
      message: `Your query must be greater than ${QUERY_MIN_LENGTH}`,
      success: false
    };
  }
  const url = `${baseUrl}?name=${encodeURIComponent(query)}&limit=60`;
  const response = await fetch(url, { headers: GUNDAM_HEADERS });
  if (response.status === 404) {
    return {
      message: `No cards were found with the query: ${query}`,
      success: false
    };
  }
  if (!response.ok) {
    return {
      message: "Failed to fetch from the Gundam Card Game API.",
      success: false
    };
  }
  const rows = extractRows(await response.json());
  return {
    message: "Cards successfully retrieved.",
    data: rows.map(normalizeGundamCard),
    success: true
  };
}
async function SearchById(id, baseUrl = GUNDAM_DEFAULT_URL) {
  const response = await fetch(`${baseUrl}/${id}`, { headers: GUNDAM_HEADERS });
  if (!response.ok) {
    return {
      success: false,
      message: `Gundam Card Game API error: ${response.status} for card ${id}`
    };
  }
  const raw = extractOne(await response.json());
  if (!raw) {
    return { success: false, message: `Card ${id} not found.` };
  }
  return {
    success: true,
    message: "Successfully fetched card by id.",
    data: normalizeGundamCard(raw)
  };
}
var gundamAdapter = {
  defaultUrl: GUNDAM_DEFAULT_URL,
  search: Search,
  searchById: SearchById
};

// src/lib/gundam/sync.ts
var PAGE_LIMIT = 250;
function extractRows2(json) {
  if (Array.isArray(json)) return json;
  if (json && typeof json === "object" && Array.isArray(json.data)) {
    return json.data;
  }
  return [];
}
async function fetchCards(baseUrl, addLog2) {
  addLog2("Fetching Gundam Card Game catalog...");
  const all = [];
  let offset = 0;
  for (; ; ) {
    const url = `${baseUrl}?limit=${PAGE_LIMIT}&offset=${offset}`;
    const res = await fetch(url, { headers: GUNDAM_HEADERS });
    if (!res.ok) throw new Error(`Gundam card list fetch failed: ${res.status}`);
    const rows = extractRows2(await res.json());
    all.push(...rows);
    addLog2(`Fetched ${all.length} cards so far...`);
    if (rows.length < PAGE_LIMIT) break;
    offset += PAGE_LIMIT;
  }
  return all.map((c) => ({
    id: c.product_id ?? c.card_number,
    name: c.name,
    setCode: c.set_code,
    imageUrl: c.image_url
  }));
}
async function fetchOne(id, baseUrl) {
  const res = await fetch(`${baseUrl}/${id}`, { headers: GUNDAM_HEADERS });
  if (!res.ok) return null;
  const json = await res.json();
  const raw = json && typeof json === "object" && "data" in json && json.data ? json.data : json;
  if (!raw) return null;
  return { name: raw.name, setCode: raw.set_code, imageUrl: raw.image_url };
}
var gundamSyncSource = {
  gameKey: "gundam",
  label: "Gundam Card Game",
  defaultUrl: GUNDAM_DEFAULT_URL,
  fetchHeaders: GUNDAM_HEADERS,
  fetchCards,
  fetchOne
};

// src/lib/pokemon/search.ts
var POKEMON_DEFAULT_URL = "https://api.tcgdex.net/v2/en/cards";
var POKEMON_HEADERS = {
  "User-Agent": "MagicVault/1.0",
  Accept: "application/json"
};
var NOT_LEGAL2 = {
  standard: "not_legal",
  future: "not_legal",
  historic: "not_legal",
  timeless: "not_legal",
  gladiator: "not_legal",
  pioneer: "not_legal",
  modern: "not_legal",
  legacy: "not_legal",
  pauper: "not_legal",
  vintage: "not_legal",
  penny: "not_legal",
  commander: "not_legal",
  oathbreaker: "not_legal",
  standardbrawl: "not_legal",
  brawl: "not_legal",
  alchemy: "not_legal",
  paupercommander: "not_legal",
  duel: "not_legal",
  oldschool: "not_legal",
  premodern: "not_legal",
  predh: "not_legal"
};
function assetUrl(image, quality) {
  return `/api/cards/image-proxy?url=${encodeURIComponent(`${image}/${quality}.webp`)}`;
}
function normalizePokemonCard(raw) {
  const small = raw.image ? assetUrl(raw.image, "low") : "";
  const large = raw.image ? assetUrl(raw.image, "high") : "";
  const colors = raw.types ?? [];
  const attackText = (raw.attacks ?? []).map(
    (a) => [a.name, a.damage != null ? `(${a.damage})` : "", a.effect].filter(Boolean).join(" ")
  ).join("\n");
  const abilityText = (raw.abilities ?? []).map((a) => [a.name, a.effect].filter(Boolean).join(": ")).join("\n");
  const oracleText = [raw.effect, raw.description, abilityText, attackText].filter(Boolean).join("\n\n") || void 0;
  const typeLine = [raw.category, raw.stage ?? raw.trainerType ?? raw.energyType].filter(Boolean).join(" - ") || (raw.category ?? "");
  return {
    object: "card",
    id: raw.id,
    oracle_id: raw.id,
    name: raw.name ?? "",
    lang: "en",
    released_at: raw.set?.releaseDate ?? "",
    uri: "",
    scryfall_uri: `https://tcgdex.dev/cards/${raw.id}`,
    layout: "normal",
    highres_image: true,
    image_status: "highres_scan",
    image_uris: large ? {
      small: small || large,
      normal: large,
      large,
      png: large,
      art_crop: large,
      border_crop: large
    } : void 0,
    cmc: raw.retreat ?? 0,
    type_line: typeLine,
    oracle_text: oracleText,
    power: void 0,
    toughness: raw.hp != null ? String(raw.hp) : void 0,
    colors,
    color_identity: colors,
    keywords: (raw.abilities ?? []).map((a) => a.name),
    legalities: {
      ...NOT_LEGAL2,
      standard: raw.legal?.standard ? "legal" : "not_legal"
    },
    games: [],
    reserved: false,
    game_changer: false,
    foil: false,
    nonfoil: true,
    finishes: ["nonfoil"],
    oversized: false,
    promo: false,
    reprint: false,
    variation: false,
    set_id: raw.set?.id ?? "",
    set: raw.set?.id ?? "",
    set_name: raw.set?.name || (raw.set?.id ?? ""),
    set_type: "expansion",
    set_uri: "",
    set_search_uri: "",
    scryfall_set_uri: "",
    rulings_uri: "",
    prints_search_uri: "",
    collector_number: raw.localId ?? "",
    digital: false,
    rarity: (raw.rarity ?? "").toLowerCase(),
    artist: raw.illustrator ?? "",
    artist_ids: [],
    border_color: "black",
    frame: "2015",
    full_art: false,
    textless: false,
    booster: false,
    story_spotlight: false,
    prices: {
      usd: null,
      usd_foil: null,
      usd_etched: null,
      eur: null,
      eur_foil: null,
      tix: null
    }
  };
}
async function fetchDetail(id, baseUrl) {
  const response = await fetch(`${baseUrl}/${id}`, {
    headers: POKEMON_HEADERS
  });
  if (!response.ok) return null;
  return await response.json();
}
var MAX_ENRICHED_RESULTS = 30;
async function Search2(query, baseUrl = POKEMON_DEFAULT_URL) {
  if (!query || query.trim().length < QUERY_MIN_LENGTH) {
    return {
      message: `Your query must be greater than ${QUERY_MIN_LENGTH}`,
      success: false
    };
  }
  const url = `${baseUrl}?name=${encodeURIComponent(query)}&pagination:itemsPerPage=${MAX_ENRICHED_RESULTS}`;
  const response = await fetch(url, { headers: POKEMON_HEADERS });
  if (!response.ok) {
    return {
      message: "Failed to fetch from the TCGdex Pok\xE9mon API.",
      success: false
    };
  }
  const briefs = await response.json();
  if (briefs.length === 0) {
    return {
      message: `No cards were found with the query: ${query}`,
      success: false
    };
  }
  const details = await Promise.all(
    briefs.map((b) => fetchDetail(b.id, baseUrl))
  );
  return {
    message: "Cards successfully retrieved.",
    data: details.filter((d) => d !== null).map(normalizePokemonCard),
    success: true
  };
}
async function SearchById2(id, baseUrl = POKEMON_DEFAULT_URL) {
  const raw = await fetchDetail(id, baseUrl);
  if (!raw) {
    return {
      success: false,
      message: `TCGdex API error: card ${id} not found.`
    };
  }
  return {
    success: true,
    message: "Successfully fetched card by id.",
    data: normalizePokemonCard(raw)
  };
}
var pokemonAdapter = {
  defaultUrl: POKEMON_DEFAULT_URL,
  search: Search2,
  searchById: SearchById2
};

// src/lib/pokemon/sync.ts
var PAGE_LIMIT2 = 1e3;
function highResUrl(image) {
  return image ? `${image}/high.webp` : void 0;
}
async function fetchCards2(baseUrl, addLog2) {
  addLog2("Fetching Pok\xE9mon TCG catalog...");
  const all = [];
  let page = 1;
  for (; ; ) {
    const url = `${baseUrl}?pagination:page=${page}&pagination:itemsPerPage=${PAGE_LIMIT2}`;
    const res = await fetch(url, { headers: POKEMON_HEADERS });
    if (!res.ok) throw new Error(`Pok\xE9mon card list fetch failed: ${res.status}`);
    const rows = await res.json();
    all.push(...rows);
    addLog2(`Fetched ${all.length} cards so far...`);
    if (rows.length < PAGE_LIMIT2) break;
    page += 1;
  }
  return all.map((c) => ({
    id: c.id,
    name: c.name,
    // The brief list card doesn't include the set code, only the full id
    // (e.g. "swsh3-136") which is set-code-prefixed - good enough as a
    // fallback grouping key since fetchOne fills in the real one on demand.
    setCode: c.id.split("-")[0] ?? "",
    imageUrl: highResUrl(c.image)
  }));
}
async function fetchOne2(id, baseUrl) {
  const res = await fetch(`${baseUrl}/${id}`, { headers: POKEMON_HEADERS });
  if (!res.ok) return null;
  const raw = await res.json();
  if (!raw) return null;
  return {
    name: raw.name,
    setCode: raw.set?.id ?? raw.id.split("-")[0] ?? "",
    imageUrl: highResUrl(raw.image)
  };
}
var pokemonSyncSource = {
  gameKey: "pokemon",
  label: "Pok\xE9mon (TCGdex)",
  defaultUrl: POKEMON_DEFAULT_URL,
  fetchHeaders: POKEMON_HEADERS,
  fetchCards: fetchCards2,
  fetchOne: fetchOne2
};

// src/lib/sync-cache.ts
var import_node_fs = require("fs");
var import_node_path = require("path");
var CACHE_DIR = process.env.SYNC_CACHE_DIR ?? (0, import_node_path.join)(process.cwd(), ".cache", "sync");
function metaPath(gameKey) {
  return (0, import_node_path.join)(CACHE_DIR, `${gameKey}.meta.json`);
}
function catalogPath(gameKey) {
  return (0, import_node_path.join)(CACHE_DIR, `${gameKey}.json`);
}
function loadCachedCatalog(gameKey, version) {
  try {
    const meta = JSON.parse((0, import_node_fs.readFileSync)(metaPath(gameKey), "utf8"));
    if (meta.version !== version) return null;
    return JSON.parse((0, import_node_fs.readFileSync)(catalogPath(gameKey), "utf8"));
  } catch {
    return null;
  }
}
function saveCachedCatalog(gameKey, version, cards) {
  try {
    (0, import_node_fs.mkdirSync)(CACHE_DIR, { recursive: true });
    (0, import_node_fs.writeFileSync)(metaPath(gameKey), JSON.stringify({ version }));
    (0, import_node_fs.writeFileSync)(catalogPath(gameKey), JSON.stringify(cards));
  } catch (err) {
    console.error(`[sync-cache] failed to cache ${gameKey} catalog:`, err);
  }
}

// src/lib/scryfall/search.ts
var SCRYFALL_DEFAULT_URL = "https://api.scryfall.com/cards";
var SCRYFALL_HEADERS = {
  "User-Agent": "MagicVault/1.0",
  Accept: "application/json"
};
async function Search3(query, baseUrl = SCRYFALL_DEFAULT_URL) {
  if (!query || query.trim().length < QUERY_MIN_LENGTH) {
    return {
      message: `Your query must be greater than ${QUERY_MIN_LENGTH}`,
      success: false
    };
  }
  const scryfallUrl = `${baseUrl}/search?q=${encodeURIComponent(query)}&unique=prints&order=released&dir=desc`;
  const response = await fetch(scryfallUrl, {
    headers: SCRYFALL_HEADERS
  });
  if (response.status === 404) {
    return {
      message: `No cards were found with the query: ${query}`,
      success: false
    };
  }
  if (!response.ok) {
    return {
      message: "Failed to fetch from Scryfall.",
      success: false
    };
  }
  const data = await response.json();
  return {
    message: "Cards successfully retrieved.",
    data: data.data,
    success: true
  };
}
async function SearchById3(id, baseUrl = SCRYFALL_DEFAULT_URL) {
  const response = await fetch(`${baseUrl}/${id}`, {
    headers: SCRYFALL_HEADERS
  });
  if (!response.ok) {
    return {
      success: false,
      message: `Scryfall API error: ${response.status} for card ${id}`
    };
  }
  return {
    success: true,
    message: "Successfully fetched card by id.",
    data: await response.json()
  };
}
var scryfallAdapter = {
  defaultUrl: SCRYFALL_DEFAULT_URL,
  search: Search3,
  searchById: SearchById3
};

// src/lib/scryfall/sync.ts
var GAME_KEY = "mtg";
function cardImageUrl(card) {
  return card.image_uris?.png ?? card.image_uris?.large ?? card.card_faces?.[0]?.image_uris?.png ?? card.card_faces?.[0]?.image_uris?.large;
}
function apiRoot(baseUrl) {
  try {
    return new URL(baseUrl).origin;
  } catch {
    return new URL(SCRYFALL_DEFAULT_URL).origin;
  }
}
async function fetchCards3(baseUrl, addLog2) {
  addLog2("Fetching Scryfall bulk data catalog...");
  const catalogRes = await fetch(`${apiRoot(baseUrl)}/bulk-data`, {
    headers: SCRYFALL_HEADERS
  });
  if (!catalogRes.ok) {
    throw new Error(`Scryfall catalog fetch failed: ${catalogRes.status}`);
  }
  const catalog = await catalogRes.json();
  const artEntry = catalog.data.find((e) => e.type === "unique_artwork");
  if (!artEntry)
    throw new Error("Could not find unique_artwork bulk data entry");
  const version = artEntry.updated_at ?? "";
  if (version) {
    const cached = loadCachedCatalog(GAME_KEY, version);
    if (cached) {
      addLog2(
        `Using cached bulk artwork data (${cached.length} cards, unchanged since ${version}).`
      );
      return cached;
    }
  }
  addLog2("Downloading bulk artwork data...");
  const bulkRes = await fetch(artEntry.download_uri, {
    headers: SCRYFALL_HEADERS
  });
  if (!bulkRes.ok)
    throw new Error(`Bulk data download failed: ${bulkRes.status}`);
  const cards = await bulkRes.json();
  addLog2(`Downloaded ${cards.length} cards.`);
  const mapped = cards.map((c) => ({
    id: c.id,
    name: c.name,
    setCode: c.set,
    imageUrl: cardImageUrl(c)
  }));
  saveCachedCatalog(GAME_KEY, version, mapped);
  return mapped;
}
async function fetchOne3(id, baseUrl) {
  const res = await fetch(`${baseUrl}/${id}`, { headers: SCRYFALL_HEADERS });
  if (!res.ok) return null;
  const card = await res.json();
  return {
    name: card.name,
    setCode: card.set,
    imageUrl: cardImageUrl(card)
  };
}
var scryfallSyncSource = {
  gameKey: "mtg",
  label: "Magic: The Gathering (Scryfall)",
  defaultUrl: SCRYFALL_DEFAULT_URL,
  fetchHeaders: SCRYFALL_HEADERS,
  fetchCards: fetchCards3,
  fetchOne: fetchOne3
};

// src/lib/card-search/resolve.ts
var ADAPTERS_BY_GAME_KEY = {
  mtg: scryfallAdapter,
  gundam: gundamAdapter,
  pokemon: pokemonAdapter
};
async function findCollectionGame(jwtClaims, orgId, collectionGuid) {
  return authQuery(jwtClaims, async (tx) => {
    const collection = await tx.query.collections.findFirst({
      where: (t, { eq: eq8, and: and3 }) => orgId ? and3(eq8(t.guid, collectionGuid), eq8(t.orgId, orgId)) : eq8(t.guid, collectionGuid),
      columns: { gameId: true }
    });
    if (!collection?.gameId) return null;
    return tx.query.games.findFirst({
      where: (t, { eq: eq8 }) => eq8(t.id, collection.gameId)
    });
  });
}
async function resolveGameDataSourceUrl(gameKey, fallback) {
  const game = await db.query.games.findFirst({
    where: (t, { eq: eq8 }) => eq8(t.key, gameKey),
    columns: { dataSourceUrl: true }
  });
  return game?.dataSourceUrl || fallback;
}
async function resolveCardSearch(jwtClaims, orgId, collectionGuid) {
  if (!collectionGuid) return null;
  const game = await findCollectionGame(jwtClaims, orgId, collectionGuid);
  if (!game) return null;
  const adapter = ADAPTERS_BY_GAME_KEY[game.key];
  if (!adapter) return null;
  const baseUrl = game.dataSourceUrl || await resolveGameDataSourceUrl(game.key, adapter.defaultUrl);
  return { adapter, baseUrl, gameKey: game.key };
}

// src/lib/discord.ts
var import_drizzle_orm3 = require("drizzle-orm");
var CARD_SCANNED_COLOR = 5793266;
function resolveImageUrl(url) {
  const proxied = url.match(/\/cards\/image-proxy\?url=([^&]+)/);
  if (proxied) {
    try {
      return decodeURIComponent(proxied[1]);
    } catch {
    }
  }
  if (/^https?:\/\//i.test(url)) return url;
  const base = process.env.WEB_URL ?? "http://localhost:5173";
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
}
function findPrice(card, fieldDefinitions) {
  if (card.prices?.usd) return card.prices.usd;
  const priceField = fieldDefinitions.find(
    (f) => f.type === "numeric" && /price/i.test(`${f.field} ${f.label}`)
  );
  if (!priceField) return null;
  const raw = getByPath(card, priceField.path);
  const num = typeof raw === "number" ? raw : Number.parseFloat(String(raw ?? ""));
  return Number.isFinite(num) ? num.toFixed(2) : null;
}
function buildCardScannedEmbed(card, options = {}) {
  const {
    isFoil,
    fieldDefinitions = FIELD_DEFINITIONS,
    collectionName,
    gameName,
    collectionGuid
  } = options;
  const price = findPrice(card, fieldDefinitions);
  const lines = [`**Price:** ${price ? `$${price}` : "N/A"}`];
  if (isFoil) lines.push("**Foil**");
  if (collectionName) lines.push(`**Collection:** ${collectionName}`);
  if (gameName) lines.push(`**Game:** ${gameName}`);
  const imageUrl = getCardImageUris(card)?.normal;
  const monitorUrl = collectionGuid ? `${process.env.WEB_URL ?? "http://localhost:5173"}/app/monitor/${collectionGuid}` : void 0;
  return {
    title: getCardFaceName(card),
    description: lines.join("\n"),
    color: CARD_SCANNED_COLOR,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    ...monitorUrl ? { url: monitorUrl } : {},
    ...imageUrl ? { image: { url: resolveImageUrl(imageUrl) } } : {}
  };
}
async function getWebhookUrl(orgId) {
  const rows = await db.select({ discordWebhookUrl: orgSettings.discordWebhookUrl }).from(orgSettings).where((0, import_drizzle_orm3.eq)(orgSettings.orgId, orgId)).limit(1);
  return rows[0]?.discordWebhookUrl ?? null;
}
async function sendDiscordNotification(orgId, embed) {
  const webhookUrl = await getWebhookUrl(orgId);
  if (!webhookUrl) return;
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] })
    });
    if (!res.ok) {
      console.error(`[discord] Webhook POST failed: ${res.status}`);
    }
  } catch (err) {
    console.error("[discord] Failed to send notification:", err);
  }
}

// src/lib/vectorize.ts
var import_transformers = require("@huggingface/transformers");
var MODEL_NAME = "Xenova/siglip-base-patch16-512";
var modelPromise = null;
var processorPromise = null;
async function getModel() {
  if (!modelPromise) {
    console.log("[vectorize] Loading SigLIP model...");
    modelPromise = import_transformers.SiglipVisionModel.from_pretrained(MODEL_NAME, {
      dtype: "q8"
    });
    await modelPromise;
    console.log(
      "[vectorize] SigLIP model loaded successfully (768 dimensions)"
    );
  }
  return modelPromise;
}
async function getProcessor() {
  if (!processorPromise) {
    processorPromise = import_transformers.AutoProcessor.from_pretrained(MODEL_NAME);
  }
  return processorPromise;
}
async function vectorizeBuffer(buffer) {
  const [model, processor] = await Promise.all([getModel(), getProcessor()]);
  const uint8Array = new Uint8Array(buffer);
  const image = await import_transformers.RawImage.fromBlob(new Blob([uint8Array]));
  const image_inputs = await processor(image);
  const { pooler_output } = await model(image_inputs);
  const embedding = Array.from(pooler_output.data);
  console.log(
    `[vectorize] Generated ${embedding.length}-dimensional SigLIP embedding`
  );
  return embedding;
}
async function vectorizeImageFromBuffer(buffer) {
  return vectorizeBuffer(buffer);
}

// src/lib/sync-job.ts
var SYNC_SOURCES = {
  mtg: scryfallSyncSource,
  gundam: gundamSyncSource,
  pokemon: pokemonSyncSource
};
var state = {
  status: "idle",
  gameKey: "",
  total: 0,
  processed: 0,
  skipped: 0,
  errors: 0,
  startedAt: null,
  logs: []
};
var cancelFlag = false;
var writers = /* @__PURE__ */ new Set();
function addLog(msg) {
  state = { ...state, logs: [...state.logs.slice(-199), msg] };
  emit("log", { line: msg });
}
function emit(event, data) {
  for (const writer of writers) {
    try {
      writer(event, data);
    } catch {
    }
  }
}
function getStatus() {
  return { ...state, logs: [...state.logs] };
}
function subscribeSSE(writer) {
  writers.add(writer);
  writer("status", getStatus());
  return () => writers.delete(writer);
}
function cancelSync() {
  if (state.status === "running") {
    cancelFlag = true;
  }
}
function startSync(orgId, gameKey) {
  if (state.status === "running") return;
  const source = SYNC_SOURCES[gameKey];
  if (!source) return;
  cancelFlag = false;
  state = {
    status: "running",
    gameKey,
    total: 0,
    processed: 0,
    skipped: 0,
    errors: 0,
    startedAt: (/* @__PURE__ */ new Date()).toISOString(),
    logs: []
  };
  emit("status", getStatus());
  runSync(source).catch((err) => {
    state = { ...state, status: "failed" };
    const msg = err instanceof Error ? err.message : String(err);
    addLog(`Fatal error: ${msg}`);
    emit("error", { message: msg });
    if (orgId) {
      void sendDiscordNotification(orgId, {
        title: "Magic Vault \u2014 Sync Failed",
        description: `The card database sync job encountered a fatal error.

**Error:** ${msg}`,
        color: 15548997,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
  });
}
async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function runSync(source) {
  const baseUrl = await resolveGameDataSourceUrl(source.gameKey, source.defaultUrl);
  addLog(`Using data source: ${baseUrl}`);
  const cards = await source.fetchCards(baseUrl, addLog);
  state = { ...state, total: cards.length };
  emit("status", getStatus());
  addLog(`Loading existing ${source.label} cards from DB...`);
  const existing = await db.select({ id: cardImageVectors.scryfallId }).from(cardImageVectors).where((0, import_drizzle_orm4.eq)(cardImageVectors.gameKey, source.gameKey));
  const existingSet = new Set(existing.map((r) => r.id));
  addLog(
    `Found ${existingSet.size} existing ${source.label} cards in DB. Starting vectorization...`
  );
  for (const card of cards) {
    if (cancelFlag) {
      state = { ...state, status: "cancelled" };
      addLog("Sync cancelled by user.");
      emit("done", {
        status: "cancelled",
        processed: state.processed,
        skipped: state.skipped,
        errors: state.errors
      });
      return;
    }
    if (!card.imageUrl || existingSet.has(card.id)) {
      state = { ...state, skipped: state.skipped + 1 };
      emit("progress", {
        processed: state.processed,
        skipped: state.skipped,
        errors: state.errors,
        currentCard: card.name
      });
      continue;
    }
    try {
      const imageRes = await fetch(card.imageUrl, {
        headers: source.fetchHeaders,
        signal: AbortSignal.timeout(3e4)
      });
      if (!imageRes.ok) throw new Error(`Image fetch failed: ${imageRes.status}`);
      const buffer = Buffer.from(await imageRes.arrayBuffer());
      const embedding = await vectorizeImageFromBuffer(buffer);
      await db.insert(cardImageVectors).values({
        scryfallId: card.id,
        gameKey: source.gameKey,
        name: card.name,
        setCode: card.setCode,
        embedding
      }).onConflictDoNothing();
      existingSet.add(card.id);
      state = { ...state, processed: state.processed + 1 };
      addLog(
        `[${state.processed + state.skipped}/${state.total}] ${card.name} (${card.setCode})`
      );
      emit("progress", {
        processed: state.processed,
        skipped: state.skipped,
        errors: state.errors,
        currentCard: card.name
      });
      await sleep(100);
    } catch (err) {
      state = { ...state, errors: state.errors + 1 };
      const msg = err instanceof Error ? err.message : String(err);
      addLog(`Error: ${card.name}: ${msg}`);
      emit("progress", {
        processed: state.processed,
        skipped: state.skipped,
        errors: state.errors,
        currentCard: card.name
      });
    }
  }
  state = { ...state, status: "completed" };
  addLog(
    `Done. Processed: ${state.processed}, Skipped: ${state.skipped}, Errors: ${state.errors}`
  );
  emit("done", {
    status: "completed",
    processed: state.processed,
    skipped: state.skipped,
    errors: state.errors
  });
}

// src/middleware/auth.ts
var import_factory = require("hono/factory");
var LOCAL_USER_ID = "local-user";
var LOCAL_ORG_ID = "local-org";
var LOCAL_ORG_ROLE = "owner";
var LOCAL_USER_ROLE = "admin";
async function getUserDisplayName(_userId) {
  return "Local User";
}
var requireAuth = (0, import_factory.createMiddleware)(async (c, next) => {
  c.set("userId", LOCAL_USER_ID);
  c.set("userRole", LOCAL_USER_ROLE);
  c.set(
    "jwtClaims",
    JSON.stringify({ sub: LOCAL_USER_ID, role: "authenticated" })
  );
  await next();
});
var requireOrg = (0, import_factory.createMiddleware)(async (c, next) => {
  c.set("orgId", LOCAL_ORG_ID);
  c.set("orgRole", LOCAL_ORG_ROLE);
  c.set(
    "jwtClaims",
    JSON.stringify({
      sub: LOCAL_USER_ID,
      role: "authenticated",
      org_id: LOCAL_ORG_ID
    })
  );
  await next();
});
function requireRole(..._roles) {
  return (0, import_factory.createMiddleware)(async (c, next) => {
    await next();
  });
}

// src/routes/admin.ts
var router = new import_hono.Hono();
router.get("/sync/stream", async (c) => {
  return (0, import_streaming.streamSSE)(c, async (stream) => {
    const unsubscribe = subscribeSSE((event, data) => {
      stream.writeSSE({ event, data: JSON.stringify(data) }).catch(() => {
      });
    });
    await new Promise((resolve) => {
      stream.onAbort(resolve);
    });
    unsubscribe();
  });
});
router.get("/sync", requireAuth, requireRole("admin"), (c) => {
  return c.json({ success: true, data: getStatus() });
});
router.get("/sync/sources", requireAuth, requireRole("admin"), (c) => {
  const sources = Object.values(SYNC_SOURCES).map((s) => ({
    gameKey: s.gameKey,
    label: s.label
  }));
  return c.json({ success: true, data: sources });
});
router.post("/sync", requireAuth, requireRole("admin"), async (c) => {
  let gameKey;
  try {
    const body = await c.req.json();
    gameKey = body.gameKey;
  } catch {
  }
  if (!gameKey) {
    return c.json({ success: false, message: "gameKey is required." }, 400);
  }
  if (!SYNC_SOURCES[gameKey]) {
    return c.json({ success: false, message: `Unknown sync source: ${gameKey}` }, 400);
  }
  startSync(c.req.header("X-Org-Id"), gameKey);
  return c.json({ success: true, data: getStatus() });
});
router.delete("/sync", requireAuth, requireRole("admin"), (c) => {
  cancelSync();
  return c.json({ success: true, data: getStatus() });
});
router.get("/cards", requireAuth, requireRole("admin"), async (c) => {
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 50)));
  const search = (c.req.query("search") ?? "").trim();
  const offset = (page - 1) * limit;
  const where = search ? (0, import_drizzle_orm5.ilike)(cardImageVectors.name, `%${search}%`) : void 0;
  const [rows, [{ total }]] = await Promise.all([
    db.select({
      id: cardImageVectors.id,
      scryfallId: cardImageVectors.scryfallId,
      gameKey: cardImageVectors.gameKey,
      name: cardImageVectors.name,
      setCode: cardImageVectors.setCode,
      updatedAt: cardImageVectors.updatedAt
    }).from(cardImageVectors).where(where).orderBy(cardImageVectors.name).limit(limit).offset(offset),
    db.select({ total: (0, import_drizzle_orm5.count)() }).from(cardImageVectors).where(where)
  ]);
  return c.json({ success: true, data: { cards: rows, total, page, limit } });
});
router.post(
  "/cards/:scryfallId/revectorize",
  requireAuth,
  requireRole("admin"),
  async (c) => {
    const scryfallId = c.req.param("scryfallId");
    const existing = await db.query.cardImageVectors.findFirst({
      where: (t, { eq: eq8 }) => eq8(t.scryfallId, scryfallId),
      columns: { gameKey: true }
    });
    if (!existing) {
      return c.json(
        { success: false, message: `Card ${scryfallId} not found in database.` },
        404
      );
    }
    const gameKey = existing.gameKey;
    const source = SYNC_SOURCES[gameKey];
    if (!source) {
      return c.json({ success: false, message: `Unknown sync source: ${gameKey}` }, 400);
    }
    const baseUrl = await resolveGameDataSourceUrl(gameKey, source.defaultUrl);
    const card = await source.fetchOne(scryfallId, baseUrl);
    if (!card) {
      return c.json({ success: false, message: `Card not found via ${source.label}` }, 404);
    }
    if (!card.imageUrl) {
      return c.json(
        { success: false, message: "No image available for this card" },
        400
      );
    }
    const imageRes = await fetch(card.imageUrl, { headers: source.fetchHeaders });
    if (!imageRes.ok) {
      return c.json(
        { success: false, message: "Failed to download card image" },
        502
      );
    }
    const buffer = Buffer.from(await imageRes.arrayBuffer());
    const embedding = await vectorizeImageFromBuffer(buffer);
    await db.insert(cardImageVectors).values({ scryfallId, gameKey, name: card.name, setCode: card.setCode, embedding }).onConflictDoUpdate({
      target: [cardImageVectors.gameKey, cardImageVectors.scryfallId],
      set: { embedding, updatedAt: /* @__PURE__ */ new Date() }
    });
    return c.json({ success: true, message: `Re-vectorized: ${card.name}` });
  }
);
router.get("/cards/games", requireAuth, requireRole("admin"), async (c) => {
  const rows = await db.select({ gameKey: cardImageVectors.gameKey, count: (0, import_drizzle_orm5.count)() }).from(cardImageVectors).groupBy(cardImageVectors.gameKey).orderBy(cardImageVectors.gameKey);
  return c.json({ success: true, data: rows });
});
router.post("/cards/dump", requireAuth, requireRole("admin"), async (c) => {
  if (getStatus().status === "running") {
    return c.json(
      { success: false, message: "Cannot dump while sync is running" },
      409
    );
  }
  let gameKey;
  try {
    const body = await c.req.json();
    if (body.gameKey) gameKey = body.gameKey;
  } catch {
  }
  if (gameKey) {
    await db.delete(cardImageVectors).where((0, import_drizzle_orm5.eq)(cardImageVectors.gameKey, gameKey));
    return c.json({ success: true, message: `Cleared "${gameKey}" cards` });
  }
  await db.delete(cardImageVectors);
  return c.json({ success: true, message: "Card database cleared" });
});

// src/routes/bins.ts
var import_drizzle_orm6 = require("drizzle-orm");
var import_hono2 = require("hono");
var router2 = new import_hono2.Hono();
function emptyRules() {
  return {
    id: crypto.randomUUID(),
    combinator: "and",
    conditions: []
  };
}
function toBinSet(row) {
  return {
    guid: row.guid,
    name: row.name,
    isActive: row.isActive,
    bins: row.bins.map((bin) => ({
      guid: bin.guid,
      binNumber: bin.binNumber,
      rules: bin.rules,
      isCatchAll: bin.isCatchAll,
      maxCapacity: bin.maxCapacity
    })),
    game: row.game ? {
      guid: row.game.guid,
      key: row.game.key,
      name: row.game.name,
      dataSourceUrl: row.game.dataSourceUrl,
      isActive: row.game.isActive,
      fieldDefinitions: row.game.fieldDefinitions,
      createdAt: row.game.createdAt.toISOString(),
      updatedAt: row.game.updatedAt.toISOString()
    } : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}
var binSetQuery = {
  columns: {
    guid: true,
    name: true,
    isActive: true,
    createdAt: true,
    updatedAt: true
  },
  with: {
    bins: {
      columns: { guid: true, binNumber: true, rules: true, isCatchAll: true, maxCapacity: true }
    },
    game: true
  }
};
async function _loadSets(tx, orgId) {
  const rows = await tx.query.binSets.findMany({
    ...binSetQuery,
    where: (binSets2, { eq: eq8 }) => eq8(binSets2.orgId, orgId),
    orderBy: (binSets2, { desc: desc2 }) => [desc2(binSets2.updatedAt)]
  });
  return { message: "Loaded sets.", success: true, data: rows.map(toBinSet) };
}
async function _snapshotBinSet(tx, binSetId, binSetGuid, orgId) {
  const rows = await tx.query.bins.findMany({
    where: (bins2, { eq: eq8 }) => eq8(bins2.binSet, binSetId),
    columns: { guid: true, binNumber: true, rules: true, isCatchAll: true, maxCapacity: true }
  });
  const snapshot = rows.map((r) => ({
    guid: r.guid,
    binNumber: r.binNumber,
    rules: r.rules,
    isCatchAll: r.isCatchAll,
    maxCapacity: r.maxCapacity
  }));
  await tx.insert(binSetAudit).values({ binSetGuid, snapshot, orgId });
}
async function _resolveGameId(tx, gameGuid) {
  if (!gameGuid) return null;
  const game = await tx.query.games.findFirst({
    where: (t, { eq: eq8 }) => eq8(t.guid, gameGuid),
    columns: { id: true }
  });
  return game?.id ?? null;
}
router2.get("/", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  try {
    const result = await authQuery(
      c.get("jwtClaims"),
      (tx) => _loadSets(tx, orgId)
    );
    return c.json(result);
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});
router2.put("/:guid/active", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  const guid = c.req.param("guid");
  try {
    const result = await authQuery(c.get("jwtClaims"), async (tx) => {
      const target = await tx.query.binSets.findFirst({
        where: (binSets2, { eq: eq8, and: and3 }) => and3(eq8(binSets2.guid, guid), eq8(binSets2.orgId, orgId)),
        columns: { id: true, gameId: true }
      });
      if (!target) return { message: "Set not found.", success: false };
      await tx.update(binSets).set({ isActive: false }).where(
        target.gameId === null ? (0, import_drizzle_orm6.and)(
          (0, import_drizzle_orm6.eq)(binSets.isActive, true),
          (0, import_drizzle_orm6.isNull)(binSets.gameId),
          (0, import_drizzle_orm6.eq)(binSets.orgId, orgId)
        ) : (0, import_drizzle_orm6.and)(
          (0, import_drizzle_orm6.eq)(binSets.isActive, true),
          (0, import_drizzle_orm6.eq)(binSets.gameId, target.gameId),
          (0, import_drizzle_orm6.eq)(binSets.orgId, orgId)
        )
      );
      await tx.update(binSets).set({ isActive: true }).where((0, import_drizzle_orm6.eq)(binSets.id, target.id));
      return _loadSets(tx, orgId);
    });
    return c.json(result);
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});
router2.post("/", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  const { name, initialBins, gameGuid } = await c.req.json();
  try {
    const result = await authQuery(c.get("jwtClaims"), async (tx) => {
      const gameId = await _resolveGameId(tx, gameGuid);
      await tx.update(binSets).set({ isActive: false }).where(
        gameId === null ? (0, import_drizzle_orm6.and)(
          (0, import_drizzle_orm6.eq)(binSets.isActive, true),
          (0, import_drizzle_orm6.isNull)(binSets.gameId),
          (0, import_drizzle_orm6.eq)(binSets.orgId, orgId)
        ) : (0, import_drizzle_orm6.and)(
          (0, import_drizzle_orm6.eq)(binSets.isActive, true),
          (0, import_drizzle_orm6.eq)(binSets.gameId, gameId),
          (0, import_drizzle_orm6.eq)(binSets.orgId, orgId)
        )
      );
      const [newBinSet] = await tx.insert(binSets).values({ name, isActive: true, gameId, orgId }).returning({ id: binSets.id });
      const binsToInsert = Array.isArray(initialBins) ? initialBins : Array.from({ length: BIN_COUNT }, (_, i) => ({
        binNumber: i + 1,
        rules: emptyRules(),
        isCatchAll: false,
        maxCapacity: 0
      }));
      await tx.insert(bins).values(
        binsToInsert.map((b) => ({
          binNumber: b.binNumber,
          rules: b.rules,
          isCatchAll: b.isCatchAll,
          maxCapacity: b.maxCapacity ?? 0,
          binSet: newBinSet.id,
          orgId
        }))
      );
      return _loadSets(tx, orgId);
    });
    return c.json(result);
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});
router2.post("/copies", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  const { name, gameGuid } = await c.req.json();
  try {
    const result = await authQuery(c.get("jwtClaims"), async (tx) => {
      const gameId = await _resolveGameId(tx, gameGuid);
      const active = await tx.query.binSets.findFirst({
        where: (binSets2, { eq: eq8, and: and3, isNull: isNull2 }) => gameId === null ? and3(
          eq8(binSets2.isActive, true),
          isNull2(binSets2.gameId),
          eq8(binSets2.orgId, orgId)
        ) : and3(
          eq8(binSets2.isActive, true),
          eq8(binSets2.gameId, gameId),
          eq8(binSets2.orgId, orgId)
        ),
        columns: { id: true },
        with: {
          bins: { columns: { binNumber: true, rules: true, isCatchAll: true, maxCapacity: true } }
        }
      });
      const activeBins = active?.bins ?? [];
      const [newBinSet] = await tx.insert(binSets).values({ name, isActive: false, gameId, orgId }).returning({ id: binSets.id });
      if (activeBins.length > 0) {
        await tx.insert(bins).values(
          activeBins.map((bin) => ({
            binNumber: bin.binNumber,
            rules: bin.rules,
            isCatchAll: bin.isCatchAll,
            maxCapacity: bin.maxCapacity ?? 0,
            binSet: newBinSet.id,
            orgId
          }))
        );
      }
      return _loadSets(tx, orgId);
    });
    return c.json(result);
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});
router2.put("/bins/:binNumber", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  const binNumber = parseInt(c.req.param("binNumber"));
  const gameGuid = c.req.query("gameGuid");
  const { rules, isCatchAll, maxCapacity } = await c.req.json();
  if (isCatchAll && binNumber !== 7) {
    return c.json(
      {
        success: false,
        message: "Only bin 7 can be configured as the catch-all bin."
      },
      400
    );
  }
  try {
    const result = await authQuery(c.get("jwtClaims"), async (tx) => {
      const gameId = await _resolveGameId(tx, gameGuid);
      const activeBinSet = await tx.query.binSets.findFirst({
        where: (binSets2, { eq: eq8, and: and3, isNull: isNull2 }) => gameId === null ? and3(
          eq8(binSets2.isActive, true),
          isNull2(binSets2.gameId),
          eq8(binSets2.orgId, orgId)
        ) : and3(
          eq8(binSets2.isActive, true),
          eq8(binSets2.gameId, gameId),
          eq8(binSets2.orgId, orgId)
        ),
        columns: { id: true, guid: true },
        with: { bins: { columns: { id: true, binNumber: true } } }
      });
      if (!activeBinSet)
        return { message: "No active set found.", success: false };
      const existing = activeBinSet.bins.find((b) => b.binNumber === binNumber);
      let savedBin;
      if (existing) {
        const [updated] = await tx.update(bins).set({
          rules,
          isCatchAll: isCatchAll ?? false,
          maxCapacity: maxCapacity ?? 0,
          updatedAt: /* @__PURE__ */ new Date()
        }).where((0, import_drizzle_orm6.eq)(bins.id, existing.id)).returning({
          guid: bins.guid,
          binNumber: bins.binNumber,
          rules: bins.rules,
          isCatchAll: bins.isCatchAll,
          maxCapacity: bins.maxCapacity
        });
        savedBin = {
          guid: updated.guid,
          binNumber: updated.binNumber,
          rules: updated.rules,
          isCatchAll: updated.isCatchAll,
          maxCapacity: updated.maxCapacity
        };
      } else {
        const [inserted] = await tx.insert(bins).values({
          binNumber,
          rules,
          isCatchAll: isCatchAll ?? false,
          maxCapacity: maxCapacity ?? 0,
          binSet: activeBinSet.id,
          orgId
        }).returning({
          guid: bins.guid,
          binNumber: bins.binNumber,
          rules: bins.rules,
          isCatchAll: bins.isCatchAll,
          maxCapacity: bins.maxCapacity
        });
        savedBin = {
          guid: inserted.guid,
          binNumber: inserted.binNumber,
          rules: inserted.rules,
          isCatchAll: inserted.isCatchAll,
          maxCapacity: inserted.maxCapacity
        };
      }
      await _snapshotBinSet(tx, activeBinSet.id, activeBinSet.guid, orgId);
      return {
        message: "Successfully saved bin config.",
        success: true,
        data: savedBin
      };
    });
    return c.json(result);
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});
router2.delete("/bins/:binNumber", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  const binNumber = parseInt(c.req.param("binNumber"));
  const gameGuid = c.req.query("gameGuid");
  try {
    const result = await authQuery(c.get("jwtClaims"), async (tx) => {
      const gameId = await _resolveGameId(tx, gameGuid);
      const activeBinSet = await tx.query.binSets.findFirst({
        where: (binSets2, { eq: eq8, and: and3, isNull: isNull2 }) => gameId === null ? and3(
          eq8(binSets2.isActive, true),
          isNull2(binSets2.gameId),
          eq8(binSets2.orgId, orgId)
        ) : and3(
          eq8(binSets2.isActive, true),
          eq8(binSets2.gameId, gameId),
          eq8(binSets2.orgId, orgId)
        ),
        columns: { id: true },
        with: { bins: { columns: { id: true, binNumber: true } } }
      });
      if (!activeBinSet)
        return { message: "No active set found.", success: false };
      const existing = activeBinSet.bins.find((b) => b.binNumber === binNumber);
      if (existing) await tx.delete(bins).where((0, import_drizzle_orm6.eq)(bins.id, existing.id));
      return {
        message: "Successfully cleared bin config.",
        success: true,
        data: null
      };
    });
    return c.json(result);
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});
router2.put("/:guid", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  const guid = c.req.param("guid");
  const { name } = await c.req.json();
  try {
    const result = await authQuery(c.get("jwtClaims"), async (tx) => {
      const target = await tx.query.binSets.findFirst({
        where: (binSets2, { eq: eq8, and: and3 }) => and3(eq8(binSets2.guid, guid), eq8(binSets2.orgId, orgId)),
        columns: { id: true }
      });
      if (!target) return { message: "Set not found.", success: false };
      await tx.update(binSets).set({ name, updatedAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm6.eq)(binSets.id, target.id));
      return _loadSets(tx, orgId);
    });
    return c.json(result);
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});
router2.delete("/:guid", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  const guid = c.req.param("guid");
  try {
    const result = await authQuery(c.get("jwtClaims"), async (tx) => {
      const target = await tx.query.binSets.findFirst({
        where: (binSets2, { eq: eq8, and: and3 }) => and3(eq8(binSets2.guid, guid), eq8(binSets2.orgId, orgId)),
        columns: { id: true }
      });
      if (!target) return { message: "Set not found.", success: false };
      await tx.delete(bins).where((0, import_drizzle_orm6.eq)(bins.binSet, target.id));
      await tx.delete(binSets).where((0, import_drizzle_orm6.eq)(binSets.id, target.id));
      return _loadSets(tx, orgId);
    });
    return c.json(result);
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});
router2.get("/history", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  const setGuid = c.req.query("setGuid");
  try {
    const result = await authQuery(c.get("jwtClaims"), async (tx) => {
      const rows = await tx.query.binSetAudit.findMany({
        where: setGuid ? (t, { eq: eq8, and: and3 }) => and3(eq8(t.binSetGuid, setGuid), eq8(t.orgId, orgId)) : (t, { eq: eq8 }) => eq8(t.orgId, orgId),
        columns: {
          guid: true,
          binSetGuid: true,
          snapshot: true,
          createdAt: true
        },
        orderBy: (t, { desc: desc2 }) => [desc2(t.createdAt)],
        limit: 20
      });
      return {
        success: true,
        message: "Loaded history.",
        data: rows.map((r) => ({
          guid: r.guid,
          binSetGuid: r.binSetGuid,
          snapshot: r.snapshot,
          createdAt: r.createdAt.toISOString()
        }))
      };
    });
    return c.json(result);
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});
router2.post("/history/:guid/revert", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  const guid = c.req.param("guid");
  try {
    const result = await authQuery(c.get("jwtClaims"), async (tx) => {
      const entry = await tx.query.binSetAudit.findFirst({
        where: (t, { eq: eq8, and: and3 }) => and3(eq8(t.guid, guid), eq8(t.orgId, orgId))
      });
      if (!entry) return { success: false, message: "Audit record not found." };
      const binSet = await tx.query.binSets.findFirst({
        where: (t, { eq: eq8, and: and3 }) => and3(eq8(t.guid, entry.binSetGuid), eq8(t.orgId, orgId)),
        columns: { id: true, guid: true },
        with: { bins: { columns: { id: true, binNumber: true } } }
      });
      if (!binSet) return { success: false, message: "Bin set not found." };
      const snapshot = entry.snapshot;
      for (const config of snapshot) {
        const existing = binSet.bins.find(
          (b) => b.binNumber === config.binNumber
        );
        if (existing) {
          await tx.update(bins).set({
            rules: config.rules,
            isCatchAll: config.isCatchAll,
            updatedAt: /* @__PURE__ */ new Date()
          }).where((0, import_drizzle_orm6.eq)(bins.id, existing.id));
        } else {
          await tx.insert(bins).values({
            binNumber: config.binNumber,
            rules: config.rules,
            isCatchAll: config.isCatchAll,
            binSet: binSet.id,
            orgId
          });
        }
      }
      await tx.insert(binSetAudit).values({
        binSetGuid: entry.binSetGuid,
        snapshot: entry.snapshot,
        orgId
      });
      return _loadSets(tx, orgId);
    });
    return c.json(result);
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});

// src/routes/card.ts
var import_node_crypto = require("crypto");
var import_node_fs2 = require("fs");
var import_node_path2 = require("path");
var import_drizzle_orm7 = require("drizzle-orm");
var import_hono3 = require("hono");

// src/lib/card-cache.ts
var TTL_MS = 60 * 60 * 1e3;
var MAX_ENTRIES = 500;
var cache = /* @__PURE__ */ new Map();
function cacheKey(baseUrl, scryfallId) {
  return `${baseUrl}::${scryfallId}`;
}
async function resolveCardDetails(adapter, baseUrl, scryfallId) {
  const key = cacheKey(baseUrl, scryfallId);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    cache.delete(key);
    cache.set(key, hit);
    return hit.data;
  }
  if (cache.size > 0) {
    const now = Date.now();
    for (const [k, entry] of cache) {
      if (entry.expiresAt <= now) cache.delete(k);
    }
  }
  const result = await adapter.searchById(scryfallId, baseUrl);
  if (!result.success || !result.data) return null;
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== void 0) cache.delete(oldest);
  }
  cache.set(key, { data: result.data, expiresAt: Date.now() + TTL_MS });
  return result.data;
}

// src/routes/card.ts
var router3 = new import_hono3.Hono();
var ART_CACHE_DIR = process.env.ART_CACHE_DIR ?? (0, import_node_path2.join)(process.cwd(), ".cache", "art");
function artCachePaths(url) {
  const key = (0, import_node_crypto.createHash)("sha256").update(url).digest("hex");
  return {
    imgPath: (0, import_node_path2.join)(ART_CACHE_DIR, `${key}.img`),
    metaPath: (0, import_node_path2.join)(ART_CACHE_DIR, `${key}.meta`)
  };
}
router3.post("/", requireAuth, async (c) => {
  const body = await c.req.parseBody();
  const file = body["image"];
  const collectionGuid = typeof body["collectionGuid"] === "string" ? body["collectionGuid"] : void 0;
  if (!file || typeof file === "string") {
    return c.json({ success: false, message: "No image provided." }, 400);
  }
  if (!file.type.startsWith("image/")) {
    return c.json(
      { success: false, message: "Uploaded file is not an image." },
      400
    );
  }
  let embedding;
  try {
    embedding = await vectorizeImageFromBuffer(
      Buffer.from(await file.arrayBuffer())
    );
  } catch (err) {
    console.error(err);
    return c.json(
      { success: false, message: "Failed to vectorize image." },
      500
    );
  }
  const embeddingStr = `[${embedding.join(",")}]`;
  const resolved = await resolveCardSearch(
    c.get("jwtClaims"),
    c.req.header("X-Org-Id"),
    collectionGuid
  );
  if (!resolved) {
    return c.json(
      { success: false, message: "No game configured for this collection." },
      400
    );
  }
  const { adapter, baseUrl, gameKey } = resolved;
  try {
    const matches = await authQuery(c.get("jwtClaims"), async (tx) => {
      const rows = await tx.execute(import_drizzle_orm7.sql`
        SELECT
          scryfall_id,
          embedding <=> ${embeddingStr}::vector(768) AS distance
        FROM cards
        WHERE game_key = ${gameKey} AND (embedding <=> ${embeddingStr}::vector(768)) < 0.3
        ORDER BY embedding <=> ${embeddingStr}::vector(768)
        LIMIT 5
      `);
      return rows.rows.map((row) => ({
        id: row.scryfall_id,
        scryfallId: row.scryfall_id,
        distance: row.distance
      }));
    });
    let data = null;
    if (matches.length > 0) {
      const closeMatches = matches.filter(
        (m) => m.distance - matches[0].distance <= CLOSE_MATCH_DELTA
      );
      data = await Promise.all(
        closeMatches.map(async (m) => ({
          ...m,
          card: await resolveCardDetails(adapter, baseUrl, m.scryfallId)
        }))
      );
    }
    return c.json({
      message: "Successfully searched for card.",
      success: true,
      data
    });
  } catch (err) {
    console.error(err);
    const orgId = c.req.header("X-Org-Id");
    if (orgId) {
      void sendDiscordNotification(orgId, {
        title: "Magic Vault \u2014 Card Search Error",
        description: "A database error occurred while searching for a card.",
        color: 15548997,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    return c.json({ success: false, message: "Database error." }, 500);
  }
});
router3.get("/search", requireAuth, async (c) => {
  const query = c.req.query("q") ?? "";
  const resolved = await resolveCardSearch(
    c.get("jwtClaims"),
    c.req.header("X-Org-Id"),
    c.req.query("collectionGuid")
  );
  if (!resolved) {
    return c.json(
      { success: false, message: "No game configured for this collection." },
      400
    );
  }
  const result = await resolved.adapter.search(query, resolved.baseUrl);
  return c.json(result);
});
router3.get("/search/:id", requireAuth, async (c) => {
  const resolved = await resolveCardSearch(
    c.get("jwtClaims"),
    c.req.header("X-Org-Id"),
    c.req.query("collectionGuid")
  );
  if (!resolved) {
    return c.json(
      { success: false, message: "No game configured for this collection." },
      400
    );
  }
  const result = await resolved.adapter.searchById(
    c.req.param("id"),
    resolved.baseUrl
  );
  return c.json(result);
});
var ALLOWED_IMAGE_HOSTS = /* @__PURE__ */ new Set([
  "cards.scryfall.io",
  "gundam-gcg.com",
  "www.gundam-gcg.com",
  "assets.tcgdex.net"
]);
router3.get("/image-proxy", async (c) => {
  const url = c.req.query("url");
  if (!url) return c.json({ success: false, message: "Missing url." }, 400);
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return c.json({ success: false, message: "Invalid url." }, 400);
  }
  if (parsed.protocol !== "https:" || !ALLOWED_IMAGE_HOSTS.has(parsed.hostname)) {
    return c.json({ success: false, message: "Host not allowed." }, 400);
  }
  const { imgPath, metaPath: metaPath2 } = artCachePaths(parsed.toString());
  if ((0, import_node_fs2.existsSync)(imgPath) && (0, import_node_fs2.existsSync)(metaPath2)) {
    try {
      const buffer2 = (0, import_node_fs2.readFileSync)(imgPath);
      const contentType2 = (0, import_node_fs2.readFileSync)(metaPath2, "utf8");
      return c.body(buffer2, 200, {
        "Content-Type": contentType2,
        "Cache-Control": "public, max-age=86400",
        "Cross-Origin-Resource-Policy": "cross-origin"
      });
    } catch {
    }
  }
  const upstream = await fetch(parsed.toString(), {
    headers: { "User-Agent": "MagicVault/1.0", Accept: "image/*" }
  });
  const contentType = upstream.headers.get("content-type") ?? "";
  if (!upstream.ok || !contentType.startsWith("image/")) {
    return c.json({ success: false, message: "Failed to fetch image." }, 502);
  }
  const buffer = Buffer.from(await upstream.arrayBuffer());
  try {
    (0, import_node_fs2.mkdirSync)(ART_CACHE_DIR, { recursive: true });
    (0, import_node_fs2.writeFileSync)(imgPath, buffer);
    (0, import_node_fs2.writeFileSync)(metaPath2, contentType);
  } catch (err) {
    console.error("[image-proxy] failed to cache art:", err);
  }
  return c.body(buffer, 200, {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=86400",
    "Cross-Origin-Resource-Policy": "cross-origin"
  });
});

// src/routes/collections.ts
var import_drizzle_orm8 = require("drizzle-orm");
var import_hono4 = require("hono");
var import_streaming2 = require("hono/streaming");

// src/lib/scan-lock.ts
var LOCK_TTL_MS = 5 * 60 * 1e3;
var locks = /* @__PURE__ */ new Map();
var orgWriters = /* @__PURE__ */ new Map();
function emitToOrg(orgId, event, data) {
  const writers2 = orgWriters.get(orgId);
  if (!writers2) return;
  for (const writer of writers2) {
    try {
      writer(event, data);
    } catch {
    }
  }
}
function scheduleLockExpiry(guid) {
  return setTimeout(() => {
    const entry = locks.get(guid);
    if (entry) {
      emitToOrg(entry.orgId, "lock_released", { guid });
      locks.delete(guid);
    }
  }, LOCK_TTL_MS);
}
function acquireLock(guid, userId, orgId, displayName) {
  const existing = locks.get(guid);
  if (existing) {
    if (existing.userId !== userId) return false;
    clearTimeout(existing.timer);
    existing.timer = scheduleLockExpiry(guid);
    existing.expiresAt = Date.now() + LOCK_TTL_MS;
    return true;
  }
  locks.set(guid, {
    userId,
    displayName,
    orgId,
    expiresAt: Date.now() + LOCK_TTL_MS,
    timer: scheduleLockExpiry(guid)
  });
  emitToOrg(orgId, "lock_acquired", { guid, userId, displayName });
  return true;
}
function releaseLock(guid, userId) {
  const existing = locks.get(guid);
  if (!existing || existing.userId !== userId) return false;
  clearTimeout(existing.timer);
  emitToOrg(existing.orgId, "lock_released", { guid });
  locks.delete(guid);
  return true;
}
function getLocksForGuids(guids) {
  const result = {};
  for (const guid of guids) {
    const entry = locks.get(guid);
    if (entry) result[guid] = { userId: entry.userId, displayName: entry.displayName, expiresAt: entry.expiresAt };
  }
  return result;
}
function subscribeOrgLocks(orgId, writer) {
  let writers2 = orgWriters.get(orgId);
  if (!writers2) {
    writers2 = /* @__PURE__ */ new Set();
    orgWriters.set(orgId, writers2);
  }
  writers2.add(writer);
  return () => {
    writers2.delete(writer);
    if (writers2.size === 0) orgWriters.delete(orgId);
  };
}

// src/lib/session-stream.ts
var sessions = /* @__PURE__ */ new Map();
function broadcastViewers(guid, entries) {
  const viewers = Array.from(entries).map(({ userId, displayName }) => ({ userId, displayName }));
  for (const entry of entries) {
    try {
      entry.writer("viewers_updated", { viewers });
    } catch {
    }
  }
}
function subscribeSession(guid, userId, displayName, writer) {
  let entries = sessions.get(guid);
  if (!entries) {
    entries = /* @__PURE__ */ new Set();
    sessions.set(guid, entries);
  }
  const entry = { userId, displayName, writer };
  entries.add(entry);
  broadcastViewers(guid, entries);
  return () => {
    entries.delete(entry);
    if (entries.size === 0) {
      sessions.delete(guid);
    } else {
      broadcastViewers(guid, entries);
    }
  };
}
function emitToSession(guid, event, data) {
  const entries = sessions.get(guid);
  if (!entries) return;
  for (const entry of entries) {
    try {
      entry.writer(event, data);
    } catch {
    }
  }
}
function sessionListenerCount(guid) {
  return sessions.get(guid)?.size ?? 0;
}
function getSessionViewers(guid) {
  return Array.from(sessions.get(guid) ?? []).map(({ userId, displayName }) => ({ userId, displayName }));
}

// src/routes/collections.ts
var router4 = new import_hono4.Hono();
async function collectionBelongsToOrg(guid, orgId, jwtClaims) {
  return authQuery(jwtClaims, async (tx) => {
    const row = await tx.query.collections.findFirst({
      where: (t, { eq: eq8, and: and3 }) => and3(eq8(t.guid, guid), eq8(t.orgId, orgId)),
      columns: { id: true }
    });
    return !!row;
  });
}
function toCollection(row) {
  return {
    guid: row.guid,
    name: row.name,
    isActive: row.isActive,
    cardCount: Number(row.cardCount),
    game: row.gameGuid ? {
      guid: row.gameGuid,
      key: row.gameKey,
      name: row.gameName,
      dataSourceUrl: row.gameDataSourceUrl,
      isActive: row.gameIsActive,
      fieldDefinitions: row.gameFieldDefinitions,
      createdAt: row.gameCreatedAt.toISOString(),
      updatedAt: row.gameUpdatedAt.toISOString()
    } : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}
function toScannedCard(row) {
  return {
    scanId: row.guid,
    card: row.card,
    scannedAt: row.scannedAt.getTime(),
    binNumber: row.binNumber ?? void 0,
    capturedImageUrl: row.capturedImageDataUrl ?? void 0,
    isFoil: row.isFoil ?? void 0,
    isDownloaded: row.isDownloaded ?? void 0,
    alternativeMatches: row.alternativeMatches ?? void 0
  };
}
async function _loadCollections(tx, orgId) {
  const rows = await tx.select({
    id: collections.id,
    guid: collections.guid,
    name: collections.name,
    isActive: collections.isActive,
    cardCount: (0, import_drizzle_orm8.count)(collectionCards.id),
    createdAt: collections.createdAt,
    updatedAt: collections.updatedAt,
    gameGuid: games.guid,
    gameKey: games.key,
    gameName: games.name,
    gameDataSourceUrl: games.dataSourceUrl,
    gameIsActive: games.isActive,
    gameFieldDefinitions: games.fieldDefinitions,
    gameCreatedAt: games.createdAt,
    gameUpdatedAt: games.updatedAt
  }).from(collections).leftJoin(collectionCards, (0, import_drizzle_orm8.eq)(collectionCards.collectionId, collections.id)).leftJoin(games, (0, import_drizzle_orm8.eq)(games.id, collections.gameId)).where((0, import_drizzle_orm8.eq)(collections.orgId, orgId)).groupBy(
    collections.id,
    collections.guid,
    collections.name,
    collections.isActive,
    collections.createdAt,
    collections.updatedAt,
    games.id
  ).orderBy((0, import_drizzle_orm8.desc)(collections.updatedAt));
  return { success: true, data: rows.map(toCollection) };
}
router4.get("/", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  try {
    const result = await authQuery(
      c.get("jwtClaims"),
      (tx) => _loadCollections(tx, orgId)
    );
    return c.json(result);
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});
router4.get("/lock-events", async (c) => {
  const orgId = c.req.query("orgId") ?? LOCAL_ORG_ID;
  const claims = JSON.stringify({ sub: LOCAL_USER_ID, role: "authenticated" });
  return (0, import_streaming2.streamSSE)(c, async (stream) => {
    try {
      const guids = await authQuery(
        claims,
        async (tx) => tx.select({ guid: collections.guid }).from(collections).where((0, import_drizzle_orm8.eq)(collections.orgId, orgId))
      );
      const initial = getLocksForGuids(
        guids.map((r) => r.guid).filter(Boolean)
      );
      await stream.writeSSE({
        event: "init",
        data: JSON.stringify({ locks: initial })
      });
    } catch {
    }
    const unsubscribe = subscribeOrgLocks(orgId, (event, data) => {
      stream.writeSSE({ event, data: JSON.stringify(data) }).catch(() => {
      });
    });
    await new Promise((resolve) => {
      stream.onAbort(resolve);
    });
    unsubscribe();
  });
});
router4.get("/locks", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  try {
    const guids = await authQuery(
      c.get("jwtClaims"),
      async (tx) => tx.select({ guid: collections.guid }).from(collections).where((0, import_drizzle_orm8.eq)(collections.orgId, orgId))
    );
    const data = getLocksForGuids(guids.map((r) => r.guid).filter(Boolean));
    return c.json({ success: true, data });
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});
router4.get("/live", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  try {
    const allCollections = await authQuery(c.get("jwtClaims"), async (tx) => {
      return tx.select({ guid: collections.guid }).from(collections).where((0, import_drizzle_orm8.eq)(collections.orgId, orgId));
    });
    const live = {};
    for (const { guid } of allCollections) {
      if (!guid) continue;
      const n = sessionListenerCount(guid);
      if (n > 0) live[guid] = n;
    }
    return c.json({ success: true, data: live });
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});
router4.get("/viewers", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  const allCollections = await authQuery(
    c.get("jwtClaims"),
    async (tx) => tx.select({ guid: collections.guid }).from(collections).where((0, import_drizzle_orm8.eq)(collections.orgId, orgId))
  );
  const result = {};
  for (const { guid } of allCollections) {
    if (!guid) continue;
    const viewers = getSessionViewers(guid);
    if (viewers.length > 0) result[guid] = viewers;
  }
  return c.json({ success: true, data: result });
});
router4.get("/:guid/viewers", requireAuth, requireOrg, async (c) => {
  const guid = c.req.param("guid");
  if (!await collectionBelongsToOrg(guid, c.get("orgId"), c.get("jwtClaims"))) {
    return c.json({ success: false, message: "Collection not found." }, 404);
  }
  return c.json({ success: true, data: getSessionViewers(guid) });
});
router4.post("/", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  const { name, gameGuid } = await c.req.json();
  try {
    const result = await authQuery(c.get("jwtClaims"), async (tx) => {
      let gameId = null;
      if (gameGuid) {
        const game = await tx.query.games.findFirst({
          where: (t, { eq: eq8 }) => eq8(t.guid, gameGuid),
          columns: { id: true }
        });
        gameId = game?.id ?? null;
      }
      await tx.update(collections).set({ isActive: false }).where(
        (0, import_drizzle_orm8.and)((0, import_drizzle_orm8.eq)(collections.isActive, true), (0, import_drizzle_orm8.eq)(collections.orgId, orgId))
      );
      await tx.insert(collections).values({ name, isActive: true, orgId, gameId });
      return _loadCollections(tx, orgId);
    });
    return c.json(result);
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});
router4.put("/:guid", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  const guid = c.req.param("guid");
  const { name } = await c.req.json();
  try {
    const result = await authQuery(c.get("jwtClaims"), async (tx) => {
      const target = await tx.query.collections.findFirst({
        where: (t, { eq: eq8, and: and3 }) => and3(eq8(t.guid, guid), eq8(t.orgId, orgId)),
        columns: { id: true }
      });
      if (!target) return { success: false, message: "Collection not found." };
      await tx.update(collections).set({ name, updatedAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm8.eq)(collections.id, target.id));
      return _loadCollections(tx, orgId);
    });
    return c.json(result);
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});
router4.put("/:guid/active", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  const guid = c.req.param("guid");
  try {
    const result = await authQuery(c.get("jwtClaims"), async (tx) => {
      const target = await tx.query.collections.findFirst({
        where: (t, { eq: eq8, and: and3 }) => and3(eq8(t.guid, guid), eq8(t.orgId, orgId)),
        columns: { id: true }
      });
      if (!target) return { success: false, message: "Collection not found." };
      await tx.update(collections).set({ isActive: false }).where(
        (0, import_drizzle_orm8.and)((0, import_drizzle_orm8.eq)(collections.isActive, true), (0, import_drizzle_orm8.eq)(collections.orgId, orgId))
      );
      await tx.update(collections).set({ isActive: true, updatedAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm8.eq)(collections.id, target.id));
      return _loadCollections(tx, orgId);
    });
    return c.json(result);
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});
router4.delete("/:guid", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  const guid = c.req.param("guid");
  try {
    const result = await authQuery(c.get("jwtClaims"), async (tx) => {
      const target = await tx.query.collections.findFirst({
        where: (t, { eq: eq8, and: and3 }) => and3(eq8(t.guid, guid), eq8(t.orgId, orgId)),
        columns: { id: true, isActive: true }
      });
      if (!target) return { success: false, message: "Collection not found." };
      await tx.delete(collections).where((0, import_drizzle_orm8.eq)(collections.id, target.id));
      if (target.isActive) {
        const next = await tx.query.collections.findFirst({
          where: (t, { eq: eq8 }) => eq8(t.orgId, orgId),
          orderBy: (t, { desc: desc2 }) => [desc2(t.updatedAt)],
          columns: { id: true }
        });
        if (next) {
          await tx.update(collections).set({ isActive: true }).where((0, import_drizzle_orm8.eq)(collections.id, next.id));
        }
      }
      return _loadCollections(tx, orgId);
    });
    return c.json(result);
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});
router4.get("/:guid/cards", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  const guid = c.req.param("guid");
  try {
    const result = await authQuery(c.get("jwtClaims"), async (tx) => {
      const collection = await tx.query.collections.findFirst({
        where: (t, { eq: eq8, and: and3 }) => and3(eq8(t.guid, guid), eq8(t.orgId, orgId)),
        columns: { id: true }
      });
      if (!collection)
        return { success: false, message: "Collection not found." };
      const rows = await tx.select({
        guid: collectionCards.guid,
        card: collectionCards.card,
        scannedAt: collectionCards.scannedAt,
        binNumber: collectionCards.binNumber,
        capturedImageDataUrl: collectionCards.capturedImageDataUrl,
        isFoil: collectionCards.isFoil,
        isDownloaded: collectionCards.isDownloaded,
        alternativeMatches: collectionCards.alternativeMatches
      }).from(collectionCards).where((0, import_drizzle_orm8.eq)(collectionCards.collectionId, collection.id)).orderBy((0, import_drizzle_orm8.desc)(collectionCards.scannedAt));
      return { success: true, data: rows.map(toScannedCard) };
    });
    return c.json(result);
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});
router4.post("/:guid/cards", requireAuth, requireOrg, async (c) => {
  const guid = c.req.param("guid");
  const userId = c.get("userId");
  const orgId = c.get("orgId");
  const {
    scanId,
    card,
    scannedAt,
    binNumber,
    capturedImageUrl,
    isFoil,
    alternativeMatches
  } = await c.req.json();
  const displayName = await getUserDisplayName(userId);
  if (!acquireLock(guid, userId, orgId, displayName)) {
    return c.json(
      {
        success: false,
        message: "Another org member is currently scanning into this collection."
      },
      423
    );
  }
  try {
    const { result, fieldDefinitions, collectionName, gameName } = await authQuery(c.get("jwtClaims"), async (tx) => {
      const collection = await tx.query.collections.findFirst({
        where: (t, { eq: eq8, and: and3 }) => and3(eq8(t.guid, guid), eq8(t.orgId, orgId)),
        columns: { id: true, gameId: true, name: true }
      });
      if (!collection)
        return {
          result: { success: false, message: "Collection not found." },
          fieldDefinitions: void 0,
          collectionName: void 0,
          gameName: void 0
        };
      await tx.insert(collectionCards).values({
        guid: scanId,
        collectionId: collection.id,
        scryfallId: card.id,
        card,
        scannedAt: new Date(scannedAt),
        binNumber: binNumber ?? null,
        capturedImageDataUrl: capturedImageUrl ?? null,
        isFoil: isFoil ?? false,
        alternativeMatches: alternativeMatches?.length ? alternativeMatches : null,
        orgId
      }).onConflictDoNothing();
      await tx.update(collections).set({ updatedAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm8.eq)(collections.id, collection.id));
      const game = collection.gameId ? await tx.query.games.findFirst({
        where: (t, { eq: eq8 }) => eq8(t.id, collection.gameId),
        columns: { fieldDefinitions: true, name: true }
      }) : null;
      return {
        result: {
          success: true,
          data: {
            scanId,
            card,
            scannedAt,
            binNumber,
            capturedImageUrl,
            isFoil,
            alternativeMatches
          }
        },
        fieldDefinitions: game?.fieldDefinitions ?? void 0,
        collectionName: collection.name,
        gameName: game?.name
      };
    });
    if (result.success) {
      emitToSession(guid, "card_added", result.data);
      db.query.orgSettings.findFirst({
        where: (0, import_drizzle_orm8.eq)(orgSettings.orgId, orgId),
        columns: { discordNotifyOnScan: true }
      }).then((row) => {
        if (row?.discordNotifyOnScan) {
          void sendDiscordNotification(
            orgId,
            buildCardScannedEmbed(card, {
              isFoil,
              fieldDefinitions,
              collectionName,
              gameName,
              collectionGuid: guid
            })
          );
        }
      }).catch((err) => {
        console.error("[discord] Failed to check discordNotifyOnScan:", err);
      });
    }
    return c.json(result);
  } catch (err) {
    console.error(err);
    emitToSession(guid, "scan_error", {
      message: "Failed to save card to collection.",
      timestamp: Date.now()
    });
    return c.json({ success: false, message: "Database error." }, 500);
  }
});
router4.put("/:guid/cards/:scanId", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  const { guid, scanId } = c.req.param();
  const { card, binNumber, isFoil } = await c.req.json();
  try {
    const result = await authQuery(c.get("jwtClaims"), async (tx) => {
      const existing = await tx.query.collectionCards.findFirst({
        where: (t, { eq: eq8, and: and3 }) => and3(eq8(t.guid, scanId), eq8(t.orgId, orgId)),
        columns: {
          id: true,
          scannedAt: true,
          card: true,
          binNumber: true,
          isFoil: true
        }
      });
      if (!existing) return { success: false, message: "Card not found." };
      const updates = {};
      if (card !== void 0) {
        updates.card = card;
        updates.scryfallId = card.id;
        if (binNumber !== void 0) updates.binNumber = binNumber;
      }
      if (isFoil !== void 0) updates.isFoil = isFoil;
      await tx.update(collectionCards).set(updates).where((0, import_drizzle_orm8.eq)(collectionCards.id, existing.id));
      return {
        success: true,
        data: toScannedCard({
          guid: scanId,
          card: card ?? existing.card,
          scannedAt: existing.scannedAt,
          binNumber: card !== void 0 ? binNumber ?? existing.binNumber : existing.binNumber,
          isFoil: isFoil !== void 0 ? isFoil : existing.isFoil
        })
      };
    });
    if (result.success) emitToSession(guid, "card_updated", result.data);
    return c.json(result);
  } catch (err) {
    console.error(err);
    emitToSession(guid, "scan_error", {
      message: "Failed to update card.",
      timestamp: Date.now()
    });
    return c.json({ success: false, message: "Database error." }, 500);
  }
});
router4.delete("/:guid/cards", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  const guid = c.req.param("guid");
  try {
    const result = await authQuery(c.get("jwtClaims"), async (tx) => {
      const collection = await tx.query.collections.findFirst({
        where: (t, { eq: eq8, and: and3 }) => and3(eq8(t.guid, guid), eq8(t.orgId, orgId)),
        columns: { id: true }
      });
      if (!collection)
        return { success: false, message: "Collection not found." };
      await tx.delete(collectionCards).where((0, import_drizzle_orm8.eq)(collectionCards.collectionId, collection.id));
      return { success: true, data: null };
    });
    if (result.success) emitToSession(guid, "cards_cleared", {});
    return c.json(result);
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});
router4.post("/:guid/cards/remove-bulk", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  const guid = c.req.param("guid");
  const { scanIds } = await c.req.json();
  try {
    const result = await authQuery(c.get("jwtClaims"), async (tx) => {
      for (const scanId of scanIds) {
        await tx.delete(collectionCards).where(
          (0, import_drizzle_orm8.and)(
            (0, import_drizzle_orm8.eq)(collectionCards.guid, scanId),
            (0, import_drizzle_orm8.eq)(collectionCards.orgId, orgId)
          )
        );
      }
      return { success: true, data: null };
    });
    if (result.success) emitToSession(guid, "cards_removed", { scanIds });
    return c.json(result);
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});
router4.post(
  "/:guid/cards/mark-downloaded",
  requireAuth,
  requireOrg,
  async (c) => {
    const orgId = c.get("orgId");
    const guid = c.req.param("guid");
    const { scanIds } = await c.req.json();
    try {
      const result = await authQuery(c.get("jwtClaims"), async (tx) => {
        for (const scanId of scanIds) {
          await tx.update(collectionCards).set({ isDownloaded: true }).where(
            (0, import_drizzle_orm8.and)(
              (0, import_drizzle_orm8.eq)(collectionCards.guid, scanId),
              (0, import_drizzle_orm8.eq)(collectionCards.orgId, orgId)
            )
          );
        }
        return { success: true, data: null };
      });
      if (result.success) emitToSession(guid, "cards_downloaded", { scanIds });
      return c.json(result);
    } catch (err) {
      console.error(err);
      return c.json({ success: false, message: "Database error." }, 500);
    }
  }
);
router4.delete("/:guid/cards/:scanId", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  const { guid, scanId } = c.req.param();
  try {
    const result = await authQuery(c.get("jwtClaims"), async (tx) => {
      await tx.delete(collectionCards).where(
        (0, import_drizzle_orm8.and)(
          (0, import_drizzle_orm8.eq)(collectionCards.guid, scanId),
          (0, import_drizzle_orm8.eq)(collectionCards.orgId, orgId)
        )
      );
      return { success: true, data: null };
    });
    if (result.success) emitToSession(guid, "card_removed", { scanId });
    return c.json(result);
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});
router4.delete("/:guid/scan-lock", requireAuth, requireOrg, async (c) => {
  const guid = c.req.param("guid");
  const userId = c.get("userId");
  if (!await collectionBelongsToOrg(guid, c.get("orgId"), c.get("jwtClaims"))) {
    return c.json({ success: false, message: "Collection not found." }, 404);
  }
  releaseLock(guid, userId);
  return c.json({ success: true, data: null });
});
router4.post("/:guid/debug/error", requireAuth, requireOrg, async (c) => {
  const guid = c.req.param("guid");
  if (!await collectionBelongsToOrg(guid, c.get("orgId"), c.get("jwtClaims"))) {
    return c.json({ success: false, message: "Collection not found." }, 404);
  }
  emitToSession(guid, "scan_error", {
    message: "Debug: forced error triggered.",
    timestamp: Date.now()
  });
  return c.json({ success: true, data: null });
});
router4.get("/:guid/stream", async (c) => {
  const guid = c.req.param("guid");
  const orgId = c.req.query("orgId") ?? LOCAL_ORG_ID;
  const jwtClaims = JSON.stringify({
    sub: LOCAL_USER_ID,
    role: "authenticated"
  });
  if (!await collectionBelongsToOrg(guid, orgId, jwtClaims)) {
    return c.json(
      { success: false, message: "Collection not found." },
      404
    );
  }
  const viewerDisplayName = await getUserDisplayName(LOCAL_USER_ID);
  return (0, import_streaming2.streamSSE)(c, async (stream) => {
    const writer = (event, data) => {
      stream.writeSSE({ event, data: JSON.stringify(data) }).catch(() => {
      });
    };
    const unsubscribe = subscribeSession(
      guid,
      LOCAL_USER_ID,
      viewerDisplayName,
      writer
    );
    try {
      const initial = await authQuery(jwtClaims, async (tx) => {
        const collection = await tx.query.collections.findFirst({
          where: (t, { eq: eq8, and: and3 }) => and3(eq8(t.guid, guid), eq8(t.orgId, orgId)),
          columns: {
            id: true,
            guid: true,
            name: true,
            isActive: true,
            gameId: true,
            createdAt: true,
            updatedAt: true
          }
        });
        if (!collection) return null;
        const game = collection.gameId ? await tx.query.games.findFirst({
          where: (t, { eq: eq8 }) => eq8(t.id, collection.gameId)
        }) : null;
        const cardRows = await tx.select({
          guid: collectionCards.guid,
          card: collectionCards.card,
          scannedAt: collectionCards.scannedAt,
          binNumber: collectionCards.binNumber,
          capturedImageDataUrl: collectionCards.capturedImageDataUrl,
          isFoil: collectionCards.isFoil,
          isDownloaded: collectionCards.isDownloaded,
          alternativeMatches: collectionCards.alternativeMatches
        }).from(collectionCards).where((0, import_drizzle_orm8.eq)(collectionCards.collectionId, collection.id)).orderBy((0, import_drizzle_orm8.desc)(collectionCards.scannedAt));
        return {
          collection: {
            guid: collection.guid,
            name: collection.name,
            isActive: collection.isActive,
            cardCount: cardRows.length,
            game: game ? {
              guid: game.guid,
              key: game.key,
              name: game.name,
              dataSourceUrl: game.dataSourceUrl,
              isActive: game.isActive,
              fieldDefinitions: game.fieldDefinitions,
              createdAt: game.createdAt.toISOString(),
              updatedAt: game.updatedAt.toISOString()
            } : null,
            createdAt: collection.createdAt.toISOString(),
            updatedAt: collection.updatedAt.toISOString()
          },
          cards: cardRows.map(toScannedCard),
          viewers: getSessionViewers(guid)
        };
      });
      if (initial) {
        await stream.writeSSE({
          event: "session_init",
          data: JSON.stringify(initial)
        });
      }
    } catch {
    }
    await new Promise((resolve) => {
      stream.onAbort(resolve);
    });
    unsubscribe();
  });
});

// src/routes/feeder.ts
var import_hono5 = require("hono");
var router5 = new import_hono5.Hono();
router5.get("/", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  try {
    const result = await authQuery(c.get("jwtClaims"), async (tx) => {
      const row = await tx.query.feederConfigs.findFirst({
        where: (t, { eq: eq8 }) => eq8(t.orgId, orgId)
      });
      const calibration = row ? {
        speed: row.speed,
        duration: row.duration,
        pulseDuration: row.pulseDuration,
        pauseDuration: row.pauseDuration,
        settleDuration: row.settleDuration
      } : { ...DEFAULT_FEEDER_CALIBRATION };
      return { success: true, message: "Loaded feeder config.", data: calibration };
    });
    return c.json(result);
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});
router5.put("/", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  const calibration = await c.req.json();
  try {
    const result = await authQuery(c.get("jwtClaims"), async (tx) => {
      await tx.insert(feederConfigs).values({ ...calibration, orgId }).onConflictDoUpdate({
        target: [feederConfigs.orgId],
        set: { ...calibration, updatedAt: /* @__PURE__ */ new Date() }
      });
      await tx.insert(feederConfigAudit).values({ ...calibration, orgId });
      const row = await tx.query.feederConfigs.findFirst({
        where: (t, { eq: eq8 }) => eq8(t.orgId, orgId)
      });
      const saved = row ? {
        speed: row.speed,
        duration: row.duration,
        pulseDuration: row.pulseDuration,
        pauseDuration: row.pauseDuration,
        settleDuration: row.settleDuration
      } : calibration;
      return { success: true, message: "Saved feeder config.", data: saved };
    });
    return c.json(result);
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});
router5.get("/history", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  try {
    const result = await authQuery(c.get("jwtClaims"), async (tx) => {
      const rows = await tx.query.feederConfigAudit.findMany({
        where: (t, { eq: eq8 }) => eq8(t.orgId, orgId),
        orderBy: (t, { desc: desc2 }) => [desc2(t.createdAt)],
        limit: 20
      });
      return {
        success: true,
        message: "Loaded history.",
        data: rows.map((r) => ({
          guid: r.guid,
          calibration: {
            speed: r.speed,
            duration: r.duration,
            pulseDuration: r.pulseDuration,
            pauseDuration: r.pauseDuration,
            settleDuration: r.settleDuration
          },
          createdAt: r.createdAt.toISOString()
        }))
      };
    });
    return c.json(result);
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});
router5.post("/history/:guid/revert", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  const guid = c.req.param("guid");
  try {
    const result = await authQuery(c.get("jwtClaims"), async (tx) => {
      const entry = await tx.query.feederConfigAudit.findFirst({
        where: (t, { eq: eq8, and: and3 }) => and3(eq8(t.guid, guid), eq8(t.orgId, orgId))
      });
      if (!entry) return { success: false, message: "Audit record not found." };
      const calibration = {
        speed: entry.speed,
        duration: entry.duration,
        pulseDuration: entry.pulseDuration,
        pauseDuration: entry.pauseDuration,
        settleDuration: entry.settleDuration
      };
      await tx.insert(feederConfigs).values({ ...calibration, orgId }).onConflictDoUpdate({
        target: [feederConfigs.orgId],
        set: { ...calibration, updatedAt: /* @__PURE__ */ new Date() }
      });
      await tx.insert(feederConfigAudit).values({ ...calibration, orgId });
      return { success: true, message: "Reverted feeder config.", data: calibration };
    });
    return c.json(result);
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});

// src/routes/games.ts
var import_drizzle_orm9 = require("drizzle-orm");
var import_hono6 = require("hono");
var router6 = new import_hono6.Hono();
function toGame(row) {
  return {
    guid: row.guid,
    key: row.key,
    name: row.name,
    dataSourceUrl: row.dataSourceUrl,
    isActive: row.isActive,
    fieldDefinitions: row.fieldDefinitions,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}
router6.get("/", requireAuth, async (c) => {
  try {
    const rows = await db.select().from(games).orderBy(games.name);
    return c.json({ success: true, data: rows.map(toGame) });
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});
router6.post("/", requireAuth, requireRole("admin"), async (c) => {
  const { key, name, dataSourceUrl, fieldDefinitions, isActive } = await c.req.json();
  if (!key?.trim() || !name?.trim() || !dataSourceUrl?.trim()) {
    return c.json(
      { success: false, message: "key, name, and dataSourceUrl are required." },
      400
    );
  }
  try {
    const [row] = await db.insert(games).values({
      key: key.trim(),
      name: name.trim(),
      dataSourceUrl: dataSourceUrl.trim(),
      // fieldDefinitions is NOT NULL in the schema; default to an empty list
      // when omitted so a minimal game creation doesn't 500.
      fieldDefinitions: fieldDefinitions ?? [],
      isActive: isActive ?? true
    }).returning();
    return c.json({ success: true, data: toGame(row) });
  } catch (err) {
    if (err instanceof Error && /unique/i.test(err.message)) {
      return c.json(
        { success: false, message: `A game with key "${key}" already exists.` },
        409
      );
    }
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});
router6.put("/:guid", requireAuth, requireRole("admin"), async (c) => {
  const guid = c.req.param("guid");
  const { key, name, dataSourceUrl, fieldDefinitions, isActive } = await c.req.json();
  try {
    const target = await db.query.games.findFirst({
      where: (t, { eq: eq8 }) => eq8(t.guid, guid),
      columns: { id: true }
    });
    if (!target) return c.json({ success: false, message: "Game not found." }, 404);
    const updates = { updatedAt: /* @__PURE__ */ new Date() };
    if (key !== void 0) updates.key = key.trim();
    if (name !== void 0) updates.name = name.trim();
    if (dataSourceUrl !== void 0) updates.dataSourceUrl = dataSourceUrl.trim();
    if (fieldDefinitions !== void 0) updates.fieldDefinitions = fieldDefinitions;
    if (isActive !== void 0) updates.isActive = isActive;
    const [row] = await db.update(games).set(updates).where((0, import_drizzle_orm9.eq)(games.id, target.id)).returning();
    return c.json({ success: true, data: toGame(row) });
  } catch (err) {
    if (err instanceof Error && /unique/i.test(err.message)) {
      return c.json(
        { success: false, message: `A game with key "${key}" already exists.` },
        409
      );
    }
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});
router6.delete("/:guid", requireAuth, requireRole("admin"), async (c) => {
  const guid = c.req.param("guid");
  try {
    const target = await db.query.games.findFirst({
      where: (t, { eq: eq8 }) => eq8(t.guid, guid),
      columns: { id: true }
    });
    if (!target) return c.json({ success: false, message: "Game not found." }, 404);
    await db.delete(games).where((0, import_drizzle_orm9.eq)(games.id, target.id));
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});

// src/routes/module-configs.ts
var import_hono7 = require("hono");
var router7 = new import_hono7.Hono();
function toModuleConfig(row) {
  return {
    moduleNumber: row.moduleNumber,
    calibration: {
      bottomClosed: row.bottomClosed,
      bottomOpen: row.bottomOpen,
      paddleClosed: row.paddleClosed,
      paddleOpen: row.paddleOpen,
      pusherLeft: row.pusherLeft,
      pusherNeutral: row.pusherNeutral,
      pusherRight: row.pusherRight
    }
  };
}
function buildConfigs(rows) {
  return [1, 2, 3].map((n) => {
    const row = rows.find((r) => r.moduleNumber === n);
    return row ? toModuleConfig(row) : { moduleNumber: n, calibration: { ...DEFAULT_CALIBRATION } };
  });
}
router7.get("/", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  try {
    const result = await authQuery(c.get("jwtClaims"), async (tx) => {
      const rows = await tx.query.moduleConfigs.findMany({
        where: (t, { eq: eq8 }) => eq8(t.orgId, orgId)
      });
      return { success: true, message: "Loaded module configs.", data: buildConfigs(rows) };
    });
    return c.json(result);
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});
router7.put("/:moduleNumber", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  const moduleNumber = Number(c.req.param("moduleNumber"));
  if (!Number.isInteger(moduleNumber) || moduleNumber < 1 || moduleNumber > 3) {
    return c.json(
      { success: false, message: "moduleNumber must be 1, 2, or 3." },
      400
    );
  }
  const calibration = await c.req.json();
  try {
    const result = await authQuery(c.get("jwtClaims"), async (tx) => {
      await tx.insert(moduleConfigs).values({ moduleNumber, ...calibration, orgId }).onConflictDoUpdate({
        target: [moduleConfigs.orgId, moduleConfigs.moduleNumber],
        set: { ...calibration, updatedAt: /* @__PURE__ */ new Date() }
      });
      await tx.insert(moduleConfigAudit).values({ moduleNumber, ...calibration, orgId });
      const rows = await tx.query.moduleConfigs.findMany({
        where: (t, { eq: eq8 }) => eq8(t.orgId, orgId)
      });
      return { success: true, message: "Saved module config.", data: buildConfigs(rows) };
    });
    return c.json(result);
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});
router7.get("/history", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  try {
    const result = await authQuery(c.get("jwtClaims"), async (tx) => {
      const rows = await tx.query.moduleConfigAudit.findMany({
        where: (t, { eq: eq8 }) => eq8(t.orgId, orgId),
        orderBy: (t, { desc: desc2 }) => [desc2(t.createdAt)],
        limit: 30
      });
      return {
        success: true,
        message: "Loaded history.",
        data: rows.map((r) => ({
          guid: r.guid,
          moduleNumber: r.moduleNumber,
          calibration: {
            bottomClosed: r.bottomClosed,
            bottomOpen: r.bottomOpen,
            paddleClosed: r.paddleClosed,
            paddleOpen: r.paddleOpen,
            pusherLeft: r.pusherLeft,
            pusherNeutral: r.pusherNeutral,
            pusherRight: r.pusherRight
          },
          createdAt: r.createdAt.toISOString()
        }))
      };
    });
    return c.json(result);
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});
router7.post("/history/:guid/revert", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  const guid = c.req.param("guid");
  try {
    const result = await authQuery(c.get("jwtClaims"), async (tx) => {
      const entry = await tx.query.moduleConfigAudit.findFirst({
        where: (t, { eq: eq8, and: and3 }) => and3(eq8(t.guid, guid), eq8(t.orgId, orgId))
      });
      if (!entry) return { success: false, message: "Audit record not found." };
      const calibration = {
        bottomClosed: entry.bottomClosed,
        bottomOpen: entry.bottomOpen,
        paddleClosed: entry.paddleClosed,
        paddleOpen: entry.paddleOpen,
        pusherLeft: entry.pusherLeft,
        pusherNeutral: entry.pusherNeutral,
        pusherRight: entry.pusherRight
      };
      await tx.insert(moduleConfigs).values({ moduleNumber: entry.moduleNumber, ...calibration, orgId }).onConflictDoUpdate({
        target: [moduleConfigs.orgId, moduleConfigs.moduleNumber],
        set: { ...calibration, updatedAt: /* @__PURE__ */ new Date() }
      });
      await tx.insert(moduleConfigAudit).values({ moduleNumber: entry.moduleNumber, ...calibration, orgId });
      const rows = await tx.query.moduleConfigs.findMany({
        where: (t, { eq: eq8 }) => eq8(t.orgId, orgId)
      });
      return { success: true, message: "Reverted module config.", data: buildConfigs(rows) };
    });
    return c.json(result);
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});

// src/routes/notifications.ts
var import_hono8 = require("hono");

// src/lib/serial-events.ts
var COMMAND_LABELS = {
  connect: "Connection",
  test: "Device Test",
  feeder: "Feed",
  "auto-feed": "Auto-Feed",
  bin: "Sorter",
  jam: "Sorter"
};
function contextLines(event) {
  const lines = [];
  if (event.cardName) lines.push(`**Card:** ${event.cardName}`);
  if (event.binNumber !== void 0) lines.push(`**Bin:** ${event.binNumber}`);
  return lines;
}
function classifySerialEvent(event) {
  const label = COMMAND_LABELS[event.command];
  const lines = contextLines(event);
  if (!event.sent) {
    return {
      title: `${label} Failed`,
      description: [...lines, "**Error:** Could not send command to the device."].join("\n")
    };
  }
  if (!event.response) {
    return {
      title: `${label} Timeout`,
      description: [...lines, "**Error:** No response from the device in time."].join("\n")
    };
  }
  if (typeof event.response !== "object") {
    return {
      title: `${label} Error`,
      description: [...lines, `**Error:** Unexpected response: ${String(event.response)}`].join(
        "\n"
      )
    };
  }
  const res = event.response;
  if (res.error === "jam") {
    return {
      title: "Card Jam Detected",
      description: `Card stuck at module ${res.module}${res.bin ? ` (heading to bin ${res.bin})` : ""}. Check the sorter and resume.`
    };
  }
  if (res.empty) {
    return {
      title: "Feeder Empty",
      description: [
        ...lines,
        "No cards remaining in the hopper. Add more cards to continue."
      ].join("\n")
    };
  }
  if (res.detected === false) {
    return {
      title: "Feeder Timeout",
      description: [
        ...lines,
        "The feeder ran without a card reaching the scanner. Check the hopper and feeder."
      ].join("\n")
    };
  }
  if (res.error) {
    return {
      title: `${label} Error`,
      description: [...lines, `**Error:** ${String(res.error)}`].join("\n")
    };
  }
  return null;
}

// src/routes/notifications.ts
var router8 = new import_hono8.Hono();
router8.get("/", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  try {
    const result = await authQuery(c.get("jwtClaims"), async (tx) => {
      const row = await tx.query.notificationSettings.findFirst({
        where: (t, { eq: eq8 }) => eq8(t.orgId, orgId)
      });
      const settings = {
        discordWebhookUrl: row?.discordWebhookUrl ?? null
      };
      return {
        success: true,
        message: "Loaded notification settings.",
        data: settings
      };
    });
    return c.json(result);
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});
router8.put("/", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  const body = await c.req.json();
  try {
    const result = await authQuery(c.get("jwtClaims"), async (tx) => {
      await tx.insert(notificationSettings).values({ discordWebhookUrl: body.discordWebhookUrl, orgId }).onConflictDoUpdate({
        target: [notificationSettings.orgId],
        set: {
          discordWebhookUrl: body.discordWebhookUrl,
          updatedAt: /* @__PURE__ */ new Date()
        }
      });
      const row = await tx.query.notificationSettings.findFirst({
        where: (t, { eq: eq8 }) => eq8(t.orgId, orgId)
      });
      const saved = {
        discordWebhookUrl: row?.discordWebhookUrl ?? null
      };
      return {
        success: true,
        message: "Saved notification settings.",
        data: saved
      };
    });
    return c.json(result);
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});
var TEST_EMBEDS = {
  "sorter-error": {
    title: "Magic Vault \u2014 Sorter Error [TEST]",
    description: "**Card:** Lightning Bolt\n**Bin:** 3\n**Error:** No response from the device in time."
  },
  "feeder-empty": {
    title: "Magic Vault \u2014 Feeder Empty [TEST]",
    description: "No cards remaining in the hopper. Add more cards to continue."
  },
  "card-jam": {
    title: "Magic Vault \u2014 Card Jam Detected [TEST]",
    description: "Card stuck at module 2 (heading to bin 5). Check the sorter and resume."
  },
  "card-search-error": {
    title: "Magic Vault \u2014 Card Search Error [TEST]",
    description: "A database error occurred while searching for a card."
  },
  "sync-failure": {
    title: "Magic Vault \u2014 Sync Failed [TEST]",
    description: "The card database sync job encountered a fatal error.\n\n**Error:** Scryfall catalog fetch failed: 503"
  }
};
router8.post("/test", requireAuth, requireOrg, async (c) => {
  const { type } = await c.req.json();
  const embed = TEST_EMBEDS[type];
  if (!embed) {
    return c.json(
      { success: false, message: "Unknown notification type." },
      400
    );
  }
  const orgId = c.get("orgId");
  await sendDiscordNotification(orgId, {
    ...embed,
    color: 15548997,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
  return c.json({ success: true, message: "Test notification sent." });
});
router8.post("/serial-event", requireAuth, requireOrg, async (c) => {
  const event = await c.req.json();
  const classified = classifySerialEvent(event);
  if (classified) {
    const orgId = c.get("orgId");
    void sendDiscordNotification(orgId, {
      title: `Magic Vault \u2014 ${classified.title}`,
      description: classified.description,
      color: 15548997,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  return c.json({ success: true, message: "Serial event reported." });
});

// src/routes/org-settings.ts
var import_drizzle_orm10 = require("drizzle-orm");
var import_hono9 = require("hono");
var router9 = new import_hono9.Hono();
var DEFAULT_SCAN_REGION = { coverage: 0.85, offsetX: 0, offsetY: 0 };
function toScanRegion(row) {
  return {
    coverage: row?.scanCoverage != null ? row.scanCoverage / 100 : DEFAULT_SCAN_REGION.coverage,
    offsetX: row?.scanOffsetX != null ? row.scanOffsetX / 100 : DEFAULT_SCAN_REGION.offsetX,
    offsetY: row?.scanOffsetY != null ? row.scanOffsetY / 100 : DEFAULT_SCAN_REGION.offsetY
  };
}
router9.get("/", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  try {
    const result = await authQuery(c.get("jwtClaims"), async (tx) => {
      const row = await tx.query.orgSettings.findFirst({
        where: (0, import_drizzle_orm10.eq)(orgSettings.orgId, orgId)
      });
      return {
        success: true,
        message: "Loaded.",
        data: {
          primaryColor: row?.primaryColor ?? null,
          scannerLayout: row?.scannerLayout ?? "horizontal",
          discordWebhookUrl: row?.discordWebhookUrl ?? null,
          discordNotifyOnScan: row?.discordNotifyOnScan ?? false,
          scanRegion: toScanRegion(row)
        }
      };
    });
    return c.json(result);
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});
router9.put("/", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  const body = await c.req.json();
  try {
    const result = await authQuery(c.get("jwtClaims"), async (tx) => {
      const existing = await tx.query.orgSettings.findFirst({
        where: (0, import_drizzle_orm10.eq)(orgSettings.orgId, orgId)
      });
      const merged = {
        primaryColor: "primaryColor" in body ? body.primaryColor ?? null : existing?.primaryColor ?? null,
        scannerLayout: "scannerLayout" in body ? body.scannerLayout ?? null : existing?.scannerLayout ?? null,
        discordWebhookUrl: "discordWebhookUrl" in body ? body.discordWebhookUrl ?? null : existing?.discordWebhookUrl ?? null,
        discordNotifyOnScan: "discordNotifyOnScan" in body ? body.discordNotifyOnScan ?? false : existing?.discordNotifyOnScan ?? false,
        scanCoverage: "scanRegion" in body ? body.scanRegion ? Math.round(body.scanRegion.coverage * 100) : null : existing?.scanCoverage ?? null,
        scanOffsetX: "scanRegion" in body ? body.scanRegion ? Math.round(body.scanRegion.offsetX * 100) : null : existing?.scanOffsetX ?? null,
        scanOffsetY: "scanRegion" in body ? body.scanRegion ? Math.round(body.scanRegion.offsetY * 100) : null : existing?.scanOffsetY ?? null
      };
      await tx.insert(orgSettings).values({ orgId, ...merged }).onConflictDoUpdate({
        target: [orgSettings.orgId],
        set: { ...merged, updatedAt: /* @__PURE__ */ new Date() }
      });
      return {
        success: true,
        message: "Saved.",
        data: {
          primaryColor: merged.primaryColor,
          scannerLayout: merged.scannerLayout ?? "horizontal",
          discordWebhookUrl: merged.discordWebhookUrl,
          discordNotifyOnScan: merged.discordNotifyOnScan,
          scanRegion: toScanRegion(merged)
        }
      };
    });
    return c.json(result);
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});

// src/index.ts
var app = new import_hono10.Hono();
var PORT = parseInt(process.env.PORT ?? "3001");
app.use(
  (0, import_cors.cors)({
    origin: process.env.WEB_URL ?? "http://localhost:5173",
    allowMethods: ["GET", "POST", "PUT", "DELETE"],
    allowHeaders: ["Content-Type", "Authorization", "X-Org-Id"]
  })
);
app.route("/api/cards", router3);
app.route("/api/bins", router2);
app.route("/api/collections", router4);
app.route("/api/modules", router7);
app.route("/api/feeder", router5);
app.route("/api/games", router6);
app.route("/api/notifications", router8);
app.route("/api/org-settings", router9);
app.route("/api/admin", router);
(0, import_node_server.serve)({ fetch: app.fetch, port: PORT, hostname: "0.0.0.0" }, () => {
  console.log(`[server] Running on port:${PORT}`);
});
