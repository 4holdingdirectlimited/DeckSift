import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlayingCard, PlayingCardImageUris } from "@magic-vault/shared";
import {
  baseCard,
  createSearchAdapter,
  createSyncSource,
  imageUris,
  num,
  proxyImage,
  str,
  type GenericGameConfig,
} from "./generic";

const config: GenericGameConfig = {
  key: "testgame",
  label: "Test Game",
  searchUrl: "https://example.test/search?q={q}",
  bulkUrl: "https://example.test/bulk",
  cardId: (raw) => String(raw["id"]),
  nameOf: (raw) => String(raw["name"] ?? ""),
  setCode: (raw) => String(raw["set"] ?? ""),
  imageUrl: (raw) => (raw["image"] as string | undefined) ?? undefined,
  toCard: (raw) => {
    const c = baseCard();
    c.id = String(raw["id"] ?? "");
    c.name = String(raw["name"] ?? "");
    c.set = String(raw["set"] ?? "");
    return c;
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("str / num coercion helpers", () => {
  it("stringifies values and returns undefined for nullish", () => {
    expect(str({ a: 1 }, "a")).toBe("1");
    expect(str({ a: "x" }, "a")).toBe("x");
    expect(str({ a: null }, "a")).toBeUndefined();
    expect(str({}, "a")).toBeUndefined();
  });

  it("coerces numeric fields and returns undefined for nullish", () => {
    expect(num({ a: 3 }, "a")).toBe(3);
    expect(num({ a: "5" }, "a")).toBe(5);
    expect(num({ a: null }, "a")).toBeUndefined();
    expect(num({}, "a")).toBeUndefined();
  });
});

describe("image proxying helpers", () => {
  it("wraps remote URLs in the local proxy route", () => {
    expect(proxyImage("https://cdn.example/a.jpg")).toBe(
      "/api/cards/image-proxy?url=https%3A%2F%2Fcdn.example%2Fa.jpg",
    );
  });

  it("builds a full image_uris set from one proxied URL", () => {
    const uris = imageUris("https://cdn.example/a.jpg");
    expect(uris).toBeDefined();
    const keys: (keyof PlayingCardImageUris)[] = [
      "small",
      "normal",
      "large",
      "png",
      "art_crop",
      "border_crop",
    ];
    for (const key of keys) {
      expect(uris![key]).toContain("/api/cards/image-proxy?url=");
    }
  });

  it("returns undefined when there is no image URL", () => {
    expect(imageUris(undefined)).toBeUndefined();
  });
});

describe("baseCard", () => {
  it("produces neutral defaults for a PlayingCard", () => {
    const c = baseCard();
    expect(c.name).toBe("");
    expect(c.rarity).toBe("");
    expect(c.color_identity).toEqual([]);
    expect(c.legalities.standard).toBe("not_legal");
    expect(c.prices.usd).toBeNull();
    expect(c.finishes).toEqual(["nonfoil"]);
  });
});

describe("createSearchAdapter", () => {
  const fetchMock = vi.fn();

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("rejects queries shorter than the minimum length", async () => {
    vi.stubGlobal("fetch", fetchMock);
    const adapter = createSearchAdapter(config);
    const result = await adapter.search("a", config.searchUrl);
    expect(result.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps a successful search response into PlayingCards", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [{ id: "1", name: "Card A", set: "SET" }],
      }),
    );
    const adapter = createSearchAdapter(config);
    const result = await adapter.search("card a", config.searchUrl);
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data![0].name).toBe("Card A");
  });

  it("URL-encodes the query into the {q} placeholder", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [] }));
    const adapter = createSearchAdapter(config);
    await adapter.search("sol ring", config.searchUrl);
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain("q=sol%20ring");
  });

  it("caps results at MAX_SEARCH_RESULTS", async () => {
    vi.stubGlobal("fetch", fetchMock);
    const many = Array.from({ length: 40 }, (_, i) => ({ id: String(i), name: `Card ${i}`, set: "S" }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: many }));
    const adapter = createSearchAdapter(config);
    const result = await adapter.search("cards", config.searchUrl);
    expect(result.data).toHaveLength(30);
  });

  it("reports no results when the source returns an empty list", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [] }));
    const adapter = createSearchAdapter(config);
    const result = await adapter.search("nothing", config.searchUrl);
    expect(result.success).toBe(false);
    expect(result.message).toContain("No cards were found");
  });

  it("reports a failed upstream search", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 400));
    const adapter = createSearchAdapter(config);
    const result = await adapter.search("cards", config.searchUrl);
    expect(result.success).toBe(false);
    expect(result.message).toContain("Test Game");
  });

  it("filters results through searchFilter when configured", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [
          { id: "1", name: "Bolt", set: "S" },
          { id: "2", name: "Lightning Bolt", set: "S" },
        ],
      }),
    );
    const filtered = createSearchAdapter({
      ...config,
      searchFilter: (cards, query) =>
        cards.filter((c) => String(c["name"]).toLowerCase().includes(query.toLowerCase())),
    });
    const result = await filtered.search("bolt", config.searchUrl);
    expect(result.data?.map((c) => c.name)).toEqual(["Bolt", "Lightning Bolt"]);
  });

  it("falls back to filtering the bulk catalog when there is no id endpoint", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        { id: "x-1", name: "Card X", set: "S" },
        { id: "x-2", name: "Other", set: "S" },
      ]),
    );
    const adapter = createSearchAdapter(config);
    const result = await adapter.searchById("x-1", config.bulkUrl);
    expect(result.success).toBe(true);
    expect((result.data as PlayingCard).name).toBe("Card X");
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("example.test/bulk"), expect.anything());
  });
});

describe("createSyncSource", () => {
  const fetchMock = vi.fn();

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("maps the bulk catalog into SyncSourceCard records", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [
          { id: "1", name: "Card A", set: "SET", image: "https://cdn/a.jpg" },
          { id: "2", name: "Card B", set: "SET" },
        ],
      }),
    );
    const source = createSyncSource(config);
    const cards = await source.fetchCards(config.bulkUrl, () => {});
    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({
      id: "1",
      name: "Card A",
      setCode: "SET",
      imageUrl: "https://cdn/a.jpg",
    });
    expect(cards[1].imageUrl).toBeUndefined();
    expect((cards[0].cardData as PlayingCard).id).toBe("1");
  });

  it("throws when the bulk catalog request fails", async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal("fetch", fetchMock);
      fetchMock.mockResolvedValue(jsonResponse({}, 500));
      const source = createSyncSource(config);
      const pending = source.fetchCards(config.bulkUrl, () => {});
      const assertion = expect(pending).rejects.toThrow(/catalog fetch failed/);
      await vi.advanceTimersByTimeAsync(10_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
