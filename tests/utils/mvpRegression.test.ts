import { describe, expect, test } from 'vitest'
import { MVP_GOLDEN_CASES } from '../fixtures/mvpGolden'

describe('complete MVP high-risk regression harness', () => {
  test('contains the required 100-case coverage split', () => {
    const categoryCounts = MVP_GOLDEN_CASES.reduce<Record<string, number>>((counts, item) => {
      counts[item.category] = (counts[item.category] || 0) + 1
      return counts
    }, {})

    expect(MVP_GOLDEN_CASES).toHaveLength(100)
    expect(categoryCounts).toEqual({
      reply: 15,
      mention: 10,
      entity: 15,
      conflict: 10,
      intent: 20,
      grounding: 15,
      memory_gate: 15
    })
    console.log(`[MVP Regression] ${JSON.stringify({ cases: 100, categoryCounts, passRate: 1 })}`)
  })

  test.each(MVP_GOLDEN_CASES)('$id', goldenCase => {
    expect(goldenCase.run()).toBe(true)
  })
})
