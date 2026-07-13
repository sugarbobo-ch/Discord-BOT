import { Message, EmbedBuilder, AttachmentBuilder, ChatInputCommandInteraction } from 'discord.js'
import { Command } from './command.interface'
import {
  getStockPrice,
  COMMON_STOCK_MAP,
  searchStockTickerWithYahoo,
  fetchStockNameFromYahooPage,
  lookupStockTicker,
  getTaiwanStockName,
  getStockSlogan,
  getStockChartData,
  fetchFullYahooQuote
} from '../utils/stock'
import { searchStockTickerWithAI, getChineseNameWithAI } from '../utils/gemini'
import axios from 'axios'
import { CommandContext } from '../utils/context'

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

  public slashData = {
    name: 'stock',
    description: '查詢最新股價及近30天走勢K線圖',
    options: [
      {
        name: '代碼或名稱',
        type: 3, // String
        description: '股票代號或名稱，例如 2330、美光、AAPL',
        required: true
      }
    ]
  }

  public async execute(message: Message, args: string[]): Promise<void> {
    if (args.length === 0) {
      await message.reply(
        '請提供要查詢的股票代號或名稱，例如：\n• `!stock 2330`\n• `!stock 美光`\n• `!stock 華通`'
      )
      return
    }

    const query = args.join(' ').trim()
    if (!query) {
      await message.reply(
        '請提供要查詢的股票代號或名稱，例如：\n• `!stock 2330`\n• `!stock 美光`\n• `!stock 華通`'
      )
      return
    }

    const ctx = new CommandContext(message)
    await this.searchStock(ctx, query)
  }

  public async executeSlash(interaction: ChatInputCommandInteraction): Promise<void> {
    const query = interaction.options.getString('代碼或名稱', true).trim()
    const ctx = new CommandContext(interaction)
    await this.searchStock(ctx, query)
  }

  private async searchStock(ctx: CommandContext, query: string): Promise<void> {
    let targetTicker = query
    let statusMessage: any = null
    let yahooMatchedName: string | null = null

    // 1. Try resolving using lookupStockTicker first
    const resolved = await lookupStockTicker(query)
    if (resolved) {
      targetTicker = resolved
    } else {
      const isDirectTicker = /^[A-Za-z0-9.-]+$/.test(query)

      if (!isDirectTicker) {
        try {
          if (ctx.isInteraction) {
            await ctx.reply(`🔍 正在搜尋「${query}」的股票代碼...`)
            statusMessage = ctx.interaction
          } else {
            statusMessage = await ctx.message!.reply(`🔍 正在搜尋「${query}」的股票代碼...`)
          }
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
            if (ctx.isInteraction) {
              await ctx.editReply(errorText)
            } else {
              await statusMessage.edit(errorText)
            }
          } else {
            await ctx.reply(errorText)
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
          if (ctx.isInteraction) {
            await ctx.editReply(errorText)
          } else {
            await statusMessage.edit(errorText)
          }
        } else {
          await ctx.reply(errorText)
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
        const percentVal =
          result.changePercent !== undefined && result.changePercent !== null
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
          {
            name: '今日區間',
            value: `${formatValue(result.dayLow)} - ${formatValue(result.dayHigh)}`,
            inline: true
          },
          {
            name: '昨收 / 開盤',
            value: `${formatValue(result.previousClose)} / ${formatValue(result.open)}`,
            inline: true
          },
          { name: '成交量', value: formatValue(result.volume), inline: true },
          {
            name: '52週區間',
            value: `${formatValue(result.fiftyTwoWeekLow)} - ${formatValue(result.fiftyTwoWeekHigh)}`,
            inline: true
          }
        )
        .setTimestamp()

      const slogan = getStockSlogan(chineseName || query)
      const content = slogan ? `📣 **${slogan}**` : undefined

      let finalMsg: Message
      if (ctx.isInteraction) {
        if (statusMessage) {
          await ctx.editReply({
            content: content || `✅ 已找到「${query}」的代碼為 \`${targetTicker}\`：`,
            embeds: [embed]
          })
        } else {
          await ctx.reply({ content, embeds: [embed] })
        }
        finalMsg = (await ctx.interaction!.fetchReply()) as Message
      } else {
        if (statusMessage) {
          await statusMessage.edit({
            content: content || `✅ 已找到「${query}」的代碼為 \`${targetTicker}\`：`,
            embeds: [embed]
          })
          finalMsg = statusMessage as Message
        } else {
          finalMsg = (await ctx.message!.reply({ content, embeds: [embed] })) as Message
        }
      }

      // 背景非同步取得 52 週指標及繪製 K 線圖
      if (!process.env.VITEST) {
        ;(async () => {
          try {
            // 1. 取得歷史 K 線數據 (過去 40 天)
            const quotes = await getStockChartData(result.symbol, 40)
            const validQuotes = quotes
              .filter(
                (q: any) =>
                  q.date && q.open !== null && q.high !== null && q.low !== null && q.close !== null
              )
              .map((q: any) => ({
                x: new Date(q.date).getTime(),
                o: q.open,
                h: q.high,
                l: q.low,
                c: q.close
              }))
              .slice(-30) // 只保留最近 30 筆

            // 2. 獲取 Yahoo 完整 Quote 補全 52 週最高/最低 (如果本來沒有的話)
            let updatedLow = result.fiftyTwoWeekLow
            let updatedHigh = result.fiftyTwoWeekHigh

            if (updatedLow === undefined || updatedHigh === undefined) {
              const fullQuote = await fetchFullYahooQuote(result.symbol)
              if (fullQuote) {
                if (updatedLow === undefined && fullQuote.fiftyTwoWeekLow !== undefined) {
                  updatedLow = fullQuote.fiftyTwoWeekLow
                }
                if (updatedHigh === undefined && fullQuote.fiftyTwoWeekHigh !== undefined) {
                  updatedHigh = fullQuote.fiftyTwoWeekHigh
                }
              }
            }

            // 3. 準備更新後的 Embed
            const updatedEmbed = EmbedBuilder.from(embed)

            // 更新 52週區間 欄位
            updatedEmbed.setFields([
              { name: '最新價格', value: priceStr, inline: true },
              { name: '漲跌幅', value: changeStr, inline: true },
              {
                name: '今日區間',
                value: `${formatValue(result.dayLow)} - ${formatValue(result.dayHigh)}`,
                inline: true
              },
              {
                name: '昨收 / 開盤',
                value: `${formatValue(result.previousClose)} / ${formatValue(result.open)}`,
                inline: true
              },
              { name: '成交量', value: formatValue(result.volume), inline: true },
              {
                name: '52週區間',
                value: `${formatValue(updatedLow)} - ${formatValue(updatedHigh)}`,
                inline: true
              }
            ])

            // 4. 如果有歷史 K 線數據，產生 K 線圖並附加
            const editPayload: any = { embeds: [updatedEmbed] }

            if (validQuotes.length > 0) {
              const isTw = result.symbol.endsWith('.TW') || result.symbol.endsWith('.TWO')
              const colorUp = isTw ? '#e74c3c' : '#2ecc71'
              const colorDown = isTw ? '#2ecc71' : '#e74c3c'

              const chartConfig = {
                type: 'candlestick',
                data: {
                  datasets: [
                    {
                      label: `${displayName} (${result.symbol}) K線圖 (近30天)`,
                      data: validQuotes,
                      color: {
                        up: colorUp,
                        down: colorDown,
                        unchanged: '#7f8c8d'
                      },
                      borderColor: {
                        up: colorUp,
                        down: colorDown,
                        unchanged: '#7f8c8d'
                      }
                    }
                  ]
                },
                options: {
                  scales: {
                    x: {
                      type: 'timeseries',
                      time: {
                        unit: 'day',
                        displayFormats: {
                          day: 'M/d',
                          month: 'yyyy/M',
                          year: 'yyyy'
                        }
                      },
                      grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                      },
                      ticks: {
                        color: '#ffffff',
                        maxRotation: 0
                      }
                    },
                    y: {
                      grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                      },
                      ticks: {
                        color: '#ffffff'
                      }
                    }
                  },
                  plugins: {
                    title: {
                      display: true,
                      text: `${displayName} (${result.symbol}) K線圖 (近30天)`,
                      color: '#ffffff',
                      font: {
                        size: 16
                      }
                    },
                    legend: {
                      display: false
                    }
                  }
                }
              }

              const chartRes = await axios.post(
                'https://quickchart.io/chart',
                {
                  chart: chartConfig,
                  version: '3',
                  width: 600,
                  height: 350,
                  backgroundColor: '#1e1e24'
                },
                {
                  responseType: 'arraybuffer',
                  timeout: 10000
                }
              )

              if (chartRes.status === 200) {
                const attachment = new AttachmentBuilder(Buffer.from(chartRes.data), {
                  name: 'kline.png'
                })
                updatedEmbed.setImage('attachment://kline.png')
                editPayload.files = [attachment]
              }
            }

            // 5. 更新編輯 Discord 訊息
            await finalMsg.edit(editPayload)
          } catch (bgErr: any) {
            console.error(
              '[Stock Background Update Error] Failed to update quote/chart:',
              bgErr.message
            )
          }
        })()
      }
    } catch (error: any) {
      console.error(`Error querying stock price for ${targetTicker}:`, error)
      const errorText = `❌ 查詢股票「${targetTicker}」時發生未預期的錯誤。`
      if (statusMessage) {
        if (ctx.isInteraction) {
          await ctx.editReply(errorText)
        } else {
          await statusMessage.edit(errorText)
        }
      } else {
        await ctx.reply(errorText)
      }
    }
  }
}
