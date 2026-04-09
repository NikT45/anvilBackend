import type Anthropic from "@anthropic-ai/sdk"
import { supabaseAdmin } from "../lib/supabase-backend"
import { embedQuery } from "../lib/voyage"

export const documentTools: Anthropic.Tool[] = [
  {
    name: "search_documents",
    description:
      "Search through documents uploaded by the user (pitch decks, financial models, contracts, private filings). Use this when the user references uploaded documents or asks questions that might be answered by their own files.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Natural language question or keywords to search for in uploaded documents",
        },
      },
      required: ["query"],
    },
  },
]

export async function searchDocuments(input: unknown): Promise<string> {
  const { query } = input as { query: string }

  // Debug: check total chunk count
  const { count } = await supabaseAdmin.from("document_chunks").select("*", { count: "exact", head: true })
  console.log(`[search_documents] total chunks in DB: ${count}, query: "${query}"`)

  // Try vector search first (semantic, higher quality)
  try {
    const embedding = await embedQuery(query)
    const { data, error } = await supabaseAdmin.rpc("match_document_chunks", {
      query_embedding: `[${embedding.join(",")}]`,
      match_count: 5,
    })
    console.log(`[search_documents] vector search → rows: ${data?.length ?? 0}, error: ${error?.message ?? "none"}`)

    if (!error && data && data.length > 0) {
      return (data as any[])
        .map((row) => `[Source: ${row.document_name ?? "Unknown"}]\n${row.content}`)
        .join("\n\n---\n\n")
    }
  } catch (e) {
    console.warn("[search_documents] vector search failed, falling back to FTS:", e)
  }

  // Fallback: simple keyword scan across all chunks
  const { data: allData, error: allError } = await supabaseAdmin
    .from("document_chunks")
    .select("content, documents!inner(name)")
    .ilike("content", `%${query.split(" ")[0]}%`)
    .limit(5)

  console.log(`[search_documents] keyword fallback → rows: ${allData?.length ?? 0}, error: ${allError?.message ?? "none"}`)

  if (!allError && allData && allData.length > 0) {
    return allData
      .map((row: any) => `[Source: ${(row.documents as any)?.name ?? "Unknown document"}]\n${row.content}`)
      .join("\n\n---\n\n")
  }

  return "No relevant content found in uploaded documents."
}

export const documentHandlers: Record<string, (input: unknown) => Promise<unknown>> = {
  search_documents: searchDocuments,
}
