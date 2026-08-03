// Tracks whether the scanner is actively in use so background jobs (the card
// sync) can back off instead of saturating the GPU while a scan is running.
// On Windows the DirectML embed and the desktop compositor (DWM) share the
// GPU, so a full-tilt sync makes the whole machine feel sluggish — pacing
// against real scan activity fixes that without slowing the sync when idle.

let lastScanAt = 0;

/** Call once per successfully vectorized scan (the heavy GPU moment). */
export function recordScan(): void {
  lastScanAt = Date.now();
}

/** True when a scan happened within the given window (ms). */
export function recentScanWithin(windowMs: number): boolean {
  return Date.now() - lastScanAt <= windowMs;
}
