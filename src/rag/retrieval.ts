import type { Pool } from "pg";
import { embedQuery } from "./embeddings.js";

export async function retrieveRelevantChunks(
  query: string,
  ownerId: string,
  pool: Pool,
  topK = 5
): Promise<string[]> {
  const embedding = await embedQuery(query);
  const result = await pool.query<{ content: string }>(
    `SELECT content
     FROM doc_chunks
     WHERE owner_id = $1
     ORDER BY embedding <-> $2::vector
     LIMIT $3`,
    [ownerId, JSON.stringify(embedding), topK]
  );
  return result.rows.map((r) => r.content);
}
