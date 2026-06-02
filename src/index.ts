import { Client, GatewayIntentBits, Message } from 'discord.js'
import auth from '../config/auth.json'
import * as messageCtrl from './features/message'
import * as nsfwCtrl from './features/nsfw'
import * as repeatCtrl from './features/repeat'
import { clientManager } from './utils/client'
import { commandRegistry } from './utils/registry'
import { UserCommand } from './commands/user'
import { RollCallCommand } from './commands/rollcall'
import { LotteryCommand } from './commands/lottery'
import { NsfwCommand } from './commands/nsfw'
import { CustomCommand } from './commands/custom'
import { BoboCommand } from './commands/bobo'
import { roastTypo } from './utils/gemini'

let count = 0

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
})

client.on('ready', async () => {
  if (client.user) {
    console.log(`Logged in as ${client.user.tag}!`)
  }
  clientManager.setClient(client)
  await messageCtrl.readCommandDict()

  // 註冊所有指令
  commandRegistry.register(new UserCommand())
  commandRegistry.register(new RollCallCommand())
  commandRegistry.register(new LotteryCommand())
  commandRegistry.register(new NsfwCommand())
  commandRegistry.register(new CustomCommand())
  commandRegistry.register(new BoboCommand())
})

client.login(auth.token)

client.on('messageCreate', async (message: Message) => {
  if (message.author.bot || message.author.id === client.user?.id) {
    return
  }

  let result = messageCtrl.checkPrefix(message)
  if (!result) {
    result = messageCtrl.checkMentions(message) || messageCtrl.checkEmoji(message)
    repeatCtrl.sendRepeatedMessage(message)

    if (nsfwCtrl.isHashPrefix(message)) {
      nsfwCtrl.sendHentaiURL(message)
    }

    const typos = ['因該', '以經', '部會', '絕得', '在一次']
    const foundTypo = typos.find(typo => message.content.includes(typo))
    if (foundTypo) {
      const roast = await roastTypo(message.content, foundTypo, message.guild?.id || message.author.id)
      if (roast) {
        message.reply(roast)
      } else {
        if (foundTypo === '因該') {
          if (Date.now() % 2 === 0) {
            message.reply('抓到了! 是錯字! "應"該吶!')
          } else {
            message.reply(
              `你是我自上次重啟第${++count}個智障把「應」打成「因」的，打對字對您來說可能比確診還難。`
            )
          }
        }
      }
    }

    // 檢查消息是否包含以 "https://x.com/" 開頭的網址
    const regex = /https:\/\/x.com\/([^\s]+)/g
    const match = message.content.match(regex)

    if (match) {
      // 將每個匹配的網址替換為以 "https://vxtwitter.com/" 開頭的網址
      // const replacedMessage = message.content.replace(regex, 'https://vxtwitter.com/$1')
      // try {
      //   // 在同一頻道發送修改後的網址
      //   // message.channel.send(replacedMessage)
      // } catch (error) {
      //   console.error(error)
      // }
    }
    if (!result) {
      return
    }
  }

  try {
    await commandRegistry.execute(message)
  } catch (error) {
    console.error(error)
  }
})

client.on('error', console.error)
