import type { ScannedCard } from "@magic-vault/shared";
import { toast } from "sonner";

/**
 * Per-set completeness announcements. After a scan lands, we count how many
 * unique cards the session owns from the scanned card's set and compare it
 * with the set's total size in the synced library (`/api/cards/library`).
 *
 * Toasts are only fired on milestones (first card of a set, every 5th card,
 * or set completion) so a fast run doesn't spam the screen.
 */

// setCode -> promise of the set's total card count in the library.
const setTotalCache = new Map<string, Promise<number>>();
// setCode -> last announced owned count (only announce when a milestone is hit).
const lastAnnounced = new Map<string, number>();

function fetchSetTotal(gameKey: string, setCode: string): Promise<number> {
  const key = `${gameKey}:${setCode}`;
  let pending = setTotalCache.get(key);
  if (!pending) {
    pending = fetch(
      `/api/cards/library?gameKey=${encodeURIComponent(gameKey)}&set=${encodeURIComponent(setCode)}&limit=1`,
    )
      .then((r) =>
        r.ok ? (r.json() as Promise<{ data?: { total?: number } }>) : null,
      )
      .then((j) => j?.data?.total ?? 0)
      .catch(() => 0);
    setTotalCache.set(key, pending);
  }
  return pending;
}

export async function announceSetProgress(
  cards: ScannedCard[],
  gameKey: string | undefined,
): Promise<void> {
  const newest = cards[0];
  if (!newest || !gameKey) return;
  const card = newest.card;
  const setCode = card.set;
  if (!setCode) return;

  // Unique cards owned from this set (by card id — the no-duplicates unit).
  const ownedIds = new Set<string>();
  for (const scan of cards) {
    if (scan.card.set === setCode) ownedIds.add(scan.card.id);
  }
  const owned = ownedIds.size;
  if (owned === (lastAnnounced.get(setCode) ?? 0)) return;

  const total = await fetchSetTotal(gameKey, setCode);
  if (total === 0) return; // set not in the library — nothing to compare against

  const isMilestone = owned === 1 || owned % 5 === 0 || owned >= total;
  if (!isMilestone) return;

  lastAnnounced.set(setCode, owned);
  const pct = Math.round((owned / total) * 100);
  const complete = owned >= total;
  toast(
    complete
      ? `Set complete! ${setCode.toUpperCase()} ${owned}/${total}`
      : `Set progress: ${owned}/${total}`,
    {
      description: `${card.set_name} · ${pct}% owned${complete ? " — every card in the set is accounted for" : ""}`,
      duration: 3000,
    },
  );
}
