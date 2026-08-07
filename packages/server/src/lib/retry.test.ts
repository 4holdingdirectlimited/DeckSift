import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWithRetry, isRetryableStatus } from "./retry";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("isRetryableStatus", () => {
  it("flags throttling and server errors only", () => {
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(408)).toBe(true);
    expect(isRetryableStatus(404)).toBe(false);
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableStatus(200)).toBe(false);
  });
});

describe("fetchWithRetry", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    fetchMock.mockReset();
  });

  it("returns a success response without retrying", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    const res = await fetchWithRetry("https://example.test");
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries transient network errors with backoff then succeeds", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const pending = fetchWithRetry("https://example.test", {}, { retries: 3 });
    await vi.advanceTimersByTimeAsync(10_000);
    const res = await pending;

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retries retryable statuses (500) and succeeds on the next attempt", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const pending = fetchWithRetry("https://example.test");
    await vi.advanceTimersByTimeAsync(10_000);
    const res = await pending;

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry definitive 404s", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 404));
    const res = await fetchWithRetry("https://example.test");
    expect(res.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up with the last failed response when attempts are exhausted", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 503));
    const pending = fetchWithRetry("https://example.test", {}, { retries: 2 });
    await vi.advanceTimersByTimeAsync(10_000);
    const res = await pending;
    expect(res.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never retries caller-initiated aborts", async () => {
    const abort = new Error("The operation was aborted");
    abort.name = "AbortError";
    fetchMock.mockRejectedValue(abort);

    await expect(
      fetchWithRetry("https://example.test", { signal: AbortSignal.timeout(1) }),
    ).rejects.toThrow("aborted");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("honors Retry-After on 429 responses", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("{} ", { status: 429, headers: { "Retry-After": "1" } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const pending = fetchWithRetry("https://example.test");
    await vi.advanceTimersByTimeAsync(2_000);
    const res = await pending;

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry at all with retries: 1", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 500));
    const res = await fetchWithRetry("https://example.test", {}, { retries: 1 });
    expect(res.status).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to backoff when Retry-After is an HTTP-date, not seconds", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response("{} ", {
          status: 429,
          headers: { "Retry-After": "Thu, 01 Jan 2026 00:00:00 GMT" },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const pending = fetchWithRetry("https://example.test");
    await vi.advanceTimersByTimeAsync(500); // ≥ 250ms backoff + jitter
    const res = await pending;

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("pins the backoff sleep duration (a 0ms-sleep regression would fail)", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const pending = fetchWithRetry("https://example.test");
    // First backoff is ≥ 250ms (base) + 0–49ms jitter. Well before that:
    await vi.advanceTimersByTimeAsync(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Just past the upper bound (299ms): the retry must have fired.
    await vi.advanceTimersByTimeAsync(150);
    const res = await pending;
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("cuts a long backoff short when the caller's signal fires", async () => {
    const controller = new AbortController();
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 503));

    const pending = fetchWithRetry("https://example.test", { signal: controller.signal });
    // Attach the rejection handler before aborting so the abort is never
    // an unhandled rejection.
    const assertion = expect(pending).rejects.toThrow("aborted");
    // Let the first attempt resolve and the backoff sleep start.
    await vi.advanceTimersByTimeAsync(0);
    controller.abort(new DOMException("The operation was aborted", "AbortError"));
    await vi.advanceTimersByTimeAsync(10_000);

    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("bounds a hung upstream with an internal timeout when no signal is given", async () => {
    vi.useRealTimers();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
            once: true,
          });
        }),
    );

    await expect(
      fetchWithRetry("https://example.test", {}, { timeoutMs: 100 }),
    ).rejects.toMatchObject({ name: "TimeoutError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("lets a caller-supplied signal own the budget (no internal timeout override)", async () => {
    vi.useRealTimers();
    const controller = new AbortController();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
            once: true,
          });
        }),
    );

    const pending = fetchWithRetry(
      "https://example.test",
      { signal: controller.signal },
      { timeoutMs: 100 },
    );
    // Abort after the internal 100ms timeout would have fired — if the
    // internal timeout wrongly applied, the call would already have rejected
    // with TimeoutError; the caller's AbortError below is what must surface.
    setTimeout(() => {
      controller.abort(new DOMException("The operation was aborted", "AbortError"));
    }, 150);

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
