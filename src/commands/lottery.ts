import { Message, EmbedBuilder, User, ChatInputCommandInteraction } from 'discord.js'
import moment from 'moment'
import { Command } from './command.interface'
import { CommandContext } from '../utils/context'

interface LotteryMember {
  time: moment.Moment
  userId: string
  user: User
}

interface LotteryInfo {
  holder: string
  title: string
  status: 'open' | 'close'
  time: moment.Moment
  list: LotteryMember[]
}

const lotteryDict: Record<string, Record<string, LotteryInfo>> = {}

export class LotteryCommand implements Command {
  public names = ['開始抽獎', '抽獎', '抽獎名單', '開獎', '結束抽獎', '強制結束抽獎', '抽獎指令']

  public slashData = [
    {
      name: '開始抽獎',
      description: '在當前頻道發起抽獎活動',
      options: [
        {
          name: '活動標題',
          type: 3, // String
          description: '抽獎活動的標題',
          required: true
        },
        {
          name: '時間',
          type: 4, // Integer
          description: '抽獎開放時間（分鐘，預設為5分鐘）',
          required: false
        }
      ]
    },
    {
      name: '抽獎',
      description: '參加當前頻道的抽獎活動'
    },
    {
      name: '抽獎名單',
      description: '查看當前頻道的抽獎規則與已參加名單'
    },
    {
      name: '開獎',
      description: '抽獎時間截止後進行開獎（限舉辦人）',
      options: [
        {
          name: '人數',
          type: 4, // Integer
          description: '抽出的中獎人數（預設為1人）',
          required: false
        }
      ]
    },
    {
      name: '結束抽獎',
      description: '結束並刪除當前頻道的抽獎活動（限舉辦人）'
    },
    {
      name: '強制結束抽獎',
      description: '強制結束並刪除當前頻道的抽獎活動'
    },
    {
      name: '抽獎指令',
      description: '查看抽獎功能的所有指令說明'
    }
  ]

  public execute(message: Message, args: string[]): void {
    const cmd = message.content.substring(1).split(' ')[0].toLowerCase()
    const ctx = new CommandContext(message)
    switch (cmd) {
      case '開始抽獎': {
        const timeVal = parseInt(args[1], 10)
        this.handleCreateLotteryCommand(ctx, args[0] || '', isNaN(timeVal) ? undefined : timeVal)
        break
      }
      case '抽獎':
        this.handleJoinLottery(ctx)
        break
      case '抽獎名單':
        this.handleDisplayLotteryList(ctx)
        break
      case '開獎': {
        const count = parseInt(args[0], 10)
        this.handleChooseWinner(ctx, isNaN(count) ? 1 : count)
        break
      }
      case '結束抽獎':
        this.handleCloseLottery(ctx)
        break
      case '強制結束抽獎':
        this.handleCloseLottery(ctx, true)
        break
      case '抽獎指令':
        this.handleDisplayHelp(ctx)
        break
    }
  }

  public async executeSlash(interaction: ChatInputCommandInteraction): Promise<void> {
    const cmd = interaction.commandName.toLowerCase()
    const ctx = new CommandContext(interaction)
    switch (cmd) {
      case '開始抽獎': {
        const title = interaction.options.getString('活動標題', true)
        const time = interaction.options.getInteger('時間') || undefined
        this.handleCreateLotteryCommand(ctx, title, time)
        break
      }
      case '抽獎':
        this.handleJoinLottery(ctx)
        break
      case '抽獎名單':
        this.handleDisplayLotteryList(ctx)
        break
      case '開獎': {
        const count = interaction.options.getInteger('人數') || 1
        this.handleChooseWinner(ctx, count)
        break
      }
      case '結束抽獎':
        this.handleCloseLottery(ctx)
        break
      case '強制結束抽獎':
        this.handleCloseLottery(ctx, true)
        break
      case '抽獎指令':
        this.handleDisplayHelp(ctx)
        break
    }
  }

  private isLotteryExist({ server, channel }: { server: string; channel: string }): boolean {
    return !!(lotteryDict[server] && lotteryDict[server][channel])
  }

  private getChannelLottery({
    server,
    channel
  }: {
    server: string
    channel: string
  }): LotteryInfo | null {
    if (lotteryDict[server] && lotteryDict[server][channel]) {
      return lotteryDict[server][channel]
    }
    return null
  }

  private updateChannelLotteryStatus({
    server,
    channel
  }: {
    server: string
    channel: string
  }): void {
    if (lotteryDict[server] && lotteryDict[server][channel]) {
      const lottery = lotteryDict[server][channel]
      lottery.status = moment().isSameOrAfter(lottery.time) ? 'close' : 'open'
    }
  }

  private createLottery({
    server,
    channel,
    userId,
    title,
    time
  }: {
    server: string
    channel: string
    userId: string
    title: string
    time: number
  }): void {
    if (!lotteryDict[server]) {
      lotteryDict[server] = {}
    }
    if (!lotteryDict[server][channel]) {
      lotteryDict[server][channel] = {
        holder: userId,
        title,
        status: 'open',
        time: moment().add(time, 'minutes'),
        list: []
      }
    }
  }

  private handleCreateLotteryCommand(ctx: CommandContext, title: string, minutesVal?: number): void {
    const server = ctx.guildId
    const channel = ctx.channel?.id
    const userId = ctx.user.id
    if (!server || !channel) return

    if (!title) {
      ctx.reply('格式錯誤，正確格式為：!開始抽獎 [活動標題] [時間(分鐘，選填)]')
      return
    }

    const time = minutesVal && minutesVal >= 1 ? minutesVal : 5
    const config = { server, channel, userId, title, time }

    if (this.isLotteryExist(config)) {
      ctx.reply(
        '此頻道內已有建立好的抽獎，請使用「/開獎 {人數}」進行抽獎，請注意抽獎完後抽到的人會自動被移出名單內'
      )
    } else {
      if (lotteryDict[server] && lotteryDict[server][channel]) {
        const currentLottery = lotteryDict[server][channel]
        if (moment().isSameOrAfter(moment(currentLottery.time).add(30, 'minutes'))) {
          delete lotteryDict[server][channel]
        } else {
          ctx.reply(
            `目前此頻道已有建立好的抽獎活動：${
              currentLottery.title
            }，結束時間：${currentLottery.time.format(
              'HH:mm:ss'
            )}，請等待此抽獎活動結束後30分鐘或是通知舉辦人關閉抽獎`
          )
          return
        }
      }

      this.createLottery(config)
      ctx.reply(
        `已建立好 ${title} 的抽獎，抽獎將於 ${time} 分內結束，詳情可以使用 /抽獎名單 查看規則與當前名單`
      )
    }
  }

  private handleJoinLottery(ctx: CommandContext): void {
    const server = ctx.guildId
    const channel = ctx.channel?.id
    const user = ctx.user
    const userId = ctx.user.id
    if (!server || !channel) return

    const config = { server, channel }
    const lottery = this.getChannelLottery(config)
    if (lottery) {
      const replyMessage: string[] = []
      this.updateChannelLotteryStatus(config)

      if (lottery.list.some(m => m.userId === userId)) {
        replyMessage.push('您已經參加了抽獎，請勿重複參加')
      } else {
        if (lottery.status !== 'open') {
          replyMessage.push('抽獎已經截止，請等待開獎')
        } else {
          lottery.list.push({ time: moment(), userId, user })
          replyMessage.push('參加抽獎成功')
        }
      }

      ctx.reply(replyMessage.join('；'))
    } else {
      ctx.reply('目前沒有進行中的抽獎')
    }
  }

  private handleChooseWinner(ctx: CommandContext, winnerCount: number): void {
    const server = ctx.guildId
    const channel = ctx.channel?.id
    const userId = ctx.user.id
    if (!server || !channel) return
    const config = { server, channel, userId }
    const lottery = this.getChannelLottery(config)

    if (this.isLotteryExist(config)) {
      this.updateChannelLotteryStatus(config)

      if (lottery && lottery.holder !== userId) {
        ctx.reply('您並非此活動舉辦人，無權限使用開獎指令')
        return
      }

      if (lottery && lottery.status === 'open') {
        ctx.reply(
          `抽獎還在進行中，為求公平，請等待抽獎結束時間 ${lottery.time.format('HH:mm:ss')}`
        )
      } else if (lottery) {
        if (lottery.list.length === 0) {
          ctx.reply('沒有人參加抽獎啦')
          return
        }
        if (lottery.list.length < winnerCount) {
          ctx.reply('開獎人數大於抽獎人數，請減少開獎人數')
          return
        }
        lottery.list.sort(() => 0.5 - Math.random())
        
        ctx.channelSend('洗牌中...等我一下喔 >u<')
        
        const selected = lottery.list.splice(0, winnerCount)
        const winners = selected.map(member => member.user)
        
        winners.forEach((user, index) => {
          const avatarUrl = user.displayAvatarURL()
          const embed = new EmbedBuilder()
            .setTitle(user.username)
            .setAuthor({ name: `${lottery.title} 中獎名單` })
            .setDescription(`恭喜幸運兒 ${user} 中獎！`)
            .setThumbnail(avatarUrl)
          
          if (index === 0) {
            ctx.reply({ embeds: [embed] })
          } else {
            ctx.channelSend({ embeds: [embed] })
          }
        })
      }
    } else {
      ctx.reply('目前沒有進行中的抽獎')
    }
  }

  private handleCloseLottery(ctx: CommandContext, forceClose?: boolean): void {
    const server = ctx.guildId
    const channel = ctx.channel?.id
    const user = ctx.user
    if (!server || !channel) return
    const config = { server, channel }
    const lottery = this.getChannelLottery(config)

    if (this.isLotteryExist(config)) {
      this.updateChannelLotteryStatus(config)

      if (lottery && lottery.holder !== user.id) {
        ctx.reply(`您並非此活動舉辦人，無權限結束此活動：${lottery.title}`)
        return
      }

      const title = lotteryDict[server][channel].title
      delete lotteryDict[server][channel]
      if (!Object.keys(lotteryDict[server]).length) {
        delete lotteryDict[server]
      }
      ctx.reply(`已結束 ${title} 抽獎活動`)
    } else {
      if (forceClose) {
        if (lotteryDict[server]) {
          delete lotteryDict[server][channel]
        }
        ctx.reply('已強制結束此頻道的抽獎活動')
        return
      }
      ctx.reply('目前沒有進行中的抽獎')
    }
  }

  private handleDisplayLotteryList(ctx: CommandContext): void {
    const server = ctx.guildId
    const channel = ctx.channel?.id
    if (!server || !channel) return
    const config = { server, channel }
    const lottery = this.getChannelLottery(config)
    if (lottery) {
      this.updateChannelLotteryStatus(config)

      const setCount = Math.ceil(lottery.list.length / 10)
      if (lottery.list.length === 0) {
        const embed = new EmbedBuilder()
          .setTitle(`${lottery.title} 抽獎清單以及說明`)
          .setDescription(
            `抽獎於 ${lottery.time.format(
              'HH:mm:ss'
            )} 截止，截止後若要開獎，請使用「/開獎 {人數}」，最後舉辦人需要執行「/結束抽獎」刪除此抽獎活動`
          )
          .addFields(
            {
              name: '當前抽獎狀態',
              value: `${lottery.status === 'open' ? '開放參加中' : '已截止'}，抽獎名單內共 ${
                lottery.list.length
              } 人`
            },
            {
              name: '當前抽獎名單為空',
              value: '請使用 /抽獎 參加此抽獎'
            }
          )
        ctx.reply({ embeds: [embed] })
      } else {
        let replied = false
        for (let i = 0; i < setCount; i++) {
          const embed = new EmbedBuilder()
            .setTitle(`${lottery.title} 抽獎清單以及說明`)
            .setDescription(
              `抽獎於 ${lottery.time.format(
                'HH:mm:ss'
              )} 截止，截止後若要開獎，請使用「/開獎 {人數}」，最後舉辦人需要執行「/結束抽獎」刪除此抽獎活動`
            )
            .addFields(
              {
                name: '當前抽獎狀態',
                value: `${lottery.status === 'open' ? '開放參加中' : '已截止'}，抽獎名單內共 ${
                  lottery.list.length
                } 人`
              },
              {
                name: '參加抽獎時間',
                value: '參加使用者名稱'
              }
            )
          const list = lottery.list.slice(i * 10, (i + 1) * 10).map(member => {
            return {
              name: member.time.format('HH:mm:ss').toString(),
              value: member.user.toString()
            }
          })
          embed.addFields(list)
          if (!replied) {
            ctx.reply({ embeds: [embed] })
            replied = true
          } else {
            ctx.channelSend({ embeds: [embed] })
          }
        }
      }
    } else {
      ctx.reply('目前沒有進行中的抽獎')
    }
  }

  private handleDisplayHelp(ctx: CommandContext): void {
    const embed = new EmbedBuilder()
      .setTitle('抽獎功能指令與介紹')
      .setDescription('{}括號內為可以設定的文字或數字，請直接替換成要設定的值')
      .addFields(
        {
          name: '開始抽獎',
          value:
            '/開始抽獎 {活動標題} {時間(分鐘，選填)}，範例：/開始抽獎 贈送訂閱。同頻道只能同時存在一個抽獎，需等待前一抽獎活動結束後30分鐘才有權利刪除上一個活動，或是由上一個活動舉辦人執行 /結束抽獎'
        },
        {
          name: '抽獎',
          value: '/抽獎，使用此指令即可在時間內同頻道參加抽獎，唯獨舉辦人無法參加'
        },
        {
          name: '抽獎名單',
          value: '/抽獎名單，顯示抽獎名單'
        },
        {
          name: '開獎',
          value:
            '/開獎 {人數(選填)}，僅限舉辦人可以進行開獎，必須要在開放抽獎時間結束後才可以開獎'
        },
        {
          name: '結束抽獎',
          value: '/結束抽獎，僅限舉辦人操作，可刪除整個抽獎活動'
        },
        {
          name: '抽獎指令',
          value: '/抽獎指令，顯示所有可進行抽獎相關的指令'
        }
      )
    ctx.reply({ embeds: [embed] })
  }
}

export const runLotteryCommand = (message: Message): void => {
  const content = message.content.substring(1)
  const commands = content.split(' ')
  const args = commands.slice(1)
  new LotteryCommand().execute(message, args)
}
