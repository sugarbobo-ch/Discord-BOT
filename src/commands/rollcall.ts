import { Message, EmbedBuilder, User } from 'discord.js'
import moment from 'moment'
import { Command } from './command.interface'

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

  public execute(message: Message, args: string[]): void {
    if (!message.guild) return
    const cmd = message.content.substring(1).split(' ')[0].toLowerCase()
    switch (cmd) {
      case '點名':
        this.addRollCallMember(message, args)
        break
      case '開始點名':
        this.checkRollCall(message, true, args)
        break
      case '點名清單':
        this.checkRollCall(message, false, args)
        break
      case '結束點名':
        this.endRollCall(message)
        break
    }
  }

  private checkRollCall(message: Message, forceReset: boolean, args: string[]): void {
    if (!message.guild) return
    const serverId = message.guild.id
    if (serverRollcallDict[serverId] === undefined) {
      const title = args[0] || ''
      serverRollcallDict[serverId] = {
        title,
        rollCallList: [],
        isOpen: true,
        votesForCloseRoll: 0
      }
      message.reply(`已建立${title}點名清單，滿3人使用 !結束點名 指令即可停止點名`)
    } else {
      const rollCall = serverRollcallDict[serverId]
      if (!forceReset) {
        const title = rollCall.title.length > 0 ? rollCall.title + ' ' : ''
        const setCount = rollCall.rollCallList.length / 10
        for (let i = 0; i < setCount; i++) {
          const embed = new EmbedBuilder()
            .setTitle(`${title}點名清單`)
            .setDescription('目前已點名的人，請注意是否有代點名的狀況出現：')

          const fields = rollCall.rollCallList.slice(i * 10, (i + 1) * 10).map(member => ({
            name: member.time,
            value: `${member.author} 點名：${member.text}`
          }))

          if (fields.length > 0) {
            embed.addFields(fields)
          }
          ;(message.channel as any).send({ embeds: [embed] })
        }
      } else {
        if (rollCall.isOpen) {
          message.reply('請先投票關閉點名後才可以開始新的點名')
          return
        }
        const title = args[0] || ''
        serverRollcallDict[serverId] = {
          title,
          rollCallList: [],
          isOpen: true,
          votesForCloseRoll: 0
        }
        message.reply(`已建立${title}點名清單，滿3人使用 !結束點名 指令即可停止點名`)
      }
    }
  }

  private addRollCallMember(message: Message, args: string[]): void {
    if (!message.guild) return
    const serverId = message.guild.id
    if (serverRollcallDict[serverId] === undefined) {
      message.reply('此伺服器尚未建立點名清單，請使用 !開始點名 [標題] 來建立點名清單')
    } else {
      const rollCall = serverRollcallDict[serverId]
      if (!rollCall.isOpen) {
        message.reply('已經關閉點名，下次請早')
        return
      }
      const text = args[0] || message.author
      rollCall.rollCallList.push({
        time: moment().format('HH:mm:ss'),
        text,
        author: message.author
      })
      message.reply(`您已完成點名：${text}`)
    }
  }

  private endRollCall(message: Message): void {
    if (!message.guild) return
    const serverId = message.guild.id
    if (serverRollcallDict[serverId] === undefined) {
      message.reply('此伺服器尚未建立點名清單，請使用 !開始點名 [標題] 來建立點名清單')
    } else {
      const rollCall = serverRollcallDict[serverId]
      if (!rollCall.isOpen || rollCall.votesForCloseRoll >= 3) {
        message.reply('目前點名狀態已經關閉')
        return
      }
      rollCall.votesForCloseRoll += 1
      if (rollCall.votesForCloseRoll === 3) {
        rollCall.isOpen = false
        message.reply(`投票：結束${rollCall.title}點名 (3/3)，關閉${rollCall.title}點名`)
      } else {
        message.reply(`投票：結束${rollCall.title}點名 (${rollCall.votesForCloseRoll}/3)`)
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
