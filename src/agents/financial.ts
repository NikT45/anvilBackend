import type Anthropic from "@anthropic-ai/sdk"
import { runAgent } from "./runner"
import { edgarTools, edgarHandlers } from "../tools/edgar"
import { tavilySearchTool, tavilyHandlers } from "../tools/tavily"
import type { CompanyProfile, FinancialSection } from "../lib/types"

const SYSTEM_PROMPT = `You are a senior equity research analyst producing the Financial Analysis section of a due diligence report.

RESEARCH PROCESS:
- If the company is PUBLIC and a CIK is provided, use EDGAR tools: pull 3yr of 10-K XBRL facts (Revenues, NetIncomeLoss, OperatingIncomeLoss, GrossProfit, Assets, Liabilities, CashAndCashEquivalentsAtCarryingValue, LongTermDebtNoncurrent, NetCashProvidedByUsedInOperatingActivities).
- If PRIVATE or EDGAR fails, use web_search to find most-recent reported financials (press releases, funding announcements, news articles, industry reports). Note data limitations explicitly.

ANALYSIS REQUIRED:
- Revenue trajectory (3yr trend, growth rates)
- Margin analysis (gross/operating/net where computable)
- Balance sheet strength (cash, debt, leverage)
- Cash flow quality (OCF, FCF, conversion)
- Identify 2-4 financial strengths and 2-4 financial concerns
- If data is limited, explicitly state what's missing

Be specific with numbers. Always cite figures with units (e.g. "$394.3B", "23.4%", "down from $387B"). When submitting, use short, scannable metric labels.

When finished, call submit_financial_analysis with the complete structured analysis. Do not output narrative text directly.`

const submitTool: Anthropic.Tool = {
  name: "submit_financial_analysis",
  description: "Submit the structured financial analysis.",
  input_schema: {
    type: "object" as const,
    properties: {
      summary: { type: "string", description: "2-3 paragraph executive summary of financial position" },
      keyMetrics: {
        type: "array",
        items: {
          type: "object",
          properties: {
            label: { type: "string" },
            value: { type: "string" },
            note: { type: "string" },
          },
          required: ["label", "value"],
        },
        description: "4-8 key headline metrics (e.g. Revenue TTM, Operating Margin, FCF, Net Cash Position)",
      },
      revenueHistory: {
        type: "array",
        items: {
          type: "object",
          properties: {
            period: { type: "string", description: "Fiscal period e.g. FY2023" },
            value: { type: "string", description: "Revenue with unit e.g. $394.3B" },
            yoyPct: { type: "string", description: "YoY growth e.g. +8.2% or -3.1%" },
          },
          required: ["period", "value"],
        },
      },
      profitability: {
        type: "object",
        properties: {
          grossMargin: { type: "string" },
          operatingMargin: { type: "string" },
          netMargin: { type: "string" },
          commentary: { type: "string" },
        },
        required: ["commentary"],
      },
      balanceSheet: {
        type: "object",
        properties: {
          cashPosition: { type: "string" },
          totalDebt: { type: "string" },
          netDebt: { type: "string" },
          commentary: { type: "string" },
        },
        required: ["commentary"],
      },
      cashFlow: {
        type: "object",
        properties: {
          operatingCashFlow: { type: "string" },
          freeCashFlow: { type: "string" },
          commentary: { type: "string" },
        },
        required: ["commentary"],
      },
      strengths: { type: "array", items: { type: "string" }, description: "2-4 specific financial strengths" },
      concerns: { type: "array", items: { type: "string" }, description: "2-4 specific financial concerns" },
      dataLimitations: { type: "string", description: "If private/limited, what data was unavailable" },
    },
    required: ["summary", "keyMetrics", "revenueHistory", "profitability", "balanceSheet", "cashFlow", "strengths", "concerns"],
  },
}

export async function runFinancialAgent(profile: CompanyProfile, context: string, onActivity?: (desc: string) => void): Promise<FinancialSection> {
  const profileLine = profile.isPublic
    ? `Company: ${profile.name} (${profile.ticker ?? ""}, CIK: ${profile.cik ?? "unknown"}) — PUBLIC`
    : `Company: ${profile.name} — PRIVATE (no EDGAR data, use web sources)`

  const messages = [
    {
      role: "user" as const,
      content: `${profileLine}\n\nDescription: ${profile.description}\n\nContext: ${context || "General DD"}\n\nConduct the financial analysis and submit structured findings.`,
    },
  ]

  let result: FinancialSection | null = null
  for await (const event of runAgent({
    systemPrompt: SYSTEM_PROMPT,
    tools: profile.isPublic ? [...edgarTools, tavilySearchTool] : [tavilySearchTool],
    toolHandlers: profile.isPublic ? { ...edgarHandlers, ...tavilyHandlers } : tavilyHandlers,
    messages,
    model: "claude-haiku-4-5-20251001",
    label: "financial",
    maxIterations: 12,
    maxTokens: 8192,
    terminalTool: submitTool,
  })) {
    if (event.type === "submit") result = event.data as FinancialSection
    if (event.type === "tool_activity") onActivity?.(event.description)
  }

  if (!result) throw new Error("Financial agent did not submit structured analysis")
  return result
}
