import { Message } from 'discord.js'
import { getTwitterSetting } from '../utils/db'

/**
 * 將文字中的 x.com 與 twitter.com 替換為支援 Discord 完整預覽的修復網域 (fixupx.com / fxtwitter.com)
 */
export const replaceTwitterUrls = (content: string): string => {
  return content
    .replace(/(https?:\/\/)(www\.)?x\.com/gi, '$1fixupx.com')
    .replace(/(https?:\/\/)(www\.)?twitter\.com/gi, '$1fxtwitter.com')
}

/**
 * 判斷訊息中的 embeds 是否已包含圖片、影片等富媒體預覽
 */
export const hasRichMediaEmbed = (embeds?: any[] | null): boolean => {
  if (!embeds || embeds.length === 0) {
    return false
  }
  return embeds.some(e => {
    // 判斷是否為 X 原生生成的無效佔位卡片 (例如標題為 Post、或圖片為官方 SEE WHAT'S HAPPENING 宣傳圖)
    const isGenericPlaceholder =
      (e.title === 'Post' && (!e.description || e.description === 'Post')) ||
      (e.image?.url && e.image.url.includes('abs.twimg.com')) ||
      (e.thumbnail?.url && e.thumbnail.url.includes('abs.twimg.com'))

    if (isGenericPlaceholder) {
      return false
    }

    return (
      Boolean(e.image?.url || e.image) ||
      Boolean(e.video?.url || e.video) ||
      Boolean(e.thumbnail?.url)
    )
  })
}

/**
 * 偵測訊息中是否含有 x.com 或 twitter.com 連結。
 * 若有，等待一定延遲後檢查是否產生完整圖片/影片 embed，若無則替換為修復網域發送至同頻道。
 */
export const checkAndFixTwitterEmbed = (message: Message, delayMs: number = 3000): void => {
  const content = message.content
  // 檢查是否含有 x.com 或 twitter.com 網址 (忽略大小寫)
  if (!/https?:\/\/(www\.)?(x\.com|twitter\.com)\/[^\s]+/i.test(content)) {
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

      // 如果沒有產生完整的圖片/影片 embed，則進行 x.com/twitter.com 的替換並發送
      if (!hasRichMediaEmbed(fetchedMsg.embeds)) {
        const fixedContent = replaceTwitterUrls(fetchedMsg.content)
        if (fixedContent !== fetchedMsg.content) {
          await (message.channel as any).send(fixedContent)
        }
      }
    } catch (error: any) {
      console.error('Error in checkAndFixTwitterEmbed:', error.message || error)
    }
  }, delayMs)
}

