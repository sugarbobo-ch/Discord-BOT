import { describe, expect, test } from 'vitest'
import {
  classifyCallerIntent,
  shouldWriteMemoryCandidate
} from '../../src/utils/conversation'

describe('structured caller intent classifier', () => {
  test('classifies stock analysis requests and keeps the entity structured', () => {
    expect(classifyCallerIntent('6515 的 2026 目標價多少？')).toEqual({
      addresseeIds: [],
      dialogueAct: 'question',
      intent: 'ask_analysis',
      entityKeys: ['stock:6515'],
      needsExternalFact: true,
      confidence: 0.92
    })
  })

  test('classifies a named stock analysis even when no ticker is written', () => {
    expect(classifyCallerIntent('仁寶會漲到150嗎')).toMatchObject({
      dialogueAct: 'question',
      intent: 'ask_analysis',
      needsExternalFact: true
    })
  })

  test('classifies a correction as a bot correction instead of a stock analysis request', () => {
    const result = classifyCallerIntent('<@999> 6515不是美光')

    expect(result).toMatchObject({
      addresseeIds: ['999'],
      dialogueAct: 'correction',
      intent: 'correct_bot',
      entityKeys: ['stock:6515'],
      needsExternalFact: false
    })
  })

  test('classifies caller-scoped memory questions', () => {
    expect(classifyCallerIntent('你還記得我喜歡貓嗎')).toMatchObject({
      dialogueAct: 'question',
      intent: 'ask_memory',
      needsExternalFact: false
    })
  })

  test('does not invent an AI request for a backchannel or empty prompt', () => {
    expect(classifyCallerIntent('哈哈')).toMatchObject({
      dialogueAct: 'agreement',
      intent: 'casual_chat'
    })
    expect(classifyCallerIntent('')).toMatchObject({
      dialogueAct: 'backchannel',
      intent: 'no_ai_request'
    })
  })

  test('only opens the automatic memory gate for stable caller facts', () => {
    expect(shouldWriteMemoryCandidate('我喜歡吃拉麵')).toBe(true)
    expect(shouldWriteMemoryCandidate('6515不是美光')).toBe(false)
    expect(shouldWriteMemoryCandidate('你還記得我住哪裡嗎')).toBe(false)
  })
})
