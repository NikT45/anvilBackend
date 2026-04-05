import { runFinancialAgent } from "./financial"
import { runRiskAgent } from "./risk"
import { runCompetitiveAgent } from "./competitive"
import { runManagementAgent } from "./management"
import { runSynthesisAgent } from "./synthesis"
import { jobStore } from "../lib/job-store"
import { v4 as uuidv4 } from "uuid"
import type { DDJob, AgentName } from "../lib/types"

const AGENT_ORDER: AgentName[] = ["financial", "risk", "competitive", "management"]
// 4 agents × 18.75% = 75%, synthesis = 25%
const AGENT_SHARE = 18.75

type AgentRunner = () => Promise<string>

export async function runDispatch(job: DDJob): Promise<void> {
  const { jobId, company, context } = job
  console.log(`\n[dispatch] ── starting DD job ${jobId} for "${company}" ──`)
  jobStore.updateStatus(jobId, "running")
  jobStore.emit(jobId, { type: "started", jobId, company })

  const runners: [AgentName, AgentRunner][] = [
    ["financial", () => runFinancialAgent(company, context)],
    ["risk", () => runRiskAgent(company, context)],
    ["competitive", () => runCompetitiveAgent(company, context)],
    ["management", () => runManagementAgent(company, context)],
  ]

  const sections: Record<AgentName, string> = {
    financial: "",
    risk: "",
    competitive: "",
    management: "",
  }

  // Run agents sequentially to avoid rate limits
  for (let i = 0; i < runners.length; i++) {
    const [name, runner] = runners[i]
    const startPct = Math.round(i * AGENT_SHARE)

    jobStore.updateAgent(jobId, name, "running")
    jobStore.emit(jobId, {
      type: "agent_progress",
      agent: name,
      status: "running",
      overallPct: startPct,
    })
    console.log(`[dispatch] agent:${name} started`)

    try {
      const output = await runner()
      console.log(`[dispatch] agent:${name} done — ${output.length} chars`)
      sections[name] = output
      jobStore.updateAgent(jobId, name, "done", output)
      jobStore.emit(jobId, {
        type: "agent_progress",
        agent: name,
        status: "done",
        overallPct: Math.round((i + 1) * AGENT_SHARE),
        preview: output.slice(0, 200),
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[dispatch] agent:${name} error — ${msg}`)
      sections[name] = `## ${name.charAt(0).toUpperCase() + name.slice(1)} Analysis\n\n*Analysis unavailable: ${msg}*`
      jobStore.updateAgent(jobId, name, "error", "", msg)
      jobStore.emit(jobId, {
        type: "agent_progress",
        agent: name,
        status: "error",
        overallPct: Math.round((i + 1) * AGENT_SHARE),
      })
    }
  }

  // Synthesis
  console.log(`[dispatch] all agents complete — starting synthesis`)
  jobStore.updateStatus(jobId, "synthesizing")
  jobStore.emit(jobId, { type: "synthesis_started" })

  try {
    const report = await runSynthesisAgent(
      company,
      sections.financial,
      sections.risk,
      sections.competitive,
      sections.management,
      (delta) => jobStore.emit(jobId, { type: "synthesis_delta", delta })
    )

    const reportId = uuidv4()
    console.log(`[dispatch] ── report complete: ${reportId} (${report.length} chars) ──\n`)
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
