import type Anthropic from "@anthropic-ai/sdk"

// ─── Shared message type ──────────────────────────────────────────────────────

export interface Message {
  role: "user" | "assistant"
  content: string
}

// ─── Agent runner events ──────────────────────────────────────────────────────

export type AgentEvent =
  | { type: "text_delta"; delta: string }
  | { type: "dd_trigger"; company: string; context: string; toolUseId: string }
  | { type: "done"; fullText: string }
  | { type: "error"; message: string }

export interface RunAgentParams {
  systemPrompt: string
  tools: Anthropic.Tool[]
  toolHandlers: Record<string, (input: unknown) => Promise<unknown>>
  messages: Anthropic.MessageParam[]
  model?: string
  maxIterations?: number
  label?: string
}

// ─── DD Job ───────────────────────────────────────────────────────────────────

export type AgentName = "financial" | "risk" | "competitive" | "management"

export type AgentStatus = "queued" | "running" | "done" | "error"

export interface AgentResult {
  name: AgentName
  status: AgentStatus
  output: string
  error?: string
}

export type DDJobStatus = "pending" | "running" | "synthesizing" | "complete" | "error"

export interface DDJob {
  jobId: string
  company: string
  context: string
  status: DDJobStatus
  agents: Record<AgentName, AgentResult>
  synthesisMarkdown: string
  reportMarkdown: string
  createdAt: number
}

// ─── SSE events ───────────────────────────────────────────────────────────────

export type SSEEvent =
  // Chat stream
  | { type: "text_delta"; delta: string }
  | { type: "dd_triggered"; company: string; ddJobId: string }
  | { type: "done" }
  | { type: "error"; message: string }
  // DD stream
  | { type: "started"; jobId: string; company: string }
  | { type: "agent_progress"; agent: AgentName; status: AgentStatus; overallPct: number; preview?: string }
  | { type: "synthesis_started" }
  | { type: "synthesis_delta"; delta: string }
  | { type: "report_complete"; reportId: string; markdown: string; company: string }
