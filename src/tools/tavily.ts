import { tavily } from "@tavily/core"
import type Anthropic from "@anthropic-ai/sdk"
import { env } from "../env"

// ─── Tool definition ──────────────────────────────────────────────────────────

export const tavilySearchTool: Anthropic.Tool = {
  name: "web_search",
  description:
    "Search the web for current information about a company, its competitors, management, industry news, or market data. Use this for anything not covered by SEC filings — recent news, executive backgrounds, competitor info, analyst commentary, market sizing.",
  input_schema: {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description: "The search query. Be specific — include company name, topic, and timeframe if relevant.",
      },
      max_results: {
        type: "number",
        description: "Number of results to return (default 5, max 10)",
      },
    },
    required: ["query"],
  },
}

// ─── Tool handler ─────────────────────────────────────────────────────────────

export async function tavilySearch(input: unknown): Promise<string> {
  const { query, max_results = 5 } = input as { query: string; max_results?: number }

  if (!env.TAVILY_API_KEY) {
    return `Web search unavailable — TAVILY_API_KEY not set. Using model knowledge only.`
  }

  try {
    const client = tavily({ apiKey: env.TAVILY_API_KEY })
    const response = await client.search(query, {
      maxResults: Math.min(max_results, 10),
      searchDepth: "basic",
    })

    if (!response.results?.length) return `No results found for: "${query}"`

    const formatted = response.results
      .map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.content?.slice(0, 400) ?? ""}`)
      .join("\n\n")

    return `Search results for: "${query}"\n\n${formatted}`
  } catch (err) {
    return `Web search error: ${err instanceof Error ? err.message : String(err)}`
  }
}

export const tavilyHandlers: Record<string, (input: unknown) => Promise<unknown>> = {
  web_search: tavilySearch,
}
