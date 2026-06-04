import { Message, EmbedBuilder } from 'discord.js'
import { Command } from './command.interface'
import { getStockPrice, COMMON_STOCK_MAP, searchStockTickerWithYahoo, fetchStockNameFromYahooPage, lookupStockTicker, getTaiwanStockName, getStockSlogan } from '../utils/stock'
import { searchStockTickerWithAI, getChineseNameWithAI } from '../utils/gemini'

function formatValue(val: any, isPercent = false): string {
  if (val === undefined || val === null) return '--'
  if (typeof val === 'number') {
    const formatted = val.toLocaleString(undefined, { maximumFractionDigits: 2 })
    return isPercent ? `${formatted}%` : formatted
  }
  return String(val)
}

export class StockCommand implements Command {
  public names = ['stock']

  public async execute(message: Message, args: string[]): Promise<void> {
    if (args.length === 0) {
      await message.reply('請提供要查詢的股票代號或名稱，例如：\n• `!stock 2330`\n• `!stock 美光`\n• `!stock 華通`')
      return
    }

    const query = args.join(' ').trim()
    if (!query) {
      await message.reply('請提供要查詢的股票代號或名稱，例如：\n• `!stock 2330`\n• `!stock 美光`\n• `!stock 華通`')
      return
    }

    let targetTicker = query
    let statusMessage: Message | null = null
    let yahooMatchedName: string | null = null

    // 1. Try resolving using lookupStockTicker first (checks NICKNAME_MAP, COMMON_STOCK_MAP, and taiwanStockMap)
    const resolved = await lookupStockTicker(query)
    if (resolved) {
      targetTicker = resolved
    } else {
      const isDirectTicker = /^[A-Za-z0-9.-]+$/.test(query)
      
      if (!isDirectTicker) {
        try {
          statusMessage = await message.reply(`🔍 正在搜尋「${query}」的股票代碼...`)
        } catch (err) {
          console.error('Failed to send status reply message:', err)
        }
      }

      const yahooResult = await searchStockTickerWithYahoo(query)
      if (yahooResult) {
        targetTicker = yahooResult.symbol
        yahooMatchedName = yahooResult.name
      } else if (isDirectTicker) {
        targetTicker = query
      } else {
        const resolvedAI = await searchStockTickerWithAI(query)
        if (!resolvedAI) {
          const errorText = `❌ 找不到與「${query}」相關的股票代碼。請嘗試輸入更精確的名稱或直接輸入代號（例如 \`2330\` 或 \`AAPL\`）。`
          if (statusMessage) {
            await statusMessage.edit(errorText)
          } else {
            await message.reply(errorText)
          }
          return
        }
        targetTicker = resolvedAI
      }
    }

    try {
      const result = await getStockPrice(targetTicker)

      if (result.error) {
        const errorText = `❌ 查詢股票「${targetTicker}」時發生錯誤：${result.error}`
        if (statusMessage) {
          await statusMessage.edit(errorText)
        } else {
          await message.reply(errorText)
        }
        return
      }

      // Resolve Chinese name
      let chineseName: string | null = null
      if (yahooMatchedName) {
        chineseName = yahooMatchedName
      }

      if (!chineseName) {
        const upperSymbol = result.symbol.toUpperCase()
        for (const [key, val] of Object.entries(COMMON_STOCK_MAP)) {
          if (val.toUpperCase() === upperSymbol && /[\u4e00-\u9fa5]/.test(key)) {
            chineseName = key
            break
          }
        }
      }

      // Try local stock list name resolution
      if (!chineseName && (result.symbol.endsWith('.TW') || result.symbol.endsWith('.TWO'))) {
        chineseName = getTaiwanStockName(result.symbol)
      }

      if (!chineseName && /[\u4e00-\u9fa5]/.test(query)) {
        chineseName = query
      }

      // Try fetching from Yahoo Page Title first
      if (!chineseName) {
        chineseName = await fetchStockNameFromYahooPage(result.symbol)
      }

      // Fallback to AI translation
      if (!chineseName && (result.symbol.endsWith('.TW') || result.symbol.endsWith('.TWO'))) {
        chineseName = await getChineseNameWithAI(result.symbol, result.name)
      }

      let displayName = result.name || result.symbol
      if (chineseName) {
        if (result.name && chineseName.trim().toLowerCase() === result.name.trim().toLowerCase()) {
          displayName = chineseName
        } else {
          displayName = `${chineseName}${result.name ? ` / ${result.name}` : ''}`
        }
      }

      // Format details
      const priceStr = `${formatValue(result.price)} ${result.currency || ''}`
      let changeStr = '--'
      let embedColor = 0x7f8c8d // Gray

      const isTaiwanStock = result.symbol.endsWith('.TW') || result.symbol.endsWith('.TWO')
      const yahooUrl = isTaiwanStock
        ? `https://tw.stock.yahoo.com/quote/${result.symbol}`
        : `https://finance.yahoo.com/quote/${result.symbol}`

      if (result.change !== undefined && result.change !== null) {
        const isPositive = result.change > 0
        const isNegative = result.change < 0
        const sign = isPositive ? '+' : ''
        
        const changeVal = formatValue(result.change)
        const percentVal = result.changePercent !== undefined && result.changePercent !== null
          ? `(${isPositive ? '+' : ''}${result.changePercent.toFixed(2)}%)`
          : ''

        let emoji = '➖ '
        if (isPositive) {
          emoji = '🔺 '
          embedColor = isTaiwanStock ? 0xe74c3c : 0x2ecc71 // 台股紅色漲，美股綠色漲
        } else if (isNegative) {
          emoji = '🔻 '
          embedColor = isTaiwanStock ? 0x2ecc71 : 0xe74c3c // 台股綠色跌，美股紅色跌
        }
        
        changeStr = `${emoji}${sign}${changeVal} ${percentVal}`
      }

      let titleEmoji = '📊'
      if (result.change !== undefined && result.change !== null) {
        if (result.change > 0) {
          titleEmoji = '📈'
        } else if (result.change < 0) {
          titleEmoji = '📉'
        }
      }

      const embed = new EmbedBuilder()
        .setTitle(`${titleEmoji} ${displayName} (${result.symbol})`)
        .setURL(yahooUrl)
        .setColor(embedColor)
        .addFields(
          { name: '最新價格', value: priceStr, inline: true },
          { name: '漲跌幅', value: changeStr, inline: true },
          { name: '今日區間', value: `${formatValue(result.dayLow)} - ${formatValue(result.dayHigh)}`, inline: true },
          { name: '昨收 / 開盤', value: `${formatValue(result.previousClose)} / ${formatValue(result.open)}`, inline: true },
          { name: '成交量', value: formatValue(result.volume), inline: true },
          { name: '52週區間', value: `${formatValue(result.fiftyTwoWeekLow)} - ${formatValue(result.fiftyTwoWeekHigh)}`, inline: true }
        )
        .setTimestamp()

      const slogan = getStockSlogan(chineseName || query)
      const content = slogan ? `📣 **${slogan}**` : undefined

      if (statusMessage) {
        await statusMessage.edit({ content: content || `✅ 已找到「${query}」的代碼為 \`${targetTicker}\`：`, embeds: [embed] })
      } else {
        await message.reply({ content, embeds: [embed] })
      }
    } catch (error: any) {
      console.error(`Error querying stock price for ${targetTicker}:`, error)
      const errorText = `❌ 查詢股票「${targetTicker}」時發生未預期的錯誤。`
      if (statusMessage) {
        await statusMessage.edit(errorText)
      } else {
        await message.reply(errorText)
      }
    }
  }
}
