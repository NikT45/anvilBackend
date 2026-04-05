import Anthropic from "@anthropic-ai/sdk"
import { env } from "../env"

export const anthropic = new Anthropic({
  apiKey: env.ANTHROPIC_API_KEY,
})

export const MODELS = {
  PRIMARY: "claude-opus-4-6" as const,
  FAST: "claude-sonnet-4-6" as const,
}
