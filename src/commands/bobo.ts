import { Message } from 'discord.js'
import { Command } from './command.interface'
import { chatWithBobo } from '../utils/gemini'

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
      const reply = await chatWithBobo(prompt, message.author.id)
      message.reply(reply)
    } catch (error: any) {
      console.error('Error in BoboCommand:', error.message)
      message.reply('波波出錯了，無法回應。')
    }
  }
}
