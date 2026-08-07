import { describe, expect, it } from "vitest";
import {
  MISPRINT_MAX_DISTANCE,
  MISPRINT_MIN_DISTANCE,
  isPossibleMisprint,
  matchConfidence,
} from "./scryfall.constant";

describe("matchConfidence", () => {
  it("returns null for missing distances", () => {
    expect(matchConfidence(null)).toBeNull();
    expect(matchConfidence(undefined)).toBeNull();
  });

  it("converts distance to a 0-100 percentage", () => {
    expect(matchConfidence(0)).toBe(100);
    expect(matchConfidence(0.05)).toBe(95);
    expect(matchConfidence(0.5)).toBe(50);
    expect(matchConfidence(1)).toBe(0);
  });

  it("clamps out-of-range distances", () => {
    expect(matchConfidence(-0.5)).toBe(100);
    expect(matchConfidence(1.5)).toBe(0);
  });
});

describe("isPossibleMisprint", () => {
  it("is false without a distance", () => {
    expect(isPossibleMisprint(null)).toBe(false);
    expect(isPossibleMisprint(undefined)).toBe(false);
  });

  it("flags distances inside the misprint band", () => {
    expect(isPossibleMisprint(MISPRINT_MIN_DISTANCE)).toBe(true);
    expect(isPossibleMisprint(0.1)).toBe(true);
    expect(isPossibleMisprint(MISPRINT_MAX_DISTANCE)).toBe(true);
  });

  it("ignores clean matches and low-confidence matches", () => {
    expect(isPossibleMisprint(MISPRINT_MIN_DISTANCE - 0.01)).toBe(false);
    expect(isPossibleMisprint(MISPRINT_MAX_DISTANCE + 0.01)).toBe(false);
  });
});
