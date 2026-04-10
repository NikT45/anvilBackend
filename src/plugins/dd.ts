import { Elysia, t } from "elysia"
import { v4 as uuidv4 } from "uuid"
import { jobStore } from "../lib/job-store"
import { runDispatch } from "../agents/dispatch"
import { formatSSE } from "../lib/sse"
import { requireAuth } from "../lib/auth"
import type { SSEEvent, AgentName } from "../lib/types"

const AGENT_ORDER: AgentName[] = ["intake", "financial", "market", "risk", "management", "synthesis"]

export const ddPlugin = new Elysia()
  .post(
    "/dd",
    async ({ body, headers, set }) => {
      let userId: string
      try {
        userId = await requireAuth(headers["authorization"])
      } catch {
        set.status = 401
        return { error: "Unauthorized" }
      }
      const { company, context = "" } = body
      const ddJobId = uuidv4()
      const job = jobStore.create(ddJobId, company, context, userId)
      runDispatch(job).catch(console.error)
      return { ddJobId, company, status: "started" }
    },
    {
      body: t.Object({
        company: t.String(),
        context: t.Optional(t.String()),
      }),
    }
  )

  .get("/dd/:jobId/stream", ({ params }) => {
    const { jobId } = params
    const job = jobStore.get(jobId)

    const encoder = new TextEncoder()
    let safeClose = () => {}

    const stream = new ReadableStream({
      cancel() {
        safeClose()
      },
      start(controller) {
        const enqueue = (event: SSEEvent) => {
          try {
            controller.enqueue(encoder.encode(formatSSE(event)))
          } catch {
            // stream closed
          }
        }

        if (!job) {
          enqueue({ type: "error", message: `Job ${jobId} not found` })
          controller.close()
          return
        }

        // Replay if already complete
        if (job.status === "complete" && job.report) {
          enqueue({ type: "started", jobId, company: job.company })
          if (job.companyProfile) enqueue({ type: "intake_complete", profile: job.companyProfile })
          for (const agent of AGENT_ORDER) {
            enqueue({
              type: "agent_progress",
              agent,
              status: job.agents[agent].status,
              overallPct: 100,
            })
          }
          enqueue({ type: "synthesis_started" })
          enqueue({
            type: "report_complete",
            reportId: uuidv4(),
            report: job.report,
            company: job.company,
          })
          controller.close()
          return
        }

        // Subscribe live
        let closed = false
        safeClose = () => {
          if (closed) return
          closed = true
          unsubscribe()
          try { controller.close() } catch {}
        }

        // Replay current state so late-connecting clients catch up
        enqueue({ type: "started", jobId, company: job.company })
        if (job.companyProfile) enqueue({ type: "intake_complete", profile: job.companyProfile })
        for (const agent of AGENT_ORDER) {
          const st = job.agents[agent].status
          if (st !== "queued") {
            enqueue({ type: "agent_progress", agent, status: st, overallPct: 0 })
          }
        }

        const unsubscribe = jobStore.subscribe(jobId, (event) => {
          if (closed) return
          enqueue(event)
          if (event.type === "report_complete" || event.type === "error") {
            safeClose()
          }
        })

        // Timeout safety — 15 minutes
        setTimeout(safeClose, 15 * 60 * 1000)
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      },
    })
  })
