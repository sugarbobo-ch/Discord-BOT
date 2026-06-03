import { Message, EmbedBuilder } from 'discord.js'
import { Command } from './command.interface'

const keepDict: Record<string, string[]> = {}

export class UserCommand implements Command {
  public names = ['keep', 'keeplist']

  public execute(message: Message, args: string[]): void {
    const cmd = message.content.substring(1).split(' ')[0].toLowerCase()
    if (cmd === 'keep') {
      if (args.length >= 1) {
        const text = args.join('') // 原本 user.ts 是用迴圈串接無空白: for (let i = 1; i < commands.length; i++) { str += commands[i] }
        if (keepDict[message.author.id] === undefined) {
          keepDict[message.author.id] = [text]
        } else {
          keepDict[message.author.id].unshift(text)
          if (keepDict[message.author.id].length > 10) {
            keepDict[message.author.id].pop()
          }
        }
        message.reply('已儲存，注意機器人重啟後會自動清除')
      }
    } else if (cmd === 'keeplist') {
      if (keepDict[message.author.id] === undefined || keepDict[message.author.id].length === 0) {
        keepDict[message.author.id] = []
        ;(message.channel as any).send('尚未儲存任何訊息')
        return
      }
      const embed = new EmbedBuilder()
        .setTitle('Keep 列表')
        .setDescription(
          `以下是 ${message.author.username} 目前儲存的訊息 (最多10筆，超過後從最舊開始刪除)：`
        )

      const fields = keepDict[message.author.id].map((text, i) => ({
        name: `${i + 1}.`,
        value: text || '無內容'
      }))

      if (fields.length > 0) {
        embed.addFields(fields)
      }
      ;(message.channel as any).send({ embeds: [embed] })
    }
  }
}

export const userKeep = (message: Message): void => {
  const content = message.content.substring(1)
  const commands = content.split(' ')
  const args = commands.slice(1)
  new UserCommand().execute(message, args)
}
