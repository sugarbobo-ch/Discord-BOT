import { Message, EmbedBuilder, User } from 'discord.js'
import moment from 'moment'
import { Command } from './command.interface'

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

  public execute(message: Message, args: string[]): void {
    if (!message.guild) return
    const cmd = message.content.substring(1).split(' ')[0].toLowerCase()
    switch (cmd) {
      case '開始抽獎':
        this.handleCreateLotteryCommand(message, args)
        break
      case '抽獎':
        this.handleJoinLottery(message)
        break
      case '抽獎名單':
        this.handleDisplayLotteryList(message)
        break
      case '開獎':
        this.handleChooseWinner(message, args)
        break
      case '結束抽獎':
        this.handleCloseLottery(message)
        break
      case '強制結束抽獎':
        this.handleCloseLottery(message, true)
        break
      case '抽獎指令':
        this.handleDisplayHelp(message)
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

  private handleCreateLotteryCommand(message: Message, args: string[]): void {
    if (!message.guild) return
    if (args.length < 1) {
      message.reply('格式錯誤，正確格式為：!開始抽獎 [活動標題] [時間(分鐘，選填)]')
      return
    }
    const server = message.guild.id
    const channel = message.channel.id
    const userId = message.author.id
    const title = args[0]

    const parsedTime = parseInt(args[1])
    const time = parsedTime >= 1 ? parsedTime : 5

    const config = { server, channel, userId, title, time }

    if (this.isLotteryExist(config)) {
      message.reply(
        '此頻道內已有建立好的抽獎，請使用「!開獎 {抽出的人數(不填寫預設為1)}」進行抽獎，請注意抽獎完後抽到的人會自動被移出名單內'
      )
    } else {
      if (lotteryDict[server] && lotteryDict[server][channel]) {
        const currentLottery = lotteryDict[server][channel]
        if (moment().isSameOrAfter(moment(currentLottery.time).add(30, 'minutes'))) {
          delete lotteryDict[server][channel]
        } else {
          message.reply(
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
      message.reply(
        `已建立好 ${title} 的抽獎，抽獎將於 ${time} 分內結束，詳情可以使用 !抽獎名單 查看規則與當前名單`
      )
    }
  }

  private handleJoinLottery(message: Message): void {
    if (!message.guild) return
    const server = message.guild.id
    const channel = message.channel.id
    const user = message.author
    const userId = message.author.id
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

      message.reply(replyMessage.join('；'))
    } else {
      message.reply('目前沒有進行中的抽獎')
    }
  }

  private handleChooseWinner(message: Message, args: string[]): void {
    if (!message.guild) return
    const parsedCount = parseInt(args[0])
    const winnerCount = parsedCount >= 1 ? parsedCount : 1

    const server = message.guild.id
    const channel = message.channel.id
    const userId = message.author.id
    const config = { server, channel, userId }
    const lottery = this.getChannelLottery(config)

    if (this.isLotteryExist(config)) {
      this.updateChannelLotteryStatus(config)

      if (lottery && lottery.holder !== userId) {
        message.reply('您並非此活動舉辦人，無權限使用開獎指令')
        return
      }

      if (lottery && lottery.status === 'open') {
        message.reply(
          `抽獎還在進行中，為求公平，請等待抽獎結束時間 ${lottery.time.format('HH:mm:ss')}`
        )
      } else if (lottery) {
        if (lottery.list.length === 0) {
          message.reply('沒有人參加抽獎啦')
          return
        }
        if (lottery.list.length < winnerCount) {
          message.reply('開獎人數大於抽獎人數，請減少開獎人數')
          return
        }
        lottery.list.sort(() => 0.5 - Math.random())
        ;(message.channel as any).send('洗牌中...等我一下喔 >u<')
        const selected = lottery.list.splice(0, winnerCount)
        const winners = selected.map(member => member.user)
        winners.forEach(user => {
          const avatarUrl = user.displayAvatarURL()
          const embed = new EmbedBuilder()
            .setTitle(user.username)
            .setAuthor({ name: `${lottery.title} 中獎名單` })
            .setDescription(`恭喜幸運兒 ${user} 中獎！`)
            .setThumbnail(avatarUrl)
          ;(message.channel as any).send({ embeds: [embed] })
        })
      }
    } else {
      message.reply('目前沒有進行中的抽獎')
    }
  }

  private handleCloseLottery(message: Message, forceClose?: boolean): void {
    if (!message.guild) return
    const server = message.guild.id
    const channel = message.channel.id
    const user = message.author
    const config = { server, channel }
    const lottery = this.getChannelLottery(config)

    if (this.isLotteryExist(config)) {
      this.updateChannelLotteryStatus(config)

      if (lottery && lottery.holder !== user.id) {
        message.reply(`您並非此活動舉辦人，無權限結束此活動：${lottery.title}`)
        return
      }

      const title = lotteryDict[server][channel].title
      delete lotteryDict[server][channel]
      if (!Object.keys(lotteryDict[server]).length) {
        delete lotteryDict[server]
      }
      message.reply(`已結束 ${title} 抽獎活動`)
    } else {
      if (forceClose) {
        if (lotteryDict[server]) {
          delete lotteryDict[server][channel]
        }
        message.reply('已強制結束此頻道的抽獎活動')
        return
      }
      message.reply('目前沒有進行中的抽獎')
    }
  }

  private handleDisplayLotteryList(message: Message): void {
    if (!message.guild) return
    const server = message.guild.id
    const channel = message.channel.id
    const config = { server, channel }
    const lottery = this.getChannelLottery(config)
    if (lottery) {
      this.updateChannelLotteryStatus(config)

      const setCount = lottery.list.length / 10
      if (lottery.list.length === 0) {
        const embed = new EmbedBuilder()
          .setTitle(`${lottery.title} 抽獎清單以及說明`)
          .setDescription(
            `抽獎於 ${lottery.time.format(
              'HH:mm:ss'
            )} 截止，截止後若要開獎，請使用「!開獎 {抽出的人數(不填寫預設為1)}」，最後舉辦人需要執行「!結束抽獎」刪除此抽獎活動`
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
              value: '請使用 !抽獎 參加此抽獎'
            }
          )
        ;(message.channel as any).send({ embeds: [embed] })
      } else {
        for (let i = 0; i < setCount; i++) {
          const embed = new EmbedBuilder()
            .setTitle(`${lottery.title} 抽獎清單以及說明`)
            .setDescription(
              `抽獎於 ${lottery.time.format(
                'HH:mm:ss'
              )} 截止，截止後若要開獎，請使用「!開獎 {抽出的人數(不填寫預設為1)}」，最後舉辦人需要執行「!結束抽獎」刪除此抽獎活動`
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
          ;(message.channel as any).send({ embeds: [embed] })
        }
      }
    } else {
      message.reply('目前沒有進行中的抽獎')
    }
  }

  private handleDisplayHelp(message: Message): void {
    const embed = new EmbedBuilder()
      .setTitle('抽獎功能指令與介紹')
      .setDescription('{}括號內為可以設定的文字或數字，請直接替換成要設定的值')
      .addFields(
        {
          name: '開始抽獎',
          value:
            '!開始抽獎 {活動標題} {抽獎開放時間(選填欄位，單位為分鐘，預設為5分鐘)}，範例：!開始抽獎 贈送訂閱，同頻道只能同時存在一個抽獎，需等待前一抽獎活動結束後30分鐘才有權利刪除上一個活動，或是由上一個活動舉辦人執行 !結束抽獎'
        },
        {
          name: '抽獎',
          value: '!抽獎，使用此指令即可在時間內同頻道參加抽獎，唯獨舉辦人無法參加'
        },
        {
          name: '抽獎名單',
          value: '!抽獎名單，顯示抽獎名單'
        },
        {
          name: '開獎',
          value:
            '!開獎 {抽出的數量(選填欄位，預設為1)}，僅限舉辦人可以進行開獎，必須要在開放抽獎時間結束後才可以開獎'
        },
        {
          name: '結束抽獎',
          value: '!結束抽獎，僅限舉辦人操作，可刪除整個抽獎活動'
        },
        {
          name: '抽獎指令',
          value: '!抽獎指令，顯示所有可進行抽獎相關的指令'
        }
      )
    ;(message.channel as any).send({ embeds: [embed] })
  }
}

export const runLotteryCommand = (message: Message): void => {
  const content = message.content.substring(1)
  const commands = content.split(' ')
  const args = commands.slice(1)
  new LotteryCommand().execute(message, args)
}
