import { runAgent } from "./runner"
import { edgarTools, edgarHandlers } from "../tools/edgar"
import { tavilySearchTool, tavilyHandlers } from "../tools/tavily"

const SYSTEM_PROMPT = `You are a competitive intelligence analyst specializing in market positioning and strategic analysis. Your task is to produce a Competitive Landscape section for a due diligence report.

Using EDGAR tools for filing data and web_search for current market intelligence:
1. Search for the company's CIK and review their 10-K Business section (Item 1) for self-reported competitive positioning
2. Use web_search to find current competitor news, market share data, analyst commentary, and recent industry developments

Analyze and produce:
- **Market Position**: Leader / Challenger / Niche player — with rationale
- **Competitive Moat**: Assess strength of network effects, switching costs, brand, cost advantages, IP/patents
- **Top Competitors**: 3-5 named competitors with brief comparative commentary (revenue scale, positioning, strengths)
- **TAM Estimate**: Total addressable market with source rationale
- **Porter's Five Forces**: Concise assessment of each force
- **Moat Durability**: Is the competitive advantage widening or narrowing?

Output a complete markdown section starting with:
## Competitive Landscape

Use tables for competitor comparison. Be specific and opinionated — generic analysis is not useful.`

export async function runCompetitiveAgent(company: string, context: string): Promise<string> {
  const messages = [
    {
      role: "user" as const,
      content: `Conduct a competitive landscape analysis for: **${company}**\n\nContext: ${context || "General due diligence"}`,
    },
  ]

  let output = ""
  for await (const event of runAgent({
    systemPrompt: SYSTEM_PROMPT,
    tools: [...edgarTools, tavilySearchTool],
    toolHandlers: { ...edgarHandlers, ...tavilyHandlers },
    messages,
    model: "claude-haiku-4-5-20251001",
    label: "competitive",
  })) {
    if (event.type === "text_delta") output += event.delta
  }
  return output
}
