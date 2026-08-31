import { describe, test, expect, vi, beforeEach } from 'vitest'
import {
  getStockPrice,
  extractTickers,
  clearStockCache,
  searchStockTickerWithYahoo,
  fetchStockNameFromYahooPage,
  lookupStockTicker,
  getTaiwanStockName,
  taiwanStockMap,
  getStockSlogan
} from '../../src/utils/stock'
import yahooFinance from 'yahoo-finance2'
import axios from 'axios'

vi.mock('yahoo-finance2')
vi.mock('axios')

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

  describe('searchStockTickerWithYahoo', () => {
    test('should search and return resolved symbol and name on success', async () => {
      const axiosGetSpy = vi.spyOn(axios, 'get').mockResolvedValueOnce({
        data: {
          ResultSet: {
            Result: [
              {
                symbol: '4927.TW',
                name: '泰鼎-KY',
                exch: 'TAI',
                type: 'S'
              }
            ]
          }
        }
      } as any)

      const result = await searchStockTickerWithYahoo('泰鼎')
      expect(result).toEqual({
        symbol: '4927.TW',
        name: '泰鼎-KY'
      })
      expect(axiosGetSpy).toHaveBeenCalledWith(
        expect.stringContaining('query=%E6%B3%B0%E9%BC%8E'),
        expect.any(Object)
      )
    })

    test('should return null if no result found', async () => {
      vi.spyOn(axios, 'get').mockResolvedValueOnce({
        data: {
          ResultSet: {
            Result: []
          }
        }
      } as any)

      const result = await searchStockTickerWithYahoo('未知')
      expect(result).toBeNull()
    })

    test('should return null on request error', async () => {
      vi.spyOn(axios, 'get').mockRejectedValueOnce(new Error('Network error'))

      const result = await searchStockTickerWithYahoo('泰鼎')
      expect(result).toBeNull()
    })
  })

  describe('fetchStockNameFromYahooPage', () => {
    test('should return Chinese name for Taiwanese stock page title', async () => {
      const axiosGetSpy = vi.spyOn(axios, 'get').mockResolvedValueOnce({
        data: '<html><head><title>台光電(2383.TW) 走勢圖 - Yahoo股市</title></head></html>'
      } as any)

      const result = await fetchStockNameFromYahooPage('2383.TW')
      expect(result).toBe('台光電')
      expect(axiosGetSpy).toHaveBeenCalledWith(
        'https://tw.stock.yahoo.com/quote/2383.TW',
        expect.any(Object)
      )
    })

    test('should return name for US stock page title', async () => {
      const axiosGetSpy = vi.spyOn(axios, 'get').mockResolvedValueOnce({
        data: '<html><head><title>Apple Inc. (AAPL) Stock Price, News, Quote &amp; History - Yahoo Finance</title></head></html>'
      } as any)

      const result = await fetchStockNameFromYahooPage('AAPL')
      expect(result).toBe('Apple Inc.')
      expect(axiosGetSpy).toHaveBeenCalledWith(
        'https://finance.yahoo.com/quote/AAPL',
        expect.any(Object)
      )
    })

    test('should decode &amp; HTML entities', async () => {
      vi.spyOn(axios, 'get').mockResolvedValueOnce({
        data: '<html><head><title>A &amp; B Co. (AB) Stock Price</title></head></html>'
      } as any)

      const result = await fetchStockNameFromYahooPage('AB')
      expect(result).toBe('A & B Co.')
    })

    test('should return null if title tag is not found', async () => {
      vi.spyOn(axios, 'get').mockResolvedValueOnce({
        data: '<html><head></head></html>'
      } as any)

      const result = await fetchStockNameFromYahooPage('2383.TW')
      expect(result).toBeNull()
    })

    test('should return null on request error', async () => {
      vi.spyOn(axios, 'get').mockRejectedValueOnce(new Error('Network error'))

      const result = await fetchStockNameFromYahooPage('2383.TW')
      expect(result).toBeNull()
    })
  })

  describe('lookupStockTicker and getTaiwanStockName', () => {
    beforeEach(() => {
      taiwanStockMap['台積電'] = '2330.TW'
      taiwanStockMap['台新新光金'] = '2887.TW'
      taiwanStockMap['永豐金'] = '2890.TW'
      taiwanStockMap['世界'] = '5347.TWO'
      taiwanStockMap['國巨*'] = '2327.TW'
      taiwanStockMap['美德醫療-DR'] = '9103.TW'
    })

    test('should resolve nicknames using NICKNAME_MAP and taiwanStockMap', async () => {
      expect(await lookupStockTicker('GG')).toBe('2330.TW')
      expect(await lookupStockTicker('西瓜')).toBe('2887.TW')
      expect(await lookupStockTicker('老董')).toBe('2890.TW')
      expect(await lookupStockTicker('世界先進')).toBe('5347.TWO')
      expect(await lookupStockTicker('國巨')).toBe('2327.TW')
    })

    test('should reverse lookup Chinese names using getTaiwanStockName', () => {
      expect(getTaiwanStockName('2330.TW')).toBe('台積電')
      expect(getTaiwanStockName('2887.TW')).toBe('台新新光金')
      expect(getTaiwanStockName('2890.TW')).toBe('永豐金')
      expect(getTaiwanStockName('5347.TWO')).toBe('世界')
      expect(getTaiwanStockName('2327.TW')).toBe('國巨*')
    })
  })

  describe('getStockPrice Fallback Chain', () => {
    beforeEach(() => {
      vi.restoreAllMocks()
    })

    test('should return TWSE price data on TWSE success (Tier 1)', async () => {
      const mockCookieResponse = {
        headers: {
          'set-cookie': ['JSESSIONID=1234567890; Path=/']
        },
        status: 200
      }
      const mockTWSEResponse = {
        data: {
          msgArray: [
            {
              z: '272.5',
              y: '275.0',
              n: '頎邦',
              l: '256.5',
              h: '279.5',
              v: '39000',
              o: '269.0'
            }
          ]
        },
        status: 200
      }

      const axiosSpy = vi
        .spyOn(axios, 'get')
        .mockResolvedValueOnce(mockCookieResponse as any)
        .mockResolvedValueOnce(mockTWSEResponse as any)

      const result = await getStockPrice('6147.TWO')

      expect(axiosSpy).toHaveBeenCalledTimes(2)
      expect(result.symbol).toBe('6147.TWO')
      expect(result.price).toBe(272.5)
      expect(result.change).toBe(-2.5)
      expect(result.name).toBe('頎邦')
    })

    test('should fallback to Yahoo TW Scraper if TWSE fails or returns z="-" (Tier 2)', async () => {
      const mockCookieResponse = {
        headers: {},
        status: 200
      }
      const mockTWSEResponse = {
        data: {
          msgArray: [
            {
              z: '-', // Transaction price is "-"
              y: '275.0',
              n: '頎邦'
            }
          ]
        },
        status: 200
      }
      const mockYahooTWHTML = `
        <html>
          <body>
            <script>
              root.App.main = {
                context: {
                  dispatcher: {
                    stores: {
                      QuoteFundamental: {
                        quote: {
                          data: {
                            price: { raw: '271.5' },
                            changePercent: '-1.27%',
                            symbolName: '頎邦',
                            regularMarketDayLow: { raw: '256.5' },
                            regularMarketDayHigh: { raw: '279.5' },
                            volume: '39414000',
                            regularMarketPreviousClose: { raw: '275.0' },
                            regularMarketOpen: { raw: '269.0' }
                          }
                        }
                      }
                    }
                  }
                }
              };
            </script>
          </body>
        </html>
      `

      const axiosSpy = vi
        .spyOn(axios, 'get')
        .mockResolvedValueOnce(mockCookieResponse as any)
        .mockResolvedValueOnce(mockTWSEResponse as any)
        .mockResolvedValueOnce({ data: mockYahooTWHTML, status: 200 } as any)

      const result = await getStockPrice('6147.TWO')

      expect(axiosSpy).toHaveBeenCalledTimes(3)
      expect(result.symbol).toBe('6147.TWO')
      expect(result.price).toBe(271.5)
      expect(result.changePercent).toBe(-1.27)
    })

    test('should fallback to Yahoo Finance Global if both TWSE and Yahoo TW fail (Tier 3)', async () => {
      vi.spyOn(axios, 'get').mockRejectedValue(new Error('Network error'))
      const quoteSpy = vi.spyOn(yahooFinance.prototype, 'quote').mockResolvedValue({
        regularMarketPrice: 266,
        currency: 'TWD',
        longName: 'Chipbond Technology'
      } as any)

      const result = await getStockPrice('6147.TWO')

      expect(result.symbol).toBe('6147.TWO')
      expect(result.price).toBe(266)
      expect(quoteSpy).toHaveBeenCalledWith('6147.TWO')
    })
  })

  describe('getStockSlogan', () => {
    test('should return correct slogans for matching stock names', () => {
      expect(getStockSlogan('華邦電')).toBe('買入華邦電 觸碰高壓電')
      expect(getStockSlogan('群創')).toBe('買入群創 身心受創')
      expect(getStockSlogan('高端疫苗')).toBe('買入高端 等著被端')
      expect(getStockSlogan('星宇航空')).toBe('買入星宇 人生無語')
      expect(getStockSlogan('南亞科技')).toBe('買入南亞科 蛋蛋少一顆')
    })

    test('should return null for unmatched stock names', () => {
      expect(getStockSlogan('台積電')).toBeNull()
    })
  })
})
