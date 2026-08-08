/**
 * SigLIP embedding benchmark for the scan pipeline.
 *
 * Measures the realistic per-scan compute cost: JPEG decode → processor →
 * model forward (the same path vectorizeImageFromBuffer uses). Also reports
 * the raw model-only time so we can see how much is decode/process overhead.
 *
 * Run from packages/server:
 *   pnpm bench:vectorize
 */
import {
  AutoProcessor,
  RawImage,
  SiglipVisionModel,
} from "@huggingface/transformers";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MODEL_NAME = "Xenova/siglip-base-patch16-512";
const SAMPLE_PATH = join(process.cwd(), ".cache", "bench-card.jpg");
// BENCH_DEVICE=cpu|dml — "dml" uses the DirectML execution provider
// (onnxruntime-node bundles DirectML.dll on Windows).
const DEVICE: string = process.env.BENCH_DEVICE ?? "cpu";
const DTYPE: string = process.env.BENCH_DTYPE ?? "q8";
// BENCH_DML_DEVICE_ID=0|1 — DirectML adapter index (DXGI order: primary
// display first). Use nvidia-smi to see which physical GPU each index is;
// on this machine 0=Quadro M4000 (primary display), 1=GTX 970.
const DML_DEVICE_ID: string | undefined = process.env.BENCH_DML_DEVICE_ID;

const session_options =
  DEVICE === "dml" && DML_DEVICE_ID !== undefined
    ? { executionProviders: [{ name: "dml" as const, deviceId: Number(DML_DEVICE_ID) }] }
    : undefined;

function stats(label: string, times: number[]): void {
  const sorted = [...times].sort((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  const p = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
  console.log(`  ${label}`);
  console.log(
    `    min=${sorted[0].toFixed(0)}ms p50=${p(0.5).toFixed(0)}ms mean=${mean.toFixed(0)}ms p95=${p(0.95).toFixed(0)}ms max=${sorted[sorted.length - 1].toFixed(0)}ms`,
  );
  console.log(`    → ${(1000 / mean).toFixed(2)} cards/sec if this were the bottleneck`);
}

async function fetchSampleImage(): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const card = await (
      await fetch("https://api.scryfall.com/cards/random", {
        headers: { "User-Agent": "MagicVault/1.0" },
      })
    ).json();
    const url: string | undefined =
      card.image_uris?.large ?? card.card_faces?.[0]?.image_uris?.large;
    if (url) {
      const imgRes = await fetch(url, {
        headers: { "User-Agent": "MagicVault/1.0" },
      });
      const buf = Buffer.from(await imgRes.arrayBuffer());
      // cards.scryfall.io can answer an HTML error page for a bad/expired
      // URL — only accept genuine image payloads.
      if (imgRes.ok && (imgRes.headers.get("content-type") ?? "").startsWith("image/")) {
        writeFileSync(SAMPLE_PATH, buf);
        return;
      }
    }
  }
  throw new Error("Could not fetch a card image with a large art URL");
}

async function main(): Promise<void> {
  if (!existsSync(SAMPLE_PATH)) {
    console.log("Downloading a sample card image...");
    await fetchSampleImage();
    console.log(`Saved ${SAMPLE_PATH}`);
  }
  const buffer = readFileSync(SAMPLE_PATH);
  const bytesKb = (buffer.length / 1024).toFixed(0);

  console.log(`Loading ${MODEL_NAME} (${DTYPE}) on device="${DEVICE}"...`);
  const t0 = performance.now();
  const model = await SiglipVisionModel.from_pretrained(MODEL_NAME, {
    dtype: DTYPE,
    device: DEVICE,
    ...(session_options ? { session_options } : {}),
  });
  const processor = await AutoProcessor.from_pretrained(MODEL_NAME);
  console.log(`Model loaded in ${(performance.now() - t0).toFixed(0)} ms`);
  // model.session may not be directly accessible across versions — that's fine.
  try {
    console.log(
      `Execution provider: ${(model.session as { ort?: unknown })?.ort?.env?.release ?? "n/a"}`,
    );
  } catch {
    /* ignore */
  }

  // Full pipeline: decode JPEG → preprocess → model forward.
  const fullEmbed = async (): Promise<number> => {
    const image = await RawImage.fromBlob(new Blob([buffer]));
    const inputs = await processor(image);
    const { pooler_output } = await model(inputs);
    return pooler_output.data.length;
  };

  // Model forward only (inputs precomputed once).
  const image = await RawImage.fromBlob(new Blob([buffer]));
  const precomputedInputs = await processor(image);

  const N = 15;
  console.log(`\nSample: ${bytesKb} KB JPEG (${image.width}x${image.height})`);

  await fullEmbed(); // warmup — includes one-time graph/backend init
  const fullTimes: number[] = [];
  for (let i = 0; i < N; i++) {
    const s = performance.now();
    await fullEmbed();
    fullTimes.push(performance.now() - s);
  }
  console.log("\nFull scan-path embed (decode + preprocess + model):");
  stats(`(${N} runs)`, fullTimes);

  const modelTimes: number[] = [];
  for (let i = 0; i < N; i++) {
    const s = performance.now();
    await model(precomputedInputs);
    modelTimes.push(performance.now() - s);
  }
  console.log("\nModel forward only (precomputed inputs):");
  stats(`(${N} runs)`, modelTimes);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
