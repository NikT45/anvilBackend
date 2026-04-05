import { cors } from "@elysiajs/cors"
import { env } from "../env"

export const corsPlugin = cors({
  origin: [env.FRONTEND_URL, "http://localhost:3000", "http://localhost:3001"],
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
})
