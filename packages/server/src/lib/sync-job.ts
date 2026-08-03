import type { SyncState, SyncStatus } from "@magic-vault/shared";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { cardImageVectors } from "../db/schema";
import { gundamSyncSource } from "./gundam/sync";
import { pokemonSyncSource } from "./pokemon/sync";
import { scryfallSyncSource } from "./scryfall/sync";
import type { SyncSource, SyncSourceCard } from "./card-search/sync-types";
import { digimonConfig, yugiohConfig } from "./card-search/generic-configs";
import { createSyncSource } from "./card-search/generic";
import { resolveGameDataSourceUrl } from "./card-search/resolve";
import { sendDiscordNotification } from "./discord";
import { vectorizeBuffers } from "./vectorize";

export const SYNC_SOURCES: Record<string, SyncSource> = {
  mtg: scryfallSyncSource,
  gundam: gundamSyncSource,
  pokemon: pokemonSyncSource,
  yugioh: createSyncSource(yugiohConfig),
  digimon: createSyncSource(digimonConfig),
};

type SseWriter = (event: string, data: unknown) => void;

let state: SyncState = {
  status: "idle",
  gameKey: "",
  total: 0,
  processed: 0,
  skipped: 0,
  errors: 0,
  startedAt: null,
  logs: [],
};

let cancelFlag = false;
const writers = new Set<SseWriter>();

// Auto-advancing sync queue: game keys run one at a time (they share the
// GPU). When the current run finishes/cancels/fails, the next queued key
// starts automatically.
const queue: string[] = [];
let queueOrgId: string | undefined;

/**
 * Replace the queue with the given game keys and start the first one now
 * (unless a sync is already running — then it runs after). Returns which key
 * started and what is left queued.
 */
export function queueSync(
  orgId: string | undefined,
  gameKeys: string[],
): { started: string | null; queued: string[] } {
  queueOrgId = orgId;
  queue.length = 0;
  queue.push(...gameKeys);
  if (state.status === "running") {
    return { started: null, queued: [...queue] };
  }
  const next = queue.shift();
  if (next) startSync(orgId, next);
  return { started: next ?? null, queued: [...queue] };
}

export function getSyncQueue(): string[] {
  return [...queue];
}

export function clearSyncQueue(): void {
  queue.length = 0;
}

function advanceQueue(): void {
  const next = queue.shift();
  if (next) startSync(queueOrgId, next);
}

function addLog(msg: string) {
  state = { ...state, logs: [...state.logs.slice(-199), msg] };
  emit("log", { line: msg });
}

function emit(event: string, data: unknown) {
  for (const writer of writers) {
    try {
      writer(event, data);
    } catch {
      // writer may have disconnected
    }
  }
}

export function getStatus(): SyncState {
  return { ...state, logs: [...state.logs] };
}

export function subscribeSSE(writer: SseWriter): () => void {
  writers.add(writer);
  writer("status", getStatus());
  return () => writers.delete(writer);
}

export function cancelSync(): void {
  if (state.status === "running") {
    cancelFlag = true;
  }
}

export function startSync(orgId: string | undefined, gameKey: string): void {
  if (state.status === "running") return;

  const source = SYNC_SOURCES[gameKey];
  if (!source) return;

  cancelFlag = false;
  state = {
    status: "running",
    gameKey,
    total: 0,
    processed: 0,
    skipped: 0,
    errors: 0,
    startedAt: new Date().toISOString(),
    logs: [],
  };

  emit("status", getStatus());
  runSync(source).catch((err) => {
    state = { ...state, status: "failed" };
    const msg = err instanceof Error ? err.message : String(err);
    addLog(`Fatal error: ${msg}`);
    emit("error", { message: msg });
    if (orgId) {
      void sendDiscordNotification(orgId, {
        title: "Magic Vault — Sync Failed",
        description: `The card database sync job encountered a fatal error.\n\n**Error:** ${msg}`,
        color: 0xed4245,
        timestamp: new Date().toISOString(),
      });
    }
    advanceQueue();
  });
}

async function runSync(source: SyncSource): Promise<void> {
  const baseUrl = await resolveGameDataSourceUrl(source.gameKey, source.defaultUrl);
  addLog(`Using data source: ${baseUrl}`);

  const cards = await source.fetchCards(baseUrl, addLog);
  state = { ...state, total: cards.length };
  emit("status", getStatus());

  addLog(`Loading existing ${source.label} cards from DB...`);

  const existing = await db
    .select({
      id: cardImageVectors.scryfallId,
      cardData: cardImageVectors.cardData,
    })
    .from(cardImageVectors)
    .where(eq(cardImageVectors.gameKey, source.gameKey));
  const existingSet = new Set(existing.map((r) => r.id));
  const existingByScryfallId = new Map(existing.map((r) => [r.id, r]));

  // One-time backfill: rows synced before cards.card_data existed have no
  // card data. Collect them while scanning the catalog, then batch-update at
  // the end so hydration can go fully local.
  const backfill: { id: string; cardData: unknown }[] = [];

  addLog(
    `Found ${existingSet.size} existing ${source.label} cards in DB. Starting vectorization...`,
  );

  // cards.scryfall.io throttles per-connection (measured ~200-400 KB/s per
  // connection, but 16 parallel connections all finish in the same wall time as
  // one). Fetching images in parallel batches turns a ~4s-per-card fetch into
  // ~0.1-0.5s-per-card.
  const FETCH_BATCH = 16;
  // GPU-safe embedding batch. Batch-16 crashed the DirectML device on this
  // machine's Quadro M4000 (DXGI_ERROR_DEVICE_HUNG); batch-8 is proven stable
  // under sustained load, so the two are deliberately decoupled.
  const EMBED_BATCH = 8;

  const fetchBatch = async (batch: SyncSourceCard[]): Promise<(Buffer | null)[]> =>
    Promise.all(
      batch.map(async (card) => {
        if (!card.imageUrl || existingSet.has(card.id)) return null;
        try {
          const imageRes = await fetch(card.imageUrl, {
            headers: source.fetchHeaders,
            signal: AbortSignal.timeout(30_000),
          });
          if (!imageRes.ok) return null;
          return Buffer.from(await imageRes.arrayBuffer());
        } catch {
          return null;
        }
      }),
    );

  // In-flight fetch for the next chunk (pipelining — see the main loop).
  let pendingFetch: Promise<(Buffer | null)[]> | null = null;

  for (let i = 0; i < cards.length; i += FETCH_BATCH) {
    if (cancelFlag) {
      state = { ...state, status: "cancelled" };
      addLog("Sync cancelled by user.");
      emit("done", {
        status: "cancelled" as SyncStatus,
        processed: state.processed,
        skipped: state.skipped,
        errors: state.errors,
      });
      advanceQueue();
      return;
    }

    const chunk = cards.slice(i, i + FETCH_BATCH);
    // Pipeline: kick off the next chunk's image fetch while this chunk is
    // being embedded/inserted, so fetch latency hides behind GPU work.
    const nextChunk = cards.slice(i + FETCH_BATCH, i + 2 * FETCH_BATCH);
    const pendingNext = nextChunk.length > 0 ? fetchBatch(nextChunk) : null;
    const buffers = (await pendingFetch) ?? (await fetchBatch(chunk));
    pendingFetch = pendingNext;

    // Collect the successfully fetched, not-yet-in-DB cards with their chunk
    // index, then embed them in GPU-safe sub-batches (one model forward each).
    const toEmbed: { index: number; card: SyncSourceCard; buffer: Buffer }[] =
      [];
    for (let j = 0; j < chunk.length; j++) {
      const card = chunk[j];
      const buffer = buffers[j];
      if (card.imageUrl && !existingSet.has(card.id) && buffer) {
        toEmbed.push({ index: j, card, buffer });
      }
    }
    const embeddingByIndex = new Map<number, number[]>();
    for (let k = 0; k < toEmbed.length; k += EMBED_BATCH) {
      const sub = toEmbed.slice(k, k + EMBED_BATCH);
      try {
        const embs = await vectorizeBuffers(sub.map((e) => e.buffer));
        for (let m = 0; m < sub.length; m++) {
          embeddingByIndex.set(sub[m].index, embs[m]);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/dml|gpu|device|onnxruntime/i.test(msg)) {
          // The DirectML device hung — every further embed will fail the same
          // way. Stop instead of churning errors; the sync is resumable, but
          // the GPU needs a server restart first, so clear the queue instead
          // of auto-advancing into more guaranteed failures.
          state = { ...state, status: "failed" };
          addLog(
            "Fatal error: GPU embedding failed (DirectML device hung). Restart the server (scripts/start-server.cmd) and re-run the sync — it resumes where it left off.",
          );
          emit("error", { message: msg });
          clearSyncQueue();
          return;
        }
        for (const { card } of sub) {
          state = { ...state, errors: state.errors + 1 };
          addLog(`Error: ${card.name}: ${msg}`);
          emit("progress", {
            processed: state.processed,
            skipped: state.skipped,
            errors: state.errors,
            currentCard: card.name,
          });
        }
      }
    }

    for (let j = 0; j < chunk.length; j++) {
      const card = chunk[j];
      const buffer = buffers[j];

      if (!card.imageUrl || existingSet.has(card.id)) {
        if (existingSet.has(card.id) && card.cardData) {
          const row = existingByScryfallId.get(card.id);
          if (row && row.cardData == null) {
            backfill.push({ id: card.id, cardData: card.cardData });
          }
        }
        state = { ...state, skipped: state.skipped + 1 };
        emit("progress", {
          processed: state.processed,
          skipped: state.skipped,
          errors: state.errors,
          currentCard: card.name,
        });
        continue;
      }

      if (!buffer) {
        state = { ...state, errors: state.errors + 1 };
        addLog(`Error: ${card.name}: image fetch failed`);
        emit("progress", {
          processed: state.processed,
          skipped: state.skipped,
          errors: state.errors,
          currentCard: card.name,
        });
        continue;
      }

      const embedding = embeddingByIndex.get(j);
      if (!embedding) continue; // embed failed — already counted above

      try {
        await db
          .insert(cardImageVectors)
          .values({
            scryfallId: card.id,
            gameKey: source.gameKey,
            name: card.name,
            setCode: card.setCode,
            embedding,
            cardData: card.cardData ?? null,
          })
          .onConflictDoNothing();

        existingSet.add(card.id);
        state = { ...state, processed: state.processed + 1 };
        addLog(
          `[${state.processed + state.skipped}/${state.total}] ${card.name} (${card.setCode})`,
        );
        emit("progress", {
          processed: state.processed,
          skipped: state.skipped,
          errors: state.errors,
          currentCard: card.name,
        });
      } catch (err) {
        state = { ...state, errors: state.errors + 1 };
        const msg = err instanceof Error ? err.message : String(err);
        addLog(`Error: ${card.name}: ${msg}`);
        emit("progress", {
          processed: state.processed,
          skipped: state.skipped,
          errors: state.errors,
          currentCard: card.name,
        });
      }
    }
  }

  // Batch-persist card data for rows that predate the card_data column.
  if (backfill.length > 0) {
    addLog(`Backfilling card data for ${backfill.length} existing cards...`);
    const CHUNK = 500;
    for (let i = 0; i < backfill.length; i += CHUNK) {
      const chunk = backfill.slice(i, i + CHUNK);
      await Promise.all(
        chunk.map(({ id, cardData }) =>
          db
            .update(cardImageVectors)
            .set({ cardData, updatedAt: new Date() })
            .where(
              and(
                eq(cardImageVectors.gameKey, source.gameKey),
                eq(cardImageVectors.scryfallId, id),
              ),
            ),
        ),
      );
    }
    addLog(`Backfilled card data for ${backfill.length} cards.`);
  }

  state = { ...state, status: "completed" };
  addLog(
    `Done. Processed: ${state.processed}, Skipped: ${state.skipped}, Errors: ${state.errors}`,
  );
  emit("done", {
    status: "completed" as SyncStatus,
    processed: state.processed,
    skipped: state.skipped,
    errors: state.errors,
  });
  advanceQueue();
}
