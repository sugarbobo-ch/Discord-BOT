import {
  Client,
  GatewayIntentBits,
  Message,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
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
import { roastTypo } from './utils/gemini'
import { checkAndFixTwitterEmbed } from './features/twitter'
import { checkAndAddNsfwEmbed } from './features/nsfwEmbed'
import { setTwitterSetting, getTwitterSetting } from './utils/db'

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

  // 註冊 Discord 斜線指令 (Slash Commands)
  try {
    if (client.application) {
      const commandsData = [
        {
          name: '設定',
          description: '設定機器人功能 (例如 x.com 自動置換)'
        },
        {
          name: '功能',
          description: '介紹這機器人如何使用與其功能列表'
        }
      ]

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
      const roast = await roastTypo(
        message.content,
        foundTypo,
        message.guild?.id || message.author.id
      )
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
    // 1. 處理斜線指令 (Slash Commands)
    if (interaction.isChatInputCommand()) {
      const { commandName, guildId } = interaction
      if (commandName === '設定') {
        if (!guildId) {
          await interaction.reply({ content: '❌ 此設定只能在伺服器中使用。', ephemeral: true })
          return
        }

        // 檢查使用者權限 (管理伺服器或管理員權限)
        const permissions = interaction.memberPermissions
        if (
          !permissions ||
          (!permissions.has(PermissionFlagsBits.ManageGuild) &&
            !permissions.has(PermissionFlagsBits.Administrator))
        ) {
          await interaction.reply({
            content: '❌ 只有管理員或擁有「管理伺服器」權限的使用者才能使用此指令。',
            ephemeral: true
          })
          return
        }

        const isTwitterEnabled = getTwitterSetting(guildId)

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('settings_twitter_enable')
            .setLabel('開啟自動置換')
            .setStyle(isTwitterEnabled ? ButtonStyle.Success : ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('settings_twitter_disable')
            .setLabel('關閉自動置換')
            .setStyle(isTwitterEnabled ? ButtonStyle.Secondary : ButtonStyle.Danger)
        )

        await interaction.reply({
          content: `🔧 **機器人伺服器設定**\n目前設定項目：**偵測 x.com 自動置換 fixvx.com**\n目前狀態：${isTwitterEnabled ? '🟢 已開啟' : '🔴 已關閉'}\n請點擊下方按鈕以切換設定：`,
          components: [row]
        })
      } else if (commandName === '功能') {
        const embed = new EmbedBuilder()
          .setTitle('🤖 波波 (Bobo) 機器人功能介紹')
          .setDescription(
            '我是波波，一個多功能又帶點幽默的 Discord 機器人助手！以下是我的主要功能介紹：'
          )
          .setColor(0x3498db) // 質感藍色
          .addFields(
            {
              name: '💬 AI 聊天助理 (Gemini 驅動)',
              value:
                '• 直接 Tag/Mention 機器人，或者使用 `!bobo [內容]` 與我聊天。\n' +
                '• 支援上傳圖片或提供圖片網址讓我解讀。\n' +
                '• 我會自動參考聊天室的最近對話，講話風格隨性自然！\n' +
                '• 在聊天中輸入股票代號（例如：`2330`、`AAPL`），我會自動抓取即時股價並為你分析！'
            },
            {
              name: '⚙️ 伺服器自訂指令',
              value:
                '• `!add [指令] [內容]`：新增自訂文字回應。\n' +
                '• `!add [指令] 隨機圖片`：再搭配 `!addimg [指令] [網址]` 新增隨機圖片池。\n' +
                '• `!edit [指令] [內容]` / `!remove [指令]`：編輯或移除指令。\n' +
                '• `!list` / `!大全 [關鍵字]`：列出可用指令或查詢關鍵字。'
            },
            {
              name: '🔧 推特/X.com 連結自動修正',
              value:
                '• 自動偵測 `x.com` 連結，若 Discord 沒產生預覽，3秒後會自動置換為 `fixvx.com`。\n' +
                '• 管理員可以使用 `/設定` 指令，點擊按鈕來開啟或關閉此功能。'
            },
            {
              name: '📋 記住功能 (Keep)',
              value:
                '• `!keep [文字]`：儲存一筆暫存訊息（每人最多 10 筆，重啟後會清除）。\n' +
                '• `!keeplist`：列出你目前暫存的所有內容。'
            },
            {
              name: '🎲 點名與抽獎',
              value:
                '• `!開始點名` / `!點名` / `!結束點名`：進行點名統計。\n' +
                '• 使用 `!抽獎指令` 可以查看完整的抽獎系統使用方法。'
            },
            {
              name: '✍️ 錯字糾正大師',
              value: '• 聊天中如果出現「因該」、「以經」、「部會」等錯字，我會毫不留情地進行嘲諷！'
            }
          )
          .setFooter({ text: '使用指令時記得在名稱與參數之間加上空白喔！' })
          .setTimestamp()

        await interaction.reply({ embeds: [embed] })
      }
      return
    }

    // 2. 處理按鈕點擊 (Buttons)
    if (interaction.isButton()) {
      const { customId, guildId } = interaction
      if (!guildId) {
        await interaction.reply({ content: '❌ 此設定只能在伺服器中使用。', ephemeral: true })
        return
      }

      // 限制只有擁有「管理伺服器」或「管理員」權限的成員可以操作設定
      const permissions = interaction.memberPermissions
      if (
        !permissions ||
        (!permissions.has(PermissionFlagsBits.ManageGuild) &&
          !permissions.has(PermissionFlagsBits.Administrator))
      ) {
        await interaction.reply({
          content: '❌ 你沒有權限更改此設定 (需要管理伺服器權限)。',
          ephemeral: true
        })
        return
      }

      if (customId === 'settings_twitter_enable' || customId === 'settings_twitter_disable') {
        const enable = customId === 'settings_twitter_enable'
        setTwitterSetting(guildId, enable)

        const newRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('settings_twitter_enable')
            .setLabel('開啟自動置換')
            .setStyle(enable ? ButtonStyle.Success : ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('settings_twitter_disable')
            .setLabel('關閉自動置換')
            .setStyle(enable ? ButtonStyle.Secondary : ButtonStyle.Danger)
        )

        await interaction.update({
          content: `🔧 **機器人伺服器設定**\n目前設定項目：**偵測 x.com 自動置換 fixvx.com**\n目前狀態：${enable ? '🟢 已開啟' : '🔴 已關閉'}\n請點擊下方按鈕以切換設定：`,
          components: [newRow]
        })
      }
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
