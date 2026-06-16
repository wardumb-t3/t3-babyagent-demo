import { randomUUID } from "crypto";
import type { Pool } from "pg";
import { embedTexts } from "./embeddings.js";
// @mozilla/readability available for richer extraction if needed

const CHUNK_SIZE = 500; // tokens (approx chars / 4)
const CHUNK_OVERLAP = 50;

function chunkText(text: string): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let i = 0;
  while (i < words.length) {
    const chunk = words.slice(i, i + CHUNK_SIZE).join(" ");
    if (chunk.trim()) chunks.push(chunk);
    i += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks;
}

export async function ingestPdf(
  buffer: Buffer,
  docId: string,
  ownerId: string,
  pool: Pool
): Promise<number> {
  const pdfParse = (await import("pdf-parse")).default;
  const parsed = await pdfParse(buffer);
  return ingestText(parsed.text, docId, ownerId, pool);
}

export async function ingestUrl(
  url: string,
  docId: string,
  ownerId: string,
  pool: Pool
): Promise<number> {
  const { default: fetch } = await import("node-fetch");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch URL: ${res.status}`);
  const html = await res.text();
  // Strip HTML tags for simple text extraction (avoids jsdom dependency)
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return ingestText(text, docId, ownerId, pool);
}

async function ingestText(text: string, docId: string, ownerId: string, pool: Pool): Promise<number> {
  const chunks = chunkText(text);
  if (chunks.length === 0) return 0;

  const embeddings = await embedTexts(chunks);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Remove existing chunks for this doc (re-ingest)
    await client.query("DELETE FROM doc_chunks WHERE doc_id = $1", [docId]);

    for (let i = 0; i < chunks.length; i++) {
      const embedding = embeddings[i]!;
      await client.query(
        `INSERT INTO doc_chunks (id, doc_id, owner_id, content, embedding, chunk_index)
         VALUES ($1, $2, $3, $4, $5::vector, $6)`,
        [randomUUID(), docId, ownerId, chunks[i], JSON.stringify(embedding), i]
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  return chunks.length;
}
