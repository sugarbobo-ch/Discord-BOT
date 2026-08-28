import { describe, expect, test } from 'vitest'
import {
  extractDeterministicStockEntities,
  validateDeterministicStockClaims
} from '../../src/utils/stock'

describe('deterministic stock claim validation', () => {
  const entities3037 = extractDeterministicStockEntities('3037 的目標價')
  const entities6515 = extractDeterministicStockEntities('6515 的目標價')

  test('rejects a model mapping 3037 to MU/美光', () => {
    const result = validateDeterministicStockClaims('3037 (美商美光 MU) 的目標價', entities3037)

    expect(result.valid).toBe(false)
    expect(result.violations).toEqual(
      expect.arrayContaining(['3037 不得對應 美光', '3037 不得對應 MU'])
    )
  })

  test('rejects a model mapping 6515 to MU/美光', () => {
    const result = validateDeterministicStockClaims('6515 (美商美光 MU) 的目標價', entities6515)

    expect(result.valid).toBe(false)
    expect(result.violations).toEqual(
      expect.arrayContaining(['6515 不得對應 美光', '6515 不得對應 MU'])
    )
  })

  test('allows a correction that explicitly rejects the conflicting label', () => {
    expect(validateDeterministicStockClaims('3037 是欣興，不是美光。', entities3037).valid).toBe(true)
    expect(validateDeterministicStockClaims('6515 是穎崴，不是美光。', entities6515).valid).toBe(true)
  })

  test('allows an unrelated MU comparison when it does not map MU to 3037', () => {
    expect(
      validateDeterministicStockClaims('3037 是欣興；MU 是美光，兩者是不同標的。', entities3037).valid
    ).toBe(true)
  })
})
