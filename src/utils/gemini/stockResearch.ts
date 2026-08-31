import { getApiKey, getResponseText, MODEL_NAME } from './core'
import { generateContentWithPolicy } from './thinkingPolicy'

export interface StockResearchTarget {
  name: string
  ticker: string
}

export interface StockResearchSource {
  title: string
  url: string
}

export interface StockResearchResult {
  searchedAt: string
  summary: string
  sources: StockResearchSource[]
  queries: string[]
}

export async function researchRecentStockEvents(
  targets: readonly StockResearchTarget[],
  prompt: string
): Promise<StockResearchResult | null> {
  if (!getApiKey() || targets.length === 0) return null

  const uniqueTargets = Array.from(
    new Map(
      targets.map(target => [target.ticker.toUpperCase(), { ...target, ticker: target.ticker.toUpperCase() }])
    ).values()
  )
  const searchedAt = new Date().toISOString()
  try {
    const response = await generateContentWithPolicy({
      operation: 'research',
      request: {
        model: MODEL_NAME,
        contents: [
          {
            text:
              '你是股票近期事件研究助手。使用 Google Search 查詢指定公司最近 30 天的公司公告、法說、財報、營收、產業事件與可信財經新聞。' +
              '只保留能解釋近期價格或成交量變化的事件；區分已確認事實與媒體推測，不提供買賣指令，不得捏造日期、數字或來源。' +
              '以繁體中文輸出精簡摘要，每項事件附日期與來源名稱。若沒有可靠的新資訊，明確回答查無足夠近期事件。'
          },
          {
            text: `查詢時間（UTC）：${searchedAt}\n標的：${uniqueTargets
              .map(target => `${target.name} (${target.ticker})`)
              .join('、')}\n使用者問題：${prompt}`
          }
        ],
        config: {
          tools: [{ googleSearch: {} }],
          toolConfig: {
            includeServerSideToolInvocations: true
          }
        }
      }
    })

    const summary = getResponseText(response).trim()
    if (!summary) return null
    const metadata = response?.candidates?.[0]?.groundingMetadata
    const sources: StockResearchSource[] = []
    const seenUrls = new Set<string>()
    for (const chunk of metadata?.groundingChunks || []) {
      const web = chunk?.web
      const url = web?.uri?.trim()
      if (!url || seenUrls.has(url)) continue
      seenUrls.add(url)
      sources.push({
        title: web?.title?.trim() || new URL(url).hostname,
        url
      })
    }

    return {
      searchedAt,
      summary,
      sources,
      queries: metadata?.webSearchQueries || []
    }
  } catch (error: any) {
    console.warn('[Stock Recent Event Research Failed]:', error.message)
    return null
  }
}
