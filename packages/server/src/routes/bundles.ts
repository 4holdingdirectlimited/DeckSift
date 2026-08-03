import {
  type BundleConfig,
  type BundlePlaceResult,
  type BundleRun,
  type BundleTarget,
  bundleTargetKey,
  type FoilFilter,
} from "@magic-vault/shared";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Transaction } from "../db";
import { authQuery } from "../db";
import { bundleConfigs, bundleRuns } from "../db/schema";
import { requireAuth, requireOrg, type AppEnv } from "../middleware/auth";

const router = new Hono<AppEnv>();

type ConfigRow = typeof bundleConfigs.$inferSelect;
type RunRow = typeof bundleRuns.$inferSelect;

function toConfig(row: ConfigRow): BundleConfig {
  return {
    guid: row.guid!,
    name: row.name,
    targets: row.targets as BundleTarget[],
    rejectBinNumber: row.rejectBinNumber,
    allowDuplicates: row.allowDuplicates,
    holoDetection: row.holoDetection,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function sanitizeFoil(value: unknown): FoilFilter | undefined {
  return value === "foil" || value === "nonfoil" || value === "any"
    ? value
    : undefined;
}

function toRun(row: RunRow, configName: string, configGuid: string): BundleRun {
  return {
    guid: row.guid!,
    configGuid,
    configName,
    status: (row.status as BundleRun["status"]) ?? "active",
    placedCardIds: (row.placedCardIds as string[]) ?? [],
    counts: (row.counts as Record<string, number>) ?? {},
    totalValueUsd: Number(row.totalValueUsd) || 0,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function _loadConfigs(tx: Transaction, orgId: string) {
  const configs = await tx.query.bundleConfigs.findMany({
    where: (t, { eq }) => eq(t.orgId, orgId),
    orderBy: (t, { desc }) => [desc(t.updatedAt)],
  });
  const runs = await tx.query.bundleRuns.findMany({
    where: (t, { eq }) => eq(t.orgId, orgId),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
  return configs.map((cfg) => {
    const run = runs.find(
      (r) => r.configId === cfg.id && r.status === "active",
    );
    return {
      ...toConfig(cfg),
      activeRun: run ? toRun(run, cfg.name, cfg.guid!) : undefined,
    };
  });
}

// The single active run across the org (there is at most one — starting a run
// aborts any other active run). Used for resume on app restart.
async function _loadActiveRun(
  tx: Transaction,
  orgId: string,
): Promise<{ run: BundleRun; configId: number; configGuid: string } | null> {
  const run = await tx.query.bundleRuns.findFirst({
    where: (t, { eq, and }) =>
      and(eq(t.orgId, orgId), eq(t.status, "active")),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
  if (!run) return null;
  const config = await tx.query.bundleConfigs.findFirst({
    where: (t, { eq }) => eq(t.id, run.configId),
  });
  if (!config) return null;
  return {
    run: toRun(run, config.name, config.guid!),
    configId: config.id,
    configGuid: config.guid!,
  };
}

// GET /bundles — all configs, each with its active run (if any)
router.get("/", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  try {
    const data = await authQuery(c.get("jwtClaims"), (tx) =>
      _loadConfigs(tx, orgId),
    );
    return c.json({ success: true, data });
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});

// POST /bundles — create a config and make it the active one
router.post("/", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  const body = await c.req
    .json<{
      name: string;
      targets: BundleTarget[];
      rejectBinNumber: number;
      allowDuplicates?: boolean;
      holoDetection?: boolean;
    }>()
    .catch(() => null);
  if (!body || !body.name?.trim()) {
    return c.json(
      { success: false, message: "name is required." },
      400,
    );
  }
  const targets = Array.isArray(body.targets)
    ? body.targets
        .filter((t) => t.rarity && Number.isFinite(t.count) && Number.isFinite(t.binNumber))
        .map((t) => ({
          rarity: String(t.rarity).toLowerCase(),
          count: Math.max(0, Math.floor(t.count)),
          binNumber: Math.floor(t.binNumber),
          ...(sanitizeFoil(t.foil) ? { foil: sanitizeFoil(t.foil) } : {}),
        }))
    : [];
  const rejectBinNumber = Number.isFinite(body.rejectBinNumber)
    ? Math.floor(body.rejectBinNumber)
    : 7;
  try {
    const data = await authQuery(c.get("jwtClaims"), async (tx) => {
      await tx
        .update(bundleConfigs)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(bundleConfigs.orgId, orgId));
      await tx.insert(bundleConfigs).values({
        name: body.name.trim(),
        targets,
        rejectBinNumber,
        allowDuplicates: body.allowDuplicates ?? false,
        holoDetection: body.holoDetection ?? false,
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

// PUT /bundles/:guid — update name/targets/reject bin
router.put("/:guid", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  const guid = c.req.param("guid");
  const body = await c.req
    .json<{
      name?: string;
      targets?: BundleTarget[];
      rejectBinNumber?: number;
      allowDuplicates?: boolean;
      holoDetection?: boolean;
    }>()
    .catch(() => null);
  try {
    const data = await authQuery(c.get("jwtClaims"), async (tx) => {
      const target = await tx.query.bundleConfigs.findFirst({
        where: (t, { eq, and }) =>
          and(eq(t.guid, guid), eq(t.orgId, orgId)),
        columns: { id: true },
      });
      if (!target) return { success: false, message: "Bundle config not found." };
      const updates: Partial<typeof bundleConfigs.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (body?.name?.trim()) updates.name = body.name.trim();
      if (body && Array.isArray(body.targets)) {
        updates.targets = body.targets
          .filter(
            (t) => t.rarity && Number.isFinite(t.count) && Number.isFinite(t.binNumber),
          )
          .map((t) => ({
            rarity: String(t.rarity).toLowerCase(),
            count: Math.max(0, Math.floor(t.count)),
            binNumber: Math.floor(t.binNumber),
            ...(sanitizeFoil(t.foil) ? { foil: sanitizeFoil(t.foil) } : {}),
          }));
      }
      if (body && Number.isFinite(body.rejectBinNumber)) {
        updates.rejectBinNumber = Math.floor(body.rejectBinNumber!);
      }
      if (body && typeof body.allowDuplicates === "boolean") {
        updates.allowDuplicates = body.allowDuplicates;
      }
      if (body && typeof body.holoDetection === "boolean") {
        updates.holoDetection = body.holoDetection;
      }
      await tx
        .update(bundleConfigs)
        .set(updates)
        .where(eq(bundleConfigs.id, target.id));
      return { success: true, data: (await _loadConfigs(tx, orgId)) };
    });
    return c.json(data);
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});

// DELETE /bundles/:guid — removes the config and its runs (cascade)
router.delete("/:guid", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  const guid = c.req.param("guid");
  try {
    const data = await authQuery(c.get("jwtClaims"), async (tx) => {
      const target = await tx.query.bundleConfigs.findFirst({
        where: (t, { eq, and }) =>
          and(eq(t.guid, guid), eq(t.orgId, orgId)),
        columns: { id: true },
      });
      if (!target) return { success: false, message: "Bundle config not found." };
      await tx.delete(bundleConfigs).where(eq(bundleConfigs.id, target.id));
      return { success: true, data: (await _loadConfigs(tx, orgId)) };
    });
    return c.json(data);
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});

// POST /bundles/:guid/start — begin a fresh run for this config
// (aborts any other active run in the org)
router.post("/:guid/start", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  const guid = c.req.param("guid");
  try {
    const data = await authQuery(c.get("jwtClaims"), async (tx) => {
      const config = await tx.query.bundleConfigs.findFirst({
        where: (t, { eq, and }) =>
          and(eq(t.guid, guid), eq(t.orgId, orgId)),
        columns: { id: true },
      });
      if (!config) return { success: false, message: "Bundle config not found." };
      await tx
        .update(bundleRuns)
        .set({ status: "aborted", updatedAt: new Date() })
        .where(
          and(eq(bundleRuns.orgId, orgId), eq(bundleRuns.status, "active")),
        );
      await tx.insert(bundleRuns).values({
        configId: config.id,
        orgId,
        status: "active",
        placedCardIds: [],
        counts: {},
      });
      return { success: true, data: (await _loadConfigs(tx, orgId)) };
    });
    return c.json(data);
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});

// POST /bundles/:guid/abort — stop the active run for this config
router.post("/:guid/abort", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  const guid = c.req.param("guid");
  try {
    const data = await authQuery(c.get("jwtClaims"), async (tx) => {
      const config = await tx.query.bundleConfigs.findFirst({
        where: (t, { eq, and }) =>
          and(eq(t.guid, guid), eq(t.orgId, orgId)),
        columns: { id: true },
      });
      if (!config) return { success: false, message: "Bundle config not found." };
      await tx
        .update(bundleRuns)
        .set({ status: "aborted", updatedAt: new Date() })
        .where(
          and(
            eq(bundleRuns.orgId, orgId),
            eq(bundleRuns.configId, config.id),
            eq(bundleRuns.status, "active"),
          ),
        );
      return { success: true, data: (await _loadConfigs(tx, orgId)) };
    });
    return c.json(data);
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});

// POST /bundles/:guid/complete — mark the active run complete (manual stop)
router.post("/:guid/complete", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  const guid = c.req.param("guid");
  try {
    const data = await authQuery(c.get("jwtClaims"), async (tx) => {
      const config = await tx.query.bundleConfigs.findFirst({
        where: (t, { eq, and }) =>
          and(eq(t.guid, guid), eq(t.orgId, orgId)),
        columns: { id: true },
      });
      if (!config) return { success: false, message: "Bundle config not found." };
      await tx
        .update(bundleRuns)
        .set({
          status: "completed",
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(bundleRuns.orgId, orgId),
            eq(bundleRuns.configId, config.id),
            eq(bundleRuns.status, "active"),
          ),
        );
      return { success: true, data: (await _loadConfigs(tx, orgId)) };
    });
    return c.json(data);
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});

// GET /bundles/run/active — the active run across the org (resume on restart)
router.get("/run/active", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  try {
    const data = await authQuery(c.get("jwtClaims"), async (tx) => {
      const active = await _loadActiveRun(tx, orgId);
      if (!active) return { success: true, data: null };
      return { success: true, data: active.run };
    });
    return c.json(data);
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});

// POST /bundles/run/:guid/place — offer a card to the active run.
// Server-side source of truth for duplicate + target-full decisions so the
// no-duplicates set and counts survive restarts.
router.post("/run/:guid/place", requireAuth, requireOrg, async (c) => {
  const orgId = c.get("orgId");
  const guid = c.req.param("guid");
  const body = await c.req
    .json<{ cardId?: string; rarity?: string; isFoil?: boolean; priceUsd?: number }>()
    .catch(() => null);
  const cardId = body?.cardId;
  if (!cardId) {
    return c.json({ success: false, message: "cardId is required." }, 400);
  }
  const rarity = (body?.rarity ?? "").toLowerCase();
  const isFoil = body?.isFoil === true;
  try {
    const result = await authQuery(c.get("jwtClaims"), async (tx) => {
      const run = await tx.query.bundleRuns.findFirst({
        where: (t, { eq, and }) =>
          and(eq(t.guid, guid), eq(t.orgId, orgId)),
      });
      if (!run) return { success: false, message: "Run not found." };
      if (run.status !== "active") {
        return { success: false, message: "Run is not active." };
      }
      const config = await tx.query.bundleConfigs.findFirst({
        where: (t, { eq }) => eq(t.id, run.configId),
      });
      if (!config) return { success: false, message: "Config not found." };

      const targets: BundleTarget[] = (config.targets as BundleTarget[]) ?? [];
      const placed: string[] = (run.placedCardIds as string[]) ?? [];
      const counts: Record<string, number> =
        (run.counts as Record<string, number>) ?? {};
      const useHolo = config.holoDetection === true;
      const allowDuplicates = config.allowDuplicates === true;

      // Resolve the target by rarity AND (when holo detection is on) the
      // card's foil status — a config may have two targets for the same
      // rarity split by foil (e.g. "common non-foil" and "common foil").
      const candidates = targets.filter((t) => t.rarity === rarity);
      let target: BundleTarget | undefined;
      let foilMismatch = false;
      if (candidates.length === 0) {
        target = undefined;
      } else if (!useHolo) {
        target = candidates[0];
      } else {
        const cardFoil = isFoil ? "foil" : "nonfoil";
        target = candidates.find(
          (t) => t.foil === "any" || t.foil === cardFoil,
        );
        // A same-rarity target exists, but none accepts this card's foil
        // status — report it as a foil mismatch, not an unknown rarity.
        if (!target) foilMismatch = true;
      }

      let decision: BundlePlaceResult;
      if (!target && !foilMismatch) {
        decision = {
          accepted: false,
          binNumber: config.rejectBinNumber,
          complete: false,
          reason: "unmatched-rarity",
        };
      } else if (foilMismatch) {
        decision = {
          accepted: false,
          binNumber: config.rejectBinNumber,
          complete: false,
          reason: "foil-mismatch",
        };
      } else if (!allowDuplicates && placed.includes(cardId)) {
        decision = {
          accepted: false,
          binNumber: config.rejectBinNumber,
          complete: false,
          reason: "duplicate",
        };
      } else {
        const t = target!; // guaranteed: the earlier branches returned
        const countKey = bundleTargetKey(t);
        if ((counts[countKey] ?? 0) >= t.count) {
          decision = {
            accepted: false,
            binNumber: config.rejectBinNumber,
            complete: false,
            reason: "target-full",
          };
        } else {
          const nextCounts = {
            ...counts,
            [countKey]: (counts[countKey] ?? 0) + 1,
          };
          const nextPlaced = allowDuplicates
            ? placed
            : [...placed, cardId];
          const complete = targets.every(
            (tt) => (nextCounts[bundleTargetKey(tt)] ?? 0) >= tt.count,
          );
          const price = Number(body?.priceUsd);
          const nextValue =
            (Number(run.totalValueUsd) || 0) +
            (Number.isFinite(price) && price > 0 ? price : 0);
          await tx
            .update(bundleRuns)
            .set({
              placedCardIds: nextPlaced,
              counts: nextCounts,
              totalValueUsd: nextValue,
              status: complete ? "completed" : "active",
              completedAt: complete ? new Date() : run.completedAt,
              updatedAt: new Date(),
            })
            .where(eq(bundleRuns.id, run.id));
          decision = {
            accepted: true,
            binNumber: t.binNumber,
            complete,
            reason: "ok",
          };
        }
      }
      return { success: true, data: decision };
    });
    return c.json(result);
  } catch (err) {
    console.error(err);
    return c.json({ success: false, message: "Database error." }, 500);
  }
});

export { router as bundlesRouter };
