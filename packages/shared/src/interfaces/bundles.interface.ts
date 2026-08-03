/**
 * Bundle mode — recipe-based sorting.
 *
 * A bundle config is a recipe: a list of targets, one per rarity, each with a
 * target count and the physical bin those cards route to. Cards that are
 * already in the current run (no duplicates within a bundle), whose rarity has
 * no target, or whose target bin is full, route to the reject bin.
 *
 * A bundle run is the live state of one assembly: which card ids have been
 * placed (dup check) and how many of each rarity have been accepted. Runs are
 * persisted so a restart resumes where the run left off.
 */

/** One rarity slot in a bundle recipe. */
export interface BundleTarget {
  /** Card rarity value (lowercased, matches card.rarity from the adapter). */
  rarity: string;
  /** How many cards of this rarity go into the bundle. */
  count: number;
  /** Physical bin number these cards route to. */
  binNumber: number;
}

export interface BundleConfig {
  guid: string;
  name: string;
  targets: BundleTarget[];
  /** Where duplicates / unmatched rarities / full targets route. */
  rejectBinNumber: number;
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
  /** Duplicate | target-full | unmatched-rarity | ok */
  reason: "ok" | "duplicate" | "target-full" | "unmatched-rarity";
}
