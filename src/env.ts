const required = (key: string): string => {
  const val = process.env[key]
  if (!val) throw new Error(`Missing required env var: ${key}`)
  return val
}

export const env = {
  ANTHROPIC_API_KEY: required("ANTHROPIC_API_KEY"),
  TAVILY_API_KEY: process.env.TAVILY_API_KEY ?? "",
  PORT: Number(process.env.PORT ?? 3000),
  FRONTEND_URL: process.env.FRONTEND_URL ?? "http://localhost:3001",
  SUPABASE_URL: process.env.SUPABASE_URL ?? "",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  VOYAGE_API_KEY: process.env.VOYAGE_API_KEY ?? "",
}
