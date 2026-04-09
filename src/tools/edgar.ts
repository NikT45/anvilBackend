import type Anthropic from "@anthropic-ai/sdk"

const EDGAR_BASE = "https://data.sec.gov"
const EDGAR_SEARCH = "https://efts.sec.gov/LATEST/search-index"

const headers = {
  "User-Agent": "Anvil Research anvil@research.com",
  "Accept-Encoding": "gzip, deflate",
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

export const edgarTools: Anthropic.Tool[] = [
  {
    name: "edgar_search_company",
    description: "Search SEC EDGAR for a company by name or ticker to get its CIK number",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Company name or ticker symbol" },
      },
      required: ["query"],
    },
  },
  {
    name: "edgar_get_filings",
    description: "Get recent SEC filings for a company by CIK number",
    input_schema: {
      type: "object" as const,
      properties: {
        cik: { type: "string", description: "CIK number (with or without leading zeros)" },
        form_type: {
          type: "string",
          description: "Form type e.g. 10-K, 10-Q, DEF 14A, 8-K",
        },
        limit: { type: "number", description: "Max results (default 5)" },
      },
      required: ["cik", "form_type"],
    },
  },
  {
    name: "edgar_get_company_facts",
    description:
      "Get XBRL financial facts for a company (revenue, assets, liabilities, EPS, etc.) spanning multiple years",
    input_schema: {
      type: "object" as const,
      properties: {
        cik: { type: "string", description: "CIK number" },
        concept: {
          type: "string",
          description:
            "XBRL concept e.g. Revenues, NetIncomeLoss, Assets, Liabilities, EarningsPerShareBasic, OperatingIncomeLoss, CashAndCashEquivalentsAtCarryingValue",
        },
      },
      required: ["cik", "concept"],
    },
  },
  {
    name: "edgar_get_filing_text",
    description:
      "Fetch the text content of a specific SEC filing section. Use for 10-K Risk Factors (Item 1A), Business (Item 1), or proxy statement sections.",
    input_schema: {
      type: "object" as const,
      properties: {
        cik: { type: "string", description: "CIK number" },
        accession_number: {
          type: "string",
          description: "Accession number from edgar_get_filings (e.g. 0000320193-23-000077)",
        },
      },
      required: ["cik", "accession_number"],
    },
  },
]

// ─── Tool handlers ────────────────────────────────────────────────────────────

export async function edgarSearchCompany(input: unknown): Promise<string> {
  const { query } = input as { query: string }

  const url = `${EDGAR_SEARCH}?q=${encodeURIComponent(query)}&dateRange=custom&startdt=2020-01-01&forms=10-K`
  const res = await fetch(url, { headers })
  if (!res.ok) return `EDGAR search failed: ${res.status}`

  const data = await res.json() as any
  const hits = data?.hits?.hits ?? []
  if (hits.length === 0) return `No results found for "${query}"`

  const results = hits.slice(0, 5).map((h: any) => ({
    company: h._source?.entity_name,
    cik: h._source?.entity_id,
    edgarUrl: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${h._source?.entity_id}&type=10-K`,
  }))

  return JSON.stringify(results, null, 2)
}

export async function edgarGetFilings(input: unknown): Promise<string> {
  const { cik, form_type, limit = 5 } = input as { cik: string; form_type: string; limit?: number }

  const paddedCik = cik.padStart(10, "0")
  const url = `${EDGAR_BASE}/submissions/CIK${paddedCik}.json`
  const res = await fetch(url, { headers })
  if (!res.ok) return `EDGAR filings fetch failed: ${res.status}`

  const data = await res.json() as any
  const recent = data?.filings?.recent
  if (!recent) return "No filings data found"

  const forms: string[] = recent.form ?? []
  const accessions: string[] = recent.accessionNumber ?? []
  const dates: string[] = recent.filingDate ?? []
  const descriptions: string[] = recent.primaryDocument ?? []

  const matches: object[] = []
  for (let i = 0; i < forms.length && matches.length < limit; i++) {
    if (forms[i] === form_type) {
      matches.push({
        form: forms[i],
        accession_number: accessions[i],
        filing_date: dates[i],
        primary_document: descriptions[i],
      })
    }
  }

  if (matches.length === 0) return `No ${form_type} filings found for CIK ${cik}`

  const withUrls = matches.map((m: any) => ({
    ...m,
    url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=${form_type}&dateb=&owner=include&count=10`,
    directUrl: `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${m.accession_number.replace(/-/g, "")}/${m.accession_number}-index.htm`,
  }))
  return JSON.stringify(withUrls, null, 2)
}

export async function edgarGetCompanyFacts(input: unknown): Promise<string> {
  const { cik, concept } = input as { cik: string; concept: string }

  const paddedCik = cik.padStart(10, "0")
  const url = `${EDGAR_BASE}/api/xbrl/companyfacts/CIK${paddedCik}.json`
  const res = await fetch(url, { headers })
  if (!res.ok) return `EDGAR facts fetch failed: ${res.status}`

  const data = await res.json() as any
  const facts = data?.facts

  // Try us-gaap namespace first, then dei
  const namespaces = ["us-gaap", "dei"]
  for (const ns of namespaces) {
    const conceptData = facts?.[ns]?.[concept]
    if (conceptData) {
      const units = conceptData.units
      const unitKey = Object.keys(units)[0]
      const entries = units[unitKey] ?? []

      // Return last 5 years of annual data
      const annual = entries
        .filter((e: any) => e.form === "10-K")
        .sort((a: any, b: any) => b.end.localeCompare(a.end))
        .slice(0, 5)

      if (annual.length === 0) return `No annual data found for concept "${concept}"`
      return JSON.stringify({ concept, unit: unitKey, data: annual }, null, 2)
    }
  }

  return `Concept "${concept}" not found. Try: Revenues, NetIncomeLoss, Assets, Liabilities, OperatingIncomeLoss, CashAndCashEquivalentsAtCarryingValue`
}

export async function edgarGetFilingText(input: unknown): Promise<string> {
  const { cik, accession_number } = input as { cik: string; accession_number: string }

  const paddedCik = cik.padStart(10, "0")
  const accPath = accession_number.replace(/-/g, "")
  const indexUrl = `${EDGAR_BASE}/Archives/edgar/data/${Number(cik)}/${accPath}/${accession_number}-index.json`

  const res = await fetch(indexUrl, { headers })
  if (!res.ok) return `Could not fetch filing index: ${res.status}`

  const index = await res.json() as any
  const files: any[] = index?.directory?.item ?? []

  // Find the primary HTML/HTM document
  const primary = files.find((f: any) =>
    f.name?.endsWith(".htm") || f.name?.endsWith(".html")
  )
  if (!primary) return "Could not find primary document in filing"

  const docUrl = `${EDGAR_BASE}/Archives/edgar/data/${Number(cik)}/${accPath}/${primary.name}`
  const docRes = await fetch(docUrl, { headers })
  if (!docRes.ok) return `Could not fetch document: ${docRes.status}`

  const html = await docRes.text()
  // Strip HTML tags and collapse whitespace — return first 8000 chars
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000)

  return text
}

// ─── Handler map ──────────────────────────────────────────────────────────────

export const edgarHandlers: Record<string, (input: unknown) => Promise<unknown>> = {
  edgar_search_company: edgarSearchCompany,
  edgar_get_filings: edgarGetFilings,
  edgar_get_company_facts: edgarGetCompanyFacts,
  edgar_get_filing_text: edgarGetFilingText,
}
