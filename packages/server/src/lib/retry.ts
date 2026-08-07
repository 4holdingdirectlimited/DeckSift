// Retry with exponential backoff for fragile external HTTP calls (Scryfall,
// image CDNs, TCG data sources). A transient 5xx or network blip is retried
// a few times before we surface the failure; definitive 4xx responses (404
// "no card", 400 "bad query") pass straight through — retrying them would
// only add latency.
//
// Budget: the total wall-clock time of a call is always bounded.
//   - If the caller passes `init.signal`, that signal is the whole-call
//     budget. It applies to the fetch itself AND to the backoff sleeps
//     between attempts (the sleep races the signal, so a caller's
//     `AbortSignal.timeout(...)` is never exceeded by a long `Retry-After`
//     or a backoff chain). An abort is never retried.
//   - If no signal is passed, an internal per-call timeout (`timeoutMs`,
//     default 15s) is applied to the fetch, so a hung upstream fails with a
//     TimeoutError after one bounded attempt instead of stalling forever.
//     Transient 5xx / network errors are still retried within that budget.
//
// GET-only in practice (no request body re-send handling).

export interface FetchRetryOptions {
  /** Total attempts including the first. Default 3. */
  retries?: number;
  /** Base backoff in ms (doubles per attempt, plus jitter). Default 250. */
  baseDelayMs?: number;
  /**
   * Whole-call timeout applied when the caller passes no `init.signal`.
   * Callers that pass their own signal keep full control of the budget.
   * Default 15s; bulk catalog downloads should raise this at the call site.
   */
  timeoutMs?: number;
}

/** Statuses worth retrying: throttling + server-side failures. */
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

/** Largest `Retry-After` we honor (ms) — beyond this, fall back to backoff. */
const MAX_RETRY_AFTER_MS = 30_000;

export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS.has(status);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sleep that resolves early (rejecting with the signal's reason) when
 * `signal` fires, so a caller's whole-call budget covers backoff sleeps as
 * well as the fetches themselves.
 */
function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) return sleep(ms);
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

/** Small jitter so concurrent failures don't retry in lockstep. */
function jitter(): number {
  return Math.floor(Math.random() * 50);
}

/**
 * Honors `Retry-After` (seconds) for 429 responses; null when absent,
 * unparsable (e.g. an HTTP-date), or beyond the cap — backoff is used then.
 */
function retryAfterDelayMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

function isTimeoutError(err: unknown): boolean {
  return err instanceof Error && err.name === "TimeoutError";
}

export async function fetchWithRetry(
  url: string | URL,
  init: RequestInit = {},
  options: FetchRetryOptions = {},
): Promise<Response> {
  const attempts = Math.max(1, options.retries ?? 3);
  const baseDelayMs = options.baseDelayMs ?? 250;
  // The caller's signal is the whole-call budget; without one, apply an
  // internal per-call timeout so a hung upstream can't stall the retries.
  const signal = init.signal ?? AbortSignal.timeout(options.timeoutMs ?? 15_000);

  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { ...init, signal });
      if (attempt < attempts && isRetryableStatus(response.status)) {
        const delay =
          retryAfterDelayMs(response.headers.get("retry-after")) ??
          baseDelayMs * 2 ** (attempt - 1) + jitter();
        await abortableSleep(delay, signal);
        continue;
      }
      return response;
    } catch (err) {
      // Caller abort (or the internal timeout) — the budget is spent.
      if (isAbortError(err) || isTimeoutError(err)) throw err;
      if (attempt >= attempts) throw err;
      await abortableSleep(baseDelayMs * 2 ** (attempt - 1) + jitter(), signal);
    }
  }
}
