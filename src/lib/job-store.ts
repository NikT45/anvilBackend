import { EventEmitter } from "events"
import type { DDJob, AgentName, AgentStatus, SSEEvent } from "./types"

class DDJobStore {
  private jobs = new Map<string, DDJob>()
  private emitters = new Map<string, EventEmitter>()

  create(jobId: string, company: string, context: string): DDJob {
    const job: DDJob = {
      jobId,
      company,
      context,
      status: "pending",
      agents: {
        financial: { name: "financial", status: "queued", output: "" },
        risk: { name: "risk", status: "queued", output: "" },
        competitive: { name: "competitive", status: "queued", output: "" },
        management: { name: "management", status: "queued", output: "" },
      },
      synthesisMarkdown: "",
      reportMarkdown: "",
      createdAt: Date.now(),
    }
    this.jobs.set(jobId, job)
    this.emitters.set(jobId, new EventEmitter())
    return job
  }

  get(jobId: string): DDJob | undefined {
    return this.jobs.get(jobId)
  }

  emit(jobId: string, event: SSEEvent) {
    try {
      this.emitters.get(jobId)?.emit("event", event)
    } catch (err) {
      // listener threw (e.g. closed SSE stream) — don't propagate
      console.warn(`[job-store] emit swallowed error for job ${jobId}:`, err instanceof Error ? err.message : err)
    }
  }

  subscribe(jobId: string, listener: (event: SSEEvent) => void): () => void {
    const emitter = this.emitters.get(jobId)
    if (!emitter) return () => {}
    emitter.on("event", listener)
    return () => emitter.off("event", listener)
  }

  updateAgent(jobId: string, agent: AgentName, status: AgentStatus, output?: string, error?: string) {
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

  setReport(jobId: string, markdown: string) {
    const job = this.jobs.get(jobId)
    if (job) {
      job.reportMarkdown = markdown
      job.status = "complete"
    }
  }

  appendSynthesisDelta(jobId: string, delta: string) {
    const job = this.jobs.get(jobId)
    if (job) job.synthesisMarkdown += delta
  }
}

export const jobStore = new DDJobStore()
