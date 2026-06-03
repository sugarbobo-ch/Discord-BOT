import YahooFinance from 'yahoo-finance2'

const yahooFinance = new YahooFinance({
  suppressNotices: ['yahooSurvey']
})

interface CacheEntry {
  data: Record<string, any>
  timestamp: number
}

const stockCache = new Map<string, CacheEntry>()
const CACHE_TTL = 60 * 1000 // 60 seconds

/**
 * 查詢指定股票代碼的最新股價與財務數據（使用 yahoo-finance2，支援 60 秒記憶體快取）
 */
export async function getStockPrice(tickerSymbol: string): Promise<Record<string, any>> {
  const normalizedTicker = tickerSymbol.trim().toUpperCase()
  if (!normalizedTicker) {
    return { error: '無效的股票代碼' }
  }

  const now = Date.now()
  const cached = stockCache.get(normalizedTicker)
  if (cached && now - cached.timestamp < CACHE_TTL) {
    console.log(`[Stock Cache Hit] ${normalizedTicker}`)
    return cached.data
  }

  try {
    const quote = (await yahooFinance.quote(normalizedTicker)) as any
    if (!quote || quote.regularMarketPrice === undefined || quote.regularMarketPrice === null) {
      const errorResult = {
        symbol: normalizedTicker,
        error: `找不到股票代碼 "${normalizedTicker}" 的價格資料`
      }
      stockCache.set(normalizedTicker, { data: errorResult, timestamp: now })
      return errorResult
    }

    const successResult: Record<string, any> = {
      symbol: normalizedTicker,
      price: quote.regularMarketPrice,
      currency: quote.currency || 'USD'
    }

    if (quote.displayName || quote.longName || quote.shortName) {
      successResult.name = quote.displayName || quote.longName || quote.shortName
    }

    const optionalKeys = [
      ['change', 'regularMarketChange'],
      ['changePercent', 'regularMarketChangePercent'],
      ['dayLow', 'regularMarketDayLow'],
      ['dayHigh', 'regularMarketDayHigh'],
      ['volume', 'regularMarketVolume'],
      ['previousClose', 'regularMarketPreviousClose'],
      ['open', 'regularMarketOpen'],
      ['marketCap', 'marketCap'],
      ['fiftyTwoWeekLow', 'fiftyTwoWeekLow'],
      ['fiftyTwoWeekHigh', 'fiftyTwoWeekHigh'],
      ['trailingPE', 'trailingPE'],
      ['forwardPE', 'forwardPE'],
      ['priceToBook', 'priceToBook'],
      ['dividendRate', 'dividendRate'],
      ['dividendYield', 'dividendYield'],
      ['epsTrailingTwelveMonths', 'epsTrailingTwelveMonths'],
      ['epsForward', 'epsForward'],
      ['fiftyDayAverage', 'fiftyDayAverage'],
      ['twoHundredDayAverage', 'twoHundredDayAverage'],
      ['averageAnalystRating', 'averageAnalystRating']
    ]

    for (const [resKey, quoteKey] of optionalKeys) {
      if (quote[quoteKey] !== undefined && quote[quoteKey] !== null) {
        successResult[resKey] = quote[quoteKey]
      }
    }

    stockCache.set(normalizedTicker, { data: successResult, timestamp: now })
    return successResult
  } catch (error: any) {
    console.error(`[Stock API Error] Failed to fetch ${normalizedTicker}:`, error.message)
    const errorResult = {
      symbol: normalizedTicker,
      error: `查詢股票代碼 "${normalizedTicker}" 時發生錯誤`
    }
    // 對於錯誤也快取一小段時間 (比如 10 秒) 以防被重複請求打爆
    stockCache.set(normalizedTicker, { data: errorResult, timestamp: now - CACHE_TTL + 10000 })
    return errorResult
  }
}

// 常見排除詞 (過濾常用英文詞彙，避免將對話字眼誤認為美股代碼)
const STOP_WORDS = new Set([
  'I',
  'A',
  'AN',
  'THE',
  'AND',
  'OR',
  'BUT',
  'IF',
  'FOR',
  'WITH',
  'AT',
  'BY',
  'TO',
  'IN',
  'ON',
  'OF',
  'IS',
  'AM',
  'ARE',
  'WAS',
  'WERE',
  'BE',
  'GET',
  'GO',
  'DO',
  'CAN',
  'HAS',
  'HAVE',
  'HOW',
  'WHY',
  'WHAT',
  'WHO',
  'YOU',
  'WE',
  'HE',
  'SHE',
  'IT',
  'THEY',
  'THIS',
  'THAT',
  'HERE',
  'THERE',
  'NOT',
  'SO',
  'UP',
  'OUT',
  'NO',
  'YES',
  'OK',
  'MY',
  'ME',
  'US',
  'HI',
  'HEY',
  'STOCK',
  'PRICE',
  'TICKER',
  'MARKET',
  'QUOTE',
  'TW',
  'TWO',
  'USD',
  'TWD',
  'HKD',
  'CNY',
  'EUR',
  'GBP'
])

/**
 * 從文字中解析可能的股票代碼
 */
export function extractTickers(text: string): string[] {
  const tickers: string[] = []
  const normalizedText = text.toLowerCase()

  // 1. 精準比對：帶有後綴的台股，例如 2330.TW, 2603.TWO (不限大小寫)
  const twPattern = /\b\d{4}\.(?:tw|two)\b/gi
  let match
  while ((match = twPattern.exec(text)) !== null) {
    tickers.push(match[0].toUpperCase())
  }

  // 檢查是否包含股票關鍵字
  const hasStockKeyword = /股價|股票|行情|個股|收盤|開盤|指數|台股|美股|stock|ticker|price/i.test(
    normalizedText
  )

  if (hasStockKeyword) {
    // 2. 匹配 4 位純數字的台股代碼 (例如 2330，自動補全為 2330.TW)
    const pureTwPattern = /\b\d{4}\b/g
    while ((match = pureTwPattern.exec(text)) !== null) {
      const tickerNum = match[0]
      // 避免重複加入
      if (!tickers.some(t => t.startsWith(tickerNum))) {
        tickers.push(`${tickerNum}.TW`)
      }
    }

    // 3. 匹配美股代碼 (1 到 5 個英文字母)
    // 尋找單字邊界限制的純英文字母 (2 到 5 碼，單一字母如 F, T 可直接忽略以防日常單字誤判)
    const usPattern = /\b[a-zA-Z]{2,5}\b/g
    while ((match = usPattern.exec(text)) !== null) {
      const word = match[0].toUpperCase()
      if (!STOP_WORDS.has(word)) {
        // 避免重複加入
        if (!tickers.includes(word)) {
          tickers.push(word)
        }
      }
    }
  }

  return tickers
}

/**
 * 用於單元測試清除快取
 */
export function clearStockCache(): void {
  stockCache.clear()
}
