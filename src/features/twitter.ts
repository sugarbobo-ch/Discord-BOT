import { Message } from 'discord.js'
import { getTwitterSetting } from '../utils/db'

/**
 * 偵測訊息中是否含有 x.com 連結。
 * 若有，等待一定延遲後檢查是否產生 embed，若無則改為 fixvx.com 並發送至同頻道。
 */
export const checkAndFixTwitterEmbed = (message: Message, delayMs: number = 3000): void => {
  const content = message.content
  // 檢查是否含有 x.com 網址 (忽略大小寫)
  if (!/https?:\/\/(www\.)?x\.com\/[^\s]+/i.test(content)) {
    return
  }

  // 檢查伺服器設定是否開啟置換
  if (message.guild) {
    const isEnabled = getTwitterSetting(message.guild.id)
    if (!isEnabled) {
      return
    }
  }

  setTimeout(async () => {
    try {
      // 重新獲取訊息以確認是否已有 embeds
      const fetchedMsg = await (message.channel as any).messages.fetch(message.id)

      // 如果沒有 embeds，則進行 x.com -> fixvx.com 的替換並發送
      if (!fetchedMsg.embeds || fetchedMsg.embeds.length === 0) {
        const fixedContent = fetchedMsg.content.replace(
          /(https?:\/\/)(www\.)?x\.com/gi,
          '$1fixvx.com'
        )
        if (fixedContent !== fetchedMsg.content) {
          await (message.channel as any).send(fixedContent)
        }
      }
    } catch (error: any) {
      console.error('Error in checkAndFixTwitterEmbed:', error.message || error)
    }
  }, delayMs)
}
