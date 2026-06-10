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
import { StockCommand } from './commands/stock'
import { MemoryCommand } from './commands/memory'
import { roastTypo, shouldSkipTypoCheck, isStrictLocalTypoCheck } from './utils/gemini'
import { checkAndFixTwitterEmbed } from './features/twitter'
import { checkAndAddNsfwEmbed } from './features/nsfwEmbed'
import {
  setTwitterSetting,
  getTwitterSetting,
  getUserMemory,
  setUserMemory,
  getUserMemorySetting,
  setUserMemorySetting
} from './utils/db'

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
      const commandsData = [
        {
          name: '設定',
          description: '設定機器人功能 (例如 x.com 自動置換)'
        },
        {
          name: '功能',
          description: '介紹這機器人如何使用與其功能列表'
        },
        {
          name: '記憶',
          description: '長期記憶功能管理與查看',
          options: [
            {
              name: '查看',
              description: '查看波波對你記錄的長期記憶',
              type: 1 // SUB_COMMAND
            },
            {
              name: '清除',
              description: '清除波波對你記錄的長期記憶',
              type: 1 // SUB_COMMAND
            },
            {
              name: '設定',
              description: '手動設定波波對你的長期記憶',
              type: 1, // SUB_COMMAND
              options: [
                {
                  name: '內容',
                  description: '記憶內容',
                  type: 3, // STRING
                  required: true
                }
              ]
            },
            {
              name: '開啟',
              description: '開啟波波對你的記憶功能',
              type: 1 // SUB_COMMAND
            },
            {
              name: '關閉',
              description: '關閉波波對你的記憶功能',
              type: 1 // SUB_COMMAND
            }
          ]
        },
        {
          name: '我的記憶',
          description: '快速查看波波對你記錄的長期記憶'
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

  // 統一在此處處理全形驚嘆號與全形空白的正規化
  message.content = messageCtrl.normalizeMessageContent(message.content)

  let result = messageCtrl.checkPrefix(message)
  if (!result) {
    // 檢查是否直接 tag / mention 機器人，或是回覆機器人的訊息 (即便回覆時關閉了 ping 依然觸發)
    const isReplyToBot = message.reference && message.mentions.repliedUser?.id === client.user?.id
    if (client.user && (message.mentions.has(client.user) || isReplyToBot)) {
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
            '我是波波，一個多功能又帶點幽默的 Discord 機器人助手！以下是我的主要功能介紹與可用指令列表：'
          )
          .setColor(0x3498db) // 質感藍色
          .addFields(
            {
              name: '💬 AI 聊天助理 (Gemini 驅動) 與股票功能',
              value:
                '• `!bobo [內容]` 或直接 Tag/Mention 機器人與我聊天。\n' +
                '• `!stock [代號或名稱]`：直接查詢最新股價（支援中英文及上櫃股票，如 `!stock 2313`、`!stock 美光`、`!stock 華通`）。\n' +
                '• 支援上傳圖片或提供圖片網址讓我解讀。\n' +
                '• 自動參考聊天室對話，且講話風格隨性自然！\n' +
                '• 在聊天中輸入股票代號（例如：`2330`、`AAPL`），會自動抓取即時股價並分析！'
            },
            {
              name: '🧠 AI 長期記憶系統',
              value:
                '• `!記憶 查看` / `/記憶 查看`：查看波波對你記錄的長期記憶。\n' +
                '• `!我的記憶` / `/我的記憶`：快速查看你的長期記憶。\n' +
                '• `!記憶 開啟/關閉` / `/記憶 開啟/關閉`：控制波波是否記錄你的個人特徵。\n' +
                '• `!記憶 設定 [內容]`：手動寫入/覆蓋你的長期記憶。\n' +
                '• `!記憶 清除`：清空你的長期記憶。\n' +
                '• 🔒 **隱私防護**：斜線指令的記憶查詢與設定皆為 Ephemeral（僅對自己可見）。'
            },
            {
              name: '⚙️ 伺服器自訂指令',
              value:
                '• `!add [指令] [內容]`：新增自訂文字回應。\n' +
                '• `!add [指令] 隨機圖片`：再搭配 `!addimg [指令] [網址]` 新增隨機圖片池。\n' +
                '• `!edit [指令] [內容]`：編輯自訂指令。\n' +
                '• `!remove [指令]`：移除自訂指令。\n' +
                '• `!list`：列出可用自訂指令。\n' +
                '• `!大全 [關鍵字]`：查詢關鍵字自訂指令。\n' +
                '• ⚠️ 自訂指令名稱不可為系統保留指令或關鍵字（如 `add`、`edit`、`bobo`、`stock` 等）。'
            },
            {
              name: '📋 記住功能 (Keep)',
              value:
                '• `!keep [文字]`：儲存一筆暫存訊息（每人最多 10 筆，重啟後會清除）。\n' +
                '• `!keeplist`：列出你目前暫存的所有內容。'
            },
            {
              name: '🎲 點名系統',
              value:
                '• `!開始點名 [標題]`：發起一個新點名清單。\n' +
                '• `!點名 [名字]`：完成點名（預設點名名字為自己）。\n' +
                '• `!點名清單`：顯示當前已點名名單。\n' +
                '• `!結束點名`：投票結束點名（需滿3人投票）。'
            },
            {
              name: '🎟️ 抽獎系統',
              value:
                '• `!開始抽獎 [標題] [時間(分)]`：建立抽獎活動（預設時間為 5 分鐘）。\n' +
                '• `!抽獎`：參加目前頻道的抽獎活動。\n' +
                '• `!抽獎名單`：查看目前抽獎清單與截止時間。\n' +
                '• `!開獎 [中獎人數]`：舉辦人開獎（選填中獎人數，預設為1人）。\n' +
                '• `!結束抽獎`：舉辦人結束並刪除該抽獎活動。\n' +
                '• `!強制結束抽獎`：強制刪除該頻道的抽獎活動。\n' +
                '• `!抽獎指令`：顯示抽獎功能詳細說明。'
            },
            {
              name: '🔞 紳士功能 (NSFW)',
              value:
                '• `!pixiv [Pixiv ID]`：產生該作品的 pixiv 連結。\n' +
                '• `!搜圖`：以圖片網址、上傳圖片或回覆圖片進行搜圖（使用 Saucenao）。\n' +
                '• `!nhentai [車牌]` / `!神的語言 [車牌]` / `!god [車牌]`：產生 nhentai 本本連結。\n' +
                '• `#[6位數車牌]`：例如在聊天輸入 `#123456`，會自動搜尋並產生本本連結。\n' +
                '• `!wnacg [車牌]`：在開車頻道產生 wnacg 連結。\n' +
                '• **自動生成 R18 網站預覽卡**：貼出 E-hentai、Wnacg、Happymh、禁漫天堂 (18comic) 連結時，會自動生成附帶封面、作者、標籤與分類的精美 Embed 卡片！'
            },
            {
              name: '🔧 推特/X.com 自動置換與設定',
              value:
                '• 自動偵測 `x.com` 連結，置換為 `fixvx.com` 以修復預覽。\n' +
                '• `!設定` / `!setting` 或斜線指令 `/設定`：開啟/關閉推特自動置換功能（管理員專用）。\n' +
                '• `!功能` / `!features` 或斜線指令 `/功能`：顯示本功能介紹與指令列表。'
            },
            {
              name: '✍️ 錯字糾正大師',
              value:
                '• 聊天中如果出現「因該」、「以經」、「部會」、「絕得」、「在一次」等錯字，我會毫不留情地進行嘲諷！'
            }
          )
          .setFooter({ text: '使用指令時記得在名稱與參數之間加上空白喔！' })
          .setTimestamp()

        await interaction.reply({ embeds: [embed] })
      } else if (commandName === '記憶') {
        const subcommand = interaction.options.getSubcommand()
        const userId = interaction.user.id
        const username = (interaction.member as any)?.displayName || interaction.user.username

        if (subcommand === '查看') {
          const profile = getUserMemory(userId)
          if (!profile) {
            await interaction.reply({ content: `🔍 目前沒有關於你的長期記憶喔！快跟波波多聊聊天吧。`, ephemeral: true })
          } else {
            await interaction.reply({ content: `🧠 **波波對「${username}」的長期記憶**：\n${profile}`, ephemeral: true })
          }
        } else if (subcommand === '清除') {
          setUserMemory(userId, '')
          await interaction.reply({ content: `🧹 長期記憶已成功清除！`, ephemeral: true })
        } else if (subcommand === '設定') {
          const content = interaction.options.getString('內容')?.trim()
          if (!content) {
            await interaction.reply({ content: `❌ 請提供記憶內容。`, ephemeral: true })
            return
          }
          setUserMemory(userId, content)
          await interaction.reply({ content: `✍️ 長期記憶已設定為：\n${content}`, ephemeral: true })
        } else if (subcommand === '開啟') {
          setUserMemorySetting(userId, true)
          await interaction.reply({ content: `🟢 長期記憶功能已開啟！波波會開始記住你的個人特徵與偏好喔。`, ephemeral: true })
        } else if (subcommand === '關閉') {
          setUserMemorySetting(userId, false)
          await interaction.reply({ content: `🔴 長期記憶功能已關閉！波波將不會記錄你的特徵，且不會讀取你之前的記憶。`, ephemeral: true })
        }
      } else if (commandName === '我的記憶') {
        const userId = interaction.user.id
        const username = (interaction.member as any)?.displayName || interaction.user.username
        const profile = getUserMemory(userId)
        if (!profile) {
          await interaction.reply({ content: `🔍 目前沒有關於你的長期記憶喔！快跟波波多聊聊天吧。`, ephemeral: true })
        } else {
          await interaction.reply({ content: `🧠 **波波對「${username}」的長期記憶**：\n${profile}`, ephemeral: true })
        }
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
