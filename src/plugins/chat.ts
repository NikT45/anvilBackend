import { Elysia, t } from "elysia"
import { runChatAgent } from "../agents/chat-agent"
import { createSSEStream } from "../lib/sse"
import { jobStore } from "../lib/job-store"
import { runDispatch } from "../agents/dispatch"
import { v4 as uuidv4 } from "uuid"
import type { Message } from "../lib/types"

export const chatPlugin = new Elysia().post(
  "/chat",
  ({ body }) => {
    const messages = body.messages as Message[]

    return createSSEStream(async (emit) => {
      for await (const event of runChatAgent(messages)) {
        if (event.type === "text_delta") {
          emit({ type: "text_delta", delta: event.delta })
        } else if (event.type === "dd_trigger") {
          const ddJobId = uuidv4()
          const job = jobStore.create(ddJobId, event.company, event.context)

          // Fire DD pipeline in background — do not await
          runDispatch(job).catch(console.error)

          emit({ type: "dd_triggered", company: event.company, ddJobId })
        } else if (event.type === "done") {
          emit({ type: "done" })
        } else if (event.type === "error") {
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
