import type Anthropic from "@anthropic-ai/sdk"
import { runAgent } from "./runner"
import { edgarTools, edgarHandlers } from "../tools/edgar"
import { tavilySearchTool, tavilyHandlers } from "../tools/tavily"
import type { CompanyProfile, ManagementSection } from "../lib/types"

const SYSTEM_PROMPT = `You are an executive assessment analyst producing the Management & Governance section of a due diligence report.

RESEARCH PROCESS:
- For PUBLIC companies: get the most recent DEF 14A (proxy) for exec comp, board, insider ownership. Also check 10-K MD&A.
- Use web_search for executive backgrounds, recent departures, insider transactions, governance controversies.
- For PRIVATE: use web_search for founder/CEO backgrounds, LinkedIn-style data, funding rounds, board composition.

ANALYSIS REQUIRED:
- 3-6 key executives with name, title, background, tenure
- Overall management rating (Exceptional/Strong/Adequate/Concerning) with rationale
- Governance: insider ownership %, board independence, share structure (dual-class, etc.)
- Compensation: pay-for-performance alignment or misalignment
- Track record: capital allocation, M&A history, stated strategy vs. actual results
- Concerns: departures, restatements, related-party transactions, governance red flags

Be direct and opinionated.

When finished, call submit_management_analysis.`

const submitTool: Anthropic.Tool = {
  name: "submit_management_analysis",
  description: "Submit structured management and governance analysis.",
  input_schema: {
    type: "object" as const,
    properties: {
      summary: { type: "string" },
      rating: { type: "string", enum: ["Exceptional", "Strong", "Adequate", "Concerning"] },
      ratingRationale: { type: "string" },
      keyExecutives: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            title: { type: "string" },
            background: { type: "string" },
            tenure: { type: "string" },
          },
          required: ["name", "title", "background"],
        },
      },
      governance: {
        type: "object",
        properties: {
          insiderOwnership: { type: "string" },
          boardIndependence: { type: "string" },
          shareStructure: { type: "string" },
          commentary: { type: "string" },
        },
        required: ["commentary"],
      },
      compensation: { type: "string" },
      trackRecord: { type: "string" },
      concerns: { type: "array", items: { type: "string" } },
    },
    required: ["summary", "rating", "ratingRationale", "keyExecutives", "governance", "compensation", "trackRecord", "concerns"],
  },
}

export async function runManagementAgent(profile: CompanyProfile, context: string, onActivity?: (desc: string) => void): Promise<ManagementSection> {
  const profileLine = profile.isPublic
    ? `Company: ${profile.name} (${profile.ticker ?? ""}, CIK: ${profile.cik ?? "unknown"}) — PUBLIC`
    : `Company: ${profile.name} — PRIVATE`

  const messages = [
    {
      role: "user" as const,
      content: `${profileLine}\nDescription: ${profile.description}\n\nContext: ${context || "General DD"}\n\nConduct management evaluation and submit structured findings.`,
    },
  ]

  let result: ManagementSection | null = null
  for await (const event of runAgent({
    systemPrompt: SYSTEM_PROMPT,
    tools: profile.isPublic ? [...edgarTools, tavilySearchTool] : [tavilySearchTool],
    toolHandlers: profile.isPublic ? { ...edgarHandlers, ...tavilyHandlers } : tavilyHandlers,
    messages,
    model: "claude-haiku-4-5-20251001",
    label: "management",
    maxIterations: 10,
    terminalTool: submitTool,
  })) {
    if (event.type === "submit") result = event.data as ManagementSection
    if (event.type === "tool_activity") onActivity?.(event.description)
  }

  if (!result) throw new Error("Management agent did not submit structured analysis")
  return result
}
