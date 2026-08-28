import { describe, expect, test } from 'vitest'
import {
  extractConversationEntityKeys,
  extractMentionUserIds,
  routeConversation,
  scoreConversationEdge,
  type ConversationMessage
} from '../../src/utils/conversation'

const message = (
  id: string,
  authorId: string,
  content: string,
  timestamp: number,
  replyToId?: string
): ConversationMessage => ({ id, authorId, content, timestamp, replyToId })

describe('conversation router', () => {
  test('extracts Discord mentions and deterministic-shaped stock entities', () => {
    expect(extractMentionUserIds('欸 <@123> 和 <@!456>')).toEqual(['123', '456'])
    expect(extractConversationEntityKeys('6515 的目標價與 NVDA 財報')).toEqual([
      'stock:6515',
      'stock:NVDA'
    ])
    expect(extractConversationEntityKeys('3037 和 2002 該買嗎')).toEqual([
      'stock:3037',
      'stock:2002'
    ])
    expect(extractConversationEntityKeys('2024 年新年快樂，我買了 3000 元遊戲')).toEqual([])
  })

  test('treats an explicit reply as a hard link and drops an unrelated topic', () => {
    const parent = message('parent', 'alice', '欣興 6515 週一會跌嗎', 1_000)
    const unrelated = message('other', 'bob', '美光 MU 的 HBM 怎麼看', 1_100)
    const current = message('current', 'carol', '跌停有沒有被打開', 1_200, parent.id)

    const result = routeConversation(current, [parent, unrelated])

    expect(result.parentId).toBe('parent')
    expect(result.selectedMessages.map(item => item.id)).toEqual(['parent'])
    expect(result.droppedMessages.map(item => item.id)).toEqual(['other'])
    expect(result.threadId).toBe('thread:parent')
  })

  test('does not replace a missing explicit reply target with an implicit candidate', () => {
    const current = message('current', 'carol', '6515 的目標價', 1_200, 'missing-parent')
    const candidate = message('candidate', 'alice', '6515 的成交量', 1_100)

    const result = routeConversation(current, [candidate])

    expect(result.parentId).toBeNull()
    expect(result.selectedMessages).toEqual([])
    expect(result.threadId).toBe('thread:missing-parent')
  })

  test('uses entity and lexical signals for implicit routing', () => {
    const current = message('current', 'carol', '6515 的目標價可以看到哪裡？', 10_000)
    const matching = message('matching', 'alice', '欣興 6515 先看成交量', 9_000)
    const unrelated = message('unrelated', 'bob', '今天晚上要不要打遊戲', 9_500)

    const result = routeConversation(current, [matching, unrelated])

    expect(result.parentId).toBe('matching')
    expect(result.selectedMessages.map(item => item.id)).toEqual(['matching'])
    expect(result.droppedMessages.map(item => item.id)).toEqual(['unrelated'])
  })

  test('opens a new thread when candidates only match by recency and speaker', () => {
    const current = message('current', 'alice', '換個話題，晚餐吃什麼', 10_000)
    const recent = message('recent', 'alice', '剛剛那張圖好好笑', 9_900)

    const result = routeConversation(current, [recent])

    expect(result.parentId).toBeNull()
    expect(result.selectedMessages).toEqual([])
    expect(result.threadId).toBe('thread:current')
  })

  test('penalizes candidates with conflicting entities', () => {
    const current = message('current', 'alice', '6515 的目標價', 10_000)
    const candidate = message('candidate', 'alice', 'MU 的目標價', 9_900)

    const score = scoreConversationEdge(current, candidate)

    expect(score.conflictingEntity).toBe(1)
    expect(score.entityOverlap).toBe(0)
    const matchingScore = scoreConversationEdge(current, {
      ...candidate,
      content: '6515 的目標價'
    })
    expect(score.total).toBeLessThan(matchingScore.total)
  })
})
