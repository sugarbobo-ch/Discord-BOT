import { describe, expect, test, vi } from 'vitest'
import { ThinkingLevel } from '@google/genai'
import {
  decideThinking,
  generateContentWithPolicy
} from '../../src/utils/gemini/thinkingPolicy'

describe('thinking policy', () => {
  test('keeps classification, moderation, lookup, and simple chat minimal', () => {
    expect(decideThinking('classification').level).toBe(ThinkingLevel.MINIMAL)
    expect(decideThinking('moderation').level).toBe(ThinkingLevel.MINIMAL)
    expect(decideThinking('lookup').level).toBe(ThinkingLevel.MINIMAL)
    expect(
      decideThinking('conversation', { semanticComplexity: 'simple' }).level
    ).toBe(ThinkingLevel.MINIMAL)
  })

  test('uses high only for complex synthesis, stock analysis, research, and repair', () => {
    expect(
      decideThinking('conversation', { semanticComplexity: 'complex' }).level
    ).toBe(ThinkingLevel.HIGH)
    expect(
      decideThinking('stock_analysis', { needsTrendAnalysis: true }).level
    ).toBe(ThinkingLevel.HIGH)
    expect(decideThinking('research').level).toBe(ThinkingLevel.HIGH)
    expect(decideThinking('repair').level).toBe(ThinkingLevel.HIGH)
  })

  test('never emits unsupported low or medium levels', () => {
    const decisions = [
      decideThinking('classification'),
      decideThinking('moderation'),
      decideThinking('lookup'),
      decideThinking('conversation', { semanticComplexity: 'simple' }),
      decideThinking('conversation', { semanticComplexity: 'complex' }),
      decideThinking('stock_analysis', { needsRecentResearch: true }),
      decideThinking('research'),
      decideThinking('repair')
    ]
    expect(new Set(decisions.map(decision => decision.level))).toEqual(
      new Set([ThinkingLevel.MINIMAL, ThinkingLevel.HIGH])
    )
  })

  test('falls back once to minimal when high thinking is rejected', async () => {
    const generate = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error('Thinking level is not supported for this model.'), {
          status: 400
        })
      )
      .mockResolvedValueOnce({ candidates: [] })

    await generateContentWithPolicy(
      {
        operation: 'repair',
        request: { contents: 'test' }
      },
      { generate }
    )

    expect(generate).toHaveBeenCalledTimes(2)
    expect(generate.mock.calls[0][0].config.thinkingConfig.thinkingLevel).toBe(
      ThinkingLevel.HIGH
    )
    expect(generate.mock.calls[1][0].config.thinkingConfig.thinkingLevel).toBe(
      ThinkingLevel.MINIMAL
    )
  })
})
