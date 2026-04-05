const required = (key: string): string => {
  const val = process.env[key]
  if (!val) throw new Error(`Missing required env var: ${key}`)
  return val
}

export const env = {
  ANTHROPIC_API_KEY: required("ANTHROPIC_API_KEY"),
  PORT: Number(process.env.PORT ?? 3000),
  FRONTEND_URL: process.env.FRONTEND_URL ?? "http://localhost:3001",
}
