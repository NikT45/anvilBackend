import { runAgent } from "./runner"
import { edgarTools, edgarHandlers } from "../tools/edgar"

const SYSTEM_PROMPT = `You are a risk analyst specializing in public company due diligence. Your task is to produce a Risk Assessment section for a due diligence report.

Using the EDGAR tools:
1. Search for the company's CIK
2. Retrieve their most recent 10-K filing
3. Extract and analyze the Risk Factors section (Item 1A)
4. Also review any recent 8-K filings for material events

Assess and score risks across four categories (Low / Medium / High / Critical):
- **Regulatory**: pending litigation, SEC investigations, industry regulation trends, compliance gaps
- **Financial**: leverage/debt load, liquidity, revenue concentration, customer churn, covenant risks
- **Operational**: key-person dependency, supply chain exposure, technology/cybersecurity risks, execution risk
- **Market**: TAM shrinkage, macro headwinds, pricing power erosion, competitive disruption

Output a complete markdown section starting with:
## Risk Assessment

Include a risk matrix table (Risk | Category | Severity | Description) followed by narrative for each category. Flag any Critical risks prominently.`

export async function runRiskAgent(company: string, context: string): Promise<string> {
  const messages = [
    {
      role: "user" as const,
      content: `Conduct a risk assessment for: **${company}**\n\nContext: ${context || "General due diligence"}`,
    },
  ]

  let output = ""
  for await (const event of runAgent({
    systemPrompt: SYSTEM_PROMPT,
    tools: edgarTools,
    toolHandlers: edgarHandlers,
    messages,
    model: "claude-haiku-4-5-20251001",
    label: "risk",
  })) {
    if (event.type === "text_delta") output += event.delta
  }
  return output
}
