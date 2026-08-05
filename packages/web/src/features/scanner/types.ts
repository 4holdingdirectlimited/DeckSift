import type {
  PlayingCard,
  PlayingCardWithDistance,
  ScannedCard,
  ScannerStatus,
} from "@magic-vault/shared";

export type CameraStatus = "idle" | "requesting" | "ready" | "error";

export interface ZoomRange {
  min: number;
  max: number;
  step: number;
}

export interface CameraContextValue {
  stream: MediaStream | null;
  status: CameraStatus;
  errorMessage: string;
  zoom: number;
  zoomRange: ZoomRange | null;
  cameras: MediaDeviceInfo[];
  selectedCameraId: string | null;
  setZoom: (value: number) => void;
  selectCamera: (deviceId: string) => void;
  retryCamera: () => Promise<void>;
  stopCamera: () => void;
}

export interface ScannedCardsContextValue {
  cards: ScannedCard[];
  isLoading: boolean;
  autoFeed: boolean;
  elapsedMs: number;
  isTimerActive: boolean;
  /** Scans completed in the last 60s (rolling window) — live throughput. */
  scanRatePerMin: number;
  /** Timestamp of the most recent completed scan (for "X s ago" display). */
  lastScanAt: number | null;
  setAutoFeed: (enabled: boolean) => void;
  /** Digitize mode: scan + record every card without sorting (routes to catch-all). */
  digitize: boolean;
  setDigitize: (enabled: boolean) => void;
  addCard: (
    card: PlayingCardWithDistance,
    capturedImageUrl?: string,
    alternativeMatches?: PlayingCardWithDistance[],
    /** Heuristic foil estimate — pre-fills the toggle so the operator can correct it. */
    isFoil?: boolean,
  ) => void;
  sendCatchAllBin: () => void;
  registerCardArrivedHook: (fn: () => void) => () => void;
  registerPauseHook: (fn: () => void) => () => void;
  registerResumeHook: (fn: () => void) => () => void;
  /** Physical card count per bin this session (bin number → cards placed). */
  binCounts: Record<number, number>;
  /** Reset a bin's count after the operator physically empties it. */
  emptyBin: (binNumber: number) => void;
  removeCard: (scanId: string) => void;
  removeCards: (scanIds: string[]) => void;
  /** Undo the most recent scan record (physical card must be moved by hand). */
  undoLastScan: () => void;
  correctCard: (scanId: string, card: PlayingCard) => void;
  toggleFoil: (scanId: string, isFoil: boolean) => void;
  /** Per-scan grading for TCGplayer export (e.g. "Near Mint"). */
  setCondition: (scanId: string, condition?: string) => void;
  markDownloaded: (scanIds: string[]) => void;
  clearCards: () => void;
}

export type SerialMessageListener = (message: unknown) => void;

export interface SerialContextValue {
  isConnected: boolean;
  isReady: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  sendBin: (binNumber: number) => Promise<unknown | null>;
  sendTest: () => Promise<boolean>;
  sendCommand: (data: string) => Promise<boolean>;
  sendCommandWithResponse: (
    data: Record<string, unknown>,
    timeoutMs?: number,
    retries?: number,
  ) => Promise<unknown | null>;
  sendFeed: () => Promise<unknown | null>;
  subscribe: (listener: SerialMessageListener) => () => void;
  registerPreTestHook: (fn: () => Promise<void>) => void;
}

export interface ScannerControlsProps {
  status: ScannerStatus;
  duplicateCardName?: string;
  onForceAddDuplicate: () => void;
  onForceScan: () => void;
  onSkipDuplicate: () => void;
  onPause: () => void;
  onResume: () => void;
}

export interface ScannerOverlayProps {
  status: ScannerStatus;
  errorMessage: string;
  isCameraActive: boolean;
  isConnected: boolean;
  isReady: boolean;
  hasCatchAll: boolean;
  onRetryError: () => void;
}

export interface SetStats {
  code: string;
  name: string;
  count: number;
  value: number;
}
