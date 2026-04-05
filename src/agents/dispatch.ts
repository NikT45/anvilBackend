import { runIntakeAgent } from "./intake"
import { runFinancialAgent } from "./financial"
import { runMarketAgent } from "./market"
import { runRiskAgent } from "./risk"
import { runManagementAgent } from "./management"
import { runSynthesisAgent } from "./synthesis"
import { jobStore } from "../lib/job-store"
import { v4 as uuidv4 } from "uuid"
import type {
  DDJob,
  AgentName,
  StructuredReport,
  FinancialSection,
  MarketSection,
  RiskSection,
  ManagementSection,
  CompanyProfile,
} from "../lib/types"

// Progress: intake=10%, 4 agents = 65% (16.25% each), synthesis = 25%
const STAGES: Array<{ name: AgentName; share: number }> = [
  { name: "intake", share: 10 },
  { name: "financial", share: 16.25 },
  { name: "market", share: 16.25 },
  { name: "risk", share: 16.25 },
  { name: "management", share: 16.25 },
  { name: "synthesis", share: 25 },
]

function cumulativePctBefore(index: number): number {
  return Math.round(STAGES.slice(0, index).reduce((s, st) => s + st.share, 0))
}

function cumulativePctAfter(index: number): number {
  return Math.round(STAGES.slice(0, index + 1).reduce((s, st) => s + st.share, 0))
}

export async function runDispatch(job: DDJob): Promise<void> {
  const { jobId, company, context } = job
  console.log(`\n[dispatch] ── starting DD job ${jobId} for "${company}" ──`)
  jobStore.updateStatus(jobId, "running")
  jobStore.emit(jobId, { type: "started", jobId, company })

  // ─── Stage 0: Intake ────────────────────────────────────────────────────────
  let profile: CompanyProfile
  try {
    jobStore.updateAgent(jobId, "intake", "running")
    jobStore.emit(jobId, {
      type: "agent_progress",
      agent: "intake",
      status: "running",
      overallPct: cumulativePctBefore(0),
    })
    console.log(`[dispatch] intake started`)
    profile = await runIntakeAgent(company, context)
    console.log(`[dispatch] intake done — ${profile.isPublic ? "PUBLIC" : "PRIVATE"} (${profile.ticker ?? "no ticker"})`)
    jobStore.setCompanyProfile(jobId, profile)
    jobStore.updateAgent(jobId, "intake", "done", profile)
    jobStore.emit(jobId, { type: "intake_complete", profile })
    jobStore.emit(jobId, {
      type: "agent_progress",
      agent: "intake",
      status: "done",
      overallPct: cumulativePctAfter(0),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[dispatch] intake error — ${msg}`)
    jobStore.updateAgent(jobId, "intake", "error", null, msg)
    jobStore.emit(jobId, { type: "error", message: `Intake failed: ${msg}`, agent: "intake" })
    return
  }

  // ─── Stage 1-4: Research agents (sequential) ────────────────────────────────
  const sections: {
    financial?: FinancialSection
    market?: MarketSection
    risk?: RiskSection
    management?: ManagementSection
  } = {}

  const researchRunners: Array<[AgentName, () => Promise<unknown>]> = [
    ["financial", () => runFinancialAgent(profile, context)],
    ["market", () => runMarketAgent(profile, context)],
    ["risk", () => runRiskAgent(profile, context)],
    ["management", () => runManagementAgent(profile, context)],
  ]

  for (let i = 0; i < researchRunners.length; i++) {
    const [name, runner] = researchRunners[i]
    const stageIdx = i + 1

    jobStore.updateAgent(jobId, name, "running")
    jobStore.emit(jobId, {
      type: "agent_progress",
      agent: name,
      status: "running",
      overallPct: cumulativePctBefore(stageIdx),
    })
    console.log(`[dispatch] ${name} started`)

    try {
      const result = await runner()
      ;(sections as Record<string, unknown>)[name] = result
      jobStore.updateAgent(jobId, name, "done", result)
      jobStore.emit(jobId, {
        type: "agent_progress",
        agent: name,
        status: "done",
        overallPct: cumulativePctAfter(stageIdx),
      })
      console.log(`[dispatch] ${name} done`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[dispatch] ${name} error — ${msg}`)
      jobStore.updateAgent(jobId, name, "error", null, msg)
      jobStore.emit(jobId, {
        type: "agent_progress",
        agent: name,
        status: "error",
        overallPct: cumulativePctAfter(stageIdx),
      })
      // Continue with other agents even if one fails
    }
  }

  // ─── Stage 5: Synthesis ─────────────────────────────────────────────────────
  console.log(`[dispatch] synthesis started`)
  jobStore.updateStatus(jobId, "synthesizing")
  jobStore.updateAgent(jobId, "synthesis", "running")
  jobStore.emit(jobId, { type: "synthesis_started" })
  jobStore.emit(jobId, {
    type: "agent_progress",
    agent: "synthesis",
    status: "running",
    overallPct: cumulativePctBefore(5),
  })

  try {
    const financial = sections.financial ?? emptyFinancial()
    const market = sections.market ?? emptyMarket()
    const risk = sections.risk ?? emptyRisk()
    const management = sections.management ?? emptyManagement()

    const synth = await runSynthesisAgent(profile, financial, market, risk, management)

    const dataSources: string[] = []
    if (profile.isPublic && profile.cik) dataSources.push("SEC EDGAR")
    dataSources.push("Tavily Web Search")
    dataSources.push("Model Knowledge")

    const confidenceNote = profile.isPublic
      ? "Analysis draws on official SEC filings supplemented with real-time web search. Figures reflect most-recent available public filings."
      : "Private company — analysis relies on web sources and public reporting. Financial data may be incomplete or based on third-party estimates."

    const report: StructuredReport = {
      company: profile,
      executiveSummary: synth.executiveSummary,
      financial,
      market,
      risk,
      management,
      keyQuestions: synth.keyQuestions,
      sources: [
        ...(profile.isPublic ? [{ label: "SEC EDGAR Filings", type: "filing" as const }] : []),
        { label: "Web Search (Tavily)", type: "web" as const },
      ],
      metadata: {
        generatedAt: new Date().toISOString(),
        dataSources,
        confidenceNote,
      },
    }

    const reportId = uuidv4()
    console.log(`[dispatch] ── report complete: ${reportId} ──\n`)
    jobStore.setReport(jobId, report)
    jobStore.updateAgent(jobId, "synthesis", "done", synth)
    jobStore.emit(jobId, {
      type: "agent_progress",
      agent: "synthesis",
      status: "done",
      overallPct: 100,
    })
    jobStore.emit(jobId, {
      type: "report_complete",
      reportId,
      report,
      company: profile.name,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[dispatch] synthesis error — ${msg}`)
    jobStore.updateStatus(jobId, "error")
    jobStore.updateAgent(jobId, "synthesis", "error", null, msg)
    jobStore.emit(jobId, { type: "error", message: `Synthesis failed: ${msg}`, agent: "synthesis" })
  }
}

// ─── Fallbacks for when agents fail ─────────────────────────────────────────

function emptyFinancial(): FinancialSection {
  return {
    summary: "Financial analysis unavailable.",
    keyMetrics: [],
    revenueHistory: [],
    profitability: { commentary: "Not available." },
    balanceSheet: { commentary: "Not available." },
    cashFlow: { commentary: "Not available." },
    strengths: [],
    concerns: [],
    dataLimitations: "Financial agent failed — see logs.",
  }
}
function emptyMarket(): MarketSection {
  return {
    summary: "Market analysis unavailable.",
    positioning: "Niche",
    positioningRationale: "Not available.",
    moat: { strength: "None", description: "Not available.", durability: "Not available." },
    competitors: [],
    marketTrends: [],
    porters: {
      competitiveRivalry: "N/A",
      supplierPower: "N/A",
      buyerPower: "N/A",
      threatOfSubstitutes: "N/A",
      threatOfNewEntrants: "N/A",
    },
  }
}
function emptyRisk(): RiskSection {
  return {
    summary: "Risk analysis unavailable.",
    factors: [],
    redFlags: [],
    overallRiskLevel: "Medium",
  }
}
function emptyManagement(): ManagementSection {
  return {
    summary: "Management analysis unavailable.",
    rating: "Adequate",
    ratingRationale: "Not available.",
    keyExecutives: [],
    governance: { commentary: "Not available." },
    compensation: "Not available.",
    trackRecord: "Not available.",
    concerns: [],
  }
}
