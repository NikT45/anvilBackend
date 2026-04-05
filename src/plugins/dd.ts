import { Elysia, t } from "elysia"
import { v4 as uuidv4 } from "uuid"
import { jobStore } from "../lib/job-store"
import { runDispatch } from "../agents/dispatch"
import { formatSSE } from "../lib/sse"
import type { SSEEvent } from "../lib/types"

export const ddPlugin = new Elysia()
  // POST /dd — manually trigger a DD report
  .post(
    "/dd",
    ({ body }) => {
      const { company, context = "" } = body
      const ddJobId = uuidv4()
      const job = jobStore.create(ddJobId, company, context)

      // Fire and forget
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

  // GET /dd/:jobId/stream — SSE progress stream
  .get("/dd/:jobId/stream", ({ params }) => {
    const { jobId } = params
    const job = jobStore.get(jobId)

    const encoder = new TextEncoder()

    // safeClose is hoisted so the cancel handler can reference it
    let safeClose = () => {}

    const stream = new ReadableStream({
      cancel() {
        // Client disconnected — clean up subscription
        safeClose()
      },
      start(controller) {
        const enqueue = (event: SSEEvent) => {
          try {
            controller.enqueue(encoder.encode(formatSSE(event)))
          } catch {
            // stream already closed (client disconnected or job finished)
          }
        }

        // If job doesn't exist, error immediately
        if (!job) {
          enqueue({ type: "error", message: `Job ${jobId} not found` })
          controller.close()
          return
        }

        // If already complete, send the report immediately
        if (job.status === "complete" && job.reportMarkdown) {
          enqueue({ type: "started", jobId, company: job.company })
          for (const agent of ["financial", "risk", "competitive", "management"] as const) {
            enqueue({
              type: "agent_progress",
              agent,
              status: job.agents[agent].status,
              overallPct: 75,
            })
          }
          enqueue({ type: "synthesis_started" })
          enqueue({
            type: "report_complete",
            reportId: uuidv4(),
            markdown: job.reportMarkdown,
            company: job.company,
          })
          controller.close()
          return
        }

        // Subscribe to live events
        let closed = false

        safeClose = () => {
          if (closed) return
          closed = true
          unsubscribe()
          try { controller.close() } catch {}
        }

        const unsubscribe = jobStore.subscribe(jobId, (event) => {
          if (closed) return
          enqueue(event)
          if (event.type === "report_complete" || event.type === "error") {
            safeClose()
          }
        })

        // Timeout safety — close after 10 minutes
        setTimeout(safeClose, 10 * 60 * 1000)
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
