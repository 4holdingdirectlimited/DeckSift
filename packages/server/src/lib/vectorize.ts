import {
  AutoProcessor,
  RawImage,
  SiglipVisionModel,
  type Processor,
} from "@huggingface/transformers";

const MODEL_NAME = "Xenova/siglip-base-patch16-512";

// Execution backend for embeddings.
//   VECTORIZE_DEVICE=cpu   → q8 model on CPU (default, no GPU needed)
//   VECTORIZE_DEVICE=dml   → fp32 model via DirectML (Windows; onnxruntime-node
//                            bundles DirectML.dll). Measured ~1.9x faster than
//                            CPU q8 on this machine (703ms → 375ms).
// The q8 model crashes natively on the DirectML EP, so dtype is forced to
// fp32 whenever DML is selected (unless VECTORIZE_DTYPE overrides it).
const DEVICE: "cpu" | "dml" =
  process.env.VECTORIZE_DEVICE === "dml" ? "dml" : "cpu";

// Which DirectML adapter to run the model on. This is the DXGI/DirectML
// adapter index, NOT the nvidia-smi index (they enumerate differently: on
// this machine nvidia-smi lists GTX 970=0 / M4000=1, but DXGI lists the
// primary display first, so DirectML deviceId 0=M4000 and 1=GTX 970).
//
// The GTX 970 is the dedicated AI card (not the primary display), so the
// scan embeddings run on it while the M4000 keeps driving the desktop —
// verified ~1.3x faster than the M4000 (284ms vs 374ms full scan-path).
// Override with VECTORIZE_DML_DEVICE_ID if the GPU topology changes.
const DML_DEVICE_ID = Number(process.env.VECTORIZE_DML_DEVICE_ID ?? "1");

// VECTORIZE_DTYPE overrides the dtype (fp32|fp16|q8). Defaults preserve the
// long-standing behavior: q8 on CPU, fp32 on DML. fp16 is ~10% faster than
// fp32 on the GTX 970 (258ms vs 284ms full-path) at slightly reduced
// embedding precision — opt in with VECTORIZE_DTYPE=fp16.
function resolveDtype(): "fp32" | "fp16" | "q8" {
  const override = process.env.VECTORIZE_DTYPE;
  if (override === "fp32" || override === "fp16" || override === "q8") {
    return override;
  }
  return DEVICE === "dml" ? "fp32" : "q8";
}
const DTYPE = resolveDtype();

// Pin the DirectML execution provider to the chosen adapter (onnxruntime
// 1.21+: DmlExecutionProviderOption.deviceId). Without this, DML uses the
// default device — the primary display adapter, i.e. the M4000.
const session_options =
  DEVICE === "dml"
    ? { executionProviders: [{ name: "dml" as const, deviceId: DML_DEVICE_ID }] }
    : undefined;

let modelPromise: Promise<SiglipVisionModel> | null = null;
let processorPromise: Promise<Processor> | null = null;

async function getModel(): Promise<SiglipVisionModel> {
  if (!modelPromise) {
    const where =
      DEVICE === "dml" ? `dml(adapter ${DML_DEVICE_ID})` : DEVICE;
    console.log(`[vectorize] Loading SigLIP model (${DTYPE}) on ${where}...`);
    modelPromise = SiglipVisionModel.from_pretrained(MODEL_NAME, {
      dtype: DTYPE,
      device: DEVICE,
      ...(session_options ? { session_options } : {}),
    });
    await modelPromise;
    console.log(
      `[vectorize] SigLIP model loaded successfully (768 dimensions, device=${where}, dtype=${DTYPE})`,
    );
  }
  return modelPromise;
}

async function getProcessor(): Promise<Processor> {
  if (!processorPromise) {
    processorPromise = AutoProcessor.from_pretrained(MODEL_NAME);
  }
  return processorPromise;
}

async function vectorizeBuffer(buffer: Buffer): Promise<number[]> {
  const [model, processor] = await Promise.all([getModel(), getProcessor()]);
  const uint8Array = new Uint8Array(buffer);
  const image = await RawImage.fromBlob(new Blob([uint8Array]));
  const image_inputs = await processor(image);
  const { pooler_output } = await model(image_inputs);
  const embedding = Array.from(pooler_output.data) as number[];

  console.log(
    `[vectorize] Generated ${embedding.length}-dimensional SigLIP embedding`,
  );

  return embedding;
}

/**
 * Batch embedding — one processor pass + one model forward for many images.
 * The GPU forward pass amortizes launch overhead, so N images cost less than
 * N single-image passes (measured ~1.4x faster at batch 8 on this machine).
 * Used by the bulk card sync; the scan path stays single-image.
 */
export async function vectorizeBuffers(buffers: Buffer[]): Promise<number[][]> {
  if (buffers.length === 0) return [];
  if (buffers.length === 1) return [await vectorizeBuffer(buffers[0])];

  const [model, processor] = await Promise.all([getModel(), getProcessor()]);
  const images = await Promise.all(
    buffers.map((b) => RawImage.fromBlob(new Blob([new Uint8Array(b)]))),
  );
  const image_inputs = await processor(images);
  const { pooler_output } = await model(image_inputs);

  const data = pooler_output.data as Float32Array;
  const dims = pooler_output.dims;
  const n = dims && dims.length >= 2 ? dims[0] : buffers.length;
  const d = dims && dims.length >= 2 ? dims[1] : data.length / Math.max(1, n);

  const result: number[][] = [];
  for (let i = 0; i < n; i++) {
    result.push(Array.from(data.subarray(i * d, (i + 1) * d)));
  }
  console.log(`[vectorize] Generated ${n}x${d} SigLIP embeddings (batched)`);
  return result;
}

export async function vectorizeImageFromUrl(url: string): Promise<number[]> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status} ${url}`);
  }
  const imageBuffer = Buffer.from(await response.arrayBuffer());
  return vectorizeBuffer(imageBuffer);
}

export async function vectorizeImageFromBuffer(
  buffer: Buffer,
): Promise<number[]> {
  return vectorizeBuffer(buffer);
}
