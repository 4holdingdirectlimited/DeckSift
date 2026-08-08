import { count, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db";
import { collectionCards, collections, games } from "../db/schema";
import { requireAuth, type AppEnv } from "../middleware/auth";

const router = new Hono<AppEnv>();

// GET /api/stats — shop-facing reliability telemetry. Everything is derived
// from collection_cards.scanned_at, so it works with zero extra hardware or
// instrumentation: total scans, today/last-hour counts, throughput per hour,
// a 14-day daily series (zero-filled for gaps), per-game totals and the top
// collections. Date buckets use the DB session timezone (UTC by default) —
// the same wall clock the app writes when it stores scannedAt.
router.get("/", requireAuth, async (c) => {
  try {
    const [
      totalRow,
      todayRow,
      hourRow,
      dailyRows,
      gameRows,
      collectionRows,
    ] = await Promise.all([
      db.select({ total: count() }).from(collectionCards),
      db.execute(sql`
        SELECT count(*)::int AS total,
               ROUND((EXTRACT(EPOCH FROM (now() - date_trunc('day', now()))) / 3600)::numeric, 1)::float AS hours_elapsed
        FROM collection_cards
        WHERE scanned_at::date = CURRENT_DATE
      `),
      db
        .select({ total: count() })
        .from(collectionCards)
        .where(sql`${collectionCards.scannedAt} >= now() - interval '1 hour'`),
      db.execute(sql`
        SELECT to_char(day, 'YYYY-MM-DD') AS date, COALESCE(s.count, 0)::int AS count
        FROM generate_series(CURRENT_DATE - 13, CURRENT_DATE, interval '1 day') AS day
        LEFT JOIN (
          SELECT scanned_at::date AS scanned_day, count(*) AS count
          FROM collection_cards
          WHERE scanned_at >= (CURRENT_DATE - 13)::timestamp
          GROUP BY 1
        ) s ON s.scanned_day = day
        ORDER BY day
      `),
      db
        .select({
          gameKey: sql<string>`COALESCE(${games.key}, 'unknown')`,
          total: count(collectionCards.id),
        })
        .from(collectionCards)
        .leftJoin(collections, eq(collectionCards.collectionId, collections.id))
        .leftJoin(games, eq(collections.gameId, games.id))
        .groupBy(games.key)
        .orderBy(desc(count(collectionCards.id))),
      db
        .select({
          guid: collections.guid,
          name: collections.name,
          total: count(collectionCards.id),
        })
        .from(collectionCards)
        .innerJoin(collections, eq(collectionCards.collectionId, collections.id))
        .groupBy(collections.guid, collections.name)
        .orderBy(desc(count(collectionCards.id)))
        .limit(10),
    ]);

    const totalScans = totalRow[0]?.total ?? 0;
    const scansToday = (todayRow.rows[0] as { total?: number } | undefined)?.total ?? 0;
    const scansLastHour = hourRow[0]?.total ?? 0;

    // Throughput since local midnight (skipped while nothing has elapsed).
    const hoursElapsedToday =
      (todayRow.rows[0] as { hours_elapsed?: number } | undefined)
        ?.hours_elapsed ?? 0;
    const cardsPerHourToday =
      hoursElapsedToday > 0
        ? Math.round((scansToday / hoursElapsedToday) * 10) / 10
        : null;

    return c.json({
      success: true,
      data: {
        totalScans,
        scansToday,
        scansLastHour,
        cardsPerHourToday,
        daily: (dailyRows.rows as { date: string; count: number }[]).map(
          (r) => ({ date: r.date, count: r.count }),
        ),
        byGame: gameRows,
        byCollection: collectionRows,
      },
    });
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});

export { router as statsRouter };
