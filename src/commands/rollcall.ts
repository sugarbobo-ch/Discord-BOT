import { Message, EmbedBuilder, User, ChatInputCommandInteraction } from 'discord.js'
import moment from 'moment'
import { Command } from './command.interface'
import { CommandContext } from '../utils/context'

interface RollCallMember {
  time: string
  text: string | User
  author: User
}

interface RollCallInfo {
  title: string
  rollCallList: RollCallMember[]
  isOpen: boolean
  votesForCloseRoll: number
}

const serverRollcallDict: Record<string, RollCallInfo> = {}

export class RollCallCommand implements Command {
  public names = ['點名', '開始點名', '點名清單', '結束點名']

  public slashData = [
    {
      name: '開始點名',
      description: '發起一個新的點名活動',
      options: [
        {
          name: '標題',
          type: 3, // String
          description: '點名活動的標題',
          required: false
        }
      ]
    },
    {
      name: '點名',
      description: '進行簽到點名',
      options: [
        {
          name: '備註',
          type: 3, // String
          description: '點名備註（例如：在線上、請假等）',
          required: false
        }
      ]
    },
    {
      name: '點名清單',
      description: '查看當前已點名的成員清單'
    },
    {
      name: '結束點名',
      description: '投票結束當前點名（需要3人同意）'
    }
  ]

  public execute(message: Message, args: string[]): void {
    const cmd = message.content.substring(1).split(' ')[0].toLowerCase()
    const ctx = new CommandContext(message)
    switch (cmd) {
      case '點名':
        this.addRollCallMember(ctx, args[0] || '')
        break
      case '開始點名':
        this.checkRollCall(ctx, true, args[0] || '')
        break
      case '點名清單':
        this.checkRollCall(ctx, false, '')
        break
      case '結束點名':
        this.endRollCall(ctx)
        break
    }
  }

  public async executeSlash(interaction: ChatInputCommandInteraction): Promise<void> {
    const cmd = interaction.commandName.toLowerCase()
    const ctx = new CommandContext(interaction)
    switch (cmd) {
      case '點名': {
        const remark = interaction.options.getString('備註') || ''
        this.addRollCallMember(ctx, remark)
        break
      }
      case '開始點名': {
        const title = interaction.options.getString('標題') || ''
        this.checkRollCall(ctx, true, title)
        break
      }
      case '點名清單':
        this.checkRollCall(ctx, false, '')
        break
      case '結束點名':
        this.endRollCall(ctx)
        break
    }
  }

  private checkRollCall(ctx: CommandContext, forceReset: boolean, title: string): void {
    const serverId = ctx.guildId
    if (!serverId) return

    if (serverRollcallDict[serverId] === undefined) {
      serverRollcallDict[serverId] = {
        title,
        rollCallList: [],
        isOpen: true,
        votesForCloseRoll: 0
      }
      ctx.reply(`已建立${title}點名清單，滿3人使用 /結束點名 指令即可停止點名`)
    } else {
      const rollCall = serverRollcallDict[serverId]
      if (!forceReset) {
        const titleStr = rollCall.title.length > 0 ? rollCall.title + ' ' : ''
        const setCount = Math.ceil(rollCall.rollCallList.length / 10)
        
        if (rollCall.rollCallList.length === 0) {
          ctx.reply(`目前${titleStr}點名清單尚未有任何成員簽到。`)
          return
        }

        // Send first response
        let replied = false
        for (let i = 0; i < setCount; i++) {
          const embed = new EmbedBuilder()
            .setTitle(`${titleStr}點名清單`)
            .setDescription('目前已點名的人，請注意是否有代點名的狀況出現：')

          const fields = rollCall.rollCallList.slice(i * 10, (i + 1) * 10).map(member => ({
            name: member.time,
            value: `${member.author} 點名：${member.text}`
          }))

          if (fields.length > 0) {
            embed.addFields(fields)
          }

          if (!replied) {
            ctx.reply({ embeds: [embed] })
            replied = true
          } else {
            ctx.channelSend({ embeds: [embed] })
          }
        }
      } else {
        if (rollCall.isOpen) {
          ctx.reply('請先投票關閉點名後才可以開始新的點名')
          return
        }
        serverRollcallDict[serverId] = {
          title,
          rollCallList: [],
          isOpen: true,
          votesForCloseRoll: 0
        }
        ctx.reply(`已建立${title}點名清單，滿3人使用 /結束點名 指令即可停止點名`)
      }
    }
  }

  private addRollCallMember(ctx: CommandContext, textVal: string): void {
    const serverId = ctx.guildId
    if (!serverId) return

    if (serverRollcallDict[serverId] === undefined) {
      ctx.reply('此伺服器尚未建立點名清單，請使用 /開始點名 [標題] 來建立點名清單')
    } else {
      const rollCall = serverRollcallDict[serverId]
      if (!rollCall.isOpen) {
        ctx.reply('已經關閉點名，下次請早')
        return
      }
      const text = textVal || ctx.user
      rollCall.rollCallList.push({
        time: moment().format('HH:mm:ss'),
        text,
        author: ctx.user
      })
      ctx.reply(`您已完成點名：${text}`)
    }
  }

  private endRollCall(ctx: CommandContext): void {
    const serverId = ctx.guildId
    if (!serverId) return

    if (serverRollcallDict[serverId] === undefined) {
      ctx.reply('此伺服器尚未建立點名清單，請使用 /開始點名 [標題] 來建立點名清單')
    } else {
      const rollCall = serverRollcallDict[serverId]
      if (!rollCall.isOpen || rollCall.votesForCloseRoll >= 3) {
        ctx.reply('目前點名狀態已經關閉')
        return
      }
      rollCall.votesForCloseRoll += 1
      if (rollCall.votesForCloseRoll === 3) {
        rollCall.isOpen = false
        ctx.reply(`投票：結束${rollCall.title}點名 (3/3)，關閉${rollCall.title}點名`)
      } else {
        ctx.reply(`投票：結束${rollCall.title}點名 (${rollCall.votesForCloseRoll}/3)`)
      }
    }
  }
}

export const runRollCallCommand = (message: Message): void => {
  const content = message.content.substring(1)
  const commands = content.split(' ')
  const args = commands.slice(1)
  new RollCallCommand().execute(message, args)
}
