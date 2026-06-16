import { config } from "../config.js";

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (config.EMBEDDINGS_PROVIDER === "openai") {
    return embedWithOpenAI(texts);
  }
  return embedWithLocal(texts);
}

export async function embedQuery(text: string): Promise<number[]> {
  const results = await embedTexts([text]);
  return results[0]!;
}

async function embedWithOpenAI(texts: string[]): Promise<number[][]> {
  if (!config.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY required for openai embeddings provider");
  const { default: fetch } = await import("node-fetch");
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: "text-embedding-3-small", input: texts }),
  });
  if (!res.ok) throw new Error(`OpenAI embeddings error: ${res.status}`);
  const data = (await res.json()) as { data: { embedding: number[] }[] };
  return data.data.map((d) => d.embedding);
}

// Local embeddings using @xenova/transformers (384-dim MiniLM)
// Lazy-loaded to avoid startup cost when not needed
let pipelineCache: ((texts: string | string[], opts?: object) => Promise<{ data: Float32Array }[]>) | null = null;

async function embedWithLocal(texts: string[]): Promise<number[][]> {
  if (!pipelineCache) {
    // Dynamic import so the heavy model only loads when needed
    const { pipeline } = await import("@xenova/transformers" as string) as {
      pipeline: (task: string, model: string) => Promise<(texts: string | string[], opts?: object) => Promise<{ data: Float32Array }[]>>
    };
    pipelineCache = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  }
  const results = await pipelineCache(texts, { pooling: "mean", normalize: true });
  return results.map((r) => Array.from(r.data));
}
