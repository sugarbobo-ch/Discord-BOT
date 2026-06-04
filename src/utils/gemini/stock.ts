import { ThinkingLevel, Type } from '@google/genai'
import { executeGenAI, getResponseText, getApiKey, MODEL_NAME } from './core'
import {
  getStockPrice,
  COMMON_STOCK_MAP,
  searchStockTickerWithYahoo,
  cleanStockNameForSearch,
  lookupStockTicker,
  getStockSlogan,
  getTaiwanStockName,
  taiwanStockMap,
  NICKNAME_MAP
} from '../stock'

export const getStockPriceTool = {
  functionDeclarations: [
    {
      name: 'get_stock_price',
      description:
        "查詢指定股票代碼的最新真實股價。如果是台股，請在代碼後加上 '.TW'，例如 '2330.TW'。如果是美股，請使用英文代碼，例如 'AAPL', 'MU'。",
      parameters: {
        type: Type.OBJECT,
        properties: {
          tickerSymbol: {
            type: Type.STRING,
            description: '股票代碼字串，例如 AAPL, TSLA, 2330.TW'
          }
        },
        required: ['tickerSymbol']
      }
    }
  ]
}

export interface StockAnalysisResult {
  isMentioningStock: boolean
  stocks: Array<{
    name: string
    ticker: string
  }>
}

/**
 * 使用 Gemini API 分析使用者訊息是否提及股票，並回傳格式化股票代號與名稱
 */
export const detectStocksWithAI = async (
  prompt: string,
  apiKey: string
): Promise<StockAnalysisResult> => {
  try {
    const response = await executeGenAI((ai) => ai.models.generateContent({
      model: MODEL_NAME,
      contents: [
        {
          text:
            '請分析以下使用者訊息，判斷其中是否提及、詢問或討論特定股票（包含台股、美股，或常見股票暱稱/簡稱如「發哥」代表聯發科、「二哥」等，或 4 位數台股代號、5 或 6 位數 ETF 代號）。\n' +
            '如果使用者訊息僅提及普通的數字，但無 any 股票相關意圖或前後文，請判定 isMentioningStock 為 false。\n' +
            '如果是台股，請輸出其股票名稱或常見簡稱（例如：台積電、聯發科）。如果是美股，請直接輸出其英文代號（例如：AAPL、TSLA）。\n' +
            '請只回覆一個 JSON 格式的物件，格式必須精確如下：\n' +
            '{\n' +
            '  "isMentioningStock": true/false,\n' +
            '  "stocks": [\n' +
            '    {\n' +
            '      "name": "股票名稱或簡稱，例如：聯發科",\n' +
            '      "ticker": "該股票可能的代碼（若是美股則為代號），例如：2454.TW，AAPL，2330.TW"\n' +
            '    }\n' +
            '  ]\n' +
            '}'
        },
        {
          text: `使用者訊息：\n"${prompt}"`
        }
      ],
      config: {
        responseMimeType: 'application/json',
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.MINIMAL
        }
      }
    }))

    const resultText = getResponseText(response)
    if (resultText) {
      const result = JSON.parse(resultText)
      return {
        isMentioningStock: !!result.isMentioningStock,
        stocks: Array.isArray(result.stocks) ? result.stocks : []
      }
    }
  } catch (error: any) {
    console.error('[detectStocksWithAI Error] Failed to detect stocks:', error.message)
  }
  return { isMentioningStock: false, stocks: [] }
}

/**
 * 使用 Gemini API (搭配 Google Search) 搜尋特定關鍵字/名稱對應的 Yahoo Finance 股票代碼
 */
export const searchStockTickerWithAI = async (query: string): Promise<string | null> => {
  const apiKey = getApiKey()
  if (!apiKey) {
    console.warn('Gemini API key is not configured for searchStockTickerWithAI.')
    return null
  }

  try {
    const tools = [{ googleSearch: {} }]

    const response = await executeGenAI((ai) => ai.models.generateContent({
      model: MODEL_NAME,
      contents: [
        {
          text:
            '你是一個股票代號查詢助手。請根據以下使用者輸入的股票名稱、公司名稱或關鍵字，搜尋並找出它在 Yahoo Finance (雅虎財經) 的正確股票代碼。\n' +
            '請務必遵循以下規範：\n' +
            '1. 如果是台灣上市股票，代碼後必須加上 \`.TW\`，例如 \`2313.TW\`。\n' +
            '2. 如果是台灣上櫃股票，代碼後必須加上 \`.TWO\`，例如 \`3293.TWO\`。\n' +
            '3. 如果是美股，請使用英文代碼，例如 \`MU\`, \`AAPL\`, \`TSLA\`。\n' +
            '4. 請利用 Google 搜尋工具搜尋「{查詢目標} 股票」或「{查詢目標} stock ticker」來確認代號是否最新且正確。\n' +
            '請只回覆一個 JSON 格式的物件，格式如下：\n' +
            '{"ticker": "正確的股票代碼，如 2313.TW 或 MU 或 3293.TWO，找不到則回傳 null"}'
        },
        {
          text: `查詢目標：\n"${query} 股票"`
        }
      ],
      config: {
        tools,
        responseMimeType: 'application/json',
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.MINIMAL
        }
      }
    }))

    const resultText = getResponseText(response)
    if (resultText) {
      const result = JSON.parse(resultText)
      if (result.ticker) {
        let ticker = result.ticker.trim().toUpperCase()
        // 清理代號，例如將 4927-KY.TW / 4927KY.TW 轉為 4927.TW，將 4927-KY 轉為 4927
        if (ticker.endsWith('.TW')) {
          const numMatch = ticker.match(/\d+/)
          if (numMatch) ticker = `${numMatch[0]}.TW`
        } else if (ticker.endsWith('.TWO')) {
          const numMatch = ticker.match(/\d+/)
          if (numMatch) ticker = `${numMatch[0]}.TWO`
        } else {
          const startNumMatch = ticker.match(/^\d{4,6}/)
          if (startNumMatch) {
            ticker = startNumMatch[0]
          }
        }
        return ticker
      }
    }
  } catch (error: any) {
    console.error('[searchStockTickerWithAI Error] Failed to search stock ticker:', error.message)
  }
  return null
}

/**
 * 判斷使用者輸入是否可能與股票有關，避免誤觸 AI 股票分析流程而導致漫長等待
 */
export function isPotentialStockQuery(prompt: string): boolean {
  let normalized = prompt.trim().toLowerCase()
  if (!normalized) return false

  // 1. 移除句首作為機器人稱呼/召喚詞的「波波」或「bobo」
  normalized = normalized.replace(/^(波波|bobo)\s*[,，:：]?\s*/gi, '')
  // 2. 移除句尾作為機器人稱呼/召喚詞的「波波」或「bobo」，排除前面緊鄰買/賣/多/空/砍等動作詞的情況
  normalized = normalized.replace(/(?<![買賣多空砍])\s*[,，]?\s*(波波|bobo)[?？!！.。]*$/gi, '')

  if (!normalized) return false

  // 1. 強烈股票特徵詞 (直接觸發)
  const STRONG_STOCK_KEYWORDS = [
    '股價', '股票', '行情', '個股', '收盤', '開盤', '指數', '台股', '美股',
    '目標價', '停損', '套牢', '波段', '糕點', '投顧', '分析師', '法說會',
    '開高', '開低', '走高', '走低', '跌停', '漲停', '除權息', '填息', '貼息',
    '融資', '融券', '借券', '做多', '做空', '放空', '補空', '軋空',
    '上漲', '下跌', '漲', '跌',
    'stock', 'ticker'
  ]
  if (STRONG_STOCK_KEYWORDS.some(kw => normalized.includes(kw))) {
    return true
  }

  // 2. 如果包含有順口溜的特定標的，直接觸發
  const SLOGAN_KEYWORDS = [
    '群創', '緯創', '微星', '鴻海', '友達', '彩晶', '高端', '技嘉',
    '緯穎', '陽明', '長榮', '萬海', '星宇', '金寶', '華邦電', '士電', '南亞科'
  ]
  if (SLOGAN_KEYWORDS.some(k => normalized.includes(k))) {
    return true
  }

  // 3. 4-6 位數純數字且完全匹配已知的股票代碼，直接觸發
  if (/^\d{4,6}$/.test(normalized) && (taiwanStockMap[normalized] || COMMON_STOCK_MAP[normalized])) {
    return true
  }

  // 4. 檢查是否包含股票標的 (4-6 位數純數字，或是對照表中的名字/暱稱)
  const hasStockTarget =
    /\b\d{4,6}\b/.test(normalized) ||
    Object.keys(taiwanStockMap).some(key => key.length >= 2 && normalized.includes(key.toLowerCase())) ||
    Object.keys(NICKNAME_MAP).some(key => key.length >= 2 && normalized.includes(key.toLowerCase())) ||
    Object.keys(COMMON_STOCK_MAP).some(key => key.length >= 2 && normalized.includes(key.toLowerCase()))

  if (hasStockTarget) {
    // 如果有標的，且有動作或股票相關脈絡詞，則觸發
    const STOCK_ACTION_WORDS = [
      '買', '賣', '多', '空', '前景', '投資', '分析', '砍', '避險',
      '進場', '退場', '成本', '加碼', '減碼', '停利', '獲利', '套', '糕'
    ]
    if (STOCK_ACTION_WORDS.some(word => normalized.includes(word))) {
      return true
    }
  }

  return false
}

/**
 * 根據已查詢的股票結果，產生帶有順口溜的進度更新文字
 */
export const getProgressStatus = (defaultMsg: string, stockResults: any[]): string => {
  if (stockResults.length === 0) return defaultMsg
  const slogans: string[] = []
  for (const res of stockResults) {
    const name = res.symbol ? getTaiwanStockName(res.symbol) : null
    const slogan = getStockSlogan(name || res.name || '')
    if (slogan && !slogans.includes(slogan)) {
      slogans.push(slogan)
    }
  }
  if (slogans.length > 0) {
    return slogans.map(s => `📣 **${s}**`).join('\n') + `\n\n😜 開玩笑的啦，正在為您撰寫專業的產業體質與股價趨勢分析，請稍後... ✍️`
  }
  return defaultMsg
}

/**
 * 使用 Gemini API 查詢股票代碼的中文公司名稱（針對台股或美股）
 */
export const getChineseNameWithAI = async (ticker: string, englishName?: string): Promise<string | null> => {
  const apiKey = getApiKey()
  if (!apiKey) return null

  const targetName = englishName || ticker

  try {
    const response = await executeGenAI((ai) => ai.models.generateContent({
      model: MODEL_NAME,
      contents: [
        {
          text: `你是一個公司名稱翻譯助手。請將以下上市公司的英文名稱或代碼，翻譯成其在台灣或全球股市最常見的繁體中文公司簡稱。\n` +
            `規範與範例：\n` +
            `- "Taiwan Semiconductor Manufacturing" -> "台積電"\n` +
            `- "Compeq Manufacturing Co., Ltd." -> "華通"\n` +
            `- "Elite Material Co., Ltd." -> "台光電"\n` +
            `- "Hon Hai Precision Industry" -> "鴻海"\n` +
            `- "MediaTek Inc." -> "聯發科"\n` +
            `- "Apple Inc." -> "蘋果"\n` +
            `- "Micron Technology" -> "美光"\n` +
            `請將 "${targetName}" 翻譯成最常見的繁體中文公司簡稱。請只回覆該中文簡稱，不要有任何其他標點符號、括號、說明文字或英文字母。如果無法確定，請回覆 null。`
        }
      ],
      config: {
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.MINIMAL
        }
      }
    }))

    const name = getResponseText(response)
    if (name && name !== 'null' && name.trim()) {
      return name.trim()
    }
  } catch (error) {
    console.error(`[getChineseNameWithAI Error] Failed to get Chinese name for ${ticker}:`, error)
  }
  return null
}

/**
 * 根據 GMT+8 當前系統時間，獲取人類作息與炒股/假日狀態的中性載入狀態文字
 */
export function getNeutralLoadingStatus(): string {
  const date = new Date()
  const utc = date.getTime() + (date.getTimezoneOffset() * 60000)
  const gmt8Date = new Date(utc + (3600000 * 8))
  const hour = gmt8Date.getHours()
  const day = gmt8Date.getDay() // 0 = 星期日, 6 = 星期六
  const isWeekend = day === 0 || day === 6

  let statuses: string[] = []

  if (isWeekend) {
    // 假日作息（無股市交易、休閒為主）
    if (hour >= 5 && hour < 9) {
      statuses = [
        '🛌 假日好不容易放假，波波正躺在溫暖被窩賴床中... 💤',
        '😴 波波正在被窩裡舒服地做美夢... 💤',
        '🥱 波波昨晚熬夜太晚，現在正呼呼大睡中... 💤'
      ]
    } else if (hour >= 9 && hour < 12) {
      statuses = [
        '☕ 假日免搬磚！波波正睡到自然醒，準備吃豪華早午餐... 🥓',
        '🏃‍♂️ 假日天氣好，波波正在戶外健行爬山... ⛰️',
        '🧹 波波正在家裡辛勤打掃環境、洗衣服... 🧼',
        '📱 波波正躺在床上悠閒地滑手機... 🥱'
      ]
    } else if (hour >= 12 && hour < 14) {
      statuses = [
        '🍱 難得放假，波波正在排隊吃熱門早午餐... 😋',
        '🥤 假日力不從心 (太熱啦)，波波正在買手搖杯消暑... 🧋',
        '🍿 週末放假，波波正在影城看電影吃爆米花... 🎬',
        '🍲 波波正在跟家人吃美味的週末大餐... 😋'
      ]
    } else if (hour >= 14 && hour < 18) {
      statuses = [
        '🎮 假日爽翻！波波正在痛快地打電動摸魚... 👾',
        '🛍️ 難得放假，波波正在百貨公司逛街血拼... 💸',
        '🧁 波波正在網美咖啡廳吃下午茶蛋糕... 🍰',
        '💤 假日午後最適合補眠，波波正舒服地睡午覺... 🥱'
      ]
    } else if (hour >= 18 && hour < 20) {
      statuses = [
        '🍲 週末夜晚！波波正在爽吃美味的麻辣火鍋... 🍲',
        '🍢 波波正在夜市排隊買地瓜球跟大雞排... 😋',
        '🍻 週末爽喝！波波正在餐酒館跟朋友暢飲聚餐... 🍻',
        '🥩 週末犒賞自己，波波正在吃厚切沙朗牛排... 🍳'
      ]
    } else if (hour >= 20 && hour < 23) {
      statuses = [
        '📺 假日晚間，波波正躺在沙發上當馬鈴薯追劇... 🍿',
        '🎮 週末夜！波波正跟朋友在語音頻道連線打牌... 👾',
        '🌌 週末夜風微涼，波波正在陽台吹風看夜景... 🌃'
      ]
    } else {
      statuses = [
        '📱 假日捨不得睡，波波正躺在床上熬夜滑手機... 📱',
        '🛌 波波出門玩累了，現在正在舒服地大字形睡覺... 💤',
        '😴 假日深夜，波波已經進入甜美的夢鄉... 💤'
      ]
    }
  } else {
    // 平日作息（含股市開盤、工作與炒股）
    if (hour >= 5 && hour < 9) {
      statuses = [
        '☕ 波波正在吃美而美蛋餅... 🥚',
        '🥛 波波正在喝大冰奶... 🏃‍♂️',
        '🥪 波波正在排隊買飯糰... 🥱',
        '🥣 波波正在吃清粥小菜配肉鬆... 🥬',
        '🥖 波波正在啃燒餅油條配鹹豆漿... 🥛',
        '🍔 波波正在大口吃卡啦雞腿堡... 🐔',
        '🍙 波波正在吃超商御飯糰配黑咖啡... ☕'
      ]
    } else if (hour >= 9 && hour < 12) {
      statuses = [
        '💻 波波正在努力搬磚中... 🧱',
        '🥱 波波正在晨會裝忙... 📊',
        '📝 波波正在偷看摸魚網頁... 🐟',
        '📈 波波正在盯盤看紅綠棒棒... 🕯️',
        '💸 波波正在當沖衝浪中... 🏄‍♂️',
        '📉 波波看著綠油油的盤面在發抖... 🥶',
        '🚀 波波正在大喊「飛向宇宙，浩瀚無垠」... ☄️'
      ]
    } else if (hour >= 12 && hour < 14) {
      statuses = [
        '🍱 波波正在排隊買排骨便當... 😋',
        '🥤 波波正在買珍奶微糖微冰... 🧋',
        '🤤 波波午休正在流口水... 😴',
        '🥟 波波正在吃八方雲集招牌水餃... 🥟',
        '🍜 波波正在大口吃牛肉麵配酸菜... 🥢',
        '🥗 波波宣稱要減肥，正在艱苦啃沙拉... 🥬',
        '🥣 波波今天當沖賠慘，正在端著碗去天台排隊... 🏢',
        '📊 波波正在一邊吃排骨飯一邊盯著尾盤損益... 💸'
      ]
    } else if (hour >= 14 && hour < 18) {
      statuses = [
        '☕ 波波正在泡下午茶拿鐵... 🥛',
        '🍪 波波正在偷吃下午茶點心... 😋',
        '🏃‍♂️ 波波正在當薪水小偷 (偷懶中)... 🤫',
        '☕ 波波正在喝熱咖啡壓壓驚... 🍰',
        '😭 波波正在暗自計算今天當沖又賠了多少錢... 💸'
      ]
    } else if (hour >= 18 && hour < 20) {
      statuses = [
        '🍲 波波正在想晚餐要吃什麼... 🤤',
        '🍜 波波正在大口吸拉麵... 🥢',
        '🚗 波波正在下班塞車路段... 🚦',
        '🥩 波波今天當沖賺大錢，晚餐正在爽吃和牛... 🥩',
        '🍜 波波今天被大戶割韭菜，晚餐只能吃陽春麵... 😭',
        '🍗 波波正在夜市買裝鹽酥雞配大雞排... 😋',
        '🍲 波波正在跟朋友聚餐吃海底撈... 🍲',
        '🥩 波波正在吃夜市平價雙拼牛排... 🍳',
        '🍙 波波今天加班，只能吃超商微波便當... 😭'
      ]
    } else if (hour >= 20 && hour < 23) {
      statuses = [
        '🎮 波波正在開心地打電動... 👾',
        '📺 波波正在沙發上當馬鈴薯追劇... 🍿',
        '🏋️‍♂️ 波波正在健身房假裝運動... 💦',
        '📊 波波正在研究明天的股市開盤策略... 📈'
      ]
    } else {
      statuses = [
        '😴 波波正在夢周公... 💤',
        '🛌 波波正躺在床上滑手機不睡覺... 📱',
        '🌌 波波深夜正在思考人生宇宙... 🪐'
      ]
    }
  }

  const selected = statuses[Math.floor(Math.random() * statuses.length)]
  return `${selected}，馬上為您處理，請稍後... ⚡`
}

