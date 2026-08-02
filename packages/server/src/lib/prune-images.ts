import { lt } from "drizzle-orm";
import { db } from "../db";
import { collectionCards } from "../db/schema";

// Maintenance script: clears stored scan photos (base64 JPEGs in
// collection_cards.captured_image_data_url) older than PRUNE_OLDER_THAN_DAYS.
// The card's official art is what Discord embeds use, so these captures only
// serve the in-app session view — old ones can be dropped to stop DB bloat.
//
// Run: pnpm --filter @magic-vault/server db:prune-images
const PRUNE_OLDER_THAN_DAYS = 30;

async function main() {
  const cutoff = new Date(Date.now() - PRUNE_OLDER_THAN_DAYS * 86_400_000);
  const result = await db
    .update(collectionCards)
    .set({ capturedImageDataUrl: null })
    .where(lt(collectionCards.scannedAt, cutoff));

  console.log(
    `Pruned ${result.rowCount ?? 0} scan image(s) older than ${PRUNE_OLDER_THAN_DAYS} days.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Prune failed:", err);
    process.exit(1);
  });
