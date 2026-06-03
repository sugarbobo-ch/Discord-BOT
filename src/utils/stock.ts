import YahooFinance from 'yahoo-finance2'
import axios from 'axios'

const yahooFinance = new YahooFinance({
  suppressNotices: ['yahooSurvey']
})

export const COMMON_STOCK_MAP: Record<string, string> = {
  // 台股龍頭與熱門股
  '台積電': '2330.TW',
  '台積': '2330.TW',
  '聯發科': '2454.TW',
  '發哥': '2454.TW',
  '鴻海': '2317.TW',
  '公公': '2317.TW',
  '廣達': '2382.TW',
  '緯創': '3231.TW',
  '技嘉': '2376.TW',
  '微星': '2377.TW',
  '元太': '8069.TWO',
  '南亞科': '2408.TW',
  '牙科': '2408.TW',
  '華邦電': '2344.TW',
  '華崩店': '2344.TW',
  '創意': '3443.TW',
  '世芯': '3661.TW',
  '世芯-KY': '3661.TW',
  '智原': '3035.TW',
  '中鋼': '2002.TW',
  '長榮': '2603.TW',
  '陽明': '2609.TW',
  '萬海': '2615.TW',
  '欣興': '3037.TW',
  '景碩': '3189.TW',
  '南電': '8046.TW',
  '奇鋐': '3017.TW',
  '雙鴻': '3324.TW',
  '聯電': '2303.TW',
  '二哥': '2303.TW',

  // 金融股
  '國泰金': '2882.TW',
  '富邦金': '2881.TW',
  '中信金': '2891.TW',
  '兆豐金': '2886.TW',
  '玉山金': '2884.TW',
  '台新金': '2887.TW',
  '新光金': '2888.TW',
  '西瓜金': '2888.TW',
  '西瓜': '2888.TW',

  // 熱門 ETF
  '0050': '0050.TW',
  '元大台灣50': '0050.TW',
  '0056': '0056.TW',
  '元大高股息': '0056.TW',
  '00878': '00878.TW',
  '國泰永續高股息': '00878.TW',
  '00919': '00919.TW',
  '群益台灣精選高股息': '00919.TW',
  '00929': '00929.TW',
  '復華台灣科技優息': '00929.TW',
  '00940': '00940.TW',
  '元大台灣價值高息': '00940.TW',
  '00981A': '00981A.TW',
  '00403A': '00403A.TW',

  // 常見美股
  '蘋果': 'AAPL',
  'APPLE': 'AAPL',
  '微軟': 'MSFT',
  'MICROSOFT': 'MSFT',
  '輝達': 'NVDA',
  'NVIDIA': 'NVDA',
  '特斯拉': 'TSLA',
  'TESLA': 'TSLA',
  '亞馬遜': 'AMZN',
  'AMAZON': 'AMZN',
  '谷歌': 'GOOGL',
  'GOOGLE': 'GOOGL',
  '臉書': 'META',
  'META': 'META',
  '美光': 'MU',
  'MICRON': 'MU',
  '超微': 'AMD',
  '台積電ADR': 'TSM',
  'TSM': 'TSM'
}

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

  let quote: any = null
  let actualTicker = normalizedTicker
  if (COMMON_STOCK_MAP[normalizedTicker]) {
    actualTicker = COMMON_STOCK_MAP[normalizedTicker]
  }

  try {
    const twStockRegex = /^\d{4,6}[A-Z]?$/
    if (twStockRegex.test(normalizedTicker)) {
      // 嘗試 .TW 後綴
      try {
        actualTicker = `${normalizedTicker}.TW`
        quote = await yahooFinance.quote(actualTicker)
      } catch (twErr) {
        // 如果 .TW 失敗，嘗試 .TWO 後綴
        try {
          actualTicker = `${normalizedTicker}.TWO`
          quote = await yahooFinance.quote(actualTicker)
        } catch (twoErr: any) {
          console.error(`[Stock API Error] Failed to fetch ${normalizedTicker} with both .TW and .TWO:`, twoErr.message)
          // 若皆失敗，仍使用 .TW 後綴回傳錯誤資訊
          actualTicker = `${normalizedTicker}.TW`
        }
      }
    } else {
      quote = await yahooFinance.quote(normalizedTicker)
    }

    if (!quote || quote.regularMarketPrice === undefined || quote.regularMarketPrice === null) {
      const errorResult = {
        symbol: actualTicker,
        error: `找不到股票代碼 "${actualTicker}" 的價格資料`
      }
      stockCache.set(normalizedTicker, { data: errorResult, timestamp: now })
      return errorResult
    }

    const successResult: Record<string, any> = {
      symbol: actualTicker,
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
      symbol: actualTicker,
      error: `查詢股票代碼 "${actualTicker}" 時發生錯誤`
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

/**
 * 使用 Yahoo Finance 聯想搜尋 API 搜尋股票代碼與中文名稱
 */
export async function searchStockTickerWithYahoo(query: string): Promise<{ symbol: string; name: string } | null> {
  const url = `https://tw.stock.yahoo.com/stock_ms/_td-stock/api/resource/AutocompleteService;query=${encodeURIComponent(query)}`
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 5000
    })
    const results = response.data?.ResultSet?.Result
    if (Array.isArray(results) && results.length > 0) {
      // 優先尋找類型為 S (股票/Equity) 或 ETF 的結果
      const stockResult = results.find(r => r.type === 'S' || r.type === 'ETF') || results[0]
      if (stockResult && stockResult.symbol) {
        return {
          symbol: stockResult.symbol.trim(),
          name: stockResult.name ? stockResult.name.trim() : ''
        }
      }
    }
  } catch (error: any) {
    console.error(`[Yahoo Autocomplete Error] Failed to search for "${query}":`, error.message)
  }
  return null
}

/**
 * 從 Yahoo 股市網頁擷取股票/公司的中文名稱（或英文名稱）
 */
export async function fetchStockNameFromYahooPage(symbol: string): Promise<string | null> {
  const isTaiwanStock = symbol.toUpperCase().endsWith('.TW') || symbol.toUpperCase().endsWith('.TWO')
  const url = isTaiwanStock
    ? `https://tw.stock.yahoo.com/quote/${symbol}`
    : `https://finance.yahoo.com/quote/${symbol}`

  try {
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 5000
    })

    const titleMatch = res.data.match(/<title>([\s\S]*?)<\/title>/i)
    if (titleMatch && titleMatch[1]) {
      const title = titleMatch[1].trim()
      const rawName = title.split('(')[0].trim()
      if (rawName) {
        return rawName.replace(/&amp;/g, '&')
      }
    }
  } catch (error: any) {
    console.error(`[fetchStockNameFromYahooPage Error] Failed to fetch name from page for ${symbol}:`, error.message)
  }
  return null
}

/**
 * 清理股票名稱中的常見公司後綴，以便於模糊搜尋或對照
 */
export function cleanStockNameForSearch(name: string): string {
  return name
    .replace(/(?:股份有限公司|有限公司|股份|公司|集團|科技|工業|控股|精密|資通|物聯網|模組|電腦|Co\.|Ltd\.|Inc\.)/g, '')
    .trim()
}
