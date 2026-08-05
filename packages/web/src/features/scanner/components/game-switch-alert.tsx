import { useCollections } from "@/features/collections/api/use-collections";
import { IconAlertTriangle, IconX } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";

const DISMISSED_KEY = "dismissedGameSwitchAlerts";

function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed) : new Set();
  } catch {
    return new Set();
  }
}

function saveDismissed(dismissed: Set<string>) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissed]));
  } catch {
    // storage unavailable — alert just re-shows next switch
  }
}

export function GameSwitchAlert() {
  const { activeCollection } = useCollections();
  const gameKey = activeCollection?.game?.key;
  const prevGameKeyRef = useRef(gameKey);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(loadDismissed);

  useEffect(() => {
    const prevGameKey = prevGameKeyRef.current;
    if (
      prevGameKey !== undefined &&
      gameKey !== undefined &&
      gameKey !== prevGameKey &&
      !dismissed.has(gameKey)
    ) {
      setVisible(true);
    }
    prevGameKeyRef.current = gameKey;
  }, [gameKey, dismissed]);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    if (!gameKey) return;
    const next = new Set(dismissed);
    next.add(gameKey);
    setDismissed(next);
    saveDismissed(next);
  };

  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
      <IconAlertTriangle
        size={14}
        className="mt-0.5 shrink-0 text-amber-500"
      />
      <p className="flex-1 text-[11px]/relaxed text-amber-600 dark:text-amber-400">
        When switching game types, you may have to re-adjust the feeder
        module tube wall.
      </p>
      <button
        type="button"
        onClick={dismiss}
        title="Don't remind me for this game"
        className="shrink-0 text-amber-600/60 hover:text-amber-600 dark:text-amber-400/60 dark:hover:text-amber-400"
      >
        <IconX size={14} />
      </button>
    </div>
  );
}
