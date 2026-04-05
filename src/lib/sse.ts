import type { SSEEvent } from "./types"

export function formatSSE(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`
}

export function createSSEStream(
  handler: (emit: (event: SSEEvent) => void) => Promise<void>
): Response {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: SSEEvent) => {
        controller.enqueue(encoder.encode(formatSSE(event)))
      }

      try {
        await handler(emit)
      } catch (err) {
        emit({ type: "error", message: err instanceof Error ? err.message : String(err) })
      } finally {
        controller.close()
      }
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
}
