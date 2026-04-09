import type Anthropic from "@anthropic-ai/sdk"

export const marketTools: Anthropic.Tool[] = [
  {
    name: "get_stock_quote",
    description:
      "Get live stock price, market cap, P/E ratio, 52-week range, and key metrics for a publicly traded company. Always use this for current price or valuation questions.",
    input_schema: {
      type: "object" as const,
      properties: {
        ticker: {
          type: "string",
          description: "Stock ticker symbol e.g. AAPL, MSFT, GOOGL, NVDA",
        },
      },
      required: ["ticker"],
    },
  },
]

// Cache crumb + cookie to avoid fetching on every request
let crumbCache: { crumb: string; cookie: string; expiresAt: number } | null = null

async function getCrumb(): Promise<{ crumb: string; cookie: string } | null> {
  if (crumbCache && Date.now() < crumbCache.expiresAt) return crumbCache

  try {
    // Step 1: hit finance.yahoo.com to get session cookies
    const pageRes = await fetch("https://finance.yahoo.com/", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    })
    const rawCookie = pageRes.headers.getSetCookie?.()?.join("; ") ?? pageRes.headers.get("set-cookie") ?? ""

    // Step 2: get crumb
    const crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Cookie: rawCookie,
      },
    })
    if (!crumbRes.ok) return null

    const crumb = (await crumbRes.text()).trim()
    crumbCache = { crumb, cookie: rawCookie, expiresAt: Date.now() + 55 * 60 * 1000 } // 55 min TTL
    return crumbCache
  } catch {
    return null
  }
}

export async function getStockQuote(input: unknown): Promise<string> {
  const { ticker } = input as { ticker: string }
  const symbol = ticker.toUpperCase().trim()

  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
  }

  // Try to get crumb for full data
  const auth = await getCrumb()
  if (auth) {
    headers["Cookie"] = auth.cookie
  }

  const crumbParam = auth ? `&crumb=${encodeURIComponent(auth.crumb)}` : ""
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=price,summaryDetail,defaultKeyStatistics${crumbParam}`

  try {
    const res = await fetch(url, { headers })
    if (res.ok) {
      const data = (await res.json()) as any
      const result = data?.quoteSummary?.result?.[0]
      if (result) {
        const price = result.price ?? {}
        const summary = result.summaryDetail ?? {}
        const stats = result.defaultKeyStatistics ?? {}
        const fmt = (v: any) => v?.raw ?? v ?? null

        return JSON.stringify({
          ticker: symbol,
          name: price.longName ?? price.shortName,
          exchange: price.exchangeName,
          currency: price.currency,
          price: fmt(price.regularMarketPrice),
          change: fmt(price.regularMarketChange),
          changePct: fmt(price.regularMarketChangePercent),
          open: fmt(price.regularMarketOpen),
          high: fmt(price.regularMarketDayHigh),
          low: fmt(price.regularMarketDayLow),
          volume: fmt(price.regularMarketVolume),
          marketCap: fmt(price.marketCap),
          peRatioTTM: fmt(price.trailingPE) ?? fmt(summary.trailingPE),
          forwardPE: fmt(summary.forwardPE),
          priceToBook: fmt(stats.priceToBook),
          evToEbitda: fmt(stats.enterpriseToEbitda),
          fiftyTwoWeekHigh: fmt(summary.fiftyTwoWeekHigh),
          fiftyTwoWeekLow: fmt(summary.fiftyTwoWeekLow),
          dividendYield: fmt(summary.dividendYield),
          beta: fmt(summary.beta),
          asOf: new Date().toISOString(),
        }, null, 2)
      }
    }
  } catch { /* fall through to chart endpoint */ }

  // Fallback: v8 chart endpoint (no auth required, price data only)
  const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`
  const chartRes = await fetch(chartUrl, { headers: { "User-Agent": headers["User-Agent"] } })
  if (!chartRes.ok) return `Failed to fetch market data for ${symbol}. Yahoo Finance may be unavailable.`

  const chartData = (await chartRes.json()) as any
  const meta = chartData?.chart?.result?.[0]?.meta
  if (!meta) return `No market data found for ticker "${symbol}"`

  return JSON.stringify({
    ticker: symbol,
    name: meta.longName ?? meta.shortName ?? symbol,
    exchange: meta.exchangeName,
    currency: meta.currency,
    price: meta.regularMarketPrice,
    previousClose: meta.chartPreviousClose,
    change: +(meta.regularMarketPrice - meta.chartPreviousClose).toFixed(2),
    changePct: +((meta.regularMarketPrice - meta.chartPreviousClose) / meta.chartPreviousClose * 100).toFixed(2),
    fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
    volume: meta.regularMarketVolume,
    asOf: new Date().toISOString(),
    note: "Limited data — full fundamentals unavailable",
  }, null, 2)
}

export const marketHandlers: Record<string, (input: unknown) => Promise<unknown>> = {
  get_stock_quote: getStockQuote,
}
