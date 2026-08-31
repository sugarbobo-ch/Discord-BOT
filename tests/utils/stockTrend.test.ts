import { describe, expect, test } from 'vitest'
import { calculateStockTrend } from '../../src/utils/stockTrend'

function candles(closes: number[], volumes?: number[]) {
  return closes.map((close, index) => ({
    date: new Date(Date.UTC(2026, 0, index + 1)),
    open: close - 1,
    high: close + 2,
    low: close - 2,
    close,
    volume: volumes?.[index] ?? 1_000
  }))
}

describe('stock trend analysis', () => {
  test('classifies an established uptrend and computes deterministic indicators', () => {
    const closes = Array.from({ length: 65 }, (_, index) => 100 + index)
    const volumes = closes.map((_, index) => (index === closes.length - 1 ? 3_000 : 1_000))

    const result = calculateStockTrend('TEST', candles(closes, volumes), 120)

    expect(result).toMatchObject({
      symbol: 'TEST',
      sampleSize: 65,
      latestClose: 164,
      trend: 'bullish',
      ma5: 162,
      ma20: 154.5,
      ma60: 134.5,
      volumeRatio20d: 3
    })
    expect(result.change5dPercent).toBeCloseTo(3.14, 2)
    expect(result.rsi14).toBe(100)
  })

  test('classifies a sustained decline as bearish', () => {
    const closes = Array.from({ length: 65 }, (_, index) => 200 - index)
    const result = calculateStockTrend('TEST', candles(closes), 120)

    expect(result.trend).toBe('bearish')
    expect(result.change20dPercent).toBeLessThan(0)
    expect(result.rsi14).toBe(0)
  })

  test('reports insufficient data instead of inventing a trend', () => {
    const result = calculateStockTrend('TEST', candles([10, 11, 12]), 120)

    expect(result.trend).toBe('insufficient_data')
    expect(result.ma20).toBeNull()
    expect(result.rsi14).toBeNull()
  })
})
