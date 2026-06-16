-- Run this once against your Postgres database before starting the app
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS doc_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id UUID NOT NULL,
  owner_id TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(384),  -- 384 dims for local MiniLM; change to 1536 for OpenAI
  chunk_index INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS doc_chunks_owner_idx ON doc_chunks (owner_id);
CREATE INDEX IF NOT EXISTS doc_chunks_embedding_idx ON doc_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
