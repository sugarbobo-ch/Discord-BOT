import { Message } from 'discord.js'
import { Command } from './command.interface'
import { chatWithBobo } from '../utils/gemini'
import auth from '../../config/auth.json'

export class BoboCommand implements Command {
  public names = ['bobo']

  public async execute(message: Message, args: string[]): Promise<void> {
    const prompt = args.join(' ')
    if (!prompt) {
      message.reply('叫波波幹嘛？後面要加上你想說的話啦！')
      return
    }

    try {
      // 在等待 AI 回應時顯示「正在輸入...」狀態
      await (message.channel as any).sendTyping()

      const limit = (auth as any).chatMemoryLimit || 10
      let channelHistoryContext = ''

      if (message.channel && message.channel.isTextBased()) {
        try {
          const fetched = await (message.channel as any).messages.fetch({ limit, before: message.id })
          const msgArray = Array.from(fetched.values()) as Message[] // [最新, ..., 最舊]
          const k = msgArray.length
          if (k > 0) {
            const nowSeconds = Math.floor(Date.now() / 1000)
            const chronologicalMsgs = msgArray.reverse() // [最舊, ..., 最新]

            channelHistoryContext = chronologicalMsgs
              .map((msg: Message, i) => {
                const msgTimeSeconds = Math.floor(msg.createdTimestamp / 1000)
                const secondsAgo = nowSeconds - msgTimeSeconds
                const weight = ((i + 1) / k).toFixed(2)
                const authorName = msg.member?.displayName || msg.author.username
                const sender = msg.author.id === message.client.user?.id ? '波波' : authorName
                return `[時間: ${secondsAgo}秒前, 發送者: ${sender}, 熱度權重: ${weight}] 內容: "${msg.content}"`
              })
              .join('\n')
          }
        } catch (fetchError: any) {
          console.warn('Failed to fetch channel history:', fetchError.message)
        }
      }

      const reply = await chatWithBobo(prompt, message.author.id, channelHistoryContext)
      message.reply(reply)
    } catch (error: any) {
      console.error('Error in BoboCommand:', error.message)
      message.reply('波波出錯了，無法回應。')
    }
  }
}
