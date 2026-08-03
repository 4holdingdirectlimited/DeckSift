import { sql } from "drizzle-orm";
import { authenticatedRole, crudPolicy } from "drizzle-orm/neon/rls";
import {
  boolean,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm/relations";

const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "vector(768)"; // 768 dimensions — SigLIP ViT-Base-Patch16-224 embeddings
  },
  toDriver(value: number[]): string {
    return JSON.stringify(value);
  },
  fromDriver(value: string): number[] {
    return JSON.parse(value);
  },
});

// org_id scopes every row to the single local org (LOCAL_ORG_ID in
// middleware/auth.ts — this is a fully-local, single-user build with no
// logins). requireOrg injects the org_id claim into request.jwt.claims, which
// the orgRls policies check against auth_is_org_member(), a SECURITY DEFINER
// SQL function created by packages/server/sql/local-neon-bootstrap.sql.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const orgRls = (orgId: any) =>
  sql`(${orgId} = (current_setting('request.jwt.claims', true)::json ->> 'org_id')) AND auth_is_org_member(${orgId})`;

// ─── Global card vectors (no org scope) ──────────────────────────────────────

export const cardImageVectors = pgTable(
  "cards",
  {
    id: serial().primaryKey(),
    guid: uuid("guid").defaultRandom(),
    scryfallId: text("scryfall_id").notNull(),
    gameKey: text("game_key").notNull().default("mtg"),
    name: text("name").notNull(),
    setCode: text("set_code").notNull(),
    embedding: vector("embedding").notNull(),
    // Full card object (Scryfall card JSON / normalized PlayingCard shape).
    // Populated at sync time from bulk sources that carry it (Scryfall) or on
    // first scan via hydration fallback. Lets hydration serve card details
    // from the local DB instead of a remote API — no network in the scan path.
    cardData: jsonb("card_data"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    // Per-game uniqueness: sync jobs run per game key, and the same scryfall
    // id could theoretically exist under another game's namespace. A global
    // unique on scryfall_id alone would silently swallow per-game conflicts
    // (sync-job uses onConflictDoNothing and would report them as processed).
    unique("cards_game_key_scryfall_id_idx").on(table.gameKey, table.scryfallId),
    // Vector search in routes/card.ts does `WHERE game_key = ... AND
    // embedding <=> ? < 0.3 ORDER BY embedding <=> ?` over the whole table —
    // a sequential scan per scan request without these.
    index("cards_game_key_idx").on(table.gameKey),
    index("cards_embedding_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
    crudPolicy({
      role: authenticatedRole,
      read: true,
      modify: false,
    }),
  ],
).enableRLS();

export const games = pgTable(
  "games",
  {
    id: serial().primaryKey(),
    guid: uuid("guid").defaultRandom(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    dataSourceUrl: text("data_source_url").notNull(),
    fieldDefinitions: jsonb("field_definitions").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("games_key_idx").on(table.key),
    unique("games_guid_idx").on(table.guid),
    crudPolicy({
      role: authenticatedRole,
      read: true,
      modify: false,
    }),
  ],
).enableRLS();

// ─── Org-scoped data tables ───────────────────────────────────────────────────

export const binSets = pgTable(
  "bin_sets",
  {
    id: serial().primaryKey(),
    guid: uuid("guid").defaultRandom(),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(false),
    gameId: integer("game_id").references(() => games.id),
    orgId: text("org_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("bin_sets_guid_idx").on(table.guid),
    crudPolicy({
      role: authenticatedRole,
      read: orgRls(table.orgId),
      modify: orgRls(table.orgId),
    }),
  ],
).enableRLS();

export const bins = pgTable(
  "bins",
  {
    id: serial().primaryKey(),
    guid: uuid("guid").defaultRandom(),
    rules: jsonb("rules").notNull(),
    isCatchAll: boolean("is_catch_all").notNull().default(false),
    maxCapacity: integer("max_capacity").notNull().default(0),
    binNumber: integer("bin_number").notNull(),
    binSet: integer("bin_set")
      .notNull()
      .references(() => binSets.id),
    orgId: text("org_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("bins_guid_idx").on(table.guid),
    // FK lookups: _snapshotBinSet and delete/update paths filter by bin_set.
    index("bins_bin_set_idx").on(table.binSet),
    crudPolicy({
      role: authenticatedRole,
      read: orgRls(table.orgId),
      modify: orgRls(table.orgId),
    }),
  ],
).enableRLS();

export const moduleConfigs = pgTable(
  "module_configs",
  {
    id: serial().primaryKey(),
    guid: uuid("guid").defaultRandom(),
    moduleNumber: integer("module_number").notNull(),
    orgId: text("org_id").notNull(),
    // Defaults mirror DEFAULT_CALIBRATION in @magic-vault/shared so a row
    // inserted without an explicit payload matches what the UI/firmware expect
    // (previously the DB defaults disagreed with the shared constants and
    // would drive the sorter to wrong positions).
    bottomClosed: integer("bottom_closed").notNull().default(400),
    bottomOpen: integer("bottom_open").notNull().default(150),
    paddleClosed: integer("paddle_closed").notNull().default(420),
    paddleOpen: integer("paddle_open").notNull().default(150),
    pusherLeft: integer("pusher_left").notNull().default(150),
    pusherNeutral: integer("pusher_neutral").notNull().default(230),
    pusherRight: integer("pusher_right").notNull().default(300),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("module_configs_org_module_idx").on(table.orgId, table.moduleNumber),
    crudPolicy({
      role: authenticatedRole,
      read: orgRls(table.orgId),
      modify: orgRls(table.orgId),
    }),
  ],
).enableRLS();

export const feederConfigs = pgTable(
  "feeder_configs",
  {
    id: serial().primaryKey(),
    guid: uuid("guid").defaultRandom(),
    orgId: text("org_id").notNull(),
    // Defaults mirror DEFAULT_FEEDER_CALIBRATION in @magic-vault/shared.
    speed: integer("speed").notNull().default(250),
    duration: integer("duration").notNull().default(3000),
    pulseDuration: integer("pulse_duration").notNull().default(80),
    pauseDuration: integer("pause_duration").notNull().default(0),
    settleDuration: integer("settle_duration").notNull().default(500),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("feeder_configs_org_idx").on(table.orgId),
    crudPolicy({
      role: authenticatedRole,
      read: orgRls(table.orgId),
      modify: orgRls(table.orgId),
    }),
  ],
).enableRLS();

export const collections = pgTable(
  "collections",
  {
    id: serial().primaryKey(),
    guid: uuid("guid").defaultRandom(),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(false),
    gameId: integer("game_id").references(() => games.id),
    orgId: text("org_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("collections_guid_idx").on(table.guid),
    crudPolicy({
      role: authenticatedRole,
      read: orgRls(table.orgId),
      modify: orgRls(table.orgId),
    }),
  ],
).enableRLS();

export const collectionCards = pgTable(
  "collection_cards",
  {
    id: serial().primaryKey(),
    guid: uuid("guid").defaultRandom(),
    collectionId: integer("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    scryfallId: text("scryfall_id").notNull(),
    card: jsonb("card").notNull(),
    scannedAt: timestamp("scanned_at").notNull(),
    binNumber: integer("bin_number"),
    capturedImageDataUrl: text("captured_image_data_url"),
    isFoil: boolean("is_foil").notNull().default(false),
    isDownloaded: boolean("is_downloaded").notNull().default(false),
    alternativeMatches: jsonb("alternative_matches"),
    orgId: text("org_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    unique("collection_cards_guid_idx").on(table.guid),
    // Per-collection card list + cascade deletes filter by collection_id on
    // every scan session load and clear.
    index("collection_cards_collection_id_idx").on(table.collectionId),
    index("collection_cards_scryfall_id_idx").on(table.scryfallId),
    crudPolicy({
      role: authenticatedRole,
      read: orgRls(table.orgId),
      modify: orgRls(table.orgId),
    }),
  ],
).enableRLS();

export const notificationSettings = pgTable(
  "notification_settings",
  {
    id: serial().primaryKey(),
    guid: uuid("guid").defaultRandom(),
    orgId: text("org_id").notNull(),
    discordWebhookUrl: text("discord_webhook_url"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("notification_settings_org_idx").on(table.orgId),
    crudPolicy({
      role: authenticatedRole,
      read: orgRls(table.orgId),
      modify: orgRls(table.orgId),
    }),
  ],
).enableRLS();

export const orgSettings = pgTable(
  "org_settings",
  {
    id: serial().primaryKey(),
    guid: uuid("guid").defaultRandom(),
    orgId: text("org_id").notNull(),
    primaryColor: text("primary_color"),
    scannerLayout: text("scanner_layout"),
    discordWebhookUrl: text("discord_webhook_url"),
    discordNotifyOnScan: boolean("discord_notify_on_scan")
      .notNull()
      .default(false),
    scanCoverage: integer("scan_coverage"),
    scanOffsetX: integer("scan_offset_x"),
    scanOffsetY: integer("scan_offset_y"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("org_settings_org_idx").on(table.orgId),
    crudPolicy({
      role: authenticatedRole,
      read: orgRls(table.orgId),
      modify: orgRls(table.orgId),
    }),
  ],
).enableRLS();

// ─── Bundle mode (recipe-based sorting) ────────────────────────────────────────

// A recipe: which rarities go into a bundle, how many of each, and which
// physical bin each rarity routes to. Targets is [{ rarity, count, binNumber, foil? }].
export const bundleConfigs = pgTable(
  "bundle_configs",
  {
    id: serial().primaryKey(),
    guid: uuid("guid").defaultRandom(),
    name: text("name").notNull(),
    orgId: text("org_id").notNull(),
    targets: jsonb("targets").notNull(),
    // Duplicates / unmatched rarities / full targets route here.
    rejectBinNumber: integer("reject_bin_number").notNull(),
    // When true, the same card id may be placed more than once in a run.
    allowDuplicates: boolean("allow_duplicates").notNull().default(false),
    // When false, the scan's foil signal is ignored entirely (a holo common
    // and a plain common are both just "common"). When true, per-target foil
    // filters in `targets` apply.
    holoDetection: boolean("holo_detection").notNull().default(false),
    isActive: boolean("is_active").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("bundle_configs_guid_idx").on(table.guid),
    crudPolicy({
      role: authenticatedRole,
      read: orgRls(table.orgId),
      modify: orgRls(table.orgId),
    }),
  ],
).enableRLS();

// Live state of one bundle assembly. Persisted so a restart resumes the run
// (placed_card_ids is the no-duplicates set, counts is rarity → accepted).
export const bundleRuns = pgTable(
  "bundle_runs",
  {
    id: serial().primaryKey(),
    guid: uuid("guid").defaultRandom(),
    configId: integer("config_id")
      .notNull()
      .references(() => bundleConfigs.id, { onDelete: "cascade" }),
    orgId: text("org_id").notNull(),
    status: text("status").notNull().default("active"),
    placedCardIds: jsonb("placed_card_ids").notNull().default([]),
    counts: jsonb("counts").notNull().default({}),
    // Running market value of accepted cards (sum of prices.usd) — lets a
    // seller see what the assembled bundle is worth.
    totalValueUsd: doublePrecision("total_value_usd").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("bundle_runs_guid_idx").on(table.guid),
    // Resume lookup: the latest active run per org.
    index("bundle_runs_config_id_idx").on(table.configId),
    crudPolicy({
      role: authenticatedRole,
      read: orgRls(table.orgId),
      modify: orgRls(table.orgId),
    }),
  ],
).enableRLS();

// ─── Set-chase mode (complete a set) ──────────────────────────────────────────

// A chase config targets one set: scanned cards that belong to the set and are
// not already owned (in the collection / already found this run) route to the
// chase bin; everything else routes to the reject bin.
export const chaseConfigs = pgTable(
  "chase_configs",
  {
    id: serial().primaryKey(),
    guid: uuid("guid").defaultRandom(),
    name: text("name").notNull(),
    orgId: text("org_id").notNull(),
    gameKey: text("game_key").notNull(),
    setCode: text("set_code").notNull(),
    binNumber: integer("bin_number").notNull(),
    rejectBinNumber: integer("reject_bin_number").notNull(),
    // When set, cards already in this collection count as owned (not missing).
    collectionGuid: text("collection_guid"),
    isActive: boolean("is_active").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("chase_configs_guid_idx").on(table.guid),
    crudPolicy({
      role: authenticatedRole,
      read: orgRls(table.orgId),
      modify: orgRls(table.orgId),
    }),
  ],
).enableRLS();

export const chaseRuns = pgTable(
  "chase_runs",
  {
    id: serial().primaryKey(),
    guid: uuid("guid").defaultRandom(),
    configId: integer("config_id")
      .notNull()
      .references(() => chaseConfigs.id, { onDelete: "cascade" }),
    orgId: text("org_id").notNull(),
    status: text("status").notNull().default("active"),
    // Card ids found this run (the no-duplicates set for the chase).
    foundCardIds: jsonb("found_card_ids").notNull().default([]),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("chase_runs_guid_idx").on(table.guid),
    index("chase_runs_config_id_idx").on(table.configId),
    crudPolicy({
      role: authenticatedRole,
      read: orgRls(table.orgId),
      modify: orgRls(table.orgId),
    }),
  ],
).enableRLS();

// ─── Wishlist (wanted cards route to a bin) ───────────────────────────────────

export const wishlists = pgTable(
  "wishlists",
  {
    id: serial().primaryKey(),
    guid: uuid("guid").defaultRandom(),
    name: text("name").notNull(),
    orgId: text("org_id").notNull(),
    gameKey: text("game_key").notNull(),
    // Cards matching this wishlist route here instead of their rule bin.
    binNumber: integer("bin_number").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("wishlists_guid_idx").on(table.guid),
    crudPolicy({
      role: authenticatedRole,
      read: orgRls(table.orgId),
      modify: orgRls(table.orgId),
    }),
  ],
).enableRLS();

export const wishlistItems = pgTable(
  "wishlist_items",
  {
    id: serial().primaryKey(),
    guid: uuid("guid").defaultRandom(),
    wishlistId: integer("wishlist_id")
      .notNull()
      .references(() => wishlists.id, { onDelete: "cascade" }),
    orgId: text("org_id").notNull(),
    // Exact card id (scryfallId) and/or a case-insensitive name pattern.
    cardId: text("card_id"),
    namePattern: text("name_pattern"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    unique("wishlist_items_guid_idx").on(table.guid),
    index("wishlist_items_wishlist_id_idx").on(table.wishlistId),
    crudPolicy({
      role: authenticatedRole,
      read: orgRls(table.orgId),
      modify: orgRls(table.orgId),
    }),
  ],
).enableRLS();

// ─── Audit tables (org-scoped, no FK — audit records are permanent) ───────────

export const binSetAudit = pgTable(
  "bin_set_audit",
  {
    id: serial().primaryKey(),
    guid: uuid("guid").defaultRandom(),
    binSetGuid: text("bin_set_guid").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    orgId: text("org_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    unique("bin_set_audit_guid_idx").on(table.guid),
    crudPolicy({
      role: authenticatedRole,
      read: orgRls(table.orgId),
      modify: orgRls(table.orgId),
    }),
  ],
).enableRLS();

export const moduleConfigAudit = pgTable(
  "module_config_audit",
  {
    id: serial().primaryKey(),
    guid: uuid("guid").defaultRandom(),
    moduleNumber: integer("module_number").notNull(),
    orgId: text("org_id").notNull(),
    bottomClosed: integer("bottom_closed").notNull(),
    bottomOpen: integer("bottom_open").notNull(),
    paddleClosed: integer("paddle_closed").notNull(),
    paddleOpen: integer("paddle_open").notNull(),
    pusherLeft: integer("pusher_left").notNull(),
    pusherNeutral: integer("pusher_neutral").notNull(),
    pusherRight: integer("pusher_right").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    unique("module_config_audit_guid_idx").on(table.guid),
    crudPolicy({
      role: authenticatedRole,
      read: orgRls(table.orgId),
      modify: orgRls(table.orgId),
    }),
  ],
).enableRLS();

export const feederConfigAudit = pgTable(
  "feeder_config_audit",
  {
    id: serial().primaryKey(),
    guid: uuid("guid").defaultRandom(),
    orgId: text("org_id").notNull(),
    speed: integer("speed").notNull(),
    duration: integer("duration").notNull(),
    pulseDuration: integer("pulse_duration").notNull(),
    pauseDuration: integer("pause_duration").notNull(),
    settleDuration: integer("settle_duration").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    unique("feeder_config_audit_guid_idx").on(table.guid),
    crudPolicy({
      role: authenticatedRole,
      read: orgRls(table.orgId),
      modify: orgRls(table.orgId),
    }),
  ],
).enableRLS();

export const binSetRelations = relations(binSets, ({ many, one }) => ({
  bins: many(bins),
  game: one(games, {
    fields: [binSets.gameId],
    references: [games.id],
  }),
}));

export const binRelations = relations(bins, ({ one }) => ({
  binSet: one(binSets, {
    fields: [bins.binSet],
    references: [binSets.id],
  }),
}));

export const collectionRelations = relations(collections, ({ many }) => ({
  cards: many(collectionCards),
}));

export const collectionCardsRelations = relations(
  collectionCards,
  ({ one }) => ({
    collection: one(collections, {
      fields: [collectionCards.collectionId],
      references: [collections.id],
    }),
  }),
);

export const bundleConfigsRelations = relations(
  bundleConfigs,
  ({ many }) => ({
    runs: many(bundleRuns),
  }),
);

export const bundleRunsRelations = relations(bundleRuns, ({ one }) => ({
  config: one(bundleConfigs, {
    fields: [bundleRuns.configId],
    references: [bundleConfigs.id],
  }),
}));

export const chaseConfigsRelations = relations(
  chaseConfigs,
  ({ many }) => ({
    runs: many(chaseRuns),
  }),
);

export const chaseRunsRelations = relations(chaseRuns, ({ one }) => ({
  config: one(chaseConfigs, {
    fields: [chaseRuns.configId],
    references: [chaseConfigs.id],
  }),
}));

export const wishlistsRelations = relations(wishlists, ({ many }) => ({
  items: many(wishlistItems),
}));

export const wishlistItemsRelations = relations(wishlistItems, ({ one }) => ({
  wishlist: one(wishlists, {
    fields: [wishlistItems.wishlistId],
    references: [wishlists.id],
  }),
}));
