import { useEffect } from "react";
import { useScannerIsland } from "./use-scanner-island";
import { useScannedCards } from "./use-scanned-cards";

/**
 * Global scanner shortcuts:
 *   Space = pause / resume the run
 *   S     = force a scan now
 *   Z     = undo the last scan record
 *
 * Key handling is skipped while typing in an input/textarea/select or when a
 * modifier key is held, so the shortcuts never fight the user's typing or
 * browser shortcuts (e.g. Ctrl+S).
 */
export function useScanShortcuts(): void {
  const scanner = useScannerIsland();
  const { undoLastScan } = useScannedCards();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      switch (e.key.toLowerCase()) {
        case " ":
          // Space on a focused button would "click" it — prevent that so the
          // shortcut is predictable no matter what was last focused.
          e.preventDefault();
          if (scanner) {
            if (scanner.status === "paused") scanner.handleResume();
            else scanner.handlePause();
          }
          break;
        case "s":
          if (scanner) scanner.handleForceScan();
          break;
        case "z":
          undoLastScan();
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [scanner, undoLastScan]);
}
