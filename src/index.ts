import { Elysia } from "elysia"
import { corsPlugin } from "./plugins/cors"
import { chatPlugin } from "./plugins/chat"
import { ddPlugin } from "./plugins/dd"
import { env } from "./env"

const app = new Elysia()
  .use(corsPlugin)
  .use(chatPlugin)
  .use(ddPlugin)
  .get("/health", () => ({ status: "ok", ts: Date.now() }))
  .listen(env.PORT)

console.log(`🔨 Anvil backend running at http://${app.server?.hostname}:${app.server?.port}`)
