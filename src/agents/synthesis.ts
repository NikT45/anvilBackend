import type Anthropic from "@anthropic-ai/sdk"
import { runAgent } from "./runner"
import type {
  ExecutiveSummary,
  FinancialSection,
  MarketSection,
  RiskSection,
  ManagementSection,
  CompanyProfile,
} from "../lib/types"

const SYSTEM_PROMPT = `You are a senior investment partner making a final verdict on a due diligence report. You have four specialist sections in front of you. Your job is to render an opinionated, investor-grade executive summary.

Deliver:
- **verdict**: Favorable / Cautious / Unfavorable — this MUST be decisive, not wishy-washy
- **verdictRationale**: 2-3 sentences explaining the call
- **thesis**: 2-3 sentence investment thesis capturing the essence of the opportunity
- **keyPoints**: 4-6 bullet points highlighting the most important findings across all sections
- **whatWouldChangeVerdict**: What evidence or changes would flip this verdict
- **keyQuestions**: 5-8 sharp questions an investor should ask management before acting

Be decisive. Generic hedging is useless. Institutional investors want conviction.

Call submit_verdict when done.`

const submitTool: Anthropic.Tool = {
  name: "submit_verdict",
  description: "Submit the final executive summary and investor verdict.",
  input_schema: {
    type: "object" as const,
    properties: {
      verdict: { type: "string", enum: ["Favorable", "Cautious", "Unfavorable"] },
      verdictRationale: { type: "string" },
      thesis: { type: "string" },
      keyPoints: { type: "array", items: { type: "string" }, description: "4-6 most important findings" },
      whatWouldChangeVerdict: { type: "string" },
      keyQuestions: { type: "array", items: { type: "string" }, description: "5-8 questions for management" },
    },
    required: ["verdict", "verdictRationale", "thesis", "keyPoints", "whatWouldChangeVerdict", "keyQuestions"],
  },
}

export interface SynthesisResult {
  executiveSummary: ExecutiveSummary
  keyQuestions: string[]
}

export async function runSynthesisAgent(
  profile: CompanyProfile,
  financial: FinancialSection,
  market: MarketSection,
  risk: RiskSection,
  management: ManagementSection
): Promise<SynthesisResult> {
  const messages = [
    {
      role: "user" as const,
      content: `Render the final verdict for **${profile.name}**.

COMPANY PROFILE:
${JSON.stringify(profile, null, 2)}

FINANCIAL SECTION:
${JSON.stringify(financial, null, 2)}

MARKET SECTION:
${JSON.stringify(market, null, 2)}

RISK SECTION:
${JSON.stringify(risk, null, 2)}

MANAGEMENT SECTION:
${JSON.stringify(management, null, 2)}

Synthesize and submit the verdict.`,
    },
  ]

  type VerdictPayload = {
    verdict: string
    verdictRationale: string
    thesis: string
    keyPoints: string[]
    whatWouldChangeVerdict: string
    keyQuestions: string[]
  }
  let result: VerdictPayload | null = null
  for await (const event of runAgent({
    systemPrompt: SYSTEM_PROMPT,
    tools: [],
    toolHandlers: {},
    messages,
    model: "claude-opus-4-6",
    label: "synthesis",
    maxIterations: 3,
    maxTokens: 4096,
    terminalTool: submitTool,
  })) {
    if (event.type === "submit") {
      result = event.data as VerdictPayload
    }
  }

  if (!result) throw new Error("Synthesis agent did not submit verdict")

  return {
    executiveSummary: {
      verdict: result.verdict as ExecutiveSummary["verdict"],
      verdictRationale: result.verdictRationale,
      thesis: result.thesis,
      keyPoints: result.keyPoints,
      whatWouldChangeVerdict: result.whatWouldChangeVerdict,
    },
    keyQuestions: result.keyQuestions,
  }
}
