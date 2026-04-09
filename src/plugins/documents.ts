import { Elysia, t } from "elysia"
import { supabaseAdmin } from "../lib/supabase-backend"
import { embedTexts } from "../lib/voyage"

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
    async ({ body, set }) => {
      const file = body.file as File
      const userId = (body as any).userId as string | undefined

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
    { body: t.Object({ file: t.File(), userId: t.Optional(t.String()) }) }
  )

  .get(
    "/documents",
    async ({ query }) => {
      let q = supabaseAdmin
        .from("documents")
        .select("id, name, size, mime_type, created_at")
        .order("created_at", { ascending: false })

      if (query.userId) q = (q as any).eq("user_id", query.userId)

      const { data, error } = await q
      if (error) return { error: error.message }
      return data ?? []
    },
    { query: t.Object({ userId: t.Optional(t.String()) }) }
  )

  .delete("/documents/:id", async ({ params, set }) => {
    const { error } = await supabaseAdmin.from("documents").delete().eq("id", params.id)
    if (error) {
      set.status = 500
      return { error: error.message }
    }
    return { success: true }
  })
