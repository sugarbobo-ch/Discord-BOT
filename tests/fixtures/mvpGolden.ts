import {
  classifyCallerIntent,
  routeConversation,
  shouldWriteMemoryCandidate,
  type ConversationMessage
} from '../../src/utils/conversation'
import {
  extractDeterministicStockEntities,
  validateDeterministicStockClaims
} from '../../src/utils/stock'

export interface MvpGoldenCase {
  id: string
  category: 'reply' | 'mention' | 'entity' | 'conflict' | 'intent' | 'grounding' | 'memory_gate'
  run: () => boolean
}

const message = (
  id: string,
  authorId: string,
  content: string,
  timestamp: number,
  replyToId?: string
): ConversationMessage => ({ id, authorId, content, timestamp, replyToId })

const cases: MvpGoldenCase[] = []

for (let index = 0; index < 15; index++) {
  cases.push({
    id: `reply-${index + 1}`,
    category: 'reply',
    run: () => {
      const parent = message(`reply-parent-${index}`, `user-${index}`, `主題 ${index}`, 1_000)
      const unrelated = message(
        `reply-other-${index}`,
        `other-${index}`,
        '另一個完全不同的話題',
        1_100
      )
      const current = message(
        `reply-current-${index}`,
        `caller-${index}`,
        '請針對上面回答',
        1_200,
        parent.id
      )
      return (
        routeConversation(current, [parent, unrelated])
          .selectedMessages.map(item => item.id)
          .join() === parent.id
      )
    }
  })
}

for (let index = 0; index < 10; index++) {
  cases.push({
    id: `mention-${index + 1}`,
    category: 'mention',
    run: () => {
      const targetAuthorId = String(100000000000000000 + index)
      const target = message(`mention-target-${index}`, targetAuthorId, '請看這個話題', 1_000)
      const unrelated = message(`mention-other-${index}`, String(200000000000000000 + index), '晚餐吃什麼', 1_100)
      const current = message(
        `mention-current-${index}`,
        `caller-${index}`,
        `<@${target.authorId}> 這件事怎麼辦`,
        1_200
      )
      return routeConversation(current, [target, unrelated]).parentId === target.id
    }
  })
}

for (let index = 0; index < 15; index++) {
  cases.push({
    id: `entity-${index + 1}`,
    category: 'entity',
    run: () => {
      const matching = message(
        `entity-match-${index}`,
        `user-${index}`,
        '6515 的成交量與欣興消息',
        9_000
      )
      const unrelated = message(`entity-other-${index}`, `other-${index}`, 'MU 的 HBM 需求', 9_500)
      const current = message(
        `entity-current-${index}`,
        `caller-${index}`,
        '6515 的目標價怎麼看',
        10_000
      )
      const result = routeConversation(current, [matching, unrelated])
      return (
        result.parentId === matching.id &&
        result.droppedMessages.some(item => item.id === unrelated.id)
      )
    }
  })
}

for (let index = 0; index < 10; index++) {
  cases.push({
    id: `entity-conflict-${index + 1}`,
    category: 'conflict',
    run: () => {
      const current = message(
        `conflict-current-${index}`,
        `caller-${index}`,
        '6515 的目標價',
        10_000
      )
      const conflicting = message(`conflict-other-${index}`, `user-${index}`, 'MU 的目標價', 9_900)
      return routeConversation(current, [conflicting]).selectedMessages.length === 0
    }
  })
}

const intentCases: Array<{
  label: string
  content: string
  intent: ReturnType<typeof classifyCallerIntent>['intent']
}> = [
  { label: 'stock-fact-code', content: '2330 股價多少', intent: 'ask_stock_fact' },
  { label: 'stock-fact-us', content: 'AAPL 最新價格', intent: 'ask_stock_fact' },
  { label: 'stock-fact-ticker', content: '6515 代號是什麼', intent: 'ask_stock_fact' },
  { label: 'stock-fact-quote', content: '欣興目前報價', intent: 'ask_stock_fact' },
  { label: 'stock-fact-close', content: '聯發科收盤多少', intent: 'ask_stock_fact' },
  { label: 'stock-analysis-target', content: '6515 目標價多少', intent: 'ask_analysis' },
  { label: 'stock-analysis-outlook', content: '台積電前景怎麼看', intent: 'ask_analysis' },
  { label: 'stock-analysis-growth', content: '仁寶會漲到150嗎', intent: 'ask_analysis' },
  { label: 'stock-analysis-entry', content: 'AAPL 現在適合進場嗎', intent: 'ask_analysis' },
  { label: 'stock-analysis-risk', content: 'MU 的投資風險分析', intent: 'ask_analysis' },
  { label: 'memory-1', content: '你還記得我喜歡貓嗎', intent: 'ask_memory' },
  { label: 'memory-2', content: '我的長期記憶有哪些', intent: 'ask_memory' },
  { label: 'memory-3', content: '忘記我之前說的偏好', intent: 'ask_memory' },
  { label: 'memory-4', content: '你記得我的稱呼嗎', intent: 'ask_memory' },
  { label: 'memory-5', content: '回憶一下我住哪裡', intent: 'ask_memory' },
  { label: 'correction-1', content: '6515不是美光', intent: 'correct_bot' },
  { label: 'correction-2', content: '你搞錯代號了', intent: 'correct_bot' },
  { label: 'correction-3', content: '更正，這不是那家公司', intent: 'correct_bot' },
  { label: 'casual-1', content: '今天吃飽了嗎', intent: 'casual_chat' },
  { label: 'casual-2', content: '哈哈這太好笑了', intent: 'casual_chat' }
]

for (const [index, item] of intentCases.entries()) {
  cases.push({
    id: `intent-${index + 1}-${item.label}`,
    category: 'intent',
    run: () => classifyCallerIntent(item.content).intent === item.intent
  })
}

for (let index = 0; index < 8; index++) {
  cases.push({
    id: `grounding-valid-${index + 1}`,
    category: 'grounding',
    run: () =>
      validateDeterministicStockClaims(
        index % 2 === 0 ? '6515 是欣興。' : '6515 是欣興；MU 是美光，兩者不同。',
        extractDeterministicStockEntities('6515')
      ).valid
  })
}

for (let index = 0; index < 7; index++) {
  cases.push({
    id: `grounding-invalid-${index + 1}`,
    category: 'grounding',
    run: () =>
      !validateDeterministicStockClaims(
        index % 2 === 0 ? '6515 是美光 MU。' : '6515（美商美光）的目標價。',
        extractDeterministicStockEntities('6515')
      ).valid
  })
}

for (let index = 0; index < 8; index++) {
  cases.push({
    id: `memory-gate-allow-${index + 1}`,
    category: 'memory_gate',
    run: () => shouldWriteMemoryCandidate(index % 2 === 0 ? '我喜歡吃拉麵' : 'I prefer tea')
  })
}

for (let index = 0; index < 7; index++) {
  cases.push({
    id: `memory-gate-block-${index + 1}`,
    category: 'memory_gate',
    run: () => !shouldWriteMemoryCandidate(index % 2 === 0 ? '6515不是美光' : '你還記得我嗎')
  })
}

if (cases.length !== 100) {
  throw new Error(`Expected 100 MVP golden cases, received ${cases.length}.`)
}

export const MVP_GOLDEN_CASES = cases
