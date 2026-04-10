import { cors } from "@elysiajs/cors"
import { env } from "../env"

export const corsPlugin = cors({
  origin: [
    env.FRONTEND_URL,
    "http://localhost:3000",
    "http://localhost:3001",
    "https://anvildd.com",
    "https://www.anvildd.com",
  ],
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
})
