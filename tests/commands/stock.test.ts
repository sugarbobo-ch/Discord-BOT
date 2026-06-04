import { describe, test, expect, vi, beforeEach } from 'vitest'
import { StockCommand } from '../../src/commands/stock'
import { searchStockTickerWithAI, getChineseNameWithAI } from '../../src/utils/gemini'
import { searchStockTickerWithYahoo, fetchStockNameFromYahooPage, clearStockCache } from '../../src/utils/stock'
import yahooFinance from 'yahoo-finance2'

vi.mock('yahoo-finance2')
vi.mock('../../src/utils/gemini', () => ({
  searchStockTickerWithAI: vi.fn(),
  getChineseNameWithAI: vi.fn()
}))
vi.mock('../../src/utils/stock', async (importOriginal) => {
  const actual = await importOriginal() as any
  return {
    ...actual,
    searchStockTickerWithYahoo: vi.fn(),
    fetchStockNameFromYahooPage: vi.fn()
  }
})

describe('StockCommand Tests', () => {
  let mockMessage: any
  let mockStatusMessage: any
  let stockCommand: StockCommand

  beforeEach(() => {
    vi.resetAllMocks()
    stockCommand = new StockCommand()
    clearStockCache()
    vi.mocked(searchStockTickerWithYahoo).mockResolvedValue(null)
    vi.mocked(fetchStockNameFromYahooPage).mockResolvedValue(null)

    mockStatusMessage = {
      edit: vi.fn().mockResolvedValue(true)
    }

    mockMessage = {
      content: '',
      reply: vi.fn().mockResolvedValue(mockStatusMessage)
    }
  })

  test('should reply with help message when args is empty', async () => {
    await stockCommand.execute(mockMessage, [])
    expect(mockMessage.reply).toHaveBeenCalledWith(expect.stringContaining('請提供要查詢的股票代號或名稱'))
  })

  test('should query direct ticker 2330 successfully', async () => {
    const quoteSpy = vi.spyOn(yahooFinance.prototype, 'quote').mockResolvedValue({
      regularMarketPrice: 600,
      currency: 'TWD',
      displayName: '台積電',
      regularMarketChange: 10,
      regularMarketChangePercent: 1.69,
      regularMarketDayLow: 595,
      regularMarketDayHigh: 605,
      regularMarketVolume: 12000,
      regularMarketPreviousClose: 590,
      regularMarketOpen: 592,
      fiftyTwoWeekLow: 500,
      fiftyTwoWeekHigh: 650
    } as any)

    await stockCommand.execute(mockMessage, ['2330'])

    expect(quoteSpy).toHaveBeenCalledWith('2330.TW')
    expect(mockMessage.reply).toHaveBeenCalledWith(expect.objectContaining({
      embeds: expect.any(Array)
    }))

    const embed = mockMessage.reply.mock.calls[0][0].embeds[0]
    expect(embed.data.title).toContain('台積電')
    expect(embed.data.title).toContain('2330.TW')
  })

  test('should lookup common stock map for 美光 directly without calling AI', async () => {
    const quoteSpy = vi.spyOn(yahooFinance.prototype, 'quote').mockResolvedValue({
      regularMarketPrice: 130,
      currency: 'USD',
      displayName: 'Micron Technology',
      regularMarketChange: -2,
      regularMarketChangePercent: -1.5,
      regularMarketDayLow: 128,
      regularMarketDayHigh: 132,
      regularMarketVolume: 15000,
      regularMarketPreviousClose: 132,
      regularMarketOpen: 131,
      fiftyTwoWeekLow: 80,
      fiftyTwoWeekHigh: 150
    } as any)

    await stockCommand.execute(mockMessage, ['美光'])

    expect(searchStockTickerWithAI).not.toHaveBeenCalled()
    expect(quoteSpy).toHaveBeenCalledWith('MU')
    expect(mockMessage.reply).toHaveBeenCalledWith(expect.objectContaining({
      embeds: expect.any(Array)
    }))
  })

  test('should resolve Taiwanese stock nickname via lookupStockTicker and NICKNAME_MAP successfully', async () => {
    const { taiwanStockMap } = await import('../../src/utils/stock')
    taiwanStockMap['台積電'] = '2330.TW'

    const quoteSpy = vi.spyOn(yahooFinance.prototype, 'quote').mockResolvedValue({
      regularMarketPrice: 600,
      currency: 'TWD',
      displayName: 'TSMC',
      regularMarketChange: 10,
      regularMarketChangePercent: 1.69,
      regularMarketDayLow: 595,
      regularMarketDayHigh: 605,
      regularMarketVolume: 12000,
      regularMarketPreviousClose: 590,
      regularMarketOpen: 592,
      fiftyTwoWeekLow: 500,
      fiftyTwoWeekHigh: 650
    } as any)

    await stockCommand.execute(mockMessage, ['GG'])

    expect(quoteSpy).toHaveBeenCalledWith('2330.TW')
    expect(mockMessage.reply).toHaveBeenCalledWith(expect.objectContaining({
      embeds: expect.any(Array)
    }))

    const embed = mockMessage.reply.mock.calls[0][0].embeds[0]
    expect(embed.data.title).toContain('台積電')
    expect(embed.data.title).toContain('2330.TW')
  })

  test('should call searchStockTickerWithAI for Chinese stocks and edit status message', async () => {
    vi.mocked(searchStockTickerWithAI).mockResolvedValueOnce('2313.TW')

    const quoteSpy = vi.spyOn(yahooFinance.prototype, 'quote').mockResolvedValue({
      regularMarketPrice: 80,
      currency: 'TWD',
      displayName: '華通',
      regularMarketChange: 1.5,
      regularMarketChangePercent: 1.9,
      regularMarketDayLow: 78,
      regularMarketDayHigh: 81,
      regularMarketVolume: 8000,
      regularMarketPreviousClose: 78.5,
      regularMarketOpen: 79,
      fiftyTwoWeekLow: 60,
      fiftyTwoWeekHigh: 90
    } as any)

    await stockCommand.execute(mockMessage, ['華通'])

    expect(searchStockTickerWithAI).toHaveBeenCalledWith('華通')
    expect(mockMessage.reply).toHaveBeenCalledWith(expect.stringContaining('正在搜尋「華通」'))
    expect(quoteSpy).toHaveBeenCalledWith('2313.TW')
    expect(mockStatusMessage.edit).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('已找到「華通」的代碼為 `2313.TW`'),
      embeds: expect.any(Array)
    }))
  })

  test('should reply error message if AI fails to resolve ticker', async () => {
    vi.mocked(searchStockTickerWithAI).mockResolvedValueOnce(null)

    await stockCommand.execute(mockMessage, ['找不到的股票'])

    expect(searchStockTickerWithAI).toHaveBeenCalledWith('找不到的股票')
    expect(mockMessage.reply).toHaveBeenCalledWith(expect.stringContaining('正在搜尋「找不到的股票」'))
    expect(mockStatusMessage.edit).toHaveBeenCalledWith(expect.stringContaining('找不到與「找不到的股票」相關的股票代碼'))
  })

  test('should reply error if stock API returns error', async () => {
    vi.spyOn(yahooFinance.prototype, 'quote').mockRejectedValue(new Error('Symbol not found'))

    await stockCommand.execute(mockMessage, ['INVALID'])

    expect(mockMessage.reply).toHaveBeenCalledWith(expect.stringContaining('查詢股票「INVALID」時發生錯誤'))
  })

  test('should call getChineseNameWithAI for Taiwanese stocks queried by code', async () => {
    vi.mocked(getChineseNameWithAI).mockResolvedValueOnce('華通')

    const quoteSpy = vi.spyOn(yahooFinance.prototype, 'quote').mockResolvedValue({
      regularMarketPrice: 80,
      currency: 'TWD',
      displayName: 'Compeq Manufacturing Co., Ltd.',
      regularMarketChange: 1.5,
      regularMarketChangePercent: 1.9,
      regularMarketDayLow: 78,
      regularMarketDayHigh: 81,
      regularMarketVolume: 8000,
      regularMarketPreviousClose: 78.5,
      regularMarketOpen: 79,
      fiftyTwoWeekLow: 60,
      fiftyTwoWeekHigh: 90
    } as any)

    await stockCommand.execute(mockMessage, ['2313'])

    expect(quoteSpy).toHaveBeenCalledWith('2313.TW')
    expect(getChineseNameWithAI).toHaveBeenCalledWith('2313.TW', 'Compeq Manufacturing Co., Ltd.')
    expect(mockMessage.reply).toHaveBeenCalledWith(expect.objectContaining({
      embeds: expect.any(Array)
    }))

    const embed = mockMessage.reply.mock.calls[0][0].embeds[0]
    expect(embed.data.title).toContain('華通 / Compeq Manufacturing Co., Ltd.')
  })

  test('should use Yahoo Autocomplete search if it resolves successfully', async () => {
    vi.mocked(searchStockTickerWithYahoo).mockResolvedValueOnce({
      symbol: '4927.TW',
      name: '泰鼎-KY'
    })

    const quoteSpy = vi.spyOn(yahooFinance.prototype, 'quote').mockResolvedValue({
      regularMarketPrice: 50,
      currency: 'TWD',
      displayName: 'Apex International Co., Ltd.',
      regularMarketChange: 0.5,
      regularMarketChangePercent: 1.0,
      regularMarketDayLow: 49,
      regularMarketDayHigh: 51,
      regularMarketVolume: 5000,
      regularMarketPreviousClose: 49.5,
      regularMarketOpen: 50,
      fiftyTwoWeekLow: 40,
      fiftyTwoWeekHigh: 60
    } as any)

    await stockCommand.execute(mockMessage, ['泰鼎'])

    expect(searchStockTickerWithYahoo).toHaveBeenCalledWith('泰鼎')
    expect(searchStockTickerWithAI).not.toHaveBeenCalled()
    expect(quoteSpy).toHaveBeenCalledWith('4927.TW')
    expect(mockStatusMessage.edit).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('已找到「泰鼎」的代碼為 `4927.TW`'),
      embeds: expect.any(Array)
    }))

    const embed = mockStatusMessage.edit.mock.calls[0][0].embeds[0]
    expect(embed.data.title).toContain('泰鼎-KY / Apex International Co., Ltd.')
  })

  test('should set correct colors and Yahoo URLs for Taiwan stock rise/fall/flat', async () => {
    // Rise (positive change)
    const quoteSpy = vi.spyOn(yahooFinance.prototype, 'quote').mockResolvedValueOnce({
      regularMarketPrice: 600,
      currency: 'TWD',
      regularMarketChange: 10,
      regularMarketChangePercent: 1.69
    } as any)
    await stockCommand.execute(mockMessage, ['2330'])
    const embedRise = mockMessage.reply.mock.calls[0][0].embeds[0]
    expect(embedRise.data.color).toBe(0xe74c3c) // Red for TW stock rise
    expect(embedRise.data.url).toBe('https://tw.stock.yahoo.com/quote/2330.TW')
    expect(embedRise.data.title).toContain('📈') // Rise chart in title
    const changeFieldRise = embedRise.data.fields.find((f: any) => f.name === '漲跌幅')
    expect(changeFieldRise.value).toContain('🔺') // Red triangle up for rise

    // Fall (negative change)
    mockMessage.reply.mockClear()
    clearStockCache()
    vi.spyOn(yahooFinance.prototype, 'quote').mockResolvedValueOnce({
      regularMarketPrice: 580,
      currency: 'TWD',
      regularMarketChange: -10,
      regularMarketChangePercent: -1.69
    } as any)
    await stockCommand.execute(mockMessage, ['2330'])
    const embedFall = mockMessage.reply.mock.calls[0][0].embeds[0]
    expect(embedFall.data.color).toBe(0x2ecc71) // Green for TW stock fall
    expect(embedFall.data.title).toContain('📉') // Fall chart in title
    const changeFieldFall = embedFall.data.fields.find((f: any) => f.name === '漲跌幅')
    expect(changeFieldFall.value).toContain('🔻') // Red triangle down for fall

    // Flat (zero change)
    mockMessage.reply.mockClear()
    clearStockCache()
    vi.spyOn(yahooFinance.prototype, 'quote').mockResolvedValueOnce({
      regularMarketPrice: 590,
      currency: 'TWD',
      regularMarketChange: 0,
      regularMarketChangePercent: 0
    } as any)
    await stockCommand.execute(mockMessage, ['2330'])
    const embedFlat = mockMessage.reply.mock.calls[0][0].embeds[0]
    expect(embedFlat.data.color).toBe(0x7f8c8d) // Gray for flat
    expect(embedFlat.data.title).toContain('📊') // Flat chart in title
    const changeFieldFlat = embedFlat.data.fields.find((f: any) => f.name === '漲跌幅')
    expect(changeFieldFlat.value).toContain('➖') // Minus for flat
  })

  test('should set correct colors and Yahoo URLs for US stock rise/fall/flat', async () => {
    // Rise (positive change)
    const quoteSpy = vi.spyOn(yahooFinance.prototype, 'quote').mockResolvedValueOnce({
      regularMarketPrice: 150,
      currency: 'USD',
      regularMarketChange: 5,
      regularMarketChangePercent: 3.4
    } as any)
    await stockCommand.execute(mockMessage, ['AAPL'])
    const embedRise = mockMessage.reply.mock.calls[0][0].embeds[0]
    expect(embedRise.data.color).toBe(0x2ecc71) // Green for US stock rise
    expect(embedRise.data.url).toBe('https://finance.yahoo.com/quote/AAPL')
    expect(embedRise.data.title).toContain('📈') // Rise chart in title
    const changeFieldRise = embedRise.data.fields.find((f: any) => f.name === '漲跌幅')
    expect(changeFieldRise.value).toContain('🔺') // Red triangle up for rise

    // Fall (negative change)
    mockMessage.reply.mockClear()
    clearStockCache()
    vi.spyOn(yahooFinance.prototype, 'quote').mockResolvedValueOnce({
      regularMarketPrice: 140,
      currency: 'USD',
      regularMarketChange: -5,
      regularMarketChangePercent: -3.4
    } as any)
    await stockCommand.execute(mockMessage, ['AAPL'])
    const embedFall = mockMessage.reply.mock.calls[0][0].embeds[0]
    expect(embedFall.data.color).toBe(0xe74c3c) // Red for US stock fall
    expect(embedFall.data.title).toContain('📉') // Fall chart in title
    const changeFieldFall = embedFall.data.fields.find((f: any) => f.name === '漲跌幅')
    expect(changeFieldFall.value).toContain('🔻') // Red triangle down for fall
  })

  test('should call fetchStockNameFromYahooPage for name resolution', async () => {
    vi.mocked(fetchStockNameFromYahooPage).mockResolvedValueOnce('台光電')

    const quoteSpy = vi.spyOn(yahooFinance.prototype, 'quote').mockResolvedValue({
      regularMarketPrice: 4830,
      currency: 'TWD',
      displayName: 'Elite Material Co., Ltd.',
      regularMarketChange: -30,
      regularMarketChangePercent: -0.62,
      regularMarketDayLow: 4820,
      regularMarketDayHigh: 5010,
      regularMarketVolume: 2187182,
      regularMarketPreviousClose: 4860,
      regularMarketOpen: 4910,
      fiftyTwoWeekLow: 763,
      fiftyTwoWeekHigh: 5635
    } as any)

    await stockCommand.execute(mockMessage, ['2383'])

    expect(quoteSpy).toHaveBeenCalledWith('2383.TW')
    expect(fetchStockNameFromYahooPage).toHaveBeenCalledWith('2383.TW')
    expect(mockMessage.reply).toHaveBeenCalledWith(expect.objectContaining({
      embeds: expect.any(Array)
    }))

    const embed = mockMessage.reply.mock.calls[0][0].embeds[0]
    expect(embed.data.title).toContain('台光電 / Elite Material Co., Ltd.')
  })
})
