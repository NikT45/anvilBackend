import { env } from "../env"

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings"
const MODEL = "voyage-finance-2"
const BATCH_SIZE = 96 // Voyage allows up to 128 inputs per request

interface VoyageResponse {
  data: Array<{ embedding: number[]; index: number }>
  usage: { total_tokens: number }
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!env.VOYAGE_API_KEY) throw new Error("VOYAGE_API_KEY not set")
  if (texts.length === 0) return []

  const allEmbeddings: number[][] = new Array(texts.length)

  // Process in batches
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE)
    const res = await fetch(VOYAGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.VOYAGE_API_KEY}`,
      },
      body: JSON.stringify({ input: batch, model: MODEL }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Voyage API error ${res.status}: ${err}`)
    }

    const data = (await res.json()) as VoyageResponse
    for (const item of data.data) {
      allEmbeddings[i + item.index] = item.embedding
    }

    console.log(`[voyage] embedded batch ${i / BATCH_SIZE + 1} — ${data.usage.total_tokens} tokens`)
  }

  return allEmbeddings
}

export async function embedQuery(text: string): Promise<number[]> {
  const [embedding] = await embedTexts([text])
  if (!embedding) throw new Error("No embedding returned for query")
  return embedding
}
