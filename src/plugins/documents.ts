import { Elysia, t } from "elysia"
import { supabaseAdmin } from "../lib/supabase-backend"
import { embedTexts } from "../lib/voyage"
import { requireAuth } from "../lib/auth"

const CHUNK_SIZE = 1200
const CHUNK_OVERLAP = 150

function chunkText(text: string): string[] {
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length)
    const chunk = text.slice(start, end).trim()
    if (chunk.length > 50) chunks.push(chunk)
    if (end >= text.length) break
    start = end - CHUNK_OVERLAP
  }
  return chunks
}

async function extractText(file: File): Promise<string> {
  const name = file.name.toLowerCase()
  if (name.endsWith(".pdf")) {
    const buffer = await file.arrayBuffer()
    const pdfParse = require("pdf-parse")
    const result = await pdfParse(Buffer.from(buffer))
    return result.text
  }
  return file.text()
}

export const documentsPlugin = new Elysia()

  .post(
    "/documents/upload",
    async ({ body, headers, set }) => {
      let userId: string
      try {
        userId = await requireAuth(headers["authorization"])
      } catch {
        set.status = 401
        return { error: "Unauthorized" }
      }

      const file = body.file as File
      try {
        const rawText = await extractText(file)
        const text = rawText.replace(/\s+/g, " ").trim()
        if (!text) {
          set.status = 400
          return { error: "Could not extract text from file" }
        }

        const { data: doc, error: docErr } = await supabaseAdmin
          .from("documents")
          .insert({ name: file.name, size: file.size, mime_type: file.type, user_id: userId ?? null })
          .select()
          .single()

        if (docErr) throw docErr

        const chunks = chunkText(text)

        // Embed all chunks via Voyage AI (finance-tuned model)
        let embeddings: number[][] = []
        try {
          embeddings = await embedTexts(chunks)
        } catch (e) {
          console.warn("[documents] embedding failed, storing without vectors:", e)
        }

        const rows = chunks.map((content, i) => ({
          document_id: doc.id,
          content,
          chunk_index: i,
          embedding: embeddings[i] ? `[${embeddings[i].join(",")}]` : null,
        }))

        const { error: chunkErr } = await supabaseAdmin.from("document_chunks").insert(rows)
        if (chunkErr) throw chunkErr

        console.log(`[documents] uploaded "${file.name}" → ${chunks.length} chunks, embedded: ${embeddings.length > 0}`)
        return { documentId: doc.id, name: file.name, chunks: chunks.length }
      } catch (err) {
        console.error("[documents] upload error:", err)
        set.status = 500
        return { error: err instanceof Error ? err.message : "Upload failed" }
      }
    },
    { body: t.Object({ file: t.File() }) }
  )

  .get(
    "/documents",
    async ({ headers, set }) => {
      let userId: string
      try {
        userId = await requireAuth(headers["authorization"])
      } catch {
        set.status = 401
        return { error: "Unauthorized" }
      }

      const { data, error } = await supabaseAdmin
        .from("documents")
        .select("id, name, size, mime_type, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })

      if (error) return { error: error.message }
      return data ?? []
    }
  )

  .delete("/documents/:id", async ({ params, headers, set }) => {
    let userId: string
    try {
      userId = await requireAuth(headers["authorization"])
    } catch {
      set.status = 401
      return { error: "Unauthorized" }
    }

    // Only delete if it belongs to this user
    const { error } = await supabaseAdmin
      .from("documents")
      .delete()
      .eq("id", params.id)
      .eq("user_id", userId)

    if (error) {
      set.status = 500
      return { error: error.message }
    }
    return { success: true }
  })
