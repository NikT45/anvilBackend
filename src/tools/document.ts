import type Anthropic from "@anthropic-ai/sdk"
import { supabaseAdmin } from "../lib/supabase-backend"

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
          description: "Keywords or phrase to search for in uploaded documents",
        },
      },
      required: ["query"],
    },
  },
]

export async function searchDocuments(input: unknown): Promise<string> {
  const { query } = input as { query: string }

  const { data, error } = await supabaseAdmin
    .from("document_chunks")
    .select("content, documents!inner(name)")
    .textSearch("search_vector", query, { type: "websearch" })
    .limit(5)

  if (error) return `Document search failed: ${error.message}`
  if (!data || data.length === 0) return "No relevant content found in uploaded documents."

  return data
    .map((row: any) => `[Source: ${(row.documents as any)?.name ?? "Unknown document"}]\n${row.content}`)
    .join("\n\n---\n\n")
}

export const documentHandlers: Record<string, (input: unknown) => Promise<unknown>> = {
  search_documents: searchDocuments,
}
