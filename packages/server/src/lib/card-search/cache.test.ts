import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withCache } from "./cache";
import type { CardSearchAdapter } from "./types";
import type { PlayingCard } from "@magic-vault/shared";

const TTL_MS = 15 * 60 * 1000;

function fakeAdapter(): {
  adapter: CardSearchAdapter;
  searchCalls: () => number;
  byIdCalls: () => number;
} {
  let searchCalls = 0;
  let byIdCalls = 0;
  const adapter: CardSearchAdapter = {
    defaultUrl: "https://example.test/cards",
    async search(query) {
      searchCalls++;
      return {
        success: true,
        message: "ok",
        data: [{ id: query } as unknown as PlayingCard],
      };
    },
    async searchById(id) {
      byIdCalls++;
      return {
        success: true,
        message: "ok",
        data: { id } as unknown as PlayingCard,
      };
    },
  };
  return { adapter, searchCalls: () => searchCalls, byIdCalls: () => byIdCalls };
}

describe("withCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("serves repeated identical searches from the cache", async () => {
    const { adapter, searchCalls } = fakeAdapter();
    const cached = withCache(adapter);

    await cached.search("sol ring", "https://example.test/cards");
    await cached.search("sol ring", "https://example.test/cards");
    expect(searchCalls()).toBe(1);
  });

  it("treats whitespace/case differences as the same query", async () => {
    const { adapter, searchCalls } = fakeAdapter();
    const cached = withCache(adapter);

    await cached.search("  Sol Ring ", "https://example.test/cards");
    await cached.search("sol ring", "https://example.test/cards");
    expect(searchCalls()).toBe(1);
  });

  it("caches searchById separately from search", async () => {
    const { adapter, byIdCalls } = fakeAdapter();
    const cached = withCache(adapter);

    await cached.searchById("abc", "https://example.test/cards");
    await cached.searchById("abc", "https://example.test/cards");
    expect(byIdCalls()).toBe(1);
  });

  it("does not cache failed searches", async () => {
    let calls = 0;
    const adapter: CardSearchAdapter = {
      defaultUrl: "https://example.test/cards",
      async search() {
        calls++;
        return { success: false, message: "upstream down" };
      },
      async searchById() {
        return { success: false, message: "nope" };
      },
    };
    const cached = withCache(adapter);

    await cached.search("sol ring", "https://example.test/cards");
    await cached.search("sol ring", "https://example.test/cards");
    expect(calls).toBe(2);
  });

  it("dedupes concurrent identical requests", async () => {
    const { adapter, searchCalls } = fakeAdapter();
    const cached = withCache(adapter);

    await Promise.all([
      cached.search("sol ring", "https://example.test/cards"),
      cached.search("sol ring", "https://example.test/cards"),
    ]);
    expect(searchCalls()).toBe(1);
  });

  it("expires entries after the TTL", async () => {
    const { adapter, searchCalls } = fakeAdapter();
    const cached = withCache(adapter);

    await cached.search("sol ring", "https://example.test/cards");
    await cached.search("sol ring", "https://example.test/cards");
    expect(searchCalls()).toBe(1);

    vi.advanceTimersByTime(TTL_MS + 1);
    await cached.search("sol ring", "https://example.test/cards");
    expect(searchCalls()).toBe(2);
  });
});
