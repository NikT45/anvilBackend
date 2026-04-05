import type Anthropic from "@anthropic-ai/sdk"

export const triggerDdReportTool: Anthropic.Tool = {
  name: "trigger_dd_report",
  description:
    "Trigger a comprehensive due diligence report for a company. Call this when the user explicitly asks for a diligence report, a full analysis, or when the conversation makes clear a deep-dive is needed. This will spin up a parallel multi-agent analysis pipeline.",
  input_schema: {
    type: "object" as const,
    properties: {
      company: {
        type: "string",
        description: "The company name or ticker symbol to analyze",
      },
      context: {
        type: "string",
        description:
          "Additional context from the conversation — investment thesis, specific concerns, sector, deal type, etc.",
      },
    },
    required: ["company"],
  },
}
