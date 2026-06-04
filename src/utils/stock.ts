import YahooFinance from 'yahoo-finance2'
import axios from 'axios'
import * as fs from 'fs'
import * as path from 'path'

const yahooFinance = new YahooFinance({
  suppressNotices: ['yahooSurvey']
})

export const COMMON_STOCK_MAP: Record<string, string> = {
  // 熱門 ETF (以防證交所 JSON 更新或快取失效，作為快速查表)
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

  // 常見美股與 ADR
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
  'TSM': 'TSM',
  '海馬': 'HIMX',
  '奇景': 'HIMX'
}

export const NICKNAME_MAP: Record<string, string> = {
  // 台股龍頭與熱門股
  'GG': '台積電',
  '護國神山': '台積電',
  '大哥': '台積電',
  '台積': '台積電',

  '小GG': '力積電',
  '力晶': '力積電',
  '天后': '力積電',
  'ZG': '力積電',

  '仙境RO': '世界',
  'DIO': '世界',
  '世界先進': '世界',

  '二哥': '聯電',
  '聯二哥': '聯電',
  '大碩': '聯電',

  '公公': '鴻海',
  '海公公': '鴻海',
  '海邊': '鴻海',

  '羚羊': '凌陽',
  '發哥': '聯發科',
  '螃蟹': '瑞昱',

  '阿姨的股': '宏達電',
  '紅茶店': '宏達電',
  'hㄒㄈ': '宏達電',

  '戀人': '友達',
  '包子': '群創',
  '肉鬆': '廣達',

  '小英': '英業達',
  '英業金': '英業達',

  '神教': '日月光投控',
  '日月光': '日月光投控',

  '皮卡': '和碩',
  '麵包店': '欣興',
  '客運': '欣興',
  '石頭': '華碩',
  '小石頭': '華擎',

  'G心': '技嘉',
  '雞排': '技嘉',
  '小星星': '微星',
  '黃色鬼屋': '燦坤',

  '種花電': '中華電',
  '中華電信': '中華電',

  '滷肉': '聯詠',

  '股王': '大立光',
  '大力肛': '大立光',
  '穩套': '穩懋',
  '旺綠': '旺宏',
  '寶寶': '仁寶',
  '華崩電': '華邦電',
  '華崩店': '華邦電',
  '華二哥': '華新科',
  '傢俱': '力麗',

  '聯合往生': '聯合再生',
  '往生': '聯合再生',

  '金瓜': '聯茂',
  '大茂': '聯茂',

  '金項鍊': '金像電',

  '沒的醫': '美德醫療-DR',
  '沒得醫': '美德醫療-DR',
  '美德醫DR': '美德醫療-DR',
  '美德醫療DR': '美德醫療-DR',

  '被動元件大哥': '國巨*',
  '國巨': '國巨*',

  '泰金寶DR': '泰金寶-DR',

  '電鍋': '大同',
  '小家電': '燦星網',
  '牛肉麵': '三商',

  '精神科': '精成科',

  '同性戀': '同欣電',

  '牙科': '南亞科',
  '智崩': '智邦',

  '機殼王': '可成',
  '賣廠王': '可成',
  '準哥': '鴻準',
  '杏仁糕': '興能高',
  '翼龍': '義隆',
  '小明': '廣明',
  '音浪': '力成',
  '麵包機': '新麥',
  '可愛教主': '成霖',
  '寶咖咖': '櫻花建',
  '寶佳': '櫻花建',

  '綠巨人': '長榮',
  '染髮劑': '美吾華',
  '一生一世': '中石化',
  '保齡球': '寶齡富錦',
  '五金行': '振宇五金',

  '軟板王': '嘉聯益',
  '嘎聯益': '嘉聯益',

  '小寶雅': '弘帆',
  '鵬哥': '敬鵬',
  '威力彩': '撼訊',
  '台表哥': '台表科',
  '威而鋼': '威剛',
  '張寶成': '寶成',
  '冷氣': '東元',
  '雅妮': '亞泥',
  '土地公': '正德',

  '荔枝': '力致',
  '奶雞': '力致',

  '滑西瓜': '華星光',
  '波波': '波若威',
  '限制': '波若威',

  '男子漢': '楠梓電',
  '男子電': '楠梓電',
  '大象': '鈊象',
  '邰哥': '智原',
  '高枝': '高技',
  '高麗菜': '高力',
  '阿達': '神達',
  '竹子': '竹陞科技',
  '負心漢': '新漢',
  '大淫威': '大銀微系統',
  '佩佩豬': '康霈',

  // 金融類股
  '西瓜金': '台新新光金',
  '西瓜': '台新新光金',
  '新光金': '台新新光金',
  '紐約金': '兆豐金',
  '馬家金': '元大金',
  '榮家銀': '上海商銀',
  '大樹金': '國泰金',
  '何家金': '永豐金',
  '一元金': '中信金',
  '牡蠣金': '中信金',
  '拉拉金': '華南金',
  '拉拉熊金': '華南金',
  '高山金': '玉山金',
  '魚翅金': '富邦金',
  '二元金': '富邦金',
  '三商獸': '三商壽',
  '三商人壽': '三商壽',
  '老董': '永豐金',
  '京城銀': '永豐金'
}

interface CacheEntry {
  data: Record<string, any>
  timestamp: number
}

const stockCache = new Map<string, CacheEntry>()
const CACHE_TTL = 60 * 1000 // 60 seconds

let twseCookieCache: { header: string; expires: number } | null = null

async function getTwseCookie(): Promise<string> {
  const now = Date.now()
  if (twseCookieCache && twseCookieCache.expires > now) {
    return twseCookieCache.header
  }

  try {
    const sessionResponse = await axios.get('https://mis.twse.com.tw/stock/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 5000
    })
    const cookies = sessionResponse.headers['set-cookie']
    const cookieHeader = cookies ? cookies.map(c => c.split(';')[0]).join('; ') : ''
    twseCookieCache = {
      header: cookieHeader,
      expires: now + 30 * 60 * 1000
    }
    return cookieHeader
  } catch (error: any) {
    console.error('[TWSE Cookie Fetch Error]:', error.message)
    return ''
  }
}

async function fetchFromTWSE(ticker: string): Promise<Record<string, any> | null> {
  const isOtc = ticker.toUpperCase().endsWith('.TWO')
  const code = ticker.split('.')[0]
  const ex_ch = `${isOtc ? 'otc' : 'tse'}_${code}.tw`

  try {
    const cookieHeader = await getTwseCookie()
    const url = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${ex_ch}&json=1&delay=0&_=${Date.now()}`
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Cookie': cookieHeader,
        'Referer': 'https://mis.twse.com.tw/stock/'
      },
      timeout: 5000
    })

    const msg = response.data?.msgArray?.[0]
    if (msg && msg.z && msg.z !== '-') {
      const price = parseFloat(msg.z)
      const prevClose = parseFloat(msg.y)
      const change = price - prevClose
      const changePercent = prevClose !== 0 ? (change / prevClose) * 100 : 0

      return {
        symbol: ticker,
        price: price,
        currency: 'TWD',
        name: msg.n || null,
        change: change,
        changePercent: changePercent,
        dayLow: msg.l !== '-' ? parseFloat(msg.l) : null,
        dayHigh: msg.h !== '-' ? parseFloat(msg.h) : null,
        volume: parseInt(msg.v, 10) || 0,
        previousClose: prevClose,
        open: msg.o !== '-' ? parseFloat(msg.o) : null
      }
    }
  } catch (error: any) {
    console.error(`[TWSE Fetch Error] Failed for ${ticker}:`, error.message)
  }
  return null
}

async function fetchFromYahooTWScraper(ticker: string): Promise<Record<string, any> | null> {
  const url = `https://tw.stock.yahoo.com/quote/${ticker}`
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 5000
    })
    const html = response.data
    const matchState = html.match(/root\.App\.main\s*=\s*(\{[\s\S]+?\});\n/m)
    if (matchState) {
      const jsonText = matchState[1]
      const parsed = Function(`return ${jsonText}`)()
      const quote = parsed?.context?.dispatcher?.stores?.QuoteFundamental?.quote?.data
      if (quote && quote.price && quote.price.raw !== undefined && quote.price.raw !== null) {
        let changePercent = 0
        if (typeof quote.changePercent === 'string') {
          changePercent = parseFloat(quote.changePercent.replace('%', '')) || 0
        } else if (typeof quote.changePercent === 'number') {
          changePercent = quote.changePercent
        }

        return {
          symbol: ticker,
          price: parseFloat(quote.price.raw),
          currency: quote.currency || 'TWD',
          name: quote.symbolName || null,
          change: quote.change && quote.change.raw !== undefined ? parseFloat(quote.change.raw) : null,
          changePercent: changePercent,
          dayLow: quote.regularMarketDayLow && quote.regularMarketDayLow.raw !== undefined ? parseFloat(quote.regularMarketDayLow.raw) : null,
          dayHigh: quote.regularMarketDayHigh && quote.regularMarketDayHigh.raw !== undefined ? parseFloat(quote.regularMarketDayHigh.raw) : null,
          volume: quote.volume ? parseInt(quote.volume, 10) : 0,
          previousClose: quote.regularMarketPreviousClose && quote.regularMarketPreviousClose.raw !== undefined ? parseFloat(quote.regularMarketPreviousClose.raw) : null,
          open: quote.regularMarketOpen && quote.regularMarketOpen.raw !== undefined ? parseFloat(quote.regularMarketOpen.raw) : null
        }
      }
    }
  } catch (error: any) {
    console.error(`[Yahoo TW Scraper Error] Failed for ${ticker}:`, error.message)
  }
  return null
}

/**
 * 查詢指定股票代碼的最新股價與財務數據（支援三層降級回退鏈與 60 秒記憶體快取）
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

  let actualTicker = normalizedTicker
  if (COMMON_STOCK_MAP[normalizedTicker]) {
    actualTicker = COMMON_STOCK_MAP[normalizedTicker]
  }

  const twStockRegex = /^\d{4,6}[A-Z]?$/
  if (twStockRegex.test(actualTicker)) {
    await initTaiwanStockMap()
    const resolvedTwTicker = getTaiwanStockTicker(actualTicker)
    if (resolvedTwTicker) {
      actualTicker = resolvedTwTicker
    }
  }

  const isTaiwanStock = actualTicker.endsWith('.TW') || actualTicker.endsWith('.TWO')

  // Tier 1 & Tier 2: Try TWSE and Yahoo TW Web Scraper for Taiwan Stocks
  if (isTaiwanStock) {
    const twseResult = await fetchFromTWSE(actualTicker)
    if (twseResult) {
      stockCache.set(normalizedTicker, { data: twseResult, timestamp: now })
      return twseResult
    }

    const yahooTwResult = await fetchFromYahooTWScraper(actualTicker)
    if (yahooTwResult) {
      stockCache.set(normalizedTicker, { data: yahooTwResult, timestamp: now })
      return yahooTwResult
    }
  }

  // Tier 3: Fallback to global Yahoo Finance API
  let quote: any = null
  try {
    if (!isTaiwanStock && twStockRegex.test(actualTicker)) {
      try {
        const testTicker = `${actualTicker}.TW`
        quote = await yahooFinance.quote(testTicker)
        actualTicker = testTicker
      } catch (twErr) {
        try {
          const testTicker = `${actualTicker}.TWO`
          quote = await yahooFinance.quote(testTicker)
          actualTicker = testTicker
        } catch (twoErr: any) {
          console.error(`[Stock API Error] Failed to fetch ${actualTicker} with both .TW and .TWO:`, twoErr.message)
          actualTicker = `${actualTicker}.TW`
        }
      }
    } else {
      quote = await yahooFinance.quote(actualTicker)
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
    console.error(`[Stock API Error] Failed to fetch ${actualTicker}:`, error.message)
    const errorResult = {
      symbol: actualTicker,
      error: `查詢股票代碼 "${actualTicker}" 時發生錯誤`
    }
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
  twseCookieCache = null
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

const STOCK_MAP_PATH = path.join(__dirname, '../../config/taiwan_stocks.json')
export let taiwanStockMap: Record<string, string> = {}
let isLoaded = false

export async function initTaiwanStockMap() {
  if (isLoaded) return

  if (process.env.VITEST) {
    isLoaded = true
    return
  }

  try {
    if (fs.existsSync(STOCK_MAP_PATH)) {
      const data = fs.readFileSync(STOCK_MAP_PATH, 'utf-8')
      taiwanStockMap = JSON.parse(data)
      isLoaded = true
      console.log(`[Stock Map] Loaded ${Object.keys(taiwanStockMap).length} symbols from cache.`)

      const stats = fs.statSync(STOCK_MAP_PATH)
      const ageMs = Date.now() - stats.mtimeMs
      if (ageMs > 24 * 60 * 60 * 1000) {
        console.log('[Stock Map] Cache is older than 24 hours. Updating in background...')
        updateTaiwanStockMapInBackground()
      }
    } else {
      console.log('[Stock Map] No cache found. Fetching stock map from TWSE...')
      await updateTaiwanStockMap()
    }
  } catch (err: any) {
    console.error('[Stock Map] Failed to initialize stock map:', err.message)
    updateTaiwanStockMapInBackground()
  }
}

async function updateTaiwanStockMapInBackground() {
  try {
    await updateTaiwanStockMap()
  } catch (err: any) {
    console.error('[Stock Map] Background update failed:', err.message)
  }
}

export async function updateTaiwanStockMap() {
  try {
    const res2 = await axios.get('https://isin.twse.com.tw/isin/C_public.jsp?strMode=2', {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 10000
    })
    const html2 = new TextDecoder('big5').decode(res2.data)
    const map2 = parseTWSEHtml(html2, '.TW')

    const res4 = await axios.get('https://isin.twse.com.tw/isin/C_public.jsp?strMode=4', {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 10000
    })
    const html4 = new TextDecoder('big5').decode(res4.data)
    const map4 = parseTWSEHtml(html4, '.TWO')

    const res5 = await axios.get('https://isin.twse.com.tw/isin/C_public.jsp?strMode=5', {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 10000
    })
    const html5 = new TextDecoder('big5').decode(res5.data)
    const map5 = parseTWSEHtml(html5, '.TWO')

    taiwanStockMap = { ...map2, ...map4, ...map5 }
    isLoaded = true

    const dir = path.dirname(STOCK_MAP_PATH)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(STOCK_MAP_PATH, JSON.stringify(taiwanStockMap))
    console.log(`[Stock Map] Updated and saved ${Object.keys(taiwanStockMap).length} symbols.`)
  } catch (err: any) {
    throw new Error(`Failed to fetch TWSE/OTC stock lists: ${err.message}`)
  }
}

function parseTWSEHtml(html: string, suffix: string): Record<string, string> {
  const map: Record<string, string> = {}
  const regex = /<td[^>]*>\s*(\d{4,6}[a-zA-Z]?)\s+([^<]+)<\/td>/gi
  let match
  while ((match = regex.exec(html)) !== null) {
    const code = match[1].trim()
    const name = match[2].trim()
    const ticker = `${code}${suffix}`

    map[name] = ticker
    map[code] = ticker
  }
  return map
}

export function getTaiwanStockTicker(nameOrCode: string): string | null {
  if (!isLoaded) {
    try {
      if (fs.existsSync(STOCK_MAP_PATH)) {
        const data = fs.readFileSync(STOCK_MAP_PATH, 'utf-8')
        taiwanStockMap = JSON.parse(data)
        isLoaded = true
      }
    } catch {}
  }
  return taiwanStockMap[nameOrCode] || null
}

export async function lookupStockTicker(query: string): Promise<string | null> {
  const normalized = query.trim()
  if (!normalized) return null

  const upperQuery = normalized.toUpperCase()

  // Check NICKNAME_MAP first
  let target = normalized
  if (NICKNAME_MAP[normalized]) {
    target = NICKNAME_MAP[normalized]
  } else if (NICKNAME_MAP[upperQuery]) {
    target = NICKNAME_MAP[upperQuery]
  }

  const upperTarget = target.toUpperCase()

  // 1. Check COMMON_STOCK_MAP
  if (COMMON_STOCK_MAP[target]) {
    return COMMON_STOCK_MAP[target]
  }
  if (COMMON_STOCK_MAP[upperTarget]) {
    return COMMON_STOCK_MAP[upperTarget]
  }

  // 2. Check crawled Taiwan stock list
  await initTaiwanStockMap()
  const twTicker = getTaiwanStockTicker(target)
  if (twTicker) {
    return twTicker
  }
  const twTickerUpper = getTaiwanStockTicker(upperTarget)
  if (twTickerUpper) {
    return twTickerUpper
  }

  // 3. Check if it's a direct US stock ticker (1-5 letters)
  const isUsTicker = /^[A-Z]{1,5}$/.test(upperTarget)
  if (isUsTicker) {
    return upperTarget
  }

  // 4. Check if it's a direct TW/TWO ticker with suffix (e.g. 2330.TW, 8069.TWO)
  const isDirectTwTicker = /^\d{4,6}\.(TW|TWO)$/i.test(target)
  if (isDirectTwTicker) {
    return upperTarget
  }

  return null
}

/**
 * 根據股票代號反向查詢台灣股票的中文名稱
 */
export function getTaiwanStockName(symbol: string): string | null {
  const upperSymbol = symbol.trim().toUpperCase()
  const code = upperSymbol.split('.')[0]

  if (!isLoaded) {
    try {
      if (fs.existsSync(STOCK_MAP_PATH)) {
        const data = fs.readFileSync(STOCK_MAP_PATH, 'utf-8')
        taiwanStockMap = JSON.parse(data)
        isLoaded = true
      }
    } catch {}
  }

  for (const [key, val] of Object.entries(taiwanStockMap)) {
    if (val.toUpperCase() === upperSymbol && key !== code) {
      return key
    }
  }
  return null
}

export const STOCK_SLOGANS: Array<{ keywords: string[]; slogan: string }> = [
  { keywords: ['群創'], slogan: '買入群創 身心受創' },
  { keywords: ['緯創'], slogan: '買入緯創 也是身心受創' },
  { keywords: ['微星'], slogan: '買入微星 眼冒金星' },
  { keywords: ['鴻海'], slogan: '買入鴻海 石沉大海' },
  { keywords: ['友達'], slogan: '買入友達 人生阿達' },
  { keywords: ['彩晶'], slogan: '買入彩晶 需要收驚' },
  { keywords: ['高端'], slogan: '買入高端 等著被端' },
  { keywords: ['技嘉'], slogan: '買入技嘉 回不了家' },
  { keywords: ['緯穎'], slogan: '買入緯穎 看到鬼影' },
  { keywords: ['陽明'], slogan: '買入陽明 不見光明' },
  { keywords: ['長榮'], slogan: '買入長榮 無地自容' },
  { keywords: ['萬海'], slogan: '加碼萬海 準備跳海' },
  { keywords: ['星宇'], slogan: '買入星宇 人生無語' },
  { keywords: ['金寶'], slogan: '買入金寶 要吃不飽' },
  { keywords: ['華邦電'], slogan: '買入華邦電 觸碰高壓電' },
  { keywords: ['士電'], slogan: '買入士電 人已觸電' },
  { keywords: ['南亞科'], slogan: '買入南亞科 蛋蛋少一顆' }
]

export function getStockSlogan(name: string): string | null {
  const cleanName = name.trim()
  for (const entry of STOCK_SLOGANS) {
    if (entry.keywords.some(k => cleanName.includes(k))) {
      return entry.slogan
    }
  }
  return null
}

