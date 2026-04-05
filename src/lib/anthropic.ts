import Anthropic from "@anthropic-ai/sdk"
import { env } from "../env"

export const anthropic = new Anthropic({
  apiKey: env.ANTHROPIC_API_KEY,
})

export const MODELS = {
  PRIMARY: "claude-opus-4-6" as const,
  BALANCED: "claude-sonnet-4-6" as const,
  FAST: "claude-haiku-4-5-20251001" as const,
}
