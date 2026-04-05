import { EventEmitter } from "events"
import type {
  DDJob,
  AgentName,
  AgentStatus,
  SSEEvent,
  CompanyProfile,
  StructuredReport,
} from "./types"

class DDJobStore {
  private jobs = new Map<string, DDJob>()
  private emitters = new Map<string, EventEmitter>()

  create(jobId: string, company: string, context: string): DDJob {
    const emptyResult = (name: AgentName) => ({
      name,
      status: "queued" as AgentStatus,
      output: null,
    })
    const job: DDJob = {
      jobId,
      company,
      context,
      status: "pending",
      agents: {
        intake: emptyResult("intake"),
        financial: emptyResult("financial"),
        market: emptyResult("market"),
        risk: emptyResult("risk"),
        management: emptyResult("management"),
        synthesis: emptyResult("synthesis"),
      },
      createdAt: Date.now(),
    }
    this.jobs.set(jobId, job)
    const emitter = new EventEmitter()
    emitter.setMaxListeners(20)
    this.emitters.set(jobId, emitter)
    return job
  }

  get(jobId: string): DDJob | undefined {
    return this.jobs.get(jobId)
  }

  emit(jobId: string, event: SSEEvent) {
    try {
      this.emitters.get(jobId)?.emit("event", event)
    } catch (err) {
      console.warn(`[job-store] emit swallowed error for ${jobId}:`, err instanceof Error ? err.message : err)
    }
  }

  subscribe(jobId: string, listener: (event: SSEEvent) => void): () => void {
    const emitter = this.emitters.get(jobId)
    if (!emitter) return () => {}
    emitter.on("event", listener)
    return () => emitter.off("event", listener)
  }

  updateAgent(jobId: string, agent: AgentName, status: AgentStatus, output?: unknown, error?: string) {
    const job = this.jobs.get(jobId)
    if (!job) return
    job.agents[agent].status = status
    if (output !== undefined) job.agents[agent].output = output
    if (error !== undefined) job.agents[agent].error = error
  }

  updateStatus(jobId: string, status: DDJob["status"]) {
    const job = this.jobs.get(jobId)
    if (job) job.status = status
  }

  setCompanyProfile(jobId: string, profile: CompanyProfile) {
    const job = this.jobs.get(jobId)
    if (job) job.companyProfile = profile
  }

  setReport(jobId: string, report: StructuredReport) {
    const job = this.jobs.get(jobId)
    if (job) {
      job.report = report
      job.status = "complete"
    }
  }
}

export const jobStore = new DDJobStore()
