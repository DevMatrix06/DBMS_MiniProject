// Gemini embeddings (hosted API). Text -> 768-dim unit vector, compared with cosine distance in pgvector.
const MODEL = "gemini-embedding-001";
const DIM = Number(process.env.EMBEDDING_DIM ?? 768);
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent`;

function normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

export async function embed(text: string): Promise<number[]> {
  const key = process.env.EMBEDDING_API_KEY;
  if (!key) throw new Error("EMBEDDING_API_KEY is not set");

  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      content: { parts: [{ text }] },
      taskType: "SEMANTIC_SIMILARITY",
      outputDimensionality: DIM,
    }),
  });
  if (!res.ok) throw new Error(`Embedding API error ${res.status}`);

  const json = (await res.json()) as { embedding?: { values?: number[] } };
  const values = json.embedding?.values;
  if (!values || values.length !== DIM) throw new Error("Unexpected embedding response");
  return normalize(values); // truncated dimensions are not unit length by default
}

/** pgvector text literal, e.g. "[0.1,0.2,...]" - pass as a parameter and cast with ::vector */
export const toVectorLiteral = (v: number[]) => `[${v.join(",")}]`;
