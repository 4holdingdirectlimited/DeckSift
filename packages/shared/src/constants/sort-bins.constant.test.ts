import { describe, expect, it } from "vitest";
import {
  BIN_COUNT,
  BIN_HEIGHTS_MM,
  CARD_THICKNESS_MM,
  computeAllBinCapacities,
  computeBinCapacity,
  createDefaultCatchAllOnlyBins,
  createDefaultColorBins,
} from "./sort-bins.constant";

describe("computeBinCapacity", () => {
  it("matches known-good capacities for every bin (unsleeved)", () => {
    // maxCapacity = floor((binHeightMm / 0.3mm) * 0.9 headroom)
    // Physical heights: 1-2: 155mm, 3-4: 110mm, 5-6: 65mm, 7: 60mm.
    expect(computeBinCapacity(1)).toBe(465);
    expect(computeBinCapacity(2)).toBe(465);
    expect(computeBinCapacity(3)).toBe(330);
    expect(computeBinCapacity(4)).toBe(330);
    expect(computeBinCapacity(5)).toBe(195);
    expect(computeBinCapacity(6)).toBe(195);
    expect(computeBinCapacity(7)).toBe(180);
  });

  it("matches known-good sleeved capacities", () => {
    expect(computeBinCapacity(1, 0.7)).toBe(199);
    expect(computeBinCapacity(7, 0.7)).toBe(77);
    expect(computeBinCapacity(1, 0.7)).toBeLessThan(computeBinCapacity(1));
  });

  it("returns 0 for unknown bins", () => {
    expect(computeBinCapacity(0)).toBe(0);
    expect(computeBinCapacity(99)).toBe(0);
  });

  it("never exceeds the physical headroom limit", () => {
    const capacity = computeBinCapacity(2);
    const stackHeightMm = capacity * CARD_THICKNESS_MM;
    expect(stackHeightMm).toBeLessThanOrEqual(BIN_HEIGHTS_MM[2]);
  });
});

describe("computeAllBinCapacities", () => {
  it("returns one entry per physical bin", () => {
    const capacities = computeAllBinCapacities();
    expect(Object.keys(capacities)).toHaveLength(BIN_COUNT);
    expect(capacities[1]).toBe(computeBinCapacity(1));
    expect(capacities[BIN_COUNT]).toBe(computeBinCapacity(BIN_COUNT));
  });
});

describe("createDefaultColorBins", () => {
  it("builds one bin per color plus a catch-all", () => {
    const bins = createDefaultColorBins();
    expect(bins).toHaveLength(BIN_COUNT);
    expect(bins.map((b) => b.binNumber)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("marks only the last bin as the catch-all", () => {
    const bins = createDefaultColorBins();
    for (const b of bins.slice(0, -1)) expect(b.isCatchAll).toBe(false);
    expect(bins[6].isCatchAll).toBe(true);
    expect(bins[6].rules.conditions).toHaveLength(0);
  });

  it("gives each color bin a single color_identity equals condition", () => {
    const bins = createDefaultColorBins();
    const expectedColors = ["W", "U", "B", "R", "G"];
    for (let i = 0; i < expectedColors.length; i++) {
      const cond = bins[i].rules.conditions[0];
      expect(cond).toMatchObject({ field: "color_identity", operator: "equals", value: [expectedColors[i]] });
    }
  });

  it("gives every rule group a stable id and combinator", () => {
    for (const b of createDefaultColorBins()) {
      expect(b.rules.id).toBeTruthy();
      expect(b.rules.combinator).toBe("and");
    }
  });
});

describe("createDefaultCatchAllOnlyBins", () => {
  it("builds BIN_COUNT bins with the last as catch-all", () => {
    const bins = createDefaultCatchAllOnlyBins();
    expect(bins).toHaveLength(BIN_COUNT);
    expect(bins[BIN_COUNT - 1].isCatchAll).toBe(true);
    for (const b of bins.slice(0, -1)) expect(b.isCatchAll).toBe(false);
  });
});
