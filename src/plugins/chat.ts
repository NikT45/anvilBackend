import { Elysia, t } from "elysia"
import { runChatAgent } from "../agents/chat-agent"
import { createSSEStream } from "../lib/sse"
import { jobStore } from "../lib/job-store"
import { runDispatch } from "../agents/dispatch"
import { requireAuth } from "../lib/auth"
import { v4 as uuidv4 } from "uuid"
import type { Message } from "../lib/types"

export const chatPlugin = new Elysia().post(
  "/chat",
  ({ body, headers }) => {
    const messages = body.messages as Message[]
    const lastMsg = messages[messages.length - 1]?.content?.slice(0, 80) ?? ""

    return createSSEStream(async (emit) => {
      let userId: string
      try {
        userId = await requireAuth(headers["authorization"])
      } catch {
        emit({ type: "error", message: "Unauthorized" })
        return
      }
      console.log(`[chat] POST /chat — ${messages.length} message(s), userId: ${userId}, last: "${lastMsg}"`)

      for await (const event of runChatAgent(messages, userId)) {
        if (event.type === "text_delta") {
          emit({ type: "text_delta", delta: event.delta })
        } else if (event.type === "dd_trigger") {
          const ddJobId = uuidv4()
          console.log(`[chat] dd_trigger → company="${event.company}", jobId=${ddJobId}`)
          const job = jobStore.create(ddJobId, event.company, event.context, userId)

          // Fire DD pipeline in background — do not await
          runDispatch(job).catch(console.error)

          emit({ type: "dd_triggered", company: event.company, ddJobId })
        } else if (event.type === "tool_activity") {
          emit({ type: "tool_activity", tool: event.tool, description: event.description })
        } else if (event.type === "done") {
          console.log(`[chat] done`)
          emit({ type: "done" })
        } else if (event.type === "error") {
          console.error(`[chat] error: ${event.message}`)
          emit({ type: "error", message: event.message })
        }
      }
    })
  },
  {
    body: t.Object({
      messages: t.Array(
        t.Object({
          role: t.Union([t.Literal("user"), t.Literal("assistant")]),
          content: t.String(),
        })
      ),
    }),
  }
)
