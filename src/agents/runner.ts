import type Anthropic from "@anthropic-ai/sdk"
import { anthropic } from "../lib/anthropic"
import type { AgentEvent, RunAgentParams } from "../lib/types"

export async function* runAgent(params: RunAgentParams): AsyncGenerator<AgentEvent> {
  const {
    systemPrompt,
    tools,
    toolHandlers,
    messages,
    model = "claude-sonnet-4-6",
    maxIterations = 10,
  } = params

  const history: Anthropic.MessageParam[] = [...messages]
  let iterations = 0

  while (iterations < maxIterations) {
    iterations++
    let fullText = ""

    const stream = await anthropic.messages.stream({
      model,
      max_tokens: 8096,
      system: systemPrompt,
      tools: tools.length > 0 ? tools : undefined,
      messages: history,
    })

    const toolUseBlocks: Anthropic.ToolUseBlock[] = []

    for await (const chunk of stream) {
      if (
        chunk.type === "content_block_delta" &&
        chunk.delta.type === "text_delta"
      ) {
        fullText += chunk.delta.text
        yield { type: "text_delta", delta: chunk.delta.text }
      }
      if (chunk.type === "content_block_start" && chunk.content_block.type === "tool_use") {
        toolUseBlocks.push({ ...chunk.content_block, input: {} })
      }
      if (chunk.type === "content_block_delta" && chunk.delta.type === "input_json_delta") {
        // accumulate — handled via finalMessage below
      }
    }

    const finalMessage = await stream.finalMessage()

    // Append assistant turn to history
    history.push({ role: "assistant", content: finalMessage.content })

    if (finalMessage.stop_reason === "end_turn") {
      yield { type: "done", fullText }
      return
    }

    if (finalMessage.stop_reason === "tool_use") {
      const toolResults: Anthropic.ToolResultBlockParam[] = []

      for (const block of finalMessage.content) {
        if (block.type !== "tool_use") continue

        // Special case: DD trigger — yield event, inject synthetic result
        if (block.name === "trigger_dd_report") {
          const input = block.input as { company: string; context?: string }
          yield {
            type: "dd_trigger",
            company: input.company,
            context: input.context ?? "",
            toolUseId: block.id,
          }
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: "Due diligence report generation has been initiated. Inform the user it will be ready shortly.",
          })
          continue
        }

        // Normal tool call
        const handler = toolHandlers[block.name]
        if (!handler) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: `Tool "${block.name}" not found.`,
            is_error: true,
          })
          continue
        }

        try {
          const result = await handler(block.input)
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: typeof result === "string" ? result : JSON.stringify(result),
          })
        } catch (err) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: `Tool error: ${err instanceof Error ? err.message : String(err)}`,
            is_error: true,
          })
        }
      }

      history.push({ role: "user", content: toolResults })
      continue
    }

    // Unexpected stop reason
    yield { type: "done", fullText }
    return
  }

  yield { type: "error", message: "Max iterations reached" }
}
