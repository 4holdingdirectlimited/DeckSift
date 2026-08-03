import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { authQuery, type Transaction } from "../db";
import { wishlistItems, wishlists } from "../db/schema";
import { requireAuth, requireOrg, type AppEnv } from "../middleware/auth";

const router: Hono<AppEnv> = new Hono();

type WishlistRow = typeof wishlists.$inferSelect;
type ItemRow = typeof wishlistItems.$inferSelect;

function toItem(row: ItemRow) {
  return {
    guid: row.guid!,
    cardId: row.cardId,
    namePattern: row.namePattern,
    createdAt: row.createdAt.toISOString(),
  };
}

function toWishlist(row: WishlistRow, items: ItemRow[]) {
  return {
    guid: row.guid!,
    name: row.name,
    gameKey: row.gameKey,
    binNumber: row.binNumber,
    isActive: row.isActive,
    items: items.map(toItem),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function _load(tx: Transaction, orgId: string) {
  const rows = await tx.query.wishlists.findMany({
    where: (t, { eq }) => eq(t.orgId, orgId),
    orderBy: (t, { desc }) => [desc(t.updatedAt)],
  });
  const items = await tx.query.wishlistItems.findMany({
    where: (t, { eq }) => eq(t.orgId, orgId),
  });
  return rows.map((w) =>
    toWishlist(w, items.filter((i) => i.wishlistId === w.id)),
  );
}

// GET /wishlist
router.get("/", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  try {
    const data = await authQuery(c.get("jwtClaims"), (tx) => _load(tx, orgId));
    return c.json({ success: true, data });
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});

// POST /wishlist — create { name, gameKey, binNumber }
router.post("/", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  const body = await c.req
    .json<{ name: string; gameKey: string; binNumber: number }>()
    .catch(() => null);
  if (!body || !body.name?.trim() || !body.gameKey?.trim()) {
    return c.json({ success: false, message: "name and gameKey are required." }, 400);
  }
  try {
    const data = await authQuery(c.get("jwtClaims"), async (tx) => {
      await tx.insert(wishlists).values({
        name: body.name.trim(),
        gameKey: body.gameKey.trim(),
        binNumber: Math.max(1, Math.floor(body.binNumber)),
        isActive: true,
        orgId,
      });
      return _load(tx, orgId);
    });
    return c.json({ success: true, data });
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});

// PUT /wishlist/:guid — rename / bin / active
router.put("/:guid", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  const guid = c.req.param("guid");
  const body = await c.req
    .json<Partial<{ name: string; binNumber: number; isActive: boolean }>>()
    .catch(() => null);
  try {
    const data = await authQuery(c.get("jwtClaims"), async (tx) => {
      const target = await tx.query.wishlists.findFirst({
        where: (t, { eq, and }) => and(eq(t.guid, guid), eq(t.orgId, orgId)),
        columns: { id: true },
      });
      if (!target) return { success: false, message: "Wishlist not found." };
      const updates: Partial<typeof wishlists.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (body?.name?.trim()) updates.name = body.name.trim();
      if (body && Number.isFinite(body.binNumber)) updates.binNumber = Math.floor(body.binNumber!);
      if (body && typeof body.isActive === "boolean") updates.isActive = body.isActive;
      await tx.update(wishlists).set(updates).where(eq(wishlists.id, target.id));
      return { success: true, data: await _load(tx, orgId) };
    });
    return c.json(data);
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});

// DELETE /wishlist/:guid
router.delete("/:guid", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  const guid = c.req.param("guid");
  try {
    const data = await authQuery(c.get("jwtClaims"), async (tx) => {
      const target = await tx.query.wishlists.findFirst({
        where: (t, { eq, and }) => and(eq(t.guid, guid), eq(t.orgId, orgId)),
        columns: { id: true },
      });
      if (!target) return { success: false, message: "Wishlist not found." };
      await tx.delete(wishlists).where(eq(wishlists.id, target.id));
      return { success: true, data: await _load(tx, orgId) };
    });
    return c.json(data);
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});

// POST /wishlist/:guid/items — add { cardId?, namePattern? }
router.post("/:guid/items", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  const guid = c.req.param("guid");
  const body = await c.req
    .json<{ cardId?: string; namePattern?: string }>()
    .catch(() => null);
  if (!body || (!body.cardId?.trim() && !body.namePattern?.trim())) {
    return c.json(
      { success: false, message: "Provide a cardId or a namePattern." },
      400,
    );
  }
  try {
    const data = await authQuery(c.get("jwtClaims"), async (tx) => {
      const target = await tx.query.wishlists.findFirst({
        where: (t, { eq, and }) => and(eq(t.guid, guid), eq(t.orgId, orgId)),
        columns: { id: true },
      });
      if (!target) return { success: false, message: "Wishlist not found." };
      await tx.insert(wishlistItems).values({
        wishlistId: target.id,
        orgId,
        cardId: body.cardId?.trim() || null,
        namePattern: body.namePattern?.trim() || null,
      });
      return { success: true, data: await _load(tx, orgId) };
    });
    return c.json(data);
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});

// DELETE /wishlist/:guid/items/:itemGuid
router.delete("/:guid/items/:itemGuid", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  const guid = c.req.param("guid");
  const itemGuid = c.req.param("itemGuid");
  try {
    const data = await authQuery(c.get("jwtClaims"), async (tx) => {
      const target = await tx.query.wishlists.findFirst({
        where: (t, { eq, and }) => and(eq(t.guid, guid), eq(t.orgId, orgId)),
        columns: { id: true },
      });
      if (!target) return { success: false, message: "Wishlist not found." };
      const item = await tx.query.wishlistItems.findFirst({
        where: (t, { eq, and }) =>
          and(eq(t.guid, itemGuid), eq(t.wishlistId, target.id)),
        columns: { id: true },
      });
      if (!item) return { success: false, message: "Item not found." };
      await tx.delete(wishlistItems).where(eq(wishlistItems.id, item.id));
      return { success: true, data: await _load(tx, orgId) };
    });
    return c.json(data);
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});

export { router as wishlistRouter };
