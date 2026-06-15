import {
  Client,
  GatewayIntentBits,
  Message
} from 'discord.js'
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
import { SettingCommand } from './commands/setting'
import { FeatureCommand } from './commands/feature'
import { StockCommand } from './commands/stock'
import { MemoryCommand } from './commands/memory'
import { roastTypo, shouldSkipTypoCheck, isStrictLocalTypoCheck } from './utils/gemini'
import { checkAndFixTwitterEmbed } from './features/twitter'
import { checkAndAddNsfwEmbed } from './features/nsfwEmbed'

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

  // 註冊所有文字指令
  commandRegistry.register(new UserCommand())
  commandRegistry.register(new RollCallCommand())
  commandRegistry.register(new LotteryCommand())
  commandRegistry.register(new NsfwCommand())
  commandRegistry.register(new CustomCommand())
  commandRegistry.register(new BoboCommand())
  commandRegistry.register(new SettingCommand())
  commandRegistry.register(new FeatureCommand())
  commandRegistry.register(new StockCommand())
  commandRegistry.register(new MemoryCommand())

  // 註冊 Discord 斜線指令 (Slash Commands)
  try {
    if (client.application) {
      const commandsData = commandRegistry.getSlashCommandsData()

      // 1. 清除全域指令以避免在伺服器中重複出現 (Discord 快取更新後會完全消失)
      await client.application.commands.set([])
      console.log('Cleared global slash commands to avoid duplicates.')

      // 2. 伺服器級註冊 (即時生效，方便開發與測試)
      for (const guild of client.guilds.cache.values()) {
        await guild.commands.set(commandsData)
        console.log(
          `Successfully registered Discord Slash Commands for guild: ${guild.name} (${guild.id})`
        )
      }
    }
  } catch (error) {
    console.error('Failed to register slash commands:', error)
  }
})

client.login(auth.token)

client.on('messageCreate', async (message: Message) => {
  if (message.author.bot || message.author.id === client.user?.id) {
    return
  }

  // 封裝 message.reply 以進行全域安全性處理（避免原訊息被刪除時崩潰）
  const originalReply = message.reply.bind(message)
  message.reply = async function (options: any) {
    try {
      return await originalReply(options)
    } catch (err: any) {
      if (err.code === 50035 || err.code === 10008) {
        try {
          if (message.channel && typeof (message.channel as any).send === 'function') {
            return await (message.channel as any).send(options)
          }
        } catch (sendErr) {
          console.error('Failed to send fallback channel message:', sendErr)
        }
      }
      throw err
    }
  } as any

  // 統一在此處處理全形驚嘆號與全形空白的正規化
  message.content = messageCtrl.normalizeMessageContent(message.content)

  let result = messageCtrl.checkPrefix(message)
  if (!result) {
    // 檢查是否直接 tag / mention 機器人，或是回覆機器人的訊息 (即便回覆時關閉了 ping 依然觸發)
    const isReplyToBot = message.reference && message.mentions.repliedUser?.id === client.user?.id
    if (client.user && (message.mentions.has(client.user) || isReplyToBot)) {
      let repliedMsg: Message | null = null
      if (message.reference && message.reference.messageId) {
        try {
          repliedMsg = await message.channel.messages.fetch(message.reference.messageId)
        } catch (err: any) {
          console.warn('Failed to fetch referenced message in trigger check:', err.message)
        }
      }

      if (!messageCtrl.shouldSkipDialogueTrigger(message, repliedMsg)) {
        const boboCmd = commandRegistry.get('bobo')
        if (boboCmd) {
          const botMentionRegex = new RegExp(`<@!?${client.user.id}>`, 'g')
          const cleanContent = message.content.replace(botMentionRegex, '').trim()
          const args = cleanContent.split(/\s+/).filter(Boolean)
          try {
            await boboCmd.execute(message, args)
          } catch (error) {
            console.error('Error executing bobo command on mention/reply:', error)
          }
          return
        }
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
      // 1. 靜態預先過濾 (跳過代碼塊、引言、網址等)
      if (!shouldSkipTypoCheck(message.content, foundTypo)) {
        const result = await roastTypo(
          message.content,
          foundTypo,
          message.guild?.id || message.author.id
        )
        if (result) {
          if (result.isTypo && result.roast) {
            message.reply(result.roast)
          }
        } else {
          // AI 無法使用 (如 rate limit 或錯誤)，僅在為「因該」且符合嚴格 Heuristic 時，才使用本地預設吐槽
          if (foundTypo === '因該' && isStrictLocalTypoCheck(message.content)) {
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
    }

    // 偵測 x.com 若沒有產生 embed 則改為 fixvx.com 發送至同頻道
    checkAndFixTwitterEmbed(message)

    // 偵測 R18 網站連結並自動加入 Embed 縮圖與資訊
    checkAndAddNsfwEmbed(message)

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

client.on('interactionCreate', async interaction => {
  console.log(
    `[Interaction] Received interaction type: ${interaction.type}, isCommand: ${interaction.isChatInputCommand()}, isButton: ${interaction.isButton()}`
  )
  try {
    if (interaction.isChatInputCommand()) {
      await commandRegistry.executeSlash(interaction)
    } else if (interaction.isButton()) {
      await commandRegistry.executeButton(interaction)
    }
  } catch (error) {
    console.error('Error handling interaction:', error)
    try {
      if (interaction.isRepliable()) {
        await interaction.reply({
          content: '❌ 執行指令時發生內部錯誤，請聯絡開發者。',
          ephemeral: true
        })
      }
    } catch (replyError) {
      console.error('Failed to send error reply:', replyError)
    }
  }
})

client.on('error', console.error)
