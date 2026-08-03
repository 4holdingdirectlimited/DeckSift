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
// fp32 whenever DML is selected.
const DEVICE: "cpu" | "dml" =
  process.env.VECTORIZE_DEVICE === "dml" ? "dml" : "cpu";
const DTYPE: "fp32" | "q8" = DEVICE === "dml" ? "fp32" : "q8";

let modelPromise: Promise<SiglipVisionModel> | null = null;
let processorPromise: Promise<Processor> | null = null;

async function getModel(): Promise<SiglipVisionModel> {
  if (!modelPromise) {
    console.log(`[vectorize] Loading SigLIP model (${DTYPE}) on ${DEVICE}...`);
    modelPromise = SiglipVisionModel.from_pretrained(MODEL_NAME, {
      dtype: DTYPE,
      device: DEVICE,
    });
    await modelPromise;
    console.log(
      `[vectorize] SigLIP model loaded successfully (768 dimensions, device=${DEVICE}, dtype=${DTYPE})`,
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
