import { runAgent } from "./runner"
import { edgarTools, edgarHandlers } from "../tools/edgar"

const SYSTEM_PROMPT = `You are a senior equity research analyst specializing in financial statement analysis. Your task is to produce a rigorous Financial Analysis section for a due diligence report.

Using the EDGAR tools available to you:
1. Search for the company's CIK number
2. Retrieve their last 3 annual 10-K filings
3. Pull key XBRL financial facts: Revenues, NetIncomeLoss, OperatingIncomeLoss, Assets, Liabilities, CashAndCashEquivalentsAtCarryingValue
4. Analyze and compute where possible:
   - Revenue trajectory and 3-year CAGR
   - Gross, operating, and net margin trends
   - Balance sheet strength (debt/equity, current ratio, cash position)
   - Free cash flow quality and FCF conversion rate
   - Key ratios context (ROIC, ROE where computable)

Output a complete markdown section starting with:
## Financial Analysis

Use tables where appropriate. Be specific with numbers. Note any data gaps and flag anomalies.`

export async function runFinancialAgent(company: string, context: string): Promise<string> {
  const messages = [
    {
      role: "user" as const,
      content: `Conduct a financial analysis for: **${company}**\n\nContext: ${context || "General due diligence"}`,
    },
  ]

  let output = ""
  for await (const event of runAgent({
    systemPrompt: SYSTEM_PROMPT,
    tools: edgarTools,
    toolHandlers: edgarHandlers,
    messages,
    model: "claude-haiku-4-5-20251001",
    label: "financial",
  })) {
    if (event.type === "text_delta") output += event.delta
  }
  return output
}
