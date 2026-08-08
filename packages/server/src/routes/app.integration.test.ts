// API route integration tests — exercise the real Hono app end to end against
// a scratch PostgreSQL database, so the wire contracts (health, sync sources,
// library search) are regression-safe instead of only unit-tested in isolation.
//
// These run only when TEST_DATABASE_URL is set (CI provides a pgvector
// Postgres service; see .github/workflows/checks.yml). Locally, run:
//
//   node scripts/local-db.mjs start
//   psql -h 127.0.0.1 -p 5433 -U postgres -c "CREATE DATABASE decksift_test"
//   set TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5433/decksift_test
//   pnpm test
//
// The suite creates its own schema from the drizzle migrations and truncates
// the tables it seeds, so it never touches a dev database's data.
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { createApp } from "../app";
import type { db as DbInstance } from "../db";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

// The app's Hono instance (typed by createApp's return) — only the fetch
// surface is exercised, but keeping the real type avoids a loose cast.
type TestApp = ReturnType<typeof createApp>;

// 768-dim zero vector — pgvector requires the exact column dimension.
const ZERO_VECTOR = `[${Array(768).fill("0").join(",")}]`;

// The migrations assume the same DB-side prereqs local-bootstrap.sql sets up
// (pgvector, the `authenticated` role the RLS policies grant to, and the
// auth_is_org_member() helper the policies call).
const BOOTSTRAP_PREREQS = [
  "CREATE EXTENSION IF NOT EXISTS vector",
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
       CREATE ROLE authenticated NOLOGIN;
     END IF;
   END $$;`,
  `CREATE OR REPLACE FUNCTION auth_is_org_member(org_id text)
   RETURNS boolean
   LANGUAGE plpgsql
   STABLE
   SECURITY DEFINER
   SET search_path = public
   AS $$
   BEGIN
     RETURN (current_setting('request.jwt.claims', true)::json ->> 'org_id') = org_id;
   END;
   $$;`,
];

describe.skipIf(!TEST_DATABASE_URL)("API route integration (test DB)", () => {
  let app: TestApp;
  // Pool type is imported dynamically alongside the app to avoid loading the
  // pg module (and building a Pool) before DATABASE_URL is set.
  let pool: Pool;
  let db: typeof DbInstance;
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL!;

    const [{ createApp }, dbModule] = await Promise.all([
      import("../app"),
      import("../db"),
    ]);
    app = createApp();
    db = dbModule.db;
    pool = dbModule.pool;

    for (const statement of BOOTSTRAP_PREREQS) {
      await pool.query(statement);
    }

    await migrate(db, {
      migrationsFolder: fileURLToPath(
        new URL("../../../../drizzle", import.meta.url),
      ),
    });

    // Fresh slate for this run: the seeds below are the only rows the
    // assertions depend on.
    await pool.query("TRUNCATE cards RESTART IDENTITY CASCADE");

    await pool.query(
      `INSERT INTO cards (scryfall_id, game_key, name, set_code, embedding, card_data)
       VALUES ($1, $2, $3, $4, $5::vector, $6::jsonb)`,
      [
        "00000000-0000-0000-0000-000000000001",
        "mtg",
        "Black Lotus",
        "LEA",
        ZERO_VECTOR,
        JSON.stringify({
          rarity: "rare",
          set_name: "Limited Edition Alpha",
          image_uris: { large: "https://example.com/black-lotus.png" },
        }),
      ],
    );
  });

  afterAll(async () => {
    await pool?.end();
    // Don't leak the test connection string into other test files sharing the
    // worker's process env.
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it("GET /api/health reports ok when the database answers", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      status: string;
      uptime: number;
    };
    expect(body.success).toBe(true);
    expect(body.status).toBe("ok");
    expect(typeof body.uptime).toBe("number");
  });

  it("GET /api/admin/sync/sources lists the registered sync games", async () => {
    const res = await app.request("/api/admin/sync/sources");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data: { gameKey: string; label: string }[];
    };
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    const keys = body.data.map((s) => s.gameKey);
    for (const expected of ["mtg", "pokemon", "yugioh"]) {
      expect(keys).toContain(expected);
    }
    // Contract: every entry carries a human label for the sync UI.
    for (const entry of body.data) {
      expect(typeof entry.label).toBe("string");
      expect(entry.label.length).toBeGreaterThan(0);
    }
  });

  it("GET /api/cards/library returns the seeded card and a stable total", async () => {
    const res = await app.request("/api/cards/library");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data: { cards: { name: string; setCode: string }[]; total: number };
    };
    expect(body.success).toBe(true);
    expect(body.data.total).toBe(1);
    expect(body.data.cards[0]?.name).toBe("Black Lotus");
    expect(body.data.cards[0]?.setCode).toBe("LEA");
  });

  it("GET /api/cards/library narrows by name search", async () => {
    const hit = await app.request("/api/cards/library?search=Black");
    expect(hit.status).toBe(200);
    const hitBody = (await hit.json()) as {
      data: { cards: unknown[]; total: number };
    };
    expect(hitBody.data.total).toBe(1);

    const miss = await app.request("/api/cards/library?search=zzzzz");
    expect(miss.status).toBe(200);
    const missBody = (await miss.json()) as {
      data: { cards: unknown[]; total: number };
    };
    expect(missBody.data.total).toBe(0);
    expect(missBody.data.cards).toHaveLength(0);
  });

  it("GET /api/cards/library honors limit + page bounds", async () => {
    const res = await app.request("/api/cards/library?limit=10&page=2");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { limit: number; page: number; cards: unknown[] };
    };
    expect(body.data.limit).toBe(10);
    expect(body.data.page).toBe(2);
    expect(body.data.cards).toHaveLength(0);
  });

  it("returns JSON 404 for unknown routes", async () => {
    const res = await app.request("/api/definitely-not-a-route");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(false);
  });

  it("GET /api/stats aggregates scan telemetry from the seed data", async () => {
    // No collection_cards rows exist (fresh TRUNCATE), so counters read zero —
    // the shape is what's under contract here.
    const res = await app.request("/api/stats");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data: {
        totalScans: number;
        scansToday: number;
        scansLastHour: number;
        cardsPerHourToday: number | null;
        daily: { date: string; count: number }[];
        byGame: { gameKey: string; total: number }[];
        byCollection: { guid: string; name: string; total: number }[];
      };
    };
    expect(body.success).toBe(true);
    expect(body.data.totalScans).toBe(0);
    expect(body.data.scansToday).toBe(0);
    // Zero scans divided by hours-elapsed-today is a truthful 0, not null.
    expect(body.data.cardsPerHourToday).toBe(0);
    // The series always spans exactly 14 days, zero-filled.
    expect(body.data.daily).toHaveLength(14);
    for (const day of body.data.daily) {
      expect(day.count).toBe(0);
      expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(body.data.byGame).toEqual([]);
    expect(body.data.byCollection).toEqual([]);
  });
});
