/**
 * Bundle mode — recipe-based sorting.
 *
 * A bundle config is a recipe: a list of targets, one per rarity, each with a
 * target count and the physical bin those cards route to. Cards that are
 * already in the current run (no duplicates within a bundle), whose rarity has
 * no target, whose target bin is full, or whose foil status doesn't match the
 * target's foil filter, route to the reject bin.
 *
 * A bundle run is the live state of one assembly: which card ids have been
 * placed (dup check) and how many of each target have been accepted. Runs are
 * persisted so a restart resumes where the run left off.
 */

/** Whether a target counts foil cards, non-foil cards, or doesn't care. */
export type FoilFilter = "any" | "foil" | "nonfoil";

/** One rarity slot in a bundle recipe. */
export interface BundleTarget {
  /** Card rarity value (lowercased, matches card.rarity from the adapter). */
  rarity: string;
  /** How many cards of this rarity go into the bundle. */
  count: number;
  /** Physical bin number these cards route to. */
  binNumber: number;
  /**
   * Foil filter for this target. Only consulted when the bundle's
   * holoDetection is enabled; "any" (default) ignores foil status entirely.
   */
  foil?: FoilFilter;
}

export interface BundleConfig {
  guid: string;
  name: string;
  targets: BundleTarget[];
  /** Where duplicates / unmatched rarities / full targets route. */
  rejectBinNumber: number;
  /** When true, the same card id may be placed more than once in a run. */
  allowDuplicates: boolean;
  /**
   * When false, the scan's foil signal is ignored — a holo common and a plain
   * common are both just "common". When true, target foil filters apply.
   */
  holoDetection: boolean;
  /** Active configs are offered for runs in the UI. */
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type BundleRunStatus = "active" | "completed" | "aborted";

export interface BundleRun {
  guid: string;
  configGuid: string;
  configName: string;
  status: BundleRunStatus;
  /** Card ids already placed in this run — the no-duplicates set. */
  placedCardIds: string[];
  /** rarity → accepted count. */
  counts: Record<string, number>;
  createdAt: string;
  completedAt?: string | null;
  updatedAt: string;
}

/** Server verdict for a card offered to the current run. */
export interface BundlePlaceResult {
  accepted: boolean;
  binNumber: number;
  /** True when every target count has been met. */
  complete: boolean;
  /** Duplicate | target-full | unmatched-rarity | foil-mismatch | ok */
  reason:
    | "ok"
    | "duplicate"
    | "target-full"
    | "unmatched-rarity"
    | "foil-mismatch";
}

/** Stable key for a target's running count (rarity + foil filter). */
export function bundleTargetKey(target: Pick<BundleTarget, "rarity" | "foil">): string {
  return target.foil && target.foil !== "any"
    ? `${target.rarity}:${target.foil}`
    : target.rarity;
}
