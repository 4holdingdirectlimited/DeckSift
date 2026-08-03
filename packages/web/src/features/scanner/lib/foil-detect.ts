/**
 * Heuristic holographic-foil detection for scanned cards.
 *
 * Runs in the browser on the same warped crop that gets uploaded, so it costs
 * nothing on the wire and needs no extra image decode. Under fixed lighting a
 * foil printing shows a rainbow diffraction pattern and specular highlights
 * that a matte (non-foil) printing does not:
 *
 *   - rainbow spread      → high circular hue variance
 *   - iridescence         → high saturation variance
 *   - specular highlights → high value variance + bright-pixel coverage
 *   - sparkle texture     → high-frequency value energy
 *
 * The score is a 0..1 confidence and the threshold is a starting point — it
 * MUST be calibrated against real captures once the rig is built (see
 * custom/PLAN.md). Every scan where the operator corrects the toggle adds a
 * labeled sample (image + is_foil) to collection_cards, which becomes the
 * training set for the classifier that replaces this heuristic.
 */

export const FOIL_SCORE_THRESHOLD = 0.5;

/**
 * Core scoring over raw RGBA pixels (exported so the math is unit-testable in
 * Node with a plain Uint8ClampedArray).
 */
export function computeFoilScoreFromPixels(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): number {
  const n = width * height;
  if (n === 0) return 0;

  const sats = new Float32Array(n);
  const vals = new Float32Array(n);
  let hueSin = 0;
  let hueCos = 0;
  let satMean = 0;
  let valMean = 0;

  for (let i = 0; i < n; i++) {
    const r = data[i * 4] / 255;
    const g = data[i * 4 + 1] / 255;
    const b = data[i * 4 + 2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const v = max;
    const s = max === 0 ? 0 : (max - min) / max;

    let h = 0;
    const d = max - min;
    if (d > 0) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }

    sats[i] = s;
    vals[i] = v;
    const rad = (h * Math.PI) / 180;
    hueSin += Math.sin(rad);
    hueCos += Math.cos(rad);
    satMean += s;
    valMean += v;
  }

  satMean /= n;
  valMean /= n;
  // Circular variance of hue: 0 = single hue, 1 = hues spread evenly
  // around the wheel (rainbow).
  const rbar = Math.sqrt((hueSin / n) ** 2 + (hueCos / n) ** 2);
  const hueVar = 1 - rbar;

  let satVar = 0;
  let valVar = 0;
  let edgeEnergy = 0;
  let brightPixels = 0;
  for (let i = 0; i < n; i++) {
    const ds = sats[i] - satMean;
    satVar += ds * ds;
    const dv = vals[i] - valMean;
    valVar += dv * dv;
    if (vals[i] > 0.85) brightPixels++;
    const x = i % width;
    if (x + 1 < width) {
      const d = vals[i + 1] - vals[i];
      edgeEnergy += d * d;
    }
    if (i + width < n) {
      const d = vals[i + width] - vals[i];
      edgeEnergy += d * d;
    }
  }
  satVar /= n;
  valVar /= n;
  edgeEnergy /= n * 2;
  const brightFrac = brightPixels / n;

  // Approximate normalizations — coefficients are calibration starting points.
  const fHue = Math.min(1, hueVar * 3);
  const fSat = Math.min(1, satVar * 12);
  const fVal = Math.min(1, valVar * 8);
  const fEdge = Math.min(1, edgeEnergy * 40);
  const fBright = Math.min(1, brightFrac * 6);

  const score =
    fHue * 0.35 + fSat * 0.2 + fVal * 0.2 + fEdge * 0.15 + fBright * 0.1;

  return Math.max(0, Math.min(1, score));
}

/** Scores the warped card crop (the same canvas that gets uploaded). */
export function computeFoilScore(source: HTMLCanvasElement): number {
  const width = 384;
  const aspect = source.height / source.width;
  const height = Math.max(1, Math.round(width * aspect));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return 0;

  ctx.drawImage(source, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);
  return computeFoilScoreFromPixels(data, width, height);
}

export function isFoilByScore(score: number | undefined): boolean {
  return score != null && score >= FOIL_SCORE_THRESHOLD;
}
