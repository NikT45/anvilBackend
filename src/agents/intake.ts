import type Anthropic from "@anthropic-ai/sdk"
import { runAgent } from "./runner"
import { edgarTools, edgarHandlers } from "../tools/edgar"
import { tavilySearchTool, tavilyHandlers } from "../tools/tavily"
import type { CompanyProfile } from "../lib/types"

const SYSTEM_PROMPT = `You are a research analyst performing intake on a company for a due diligence report. Your job is to identify the company, classify it, and gather baseline metadata.

Steps:
1. Use edgar_search_company to check if this is a US-listed public company. If a CIK is found, set isPublic=true and record it.
2. Use web_search to confirm the company identity and gather metadata: sector, industry, HQ, founding year, employee count, website, brief description.
3. If EDGAR returns no match, the company is likely private/international — rely on web_search and note that in confidenceNote.

Be precise. If the user's query is ambiguous (e.g. "Apple" could be Apple Inc. or Apple Hospitality REIT), pick the most likely match based on context and note the disambiguation.

When finished, call the submit_company_profile tool with all fields populated. Do NOT output narrative text — just research and submit.`

const submitCompanyProfileTool: Anthropic.Tool = {
  name: "submit_company_profile",
  description: "Submit the finalized company profile after research is complete.",
  input_schema: {
    type: "object" as const,
    properties: {
      name: { type: "string", description: "Common name" },
      legalName: { type: "string", description: "Full legal entity name if different" },
      ticker: { type: "string", description: "Stock ticker if public" },
      cik: { type: "string", description: "SEC CIK number if public" },
      isPublic: { type: "boolean", description: "True if US-publicly-traded" },
      sector: { type: "string" },
      industry: { type: "string" },
      description: { type: "string", description: "2-3 sentence overview of what the company does" },
      hq: { type: "string", description: "Headquarters location" },
      founded: { type: "string", description: "Year founded" },
      employees: { type: "string", description: "Employee count, approximate ok" },
      website: { type: "string", description: "Primary website URL" },
    },
    required: ["name", "isPublic", "description"],
  },
}

export async function runIntakeAgent(company: string, context: string, onActivity?: (desc: string) => void): Promise<CompanyProfile> {
  const messages = [
    {
      role: "user" as const,
      content: `Identify and profile: **${company}**\n\nContext: ${context || "General due diligence"}\n\nResearch the company, determine if public or private, and submit the complete profile.`,
    },
  ]

  let profile: CompanyProfile | null = null
  for await (const event of runAgent({
    systemPrompt: SYSTEM_PROMPT,
    tools: [...edgarTools, tavilySearchTool],
    toolHandlers: { ...edgarHandlers, ...tavilyHandlers },
    messages,
    model: "claude-haiku-4-5-20251001",
    label: "intake",
    maxIterations: 8,
    terminalTool: submitCompanyProfileTool,
  })) {
    if (event.type === "submit") {
      profile = event.data as CompanyProfile
    }
    if (event.type === "tool_activity") onActivity?.(event.description)
  }

  if (!profile) {
    // Fallback profile
    return {
      name: company,
      isPublic: false,
      description: `${company} — profile could not be fully researched`,
    }
  }
  return profile
}
