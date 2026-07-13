import { Message, EmbedBuilder, ChatInputCommandInteraction } from 'discord.js'
import { Command } from './command.interface'
import { CommandContext } from '../utils/context'

const keepDict: Record<string, string[]> = {}

export class UserCommand implements Command {
  public names = ['keep', 'keeplist']

  public slashData = [
    {
      name: 'keep',
      description: '暫存一筆文字訊息',
      options: [
        {
          name: 'message',
          type: 3, // String
          description: '要暫存的文字內容',
          required: true
        }
      ]
    },
    {
      name: 'keeplist',
      description: '查看您目前暫存的所有內容'
    }
  ]

  public execute(message: Message, args: string[]): void {
    const cmd = message.content.substring(1).split(' ')[0].toLowerCase()
    const ctx = new CommandContext(message)
    if (cmd === 'keep') {
      if (args.length >= 1) {
        const text = args.join(' ')
        if (keepDict[ctx.user.id] === undefined) {
          keepDict[ctx.user.id] = [text]
        } else {
          keepDict[ctx.user.id].unshift(text)
          if (keepDict[ctx.user.id].length > 10) {
            keepDict[ctx.user.id].pop()
          }
        }
        ctx.reply('已儲存，注意機器人重啟後會自動清除')
      } else {
        ctx.reply('格式錯誤，正確格式為：!keep [文字訊息]')
      }
    } else if (cmd === 'keeplist') {
      if (keepDict[ctx.user.id] === undefined || keepDict[ctx.user.id].length === 0) {
        keepDict[ctx.user.id] = []
        ctx.reply('尚未儲存任何訊息')
        return
      }
      const embed = new EmbedBuilder()
        .setTitle('Keep 列表')
        .setDescription(
          `以下是 ${ctx.user.username} 目前儲存的訊息 (最多10筆，超過後從最舊開始刪除)：`
        )

      const fields = keepDict[ctx.user.id].map((text, i) => ({
        name: `${i + 1}.`,
        value: text || '無內容'
      }))

      if (fields.length > 0) {
        embed.addFields(fields)
      }
      ctx.reply({ embeds: [embed] })
    }
  }

  public async executeSlash(interaction: ChatInputCommandInteraction): Promise<void> {
    const cmd = interaction.commandName.toLowerCase()
    if (cmd === 'keep') {
      const text = interaction.options.getString('message', true)
      if (keepDict[interaction.user.id] === undefined) {
        keepDict[interaction.user.id] = [text]
      } else {
        keepDict[interaction.user.id].unshift(text)
        if (keepDict[interaction.user.id].length > 10) {
          keepDict[interaction.user.id].pop()
        }
      }
      await interaction.reply({ content: '已儲存，注意機器人重啟後會自動清除', ephemeral: true })
    } else if (cmd === 'keeplist') {
      if (keepDict[interaction.user.id] === undefined || keepDict[interaction.user.id].length === 0) {
        keepDict[interaction.user.id] = []
        await interaction.reply({ content: '尚未儲存任何訊息', ephemeral: true })
        return
      }
      const embed = new EmbedBuilder()
        .setTitle('Keep 列表')
        .setDescription(
          `以下是 ${interaction.user.username} 目前儲存的訊息 (最多10筆，超過後從最舊開始刪除)：`
        )

      const fields = keepDict[interaction.user.id].map((text, i) => ({
        name: `${i + 1}.`,
        value: text || '無內容'
      }))

      if (fields.length > 0) {
        embed.addFields(fields)
      }
      await interaction.reply({ embeds: [embed] })
    }
  }
}

export const userKeep = (message: Message): void => {
  const content = message.content.substring(1)
  const commands = content.split(' ')
  const args = commands.slice(1)
  new UserCommand().execute(message, args)
}
