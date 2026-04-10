import { supabaseAdmin } from "./supabase-backend"

/**
 * Verify a Supabase JWT from the Authorization header.
 * Returns the userId on success, throws with a 401 message on failure.
 */
export async function requireAuth(authHeader: string | undefined): Promise<string> {
  if (!authHeader?.startsWith("Bearer ")) {
    throw Object.assign(new Error("Missing or invalid Authorization header"), { status: 401 })
  }

  const token = authHeader.slice(7)
  const { data, error } = await supabaseAdmin.auth.getUser(token)

  if (error || !data.user) {
    throw Object.assign(new Error("Unauthorized"), { status: 401 })
  }

  return data.user.id
}
