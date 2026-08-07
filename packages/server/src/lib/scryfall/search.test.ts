import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Search, SearchById } from "./search";

const SCRYFALL_URL = "https://api.scryfall.com/cards";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const CARD = {
  id: "abc-123",
  name: "Sol Ring",
  set: "ecc",
  rarity: "uncommon",
  prices: { usd: "2.74", usd_foil: null },
};

describe("Search", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("rejects queries below the minimum length without calling the API", async () => {
    const result = await Search("a", SCRYFALL_URL);
    expect(result.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("URL-encodes the query in the search request", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [CARD] }));
    await Search("sol ring", SCRYFALL_URL);
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain("q=sol%20ring");
    expect(calledUrl).toContain("unique=prints");
  });

  it("returns cards on a successful response", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [CARD] }));
    const result = await Search("sol ring", SCRYFALL_URL);
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data![0].name).toBe("Sol Ring");
  });

  it("turns a 404 into a friendly no-cards message", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 404));
    const result = await Search("zzzzzz", SCRYFALL_URL);
    expect(result.success).toBe(false);
    expect(result.message).toContain("No cards were found");
  });

  it("retries transient 5xx responses before reporting failure", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(jsonResponse({}, 503));
    const pending = Search("sol ring", SCRYFALL_URL);
    const assertion = expect(pending).resolves.toMatchObject({
      success: false,
      message: "Failed to fetch from Scryfall.",
    });
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("SearchById", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the card on success", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(CARD));
    const result = await SearchById("abc-123", SCRYFALL_URL);
    expect(result.success).toBe(true);
    expect((result.data as { name: string }).name).toBe("Sol Ring");
  });

  it("reports the failing status and id on a 404", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 404));
    const result = await SearchById("abc-123", SCRYFALL_URL);
    expect(result.success).toBe(false);
    expect(result.message).toContain("404");
    expect(result.message).toContain("abc-123");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
