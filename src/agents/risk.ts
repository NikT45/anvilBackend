import type Anthropic from "@anthropic-ai/sdk"
import { runAgent } from "./runner"
import { edgarTools, edgarHandlers } from "../tools/edgar"
import { tavilySearchTool, tavilyHandlers } from "../tools/tavily"
import type { CompanyProfile, RiskSection } from "../lib/types"

const SYSTEM_PROMPT = `You are a risk analyst producing the Risk Assessment section of a due diligence report.

RESEARCH PROCESS:
- For PUBLIC companies, pull the most recent 10-K Risk Factors (Item 1A) via edgar_get_filing_text, and check 8-K filings for material events.
- Use web_search for current litigation, regulatory actions, customer concentration, supply chain issues, and red-flag news.

ANALYSIS REQUIRED — assess risks across 4 categories, each with severity (Low/Medium/High/Critical):
- **Regulatory**: litigation, investigations, compliance gaps, industry regulation
- **Financial**: leverage, liquidity, customer concentration, covenant risk, burn rate (for private)
- **Operational**: key-person, supply chain, cybersecurity, execution, technology risk
- **Market**: TAM erosion, macro headwinds, pricing power loss, disruption

Produce 6-10 specific risk factors total. Be concrete — cite actual events, filings, or data. Flag any CRITICAL risks in redFlags.

Assess overallRiskLevel holistically.

When finished, call submit_risk_analysis.`

const submitTool: Anthropic.Tool = {
  name: "submit_risk_analysis",
  description: "Submit structured risk analysis.",
  input_schema: {
    type: "object" as const,
    properties: {
      summary: { type: "string" },
      factors: {
        type: "array",
        items: {
          type: "object",
          properties: {
            category: { type: "string", enum: ["Regulatory", "Financial", "Operational", "Market"] },
            name: { type: "string", description: "Short risk name e.g. 'Customer concentration'" },
            severity: { type: "string", enum: ["Low", "Medium", "High", "Critical"] },
            description: { type: "string" },
            mitigation: { type: "string" },
          },
          required: ["category", "name", "severity", "description"],
        },
        description: "6-10 specific risks",
      },
      redFlags: { type: "array", items: { type: "string" }, description: "Critical concerns demanding attention" },
      overallRiskLevel: { type: "string", enum: ["Low", "Medium", "High", "Critical"] },
    },
    required: ["summary", "factors", "redFlags", "overallRiskLevel"],
  },
}

export async function runRiskAgent(profile: CompanyProfile, context: string, onActivity?: (desc: string) => void): Promise<RiskSection> {
  const profileLine = profile.isPublic
    ? `Company: ${profile.name} (${profile.ticker ?? ""}, CIK: ${profile.cik ?? "unknown"}) — PUBLIC`
    : `Company: ${profile.name} — PRIVATE`

  const messages = [
    {
      role: "user" as const,
      content: `${profileLine}\nDescription: ${profile.description}\n\nContext: ${context || "General DD"}\n\nConduct risk assessment and submit structured findings.`,
    },
  ]

  let result: RiskSection | null = null
  for await (const event of runAgent({
    systemPrompt: SYSTEM_PROMPT,
    tools: profile.isPublic ? [...edgarTools, tavilySearchTool] : [tavilySearchTool],
    toolHandlers: profile.isPublic ? { ...edgarHandlers, ...tavilyHandlers } : tavilyHandlers,
    messages,
    model: "claude-haiku-4-5-20251001",
    label: "risk",
    maxIterations: 10,
    terminalTool: submitTool,
  })) {
    if (event.type === "submit") result = event.data as RiskSection
    if (event.type === "tool_activity") onActivity?.(event.description)
  }

  if (!result) throw new Error("Risk agent did not submit structured analysis")
  return result
}
