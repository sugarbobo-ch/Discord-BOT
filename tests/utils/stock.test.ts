import { describe, test, expect, vi, beforeEach } from 'vitest'
import { getStockPrice, extractTickers, clearStockCache } from '../../src/utils/stock'
import yahooFinance from 'yahoo-finance2'

vi.mock('yahoo-finance2')

describe('Stock Utility Tests', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    clearStockCache()
  })

  describe('extractTickers', () => {
    test('should extract explicit Taiwanese tickers with suffixes', () => {
      expect(extractTickers('台積電 2330.TW 是不是好股票')).toEqual(['2330.TW'])
      expect(extractTickers('長榮 2603.two')).toEqual(['2603.TWO'])
    })

    test('should extract pure 4-digit Taiwanese tickers if stock keywords exist', () => {
      // 含有 stock keywords
      expect(extractTickers('幫我查 2330 股價')).toEqual(['2330.TW'])
      expect(extractTickers('台股 2454 開盤了嗎')).toEqual(['2454.TW'])

      // 不含 stock keywords
      expect(extractTickers('我明天下午 2330 要去搭高鐵')).toEqual([])
    })

    test('should extract US tickers if stock keywords exist', () => {
      expect(extractTickers('AAPL stock price?')).toEqual(['AAPL'])
      expect(extractTickers('TSLA 股價多少')).toEqual(['TSLA'])
    })

    test('should filter out stop words from US tickers', () => {
      expect(extractTickers('IS 股價')).toEqual([])
      expect(extractTickers('GO 股價')).toEqual([])
      expect(extractTickers('AAPL and TSLA stock price')).toEqual(['AAPL', 'TSLA'])
    })
  })

  describe('getStockPrice', () => {
    test('should return price data on success', async () => {
      const quoteSpy = vi.spyOn(yahooFinance.prototype, 'quote').mockResolvedValue({
        regularMarketPrice: 150.25,
        currency: 'USD'
      } as any)

      const result = await getStockPrice('AAPL')
      expect(result).toEqual({
        symbol: 'AAPL',
        price: 150.25,
        currency: 'USD'
      })
      expect(quoteSpy).toHaveBeenCalledWith('AAPL')
    })

    test('should use cache for subsequent calls within TTL', async () => {
      const quoteSpy = vi.spyOn(yahooFinance.prototype, 'quote').mockResolvedValue({
        regularMarketPrice: 150.25,
        currency: 'USD'
      } as any)

      // 第一次呼叫
      await getStockPrice('AAPL')

      // 第二次呼叫
      const result = await getStockPrice('AAPL')

      expect(result.price).toBe(150.25)
      expect(quoteSpy).toHaveBeenCalledTimes(1) // 只呼叫了一次外部 API
    })

    test('should return error object on API failure', async () => {
      vi.spyOn(yahooFinance.prototype, 'quote').mockRejectedValue(new Error('Network error'))

      const result = await getStockPrice('INVALID')
      expect(result.error).toBeDefined()
      expect(result.symbol).toBe('INVALID')
    })
  })
})
