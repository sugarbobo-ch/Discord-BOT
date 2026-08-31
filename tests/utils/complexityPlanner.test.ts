import { describe, expect, test, vi } from 'vitest'
import { assessConversationComplexity } from '../../src/utils/gemini/complexityPlanner'

describe('semantic complexity planner', () => {
  test('parses a semantic complex decision without a keyword table', async () => {
    const generate = vi.fn().mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  complexity: 'complex',
                  needsMultipleSources: true,
                  reasonCategory: 'multi_source_synthesis'
                })
              }
            ]
          }
        }
      ]
    })

    await expect(
      assessConversationComplexity('比較兩種制度的近期影響', { generate })
    ).resolves.toEqual({
      complexity: 'complex',
      needsMultipleSources: true,
      reasonCategory: 'multi_source_synthesis'
    })
  })

  test('returns fast path simple for greetings without calling generate', async () => {
    const generate = vi.fn()

    await expect(
      assessConversationComplexity('你好！', { generate })
    ).resolves.toEqual({
      complexity: 'simple',
      needsMultipleSources: false,
      reasonCategory: 'fast_path_simple'
    })
    expect(generate).not.toHaveBeenCalled()
  })

  test('fails closed to simple when planning is unavailable', async () => {
    const generate = vi.fn().mockRejectedValue(new Error('offline'))

    await expect(
      assessConversationComplexity('任意問題', { generate })
    ).resolves.toEqual({
      complexity: 'simple',
      needsMultipleSources: false,
      reasonCategory: 'planner_fallback'
    })
  })
})
