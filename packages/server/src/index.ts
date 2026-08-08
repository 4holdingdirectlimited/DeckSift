import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { pool } from "./db";
import { logger } from "./lib/logger";

const app = createApp();
const PORT = parseInt(process.env.PORT ?? "3001", 10);

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
