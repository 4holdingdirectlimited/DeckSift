import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { authQuery, type Transaction } from "../db";
import { chaseConfigs, chaseRuns } from "../db/schema";
import { requireAuth, requireOrg, type AppEnv } from "../middleware/auth";

const router: Hono<AppEnv> = new Hono();

type ConfigRow = typeof chaseConfigs.$inferSelect;
type RunRow = typeof chaseRuns.$inferSelect;

function toConfig(row: ConfigRow) {
  return {
    guid: row.guid!,
    name: row.name,
    gameKey: row.gameKey,
    setCode: row.setCode,
    binNumber: row.binNumber,
    rejectBinNumber: row.rejectBinNumber,
    collectionGuid: row.collectionGuid,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toRun(row: RunRow, config: ConfigRow) {
  return {
    guid: row.guid!,
    configGuid: config.guid!,
    configName: config.name,
    status: row.status,
    foundCardIds: (row.foundCardIds as string[]) ?? [],
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function _loadConfigs(tx: Transaction, orgId: string) {
  const configs = await tx.query.chaseConfigs.findMany({
    where: (t, { eq }) => eq(t.orgId, orgId),
    orderBy: (t, { desc }) => [desc(t.updatedAt)],
  });
  const runs = await tx.query.chaseRuns.findMany({
    where: (t, { eq }) => eq(t.orgId, orgId),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
  return configs.map((cfg) => ({
    ...toConfig(cfg),
    activeRun: runs.find((r) => r.configId === cfg.id && r.status === "active")
      ? toRun(runs.find((r) => r.configId === cfg.id && r.status === "active")!, cfg)
      : undefined,
  }));
}

async function _loadActiveRun(tx: Transaction, orgId: string) {
  const run = await tx.query.chaseRuns.findFirst({
    where: (t, { eq, and }) => and(eq(t.orgId, orgId), eq(t.status, "active")),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
  if (!run) return null;
  const config = await tx.query.chaseConfigs.findFirst({
    where: (t, { eq }) => eq(t.id, run.configId),
  });
  if (!config) return null;
  return { run: toRun(run, config), config };
}

// GET /chase
router.get("/", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  try {
    const data = await authQuery(c.get("jwtClaims"), (tx) => _loadConfigs(tx, orgId));
    return c.json({ success: true, data });
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});

// GET /chase/run/active — resume lookup
router.get("/run/active", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  try {
    const data = await authQuery(c.get("jwtClaims"), async (tx) => {
      const active = await _loadActiveRun(tx, orgId);
      return active ? active.run : null;
    });
    return c.json({ success: true, data });
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});

// POST /chase — create a config and make it the active one
router.post("/", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  const body = await c.req
    .json<{
      name: string;
      gameKey: string;
      setCode: string;
      binNumber: number;
      rejectBinNumber: number;
      collectionGuid?: string;
    }>()
    .catch(() => null);
  if (
    !body ||
    !body.name?.trim() ||
    !body.gameKey?.trim() ||
    !body.setCode?.trim()
  ) {
    return c.json(
      { success: false, message: "name, gameKey, and setCode are required." },
      400,
    );
  }
  try {
    const data = await authQuery(c.get("jwtClaims"), async (tx) => {
      await tx
        .update(chaseConfigs)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(chaseConfigs.orgId, orgId));
      await tx.insert(chaseConfigs).values({
        name: body.name.trim(),
        gameKey: body.gameKey.trim(),
        setCode: body.setCode.trim().toUpperCase(),
        binNumber: Math.max(1, Math.floor(body.binNumber)),
        rejectBinNumber: Math.max(1, Math.floor(body.rejectBinNumber)),
        collectionGuid: body.collectionGuid?.trim() || null,
        isActive: true,
        orgId,
      });
      return _loadConfigs(tx, orgId);
    });
    return c.json({ success: true, data });
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});

// PUT /chase/:guid
router.put("/:guid", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  const guid = c.req.param("guid");
  const body = await c.req
    .json<Partial<{ name: string; setCode: string; binNumber: number; rejectBinNumber: number; collectionGuid?: string }>>()
    .catch(() => null);
  try {
    const data = await authQuery(c.get("jwtClaims"), async (tx) => {
      const target = await tx.query.chaseConfigs.findFirst({
        where: (t, { eq, and }) => and(eq(t.guid, guid), eq(t.orgId, orgId)),
        columns: { id: true },
      });
      if (!target) return { success: false, message: "Chase config not found." };
      const updates: Partial<typeof chaseConfigs.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (body?.name?.trim()) updates.name = body.name.trim();
      if (body?.setCode?.trim()) updates.setCode = body.setCode.trim().toUpperCase();
      if (body && Number.isFinite(body.binNumber)) updates.binNumber = Math.floor(body.binNumber!);
      if (body && Number.isFinite(body.rejectBinNumber))
        updates.rejectBinNumber = Math.floor(body.rejectBinNumber!);
      if (body && "collectionGuid" in body) updates.collectionGuid = body.collectionGuid?.trim() || null;
      await tx.update(chaseConfigs).set(updates).where(eq(chaseConfigs.id, target.id));
      return { success: true, data: await _loadConfigs(tx, orgId) };
    });
    return c.json(data);
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});

// DELETE /chase/:guid
router.delete("/:guid", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  const guid = c.req.param("guid");
  try {
    const data = await authQuery(c.get("jwtClaims"), async (tx) => {
      const target = await tx.query.chaseConfigs.findFirst({
        where: (t, { eq, and }) => and(eq(t.guid, guid), eq(t.orgId, orgId)),
        columns: { id: true },
      });
      if (!target) return { success: false, message: "Chase config not found." };
      await tx.delete(chaseConfigs).where(eq(chaseConfigs.id, target.id));
      return { success: true, data: await _loadConfigs(tx, orgId) };
    });
    return c.json(data);
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});

async function startRunFor(tx: Transaction, orgId: string, configId: number) {
  await tx
    .update(chaseRuns)
    .set({ status: "aborted", updatedAt: new Date() })
    .where(and(eq(chaseRuns.orgId, orgId), eq(chaseRuns.status, "active")));
  await tx.insert(chaseRuns).values({
    configId,
    orgId,
    status: "active",
    foundCardIds: [],
  });
}

// POST /chase/:guid/start
router.post("/:guid/start", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  const guid = c.req.param("guid");
  try {
    const data = await authQuery(c.get("jwtClaims"), async (tx) => {
      const config = await tx.query.chaseConfigs.findFirst({
        where: (t, { eq, and }) => and(eq(t.guid, guid), eq(t.orgId, orgId)),
        columns: { id: true },
      });
      if (!config) return { success: false, message: "Chase config not found." };
      await startRunFor(tx, orgId, config.id);
      return { success: true, data: await _loadConfigs(tx, orgId) };
    });
    return c.json(data);
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});

// POST /chase/:guid/abort
router.post("/:guid/abort", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  const guid = c.req.param("guid");
  try {
    const data = await authQuery(c.get("jwtClaims"), async (tx) => {
      const config = await tx.query.chaseConfigs.findFirst({
        where: (t, { eq, and }) => and(eq(t.guid, guid), eq(t.orgId, orgId)),
        columns: { id: true },
      });
      if (!config) return { success: false, message: "Chase config not found." };
      await tx
        .update(chaseRuns)
        .set({ status: "aborted", updatedAt: new Date() })
        .where(
          and(
            eq(chaseRuns.orgId, orgId),
            eq(chaseRuns.configId, config.id),
            eq(chaseRuns.status, "active"),
          ),
        );
      return { success: true, data: await _loadConfigs(tx, orgId) };
    });
    return c.json(data);
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});

// POST /chase/run/:guid/place — offer a card to the active chase.
// The card belongs to the chased set AND isn't owned/found already → chase bin.
router.post("/run/:guid/place", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  const guid = c.req.param("guid");
  const body = await c.req
    .json<{ cardId?: string; setCode?: string }>()
    .catch(() => null);
  const cardId = body?.cardId;
  if (!cardId) {
    return c.json({ success: false, message: "cardId is required." }, 400);
  }
  const setCode = (body?.setCode ?? "").trim().toUpperCase();
  try {
    const result = await authQuery(c.get("jwtClaims"), async (tx) => {
      const run = await tx.query.chaseRuns.findFirst({
        where: (t, { eq, and }) => and(eq(t.guid, guid), eq(t.orgId, orgId)),
      });
      if (!run) return { success: false, message: "Run not found." };
      if (run.status !== "active") return { success: false, message: "Run is not active." };
      const config = await tx.query.chaseConfigs.findFirst({
        where: (t, { eq }) => eq(t.id, run.configId),
      });
      if (!config) return { success: false, message: "Config not found." };

      const found: string[] = (run.foundCardIds as string[]) ?? [];

      // Not part of the chased set → reject.
      if (setCode && config.setCode !== setCode) {
        return {
          success: true,
          data: {
            accepted: false,
            binNumber: config.rejectBinNumber,
            reason: "not-in-set",
          },
        };
      }
      // Already found this run → reject (no duplicates in a set chase).
      if (found.includes(cardId)) {
        return {
          success: true,
          data: {
            accepted: false,
            binNumber: config.rejectBinNumber,
            reason: "duplicate",
          },
        };
      }
      // Already owned by the collection → reject.
      if (config.collectionGuid) {
        const collection = await tx.query.collections.findFirst({
          where: (t, { eq }) => eq(t.guid, config.collectionGuid!),
          columns: { id: true },
        });
        if (collection) {
          const owned = await tx.query.collectionCards.findFirst({
            where: (t, { eq, and }) =>
              and(
                eq(t.collectionId, collection.id),
                eq(t.scryfallId, cardId),
              ),
            columns: { id: true },
          });
          if (owned) {
            return {
              success: true,
              data: {
                accepted: false,
                binNumber: config.rejectBinNumber,
                reason: "owned",
              },
            };
          }
        }
      }

      const nextFound = [...found, cardId];
      await tx
        .update(chaseRuns)
        .set({ foundCardIds: nextFound, updatedAt: new Date() })
        .where(eq(chaseRuns.id, run.id));
      return {
        success: true,
        data: {
          accepted: true,
          binNumber: config.binNumber,
          reason: "ok",
        },
      };
    });
    return c.json(result);
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});

export { router as chaseRouter };
