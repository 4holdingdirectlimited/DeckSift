import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { sql } from "drizzle-orm";
import type { AppEnv } from "./middleware/auth";
import { logger } from "./lib/logger";
import { adminRouter } from "./routes/admin";
import { sortBinsRouter } from "./routes/bins";
import { bundlesRouter } from "./routes/bundles";
import { cardRouter } from "./routes/card";
import { chaseRouter } from "./routes/chase";
import { collectionsRouter } from "./routes/collections";
import { feederRouter } from "./routes/feeder";
import { gamesRouter } from "./routes/games";
import { moduleConfigsRouter } from "./routes/module-configs";
import { notificationsRouter } from "./routes/notifications";
import { orgSettingsRouter } from "./routes/org-settings";
import { wishlistRouter } from "./routes/wishlist";
import { authQuery, pool } from "./db";

// ─── Config ──────────────────────────────────────────────────────────────────
// Fail fast with a clear message instead of crashing later on the first query.
if (!process.env.DATABASE_URL) {
  logger.error(
    "[server] FATAL: DATABASE_URL is not set. Copy .env.example to .env and fill it in.",
  );
  process.exit(1);
}

const app = new Hono<AppEnv>();
const PORT = parseInt(process.env.PORT ?? "3001", 10);

// WEB_URL may be a comma-separated list (e.g. localhost + decksift.local) —
// each is an allowed CORS origin. With the dev proxy the web app is
// same-origin anyway; this only matters for direct (non-proxied) API calls.
const webOrigins = (process.env.WEB_URL ?? "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: webOrigins,
    allowMethods: ["GET", "POST", "PUT", "DELETE"],
    allowHeaders: ["Content-Type", "Authorization", "X-Org-Id"],
  }),
);

// Routers are mounted under /api to match the web client's API_BASE paths
// (packages/web/src/lib/api/client.ts calls "/api/..."). The dev Vite proxy
// forwards /api/* to this server without rewriting, so the same prefix works
// in dev and in production.
app.route("/api/cards", cardRouter);
app.route("/api/bins", sortBinsRouter);
app.route("/api/bundles", bundlesRouter);
app.route("/api/chase", chaseRouter);
app.route("/api/collections", collectionsRouter);
app.route("/api/modules", moduleConfigsRouter);
app.route("/api/feeder", feederRouter);
app.route("/api/games", gamesRouter);
app.route("/api/notifications", notificationsRouter);
app.route("/api/org-settings", orgSettingsRouter);
app.route("/api/wishlist", wishlistRouter);
app.route("/api/admin", adminRouter);

// GET /api/health — liveness + database reachability. The web client / ops
// scripts can check this before/after restarts.
app.get("/api/health", async (c) => {
  try {
    await authQuery(
      JSON.stringify({ sub: "local-user", role: "authenticated" }),
      async (tx) => {
        await tx.execute(sql`SELECT 1`);
      },
    );
    return c.json({
      success: true,
      status: "ok",
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error("[server] Health check failed", err);
    return c.json({ success: false, status: "error" }, 503);
  }
});

// JSON 404 + 500 for every route — the browser client always expects JSON.
app.notFound((c) => c.json({ success: false, message: "Not found." }, 404));
app.onError((err, c) => {
  logger.error(
    `[server] Unhandled error on ${c.req.method} ${c.req.path}`,
    err,
  );
  return c.json({ success: false, message: "Internal server error." }, 500);
});

// ─── Lifeline ────────────────────────────────────────────────────────────────
// Graceful shutdown: stop accepting connections, drain, close the DB pool.
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`[server] ${signal} received — shutting down...`);
  try {
    await pool.end();
  } catch (err) {
    logger.error("[server] Error closing DB pool", err);
  }
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

// Fail fast on uncaught errors so a supervisor/operator notices; log first so
// the file log has the details.
process.on("uncaughtException", (err) => {
  logger.error("[server] Uncaught exception", err);
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  logger.error("[server] Unhandled rejection", reason);
  process.exit(1);
});

serve({ fetch: app.fetch, port: PORT, hostname: "0.0.0.0" }, () => {
  logger.info(`[server] Running on port:${PORT}`);
});
