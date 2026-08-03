import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppEnv } from "./middleware/auth";
import { adminRouter } from "./routes/admin";
import { sortBinsRouter } from "./routes/bins";
import { cardRouter } from "./routes/card";
import { collectionsRouter } from "./routes/collections";
import { feederRouter } from "./routes/feeder";
import { gamesRouter } from "./routes/games";
import { moduleConfigsRouter } from "./routes/module-configs";
import { notificationsRouter } from "./routes/notifications";
import { orgSettingsRouter } from "./routes/org-settings";

const app = new Hono<AppEnv>();
const PORT = parseInt(process.env.PORT ?? "3001");

app.use(
  cors({
    origin: process.env.WEB_URL ?? "http://localhost:5173",
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
app.route("/api/collections", collectionsRouter);
app.route("/api/modules", moduleConfigsRouter);
app.route("/api/feeder", feederRouter);
app.route("/api/games", gamesRouter);
app.route("/api/notifications", notificationsRouter);
app.route("/api/org-settings", orgSettingsRouter);
app.route("/api/admin", adminRouter);

serve({ fetch: app.fetch, port: PORT, hostname: "0.0.0.0" }, () => {
  console.log(`[server] Running on port:${PORT}`);
});
