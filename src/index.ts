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
import { checkAndFixTwitterEmbed } from './features/twitter'

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
    // 檢查是否直接 tag / mention 機器人
    if (client.user && message.mentions.has(client.user)) {
      const boboCmd = commandRegistry.get('bobo')
      if (boboCmd) {
        const botMentionRegex = new RegExp(`<@!?${client.user.id}>`, 'g')
        const cleanContent = message.content.replace(botMentionRegex, '').trim()
        const args = cleanContent.split(/\s+/).filter(Boolean)
        try {
          await boboCmd.execute(message, args)
        } catch (error) {
          console.error('Error executing bobo command on mention:', error)
        }
        return
      }
    }

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

    // 偵測 x.com 若沒有產生 embed 則改為 fixvx.com 發送至同頻道
    checkAndFixTwitterEmbed(message)

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
