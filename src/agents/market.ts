import type Anthropic from "@anthropic-ai/sdk"
import { runAgent } from "./runner"
import { edgarTools, edgarHandlers } from "../tools/edgar"
import { tavilySearchTool, tavilyHandlers } from "../tools/tavily"
import type { CompanyProfile, MarketSection } from "../lib/types"

const SYSTEM_PROMPT = `You are a competitive strategy analyst producing the Market & Competitive Landscape section of a due diligence report.

RESEARCH PROCESS:
- For PUBLIC companies, check the 10-K Business section (Item 1) for self-reported competitive positioning via edgar_get_filing_text.
- Use web_search to find current competitor news, market share data, analyst commentary, industry reports, and TAM estimates.

ANALYSIS REQUIRED:
- Market positioning (Leader / Challenger / Niche / Emerging) with clear rationale
- Moat strength (Strong / Moderate / Weak / None) — assess network effects, switching costs, brand, scale, IP
- Moat durability — is the advantage widening or narrowing and why
- 3-5 named competitors with relative positioning commentary
- TAM estimate with source rationale
- 3-5 key market trends shaping the industry
- Porter's Five Forces — ONE CONCISE SENTENCE per force

Be opinionated and specific. Generic analysis is not useful.

When finished, call submit_market_analysis with the complete structured analysis.`

const submitTool: Anthropic.Tool = {
  name: "submit_market_analysis",
  description: "Submit structured market and competitive analysis.",
  input_schema: {
    type: "object" as const,
    properties: {
      summary: { type: "string", description: "2-3 paragraph overview" },
      positioning: {
        type: "string",
        enum: ["Leader", "Challenger", "Niche", "Emerging"],
      },
      positioningRationale: { type: "string" },
      moat: {
        type: "object",
        properties: {
          strength: { type: "string", enum: ["Strong", "Moderate", "Weak", "None"] },
          description: { type: "string" },
          durability: { type: "string", description: "Is moat widening or narrowing and why" },
        },
        required: ["strength", "description", "durability"],
      },
      competitors: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            relativePositioning: { type: "string" },
            note: { type: "string" },
          },
          required: ["name", "relativePositioning"],
        },
      },
      tamEstimate: { type: "string", description: "e.g. $450B" },
      tamRationale: { type: "string" },
      marketTrends: { type: "array", items: { type: "string" } },
      porters: {
        type: "object",
        properties: {
          competitiveRivalry: { type: "string" },
          supplierPower: { type: "string" },
          buyerPower: { type: "string" },
          threatOfSubstitutes: { type: "string" },
          threatOfNewEntrants: { type: "string" },
        },
        required: ["competitiveRivalry", "supplierPower", "buyerPower", "threatOfSubstitutes", "threatOfNewEntrants"],
      },
    },
    required: ["summary", "positioning", "positioningRationale", "moat", "competitors", "marketTrends", "porters"],
  },
}

export async function runMarketAgent(profile: CompanyProfile, context: string, onActivity?: (desc: string) => void): Promise<MarketSection> {
  const profileLine = profile.isPublic
    ? `Company: ${profile.name} (${profile.ticker ?? ""}) — PUBLIC`
    : `Company: ${profile.name} — PRIVATE`

  const messages = [
    {
      role: "user" as const,
      content: `${profileLine}\nSector: ${profile.sector ?? "unknown"}\nDescription: ${profile.description}\n\nContext: ${context || "General DD"}\n\nConduct competitive landscape analysis and submit structured findings.`,
    },
  ]

  let result: MarketSection | null = null
  for await (const event of runAgent({
    systemPrompt: SYSTEM_PROMPT,
    tools: profile.isPublic ? [...edgarTools, tavilySearchTool] : [tavilySearchTool],
    toolHandlers: profile.isPublic ? { ...edgarHandlers, ...tavilyHandlers } : tavilyHandlers,
    messages,
    model: "claude-haiku-4-5-20251001",
    label: "market",
    maxIterations: 10,
    terminalTool: submitTool,
  })) {
    if (event.type === "submit") result = event.data as MarketSection
    if (event.type === "tool_activity") onActivity?.(event.description)
  }

  if (!result) throw new Error("Market agent did not submit structured analysis")
  return result
}
