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
    maxIterations = 12,
    maxTokens = 8192,
    terminalTool,
  } = params

  const agentLabel = params.label ?? model
  // Combine research tools with terminal tool (if provided)
  const allTools = terminalTool ? [...tools, terminalTool] : tools
  console.log(`[runner:${agentLabel}] starting — ${messages.length} msg(s), ${allTools.length} tool(s)${terminalTool ? ` (terminal: ${terminalTool.name})` : ""}`)

  const history: Anthropic.MessageParam[] = [...messages]
  let iterations = 0

  while (iterations < maxIterations) {
    iterations++
    let fullText = ""
    console.log(`[runner:${agentLabel}] iteration ${iterations}`)

    const stream = await anthropic.messages.stream({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      tools: allTools.length > 0 ? allTools : undefined,
      messages: history,
    })

    for await (const chunk of stream) {
      if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
        fullText += chunk.delta.text
        yield { type: "text_delta", delta: chunk.delta.text }
      }
    }

    const finalMessage = await stream.finalMessage()
    history.push({ role: "assistant", content: finalMessage.content })

    console.log(
      `[runner:${agentLabel}] stop: ${finalMessage.stop_reason}, tokens: ${finalMessage.usage.input_tokens}in/${finalMessage.usage.output_tokens}out`
    )

    if (finalMessage.stop_reason === "end_turn") {
      console.log(`[runner:${agentLabel}] done — ${fullText.length} chars`)
      yield { type: "done", fullText }
      return
    }

    if (finalMessage.stop_reason === "tool_use") {
      const toolResults: Anthropic.ToolResultBlockParam[] = []
      let terminalCalled = false

      for (const block of finalMessage.content) {
        if (block.type !== "tool_use") continue

        // DD trigger special case
        if (block.name === "trigger_dd_report") {
          const input = block.input as { company: string; context?: string }
          console.log(`[runner:${agentLabel}] trigger_dd_report for "${input.company}"`)
          yield {
            type: "dd_trigger",
            company: input.company,
            context: input.context ?? "",
            toolUseId: block.id,
          }
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: "Due diligence report generation initiated. Inform the user it will be ready shortly.",
          })
          continue
        }

        // Terminal tool — structured output submission
        if (terminalTool && block.name === terminalTool.name) {
          console.log(`[runner:${agentLabel}] terminal tool called: ${block.name}`)
          yield { type: "submit", data: block.input }
          terminalCalled = true
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: "Analysis submitted successfully.",
          })
          continue
        }

        // Normal tool
        console.log(`[runner:${agentLabel}] tool: ${block.name}`, JSON.stringify(block.input).slice(0, 120))
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
          const resultStr = typeof result === "string" ? result : JSON.stringify(result)
          console.log(`[runner:${agentLabel}] → ${resultStr.slice(0, 120)}…`)
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: resultStr,
          })
        } catch (err) {
          console.error(`[runner:${agentLabel}] tool error: ${block.name}`, err)
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: `Tool error: ${err instanceof Error ? err.message : String(err)}`,
            is_error: true,
          })
        }
      }

      history.push({ role: "user", content: toolResults })

      // If terminal tool was called, end loop after submitting tool_result
      if (terminalCalled) {
        console.log(`[runner:${agentLabel}] done via terminal tool`)
        yield { type: "done", fullText }
        return
      }

      continue
    }

    yield { type: "done", fullText }
    return
  }

  yield { type: "error", message: "Max iterations reached" }
}
