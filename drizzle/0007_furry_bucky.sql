DROP INDEX "cards_embedding_idx";--> statement-breakpoint
CREATE INDEX "cards_embedding_idx" ON "cards" USING hnsw ("embedding" vector_cosine_ops) WITH (m=32, ef_construction=128);
