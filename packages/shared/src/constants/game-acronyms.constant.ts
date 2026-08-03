/**
 * Short acronyms used in generated SKUs (bundle inventory).
 * Every supported game gets a stable 2-3 letter code; unknown keys fall back
 * to the uppercased key truncated to 3 characters.
 */
export const GAME_ACRONYMS: Record<string, string> = {
  mtg: "MTG",
  yugioh: "YGO",
  pokemon: "PKM",
  digimon: "DIG",
  gundam: "GUN",
};

/** Stable SKU prefix for a game key (e.g. "mtg" → "MTG"). */
export function gameAcronym(gameKey: string | null | undefined): string {
  if (!gameKey) return "TCG";
  return GAME_ACRONYMS[gameKey] ?? gameKey.toUpperCase().slice(0, 3);
}
