import type Anthropic from "@anthropic-ai/sdk"

// ─── Shared message type ──────────────────────────────────────────────────────

export interface Message {
  role: "user" | "assistant"
  content: string
}

// ─── Agent runner events ──────────────────────────────────────────────────────

export type AgentEvent =
  | { type: "text_delta"; delta: string }
  | { type: "tool_activity"; tool: string; description: string }
  | { type: "dd_trigger"; company: string; context: string; toolUseId: string }
  | { type: "submit"; data: unknown }
  | { type: "done"; fullText: string }
  | { type: "error"; message: string }

export interface RunAgentParams {
  systemPrompt: string
  tools: Anthropic.Tool[]
  toolHandlers: Record<string, (input: unknown) => Promise<unknown>>
  messages: Anthropic.MessageParam[]
  model?: string
  maxIterations?: number
  maxTokens?: number
  label?: string
  terminalTool?: Anthropic.Tool
}

// ─── Structured Report Schema ─────────────────────────────────────────────────

export type Verdict = "Favorable" | "Cautious" | "Unfavorable"
export type Severity = "Low" | "Medium" | "High" | "Critical"
export type MoatStrength = "Strong" | "Moderate" | "Weak" | "None"
export type Positioning = "Leader" | "Challenger" | "Niche" | "Emerging"
export type MgmtRating = "Exceptional" | "Strong" | "Adequate" | "Concerning"

export interface CompanyProfile {
  name: string
  legalName?: string
  ticker?: string
  cik?: string
  isPublic: boolean
  sector?: string
  industry?: string
  description: string
  hq?: string
  founded?: string
  employees?: string
  website?: string
}

export interface FinancialSection {
  summary: string
  keyMetrics: Array<{ label: string; value: string; note?: string }>
  revenueHistory: Array<{ period: string; value: string; yoyPct?: string }>
  profitability: {
    grossMargin?: string
    operatingMargin?: string
    netMargin?: string
    commentary: string
  }
  balanceSheet: {
    cashPosition?: string
    totalDebt?: string
    netDebt?: string
    commentary: string
  }
  cashFlow: {
    operatingCashFlow?: string
    freeCashFlow?: string
    commentary: string
  }
  strengths: string[]
  concerns: string[]
  dataLimitations?: string
}

export interface MarketSection {
  summary: string
  positioning: Positioning
  positioningRationale: string
  moat: {
    strength: MoatStrength
    description: string
    durability: string
  }
  competitors: Array<{
    name: string
    relativePositioning: string
    note?: string
  }>
  tamEstimate?: string
  tamRationale?: string
  marketTrends: string[]
  porters: {
    competitiveRivalry: string
    supplierPower: string
    buyerPower: string
    threatOfSubstitutes: string
    threatOfNewEntrants: string
  }
}

export interface RiskSection {
  summary: string
  factors: Array<{
    category: "Regulatory" | "Financial" | "Operational" | "Market"
    name: string
    severity: Severity
    description: string
    mitigation?: string
  }>
  redFlags: string[]
  overallRiskLevel: Severity
}

export interface ManagementSection {
  summary: string
  rating: MgmtRating
  ratingRationale: string
  keyExecutives: Array<{
    name: string
    title: string
    background: string
    tenure?: string
  }>
  governance: {
    insiderOwnership?: string
    boardIndependence?: string
    shareStructure?: string
    commentary: string
  }
  compensation: string
  trackRecord: string
  concerns: string[]
}

export interface ExecutiveSummary {
  verdict: Verdict
  verdictRationale: string
  thesis: string
  keyPoints: string[]
  whatWouldChangeVerdict: string
}

export interface StructuredReport {
  company: CompanyProfile
  executiveSummary: ExecutiveSummary
  financial: FinancialSection
  market: MarketSection
  risk: RiskSection
  management: ManagementSection
  keyQuestions: string[]
  sources: Array<{ label: string; url?: string; type: "filing" | "web" | "model" }>
  metadata: {
    generatedAt: string
    dataSources: string[]
    confidenceNote: string
  }
}

// ─── DD Job ───────────────────────────────────────────────────────────────────

export type AgentName = "intake" | "financial" | "market" | "risk" | "management" | "synthesis"

export type AgentStatus = "queued" | "running" | "done" | "error"

export interface AgentResult {
  name: AgentName
  status: AgentStatus
  output: unknown
  error?: string
}

export type DDJobStatus = "pending" | "running" | "synthesizing" | "complete" | "error"

export interface DDJob {
  jobId: string
  company: string
  context: string
  status: DDJobStatus
  agents: Record<AgentName, AgentResult>
  companyProfile?: CompanyProfile
  report?: StructuredReport
  createdAt: number
}

// ─── SSE events ───────────────────────────────────────────────────────────────

export type SSEEvent =
  // Chat stream
  | { type: "text_delta"; delta: string }
  | { type: "dd_triggered"; company: string; ddJobId: string }
  | { type: "done" }
  | { type: "error"; message: string; agent?: AgentName }
  // DD stream
  | { type: "started"; jobId: string; company: string }
  | { type: "intake_complete"; profile: CompanyProfile }
  | { type: "agent_progress"; agent: AgentName; status: AgentStatus; overallPct: number; preview?: string }
  | { type: "tool_activity"; agent: AgentName; tool: string; description: string }
  | { type: "synthesis_started" }
  | { type: "report_complete"; reportId: string; report: StructuredReport; company: string }
