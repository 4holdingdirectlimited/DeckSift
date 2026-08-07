export const QUERY_MIN_LENGTH = 2;

// Maximum distance difference from the best match for a card to count as a
// close match (and therefore be hydrated with full card data server-side).
export const CLOSE_MATCH_DELTA = 0.05;

// ─── Error / misprint detection band ───────────────────────────────────────────
// Cosine distance between the scan's embedding and the catalog card's: a clean
// card matches near 0 (≥ ~93% confidence). A misprint or error card (shifted
// colors, extra features, wrong-frame art) is still the SAME card — the match
// wins — but its art differs enough to land in this band: accepted as a match,
// yet noticeably off. Cards above the band are low-confidence matches handled
// by the review / auto-reject flow instead. Tune these after real-world scans.
export const MISPRINT_MIN_DISTANCE = 0.07; // below this = clean match
export const MISPRINT_MAX_DISTANCE = 0.2; // above this = low confidence

/** Match confidence percentage (100 − distance×100), clamped to 0–100. */
export function matchConfidence(
  distance: number | null | undefined,
): number | null {
  if (distance == null) return null;
  return Math.max(0, Math.min(100, 100 - distance * 100));
}

/** True when the match is plausible but the art differs noticeably from the
 *  catalog — the signature of a misprint/error card worth eyeballing before
 *  pricing. */
export function isPossibleMisprint(
  distance: number | null | undefined,
): boolean {
  if (distance == null) return false;
  return distance >= MISPRINT_MIN_DISTANCE && distance <= MISPRINT_MAX_DISTANCE;
}
