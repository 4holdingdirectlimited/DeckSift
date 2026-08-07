import { describe, expect, it } from "vitest";
import { gameAcronym } from "./game-acronyms.constant";

describe("gameAcronym", () => {
  it("returns the stable acronym for known games", () => {
    expect(gameAcronym("mtg")).toBe("MTG");
    expect(gameAcronym("yugioh")).toBe("YGO");
    expect(gameAcronym("pokemon")).toBe("PKM");
    expect(gameAcronym("digimon")).toBe("DIG");
    expect(gameAcronym("gundam")).toBe("GUN");
  });

  it("falls back to TCG for missing game keys", () => {
    expect(gameAcronym(null)).toBe("TCG");
    expect(gameAcronym(undefined)).toBe("TCG");
  });

  it("derives a truncated uppercase code for unknown keys", () => {
    expect(gameAcronym("flesh_and_blood")).toBe("FLE");
    expect(gameAcronym("xyz")).toBe("XYZ");
    expect(gameAcronym("")).toBe("TCG");
  });
});
