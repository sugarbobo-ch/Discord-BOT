import { getStockChartData } from './stock'

export interface StockCandle {
  date: Date | string | number
  open?: number | null
  high?: number | null
  low?: number | null
  close?: number | null
  volume?: number | null
}

export type StockTrendDirection = 'bullish' | 'bearish' | 'sideways' | 'insufficient_data'

export interface StockTrendSnapshot {
  symbol: string
  asOf: string | null
  periodDays: number
  sampleSize: number
  latestClose: number | null
  change5dPercent: number | null
  change20dPercent: number | null
  ma5: number | null
  ma20: number | null
  ma60: number | null
  rsi14: number | null
  volumeRatio20d: number | null
  support: number | null
  resistance: number | null
  trend: StockTrendDirection
}

function round(value: number | null, digits = 2): number | null {
  if (value === null || !Number.isFinite(value)) return null
  const multiplier = 10 ** digits
  return Math.round(value * multiplier) / multiplier
}

function movingAverage(values: number[], period: number): number | null {
  if (values.length < period) return null
  const sample = values.slice(-period)
  return sample.reduce((sum, value) => sum + value, 0) / period
}

function percentageChange(values: number[], sessions: number): number | null {
  if (values.length <= sessions) return null
  const previous = values[values.length - 1 - sessions]
  const latest = values[values.length - 1]
  if (previous === 0) return null
  return ((latest - previous) / previous) * 100
}

function relativeStrengthIndex(values: number[], period = 14): number | null {
  if (values.length <= period) return null
  const sample = values.slice(-(period + 1))
  let gains = 0
  let losses = 0
  for (let index = 1; index < sample.length; index++) {
    const change = sample[index] - sample[index - 1]
    if (change > 0) gains += change
    if (change < 0) losses += Math.abs(change)
  }
  if (losses === 0) return gains > 0 ? 100 : 50
  if (gains === 0) return 0
  const relativeStrength = gains / losses
  return 100 - 100 / (1 + relativeStrength)
}

function toIsoDate(value: Date | string | number): string | null {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function calculateStockTrend(
  symbol: string,
  quotes: readonly StockCandle[],
  periodDays = 120
): StockTrendSnapshot {
  const usableQuotes = quotes
    .filter(quote => typeof quote.close === 'number' && Number.isFinite(quote.close))
    .slice()
    .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime())
  const closes = usableQuotes.map(quote => quote.close as number)
  const latest = usableQuotes.at(-1)
  const ma5 = movingAverage(closes, 5)
  const ma20 = movingAverage(closes, 20)
  const ma60 = movingAverage(closes, 60)
  const change20dPercent = percentageChange(closes, 20)

  const previousVolumes = usableQuotes
    .slice(-21, -1)
    .map(quote => quote.volume)
    .filter((volume): volume is number => typeof volume === 'number' && Number.isFinite(volume))
  const latestVolume = latest?.volume
  const averagePreviousVolume = previousVolumes.length
    ? previousVolumes.reduce((sum, volume) => sum + volume, 0) / previousVolumes.length
    : null
  const volumeRatio20d =
    typeof latestVolume === 'number' && averagePreviousVolume && averagePreviousVolume > 0
      ? latestVolume / averagePreviousVolume
      : null

  const recentQuotes = usableQuotes.slice(-20)
  const lows = recentQuotes
    .map(quote => quote.low)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  const highs = recentQuotes
    .map(quote => quote.high)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))

  let trend: StockTrendDirection = 'insufficient_data'
  const latestClose = closes.at(-1) ?? null
  if (
    closes.length >= 20 &&
    latestClose !== null &&
    ma5 !== null &&
    ma20 !== null &&
    change20dPercent !== null
  ) {
    if (latestClose > ma20 && ma5 > ma20 && change20dPercent > 0) {
      trend = 'bullish'
    } else if (latestClose < ma20 && ma5 < ma20 && change20dPercent < 0) {
      trend = 'bearish'
    } else {
      trend = 'sideways'
    }
  }

  return {
    symbol: symbol.trim().toUpperCase(),
    asOf: latest ? toIsoDate(latest.date) : null,
    periodDays,
    sampleSize: closes.length,
    latestClose: round(latestClose),
    change5dPercent: round(percentageChange(closes, 5)),
    change20dPercent: round(change20dPercent),
    ma5: round(ma5),
    ma20: round(ma20),
    ma60: round(ma60),
    rsi14: round(relativeStrengthIndex(closes)),
    volumeRatio20d: round(volumeRatio20d),
    support: lows.length ? round(Math.min(...lows)) : null,
    resistance: highs.length ? round(Math.max(...highs)) : null,
    trend
  }
}

export async function getStockTrend(
  ticker: string,
  periodDays = 120
): Promise<StockTrendSnapshot> {
  // Fetch extra calendar days so weekends and market holidays still leave
  // enough trading sessions for the 60-day moving average.
  const quotes = await getStockChartData(ticker, Math.max(periodDays, 90) * 2)
  return calculateStockTrend(ticker, quotes, periodDays)
}
