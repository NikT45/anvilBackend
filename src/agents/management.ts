import { runAgent } from "./runner"
import { edgarTools, edgarHandlers } from "../tools/edgar"
import { tavilySearchTool, tavilyHandlers } from "../tools/tavily"

const SYSTEM_PROMPT = `You are an executive assessment specialist focusing on management quality and corporate governance. Your task is to produce a Management & Governance section for a due diligence report.

Using the EDGAR tools:
1. Search for the company's CIK
2. Retrieve the most recent DEF 14A (proxy statement) — this contains executive compensation, board composition, and insider ownership
3. Also check recent 10-K for management discussion

Assess:
- **Leadership Team**: CEO/CFO/key executives — tenure, prior experience, track record, domain expertise
- **Insider Ownership**: Percentage held by management and board; recent insider buying/selling trends (bullish or bearish signal)
- **Executive Compensation**: Pay vs. performance alignment; excessive perks or misaligned incentives
- **Board Quality**: Independence, diversity, relevant expertise, committee structure
- **Governance Red Flags**: Restatements, SEC investigations, related-party transactions, executive departures, dual-class share structures
- **Culture & Execution**: Capital allocation track record, M&A history, stated strategy vs. results

Output a complete markdown section starting with:
## Management & Governance

Flag any red flags clearly. Include an overall management quality rating: Exceptional / Strong / Adequate / Concerning.`

export async function runManagementAgent(company: string, context: string): Promise<string> {
  const messages = [
    {
      role: "user" as const,
      content: `Conduct a management and governance evaluation for: **${company}**\n\nContext: ${context || "General due diligence"}`,
    },
  ]

  let output = ""
  for await (const event of runAgent({
    systemPrompt: SYSTEM_PROMPT,
    tools: [...edgarTools, tavilySearchTool],
    toolHandlers: { ...edgarHandlers, ...tavilyHandlers },
    messages,
    model: "claude-haiku-4-5-20251001",
    label: "management",
  })) {
    if (event.type === "text_delta") output += event.delta
  }
  return output
}
