/**
 * Apply the physical bin capacities (from shared constants) to every bin in
 * the active default bin set. Run once after the machine's bin heights are
 * finalised; the values live in BIN_HEIGHTS_MM in the shared package.
 */
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { bins, binSets } from "../src/db/schema";
import { computeAllBinCapacities } from "@magic-vault/shared";

async function main(): Promise<void> {
  const capacities = computeAllBinCapacities();
  console.log("Computed capacities:", JSON.stringify(capacities));

  const sets = await db
    .select({ id: binSets.id, name: binSets.name, isActive: binSets.isActive })
    .from(binSets);
  if (sets.length === 0) {
    console.log("No bin sets found — run scripts/seed-local.ts first.");
    process.exit(1);
  }

  for (const set of sets) {
    const existing = await db
      .select({ id: bins.id, binNumber: bins.binNumber })
      .from(bins)
      .where(eq(bins.binSet, set.id));
    for (const bin of existing) {
      const capacity = capacities[bin.binNumber] ?? 0;
      await db
        .update(bins)
        .set({ maxCapacity: capacity, updatedAt: new Date() })
        .where(eq(bins.id, bin.id));
    }
    console.log(
      `  set "${set.name}" (${set.isActive ? "active" : "inactive"}): ${existing.length} bins updated`,
    );
  }
  console.log("Done.");
  process.exit(0);
}

void main();
