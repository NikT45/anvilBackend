import { runFinancialAgent } from "./financial"
import { runRiskAgent } from "./risk"
import { runCompetitiveAgent } from "./competitive"
import { runManagementAgent } from "./management"
import { runSynthesisAgent } from "./synthesis"
import { jobStore } from "../lib/job-store"
import { v4 as uuidv4 } from "uuid"
import type { DDJob, AgentName } from "../lib/types"

// Progress math: each of 4 agents = 18.75%, synthesis = 25% (starts at 75%)
const AGENT_SHARE = 18.75
const AGENT_NAMES: AgentName[] = ["financial", "risk", "competitive", "management"]

function agentOverallPct(agentIndex: number, agentInternalPct: number): number {
  return Math.round(agentIndex * AGENT_SHARE + agentInternalPct * (AGENT_SHARE / 100))
}

export async function runDispatch(job: DDJob): Promise<void> {
  const { jobId, company, context } = job
  jobStore.updateStatus(jobId, "running")
  jobStore.emit(jobId, { type: "started", jobId, company })

  // Run all 4 agents in parallel
  const agentRunners: [AgentName, () => Promise<string>][] = [
    ["financial", () => runFinancialAgent(company, context)],
    ["risk", () => runRiskAgent(company, context)],
    ["competitive", () => runCompetitiveAgent(company, context)],
    ["management", () => runManagementAgent(company, context)],
  ]

  const results = await Promise.allSettled(
    agentRunners.map(async ([name, runner], index) => {
      jobStore.updateAgent(jobId, name, "running")
      jobStore.emit(jobId, {
        type: "agent_progress",
        agent: name,
        status: "running",
        overallPct: agentOverallPct(index, 0),
      })

      try {
        const output = await runner()
        jobStore.updateAgent(jobId, name, "done", output)
        jobStore.emit(jobId, {
          type: "agent_progress",
          agent: name,
          status: "done",
          overallPct: agentOverallPct(index, 100),
          preview: output.slice(0, 200),
        })
        return output
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        jobStore.updateAgent(jobId, name, "error", "", msg)
        jobStore.emit(jobId, {
          type: "agent_progress",
          agent: name,
          status: "error",
          overallPct: agentOverallPct(index, 100),
        })
        return `## ${name.charAt(0).toUpperCase() + name.slice(1)} Analysis\n\n*Analysis unavailable: ${msg}*`
      }
    })
  )

  const [financialResult, riskResult, competitiveResult, managementResult] = results.map((r) =>
    r.status === "fulfilled" ? r.value : `*Section unavailable*`
  )

  // Synthesis
  jobStore.updateStatus(jobId, "synthesizing")
  jobStore.emit(jobId, { type: "synthesis_started" })

  try {
    const report = await runSynthesisAgent(
      company,
      financialResult,
      riskResult,
      competitiveResult,
      managementResult
    )

    const reportId = uuidv4()
    jobStore.setReport(jobId, report)
    jobStore.emit(jobId, {
      type: "report_complete",
      reportId,
      markdown: report,
      company,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    jobStore.updateStatus(jobId, "error")
    jobStore.emit(jobId, { type: "error", message: `Synthesis failed: ${msg}` })
  }
}
