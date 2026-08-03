import {
  CLOSE_MATCH_DELTA,
  type SearchCardMatch,
} from "@magic-vault/shared";
import { and, count, sql } from "drizzle-orm";
import { Hono } from "hono";
import { authQuery, db } from "../db";
import { cardImageVectors } from "../db/schema";
import { fetchImageWithCache } from "../lib/art-cache";
import { resolveCardDetails } from "../lib/card-cache";
import { resolveCardSearch } from "../lib/card-search/resolve";
import { recordScan } from "../lib/scan-activity";
import { sendDiscordNotification } from "../lib/discord";
import { vectorizeImageFromBuffer } from "../lib/vectorize";
import { requireAuth, type AppEnv } from "../middleware/auth";

const router = new Hono<AppEnv>();

// GET /cards/library — browse the synced card library with filters
// (game, name search, rarity, set code). Art and rarity come from the stored
// card_data jsonb; image_uris are proxied URLs the client resolves locally.
router.get("/library", requireAuth, async (c) => {
  const gameKey = (c.req.query("gameKey") ?? "").trim() || undefined;
  const search = (c.req.query("search") ?? "").trim();
  const rarity = (c.req.query("rarity") ?? "").trim() || undefined;
  const setCode = (c.req.query("set") ?? "").trim().toUpperCase() || undefined;
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const limit = Math.min(
    100,
    Math.max(1, Number(c.req.query("limit") ?? 60)),
  );
  const offset = (page - 1) * limit;

  const conditions = [];
  if (gameKey) conditions.push(sql`${cardImageVectors.gameKey} = ${gameKey}`);
  if (search)
    conditions.push(
      sql`${cardImageVectors.name} ILIKE ${`%${search}%`}`,
    );
  if (rarity)
    conditions.push(
      sql`${cardImageVectors.cardData}->>'rarity' = ${rarity}`,
    );
  if (setCode)
    conditions.push(sql`${cardImageVectors.setCode} = ${setCode}`);
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  try {
    const [rows, [rowCount]] = await Promise.all([
      db
        .select({
          scryfallId: cardImageVectors.scryfallId,
          gameKey: cardImageVectors.gameKey,
          name: cardImageVectors.name,
          setCode: cardImageVectors.setCode,
          rarity: sql<string>`${cardImageVectors.cardData}->>'rarity'`,
          setName: sql<string>`${cardImageVectors.cardData}->>'set_name'`,
          imageUrl: sql<string>`${cardImageVectors.cardData}->'image_uris'->>'large'`,
          cardData: cardImageVectors.cardData,
        })
        .from(cardImageVectors)
        .where(where)
        .orderBy(cardImageVectors.name)
        .limit(limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(cardImageVectors)
        .where(where),
    ]);

    return c.json({
      success: true,
      data: { cards: rows, total: rowCount.total, page, limit },
    });
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});

// POST / — scan an uploaded card image (embed + vector search)
router.post("/", requireAuth, async (c) => {
  const body = await c.req.parseBody();
  const file = body["image"];
  const collectionGuid =
    typeof body["collectionGuid"] === "string"
      ? body["collectionGuid"]
      : undefined;

  if (!file || typeof file === "string") {
    return c.json({ success: false, message: "No image provided." }, 400);
  }

  if (!file.type.startsWith("image/")) {
    return c.json(
      { success: false, message: "Uploaded file is not an image." },
      400,
    );
  }

  let embedding: number[];
  try {
    embedding = await vectorizeImageFromBuffer(
      Buffer.from(await file.arrayBuffer()),
    );
  } catch (err) {
    console.error(err);
    return c.json(
      { success: false, message: "Failed to vectorize image." },
      500,
    );
  }
  // A real scan happened (image → embedding on the GPU). Background jobs pace
  // against this so they don't starve the scanner / desktop compositor.
  recordScan();

  const embeddingStr = `[${embedding.join(",")}]`;
  const resolved = await resolveCardSearch(
    c.get("jwtClaims"),
    c.req.header("X-Org-Id"),
    collectionGuid,
  );
  if (!resolved) {
    return c.json(
      { success: false, message: "No game configured for this collection." },
      400,
    );
  }
  const { adapter, baseUrl, gameKey } = resolved;

  try {
    const matches = await authQuery(c.get("jwtClaims"), async (tx) => {
      const rows = await tx.execute(sql`
        SELECT
          scryfall_id,
          embedding <=> ${embeddingStr}::vector(768) AS distance
        FROM cards
        WHERE game_key = ${gameKey} AND (embedding <=> ${embeddingStr}::vector(768)) < 0.3
        ORDER BY embedding <=> ${embeddingStr}::vector(768)
        LIMIT 5
      `);

      return rows.rows.map((row) => ({
        id: row.scryfall_id as string,
        scryfallId: row.scryfall_id as string,
        distance: row.distance as number,
      }));
    });

    // Hydrate the close matches with full card data here so the client does
    // one request per scan instead of one request per close match. Repeats of
    // the same card (playsets) are served from the in-memory cache.
    let data: SearchCardMatch[] | null = null;
    if (matches.length > 0) {
      const closeMatches = matches.filter(
        (m) => m.distance - matches[0].distance <= CLOSE_MATCH_DELTA,
      );
      data = await Promise.all(
        closeMatches.map(async (m) => ({
          ...m,
          card: await resolveCardDetails(
            gameKey,
            adapter,
            baseUrl,
            m.scryfallId,
          ),
        })),
      );
    }

    return c.json({
      message: "Successfully searched for card.",
      success: true,
      data,
    });
  } catch (err) {
    console.error(err);
    const orgId = c.req.header("X-Org-Id");
    if (orgId) {
      void sendDiscordNotification(orgId, {
        title: "Magic Vault — Card Search Error",
        description: "A database error occurred while searching for a card.",
        color: 0xed4245,
        timestamp: new Date().toISOString(),
      });
    }
    return c.json({ success: false, message: "Database error." }, 500);
  }
});

// /search must be registered before /search/:id to avoid path conflicts.
// Dispatches to whichever game's card API backs the given collection -
// see lib/card-search/resolve.ts. Every game (including MTG/Scryfall) is
// registered explicitly there; there is no implicit default game.
router.get("/search", requireAuth, async (c) => {
  const query = c.req.query("q") ?? "";
  const resolved = await resolveCardSearch(
    c.get("jwtClaims"),
    c.req.header("X-Org-Id"),
    c.req.query("collectionGuid"),
  );
  if (!resolved) {
    return c.json(
      { success: false, message: "No game configured for this collection." },
      400,
    );
  }
  const result = await resolved.adapter.search(query, resolved.baseUrl);
  return c.json(result);
});

router.get("/search/:id", requireAuth, async (c) => {
  const resolved = await resolveCardSearch(
    c.get("jwtClaims"),
    c.req.header("X-Org-Id"),
    c.req.query("collectionGuid"),
  );
  if (!resolved) {
    return c.json(
      { success: false, message: "No game configured for this collection." },
      400,
    );
  }
  const result = await resolved.adapter.searchById(
    c.req.param("id"),
    resolved.baseUrl,
  );
  return c.json(result);
});

const ALLOWED_IMAGE_HOSTS = new Set([
  "cards.scryfall.io",
  "gundam-gcg.com",
  "www.gundam-gcg.com",
  "assets.tcgdex.net",
  "images.ygoprodeck.com",
  "images.digimoncard.io",
]);

router.get("/image-proxy", async (c) => {
  const url = c.req.query("url");
  if (!url) return c.json({ success: false, message: "Missing url." }, 400);

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return c.json({ success: false, message: "Invalid url." }, 400);
  }
  if (
    parsed.protocol !== "https:" ||
    !ALLOWED_IMAGE_HOSTS.has(parsed.hostname)
  ) {
    return c.json({ success: false, message: "Host not allowed." }, 400);
  }

  try {
    const { buffer, contentType } = await fetchImageWithCache(parsed.toString());
    return c.body(new Uint8Array(buffer), 200, {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400",
      "Cross-Origin-Resource-Policy": "cross-origin",
    });
  } catch {
    return c.json({ success: false, message: "Failed to fetch image." }, 502);
  }
});

export { router as cardRouter };
