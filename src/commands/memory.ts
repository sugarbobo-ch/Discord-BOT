import { 
  Message, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ComponentType,
  ChatInputCommandInteraction,
  MessageFlags
} from 'discord.js'
import { Command } from './command.interface'
import { getUserMemorySetting, setUserMemorySetting } from '../utils/db'
import { getMemory } from '../utils/gemini/mem0'

/**
 * 處理長期記憶查看的共用核心邏輯（支援 Embed 與分頁按鈕以及排序）
 */
async function handleViewMemory(
  target: Message | ChatInputCommandInteraction,
  userId: string,
  username: string,
  sortParam: string,
  isEphemeral: boolean
) {
  const memory = getMemory()
  const searchRes = await memory.getAll({ filters: { user_id: userId } })
  const results = searchRes?.results || []

  if (results.length === 0) {
    const replyOptions: any = { content: `🔍 目前沒有關於你的長期記憶喔！快跟波波多聊聊天吧。` }
    if (isEphemeral) replyOptions.flags = MessageFlags.Ephemeral
    await target.reply(replyOptions)
    return
  }

  let sortLabel = '時間新到舊'
  if (sortParam === '舊到新' || sortParam === 'oldest') {
    results.sort((a: any, b: any) => new Date(a.updatedAt || a.createdAt || 0).getTime() - new Date(b.updatedAt || b.createdAt || 0).getTime())
    sortLabel = '時間舊到新'
  } else if (sortParam === '字母' || sortParam === 'abc') {
    results.sort((a: any, b: any) => a.memory.localeCompare(b.memory, 'zh-Hant-TW'))
    sortLabel = '字母排序'
  } else {
    results.sort((a: any, b: any) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime())
    sortLabel = '時間新到舊'
  }

  const itemsPerPage = 5
  const totalPages = Math.ceil(results.length / itemsPerPage)
  let currentPage = 1

  const generateEmbed = (page: number) => {
    const startIndex = (page - 1) * itemsPerPage
    const pageItems = results.slice(startIndex, startIndex + itemsPerPage)

    const embed = new EmbedBuilder()
      .setColor('#FF9900')
      .setTitle(`🧠 波波對「${username}」的長期記憶`)
      .setDescription(`目前總共記住了 **${results.length}** 條記憶 (排序方式: \`${sortLabel}\`)`)
      .setFooter({ text: `第 ${page} / ${totalPages} 頁 • 記憶資料庫` })
      .setTimestamp()

    pageItems.forEach((item: any, index: number) => {
      const globalIndex = startIndex + index + 1
      let timeStr = ''
      const rawTime = item.updatedAt || item.createdAt
      if (rawTime) {
        const d = new Date(rawTime)
        if (!isNaN(d.getTime())) {
          timeStr = ` (更新於: ${d.toLocaleDateString('zh-TW')})`
        }
      }
      embed.addFields({
        name: `#${globalIndex}${timeStr}`,
        value: `• ${item.memory}`,
        inline: false
      })
    })

    return embed
  }

  const generateButtons = (page: number) => {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('prev_page')
        .setLabel('◀️ 上一頁')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page === 1),
      new ButtonBuilder()
        .setCustomId('next_page')
        .setLabel('下一頁 ▶️')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page === totalPages),
      new ButtonBuilder()
        .setCustomId('copy_all')
        .setLabel('📋 複製全部')
        .setStyle(ButtonStyle.Secondary)
    )
    return row
  }

  const replyOptions: any = {
    embeds: [generateEmbed(currentPage)],
    components: [generateButtons(currentPage)]
  }
  if (isEphemeral) {
    replyOptions.flags = MessageFlags.Ephemeral
    replyOptions.fetchReply = true
  }

  const response = (await target.reply(replyOptions)) as any

  // 建立 collector 以便處理換頁和複製全部按鈕
  const collector = response.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 60000,
    filter: (i: any) => i.user.id === userId
  })

  collector.on('collect', async (i: any) => {
    if (i.customId === 'prev_page') {
      currentPage = Math.max(1, currentPage - 1)
      await i.update({
        embeds: [generateEmbed(currentPage)],
        components: [generateButtons(currentPage)]
      })
    } else if (i.customId === 'next_page') {
      currentPage = Math.min(totalPages, currentPage + 1)
      await i.update({
        embeds: [generateEmbed(currentPage)],
        components: [generateButtons(currentPage)]
      })
    } else if (i.customId === 'copy_all') {
      const rawContent = results.map((item: any, idx: number) => {
        let timeStr = ''
        const rawTime = item.updatedAt || item.createdAt
        if (rawTime) {
          const d = new Date(rawTime)
          if (!isNaN(d.getTime())) {
            timeStr = ` (${d.toLocaleDateString('zh-TW')})`
          }
        }
        return `${idx + 1}. [${timeStr || '無時間記錄'}] ${item.memory}`
      }).join('\n')

      const formattedMessage = `🧠 **以下是波波對「${username}」記錄的所有長期記憶，你可以點擊程式碼區塊右上角的按鈕一鍵複製：**\n\`\`\`ts\n${rawContent}\n\`\`\``
      
      await i.reply({
        content: formattedMessage,
        flags: MessageFlags.Ephemeral
      })
    }
  })

  collector.on('end', async () => {
    const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('prev').setLabel('◀️ 上一頁').setStyle(ButtonStyle.Primary).setDisabled(true),
      new ButtonBuilder().setCustomId('next').setLabel('下一頁 ▶️').setStyle(ButtonStyle.Primary).setDisabled(true),
      new ButtonBuilder().setCustomId('copy').setLabel('📋 複製全部').setStyle(ButtonStyle.Secondary).setDisabled(true)
    )
    try {
      if ('editReply' in target && typeof target.editReply === 'function') {
        await target.editReply({ components: [disabledRow] })
      } else {
        await response.edit({ components: [disabledRow] })
      }
    } catch {
      // 忽略編輯失敗的錯誤
    }
  })
}

export class MemoryCommand implements Command {
  public names = ['記憶', 'memory', '我的記憶']

  public async execute(message: Message, args: string[]): Promise<void> {
    const commandTrigger = message.content.trim().split(/\s+/)[0].substring(1).toLowerCase()
    const isAlias = commandTrigger === '我的記憶'

    const subcommand = isAlias ? '查看' : args[0]?.trim()
    const userId = message.author.id
    const username = message.member?.displayName || message.author.username

    const usageInstructions = `🧠 **長期記憶管理指令使用說明**
• \`!記憶 查看 [排序]\` - 查看波波對你記錄的長期記憶。排序可選：\`新到舊\`、\`舊到新\`、\`字母\`。
• \`!記憶 清除\` - 清除波波對你記錄的長期記憶。
• \`!記憶 設定 <內容>\` - 手動設定波波對你的長期記憶。
• \`!記憶 開啟\` - 開啟波波對你的記憶功能。
• \`!記憶 關閉\` - 關閉波波對你的記憶功能。
• \`!我的記憶 [排序]\` - 快速查看波波對你記錄的長期記憶。`

    if (!subcommand) {
      await message.reply(usageInstructions)
      return
    }

    try {
      console.log('EXECUTE SUBCOMMAND:', subcommand);
      if (subcommand === '查看' || subcommand === 'view' || subcommand === 'show') {
        const sortParam = (isAlias ? args[0]?.trim() : args[1]?.trim()) || '新到舊'
        await handleViewMemory(message, userId, username, sortParam, false)
      } else if (subcommand === '清除' || subcommand === 'clear') {
        const memory = getMemory()
        await memory.deleteAll({ userId })
        await message.reply(`🧹 長期記憶已成功清除！`)
      } else if (subcommand === '設定' || subcommand === 'set') {
        const content = args.slice(1).join(' ').trim()
        if (!content) {
          await message.reply(`❌ 請提供記憶內容。格式：\`!記憶 設定 <內容>\``)
          return
        }
        const statusMessage = await message.reply(`🔍 正在處理並設定長期記憶，請稍候...`)
        try {
          const memory = getMemory()
          await memory.deleteAll({ userId })
          await memory.add(content, { userId })
          await statusMessage.edit(`✍️ 長期記憶已設定為：\n${content}`)
        } catch (err: any) {
          console.error('Error setting memory:', err)
          await statusMessage.edit(`❌ 處理記憶指令時發生錯誤：${err.message}`)
        }
      } else if (subcommand === '開啟' || subcommand === 'enable') {
        console.log('SETTING MEMORY TO TRUE FOR:', userId);
        setUserMemorySetting(userId, true)
        await message.reply(`🟢 長期記憶功能已開啟！波波會開始記住你的個人特徵與偏好喔。`)
      } else if (subcommand === '關閉' || subcommand === 'disable') {
        setUserMemorySetting(userId, false)
        await message.reply(`🔴 長期記憶功能已關閉！波波將不會記錄你的特徵，且不會讀取你之前的記憶。`)
      } else {
        await message.reply(usageInstructions)
      }
    } catch (err: any) {
      console.error('Error handling memory command:', err)
      await message.reply(`❌ 處理記憶指令時發生錯誤：${err.message}`)
    }
  }

  public async executeSlash(interaction: ChatInputCommandInteraction): Promise<void> {
    const { commandName } = interaction
    const isAlias = commandName === '我的記憶'
    const subcommand = isAlias ? '查看' : interaction.options.getSubcommand()
    const userId = interaction.user.id
    const username = (interaction.member as any)?.displayName || interaction.user.username

    try {
      if (subcommand === '查看') {
        const sortParam = interaction.options.getString('排序') || '新到舊'
        await handleViewMemory(interaction, userId, username, sortParam, true)
      } else if (subcommand === '清除') {
        const memory = getMemory()
        await memory.deleteAll({ userId })
        await interaction.reply({ content: `🧹 長期記憶已成功清除！`, flags: MessageFlags.Ephemeral })
      } else if (subcommand === '設定') {
        const content = interaction.options.getString('內容')?.trim()
        if (!content) {
          await interaction.reply({ content: `❌ 請提供記憶內容。`, flags: MessageFlags.Ephemeral })
          return
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral })
        try {
          const memory = getMemory()
          await memory.deleteAll({ userId })
          await memory.add(content, { userId })
          await interaction.editReply({ content: `✍️ 長期記憶已設定為：\n${content}` })
        } catch (err: any) {
          console.error('Error setting memory slash:', err)
          await interaction.editReply({ content: `❌ 處理記憶時發生錯誤：${err.message}` })
        }
      } else if (subcommand === '開啟') {
        setUserMemorySetting(userId, true)
        await interaction.reply({ content: `🟢 長期記憶功能已開啟！波波會開始記住你的個人特徵與偏好喔。`, flags: MessageFlags.Ephemeral })
      } else if (subcommand === '關閉') {
        setUserMemorySetting(userId, false)
        await interaction.reply({ content: `🔴 長期記憶功能已關閉！波波將不會記錄你的特徵，且不會讀取你之前的記憶。`, flags: MessageFlags.Ephemeral })
      }
    } catch (err: any) {
      console.error('Error handling slash memory command:', err)
      await interaction.reply({ content: `❌ 處理記憶時發生錯誤：${err.message}`, flags: MessageFlags.Ephemeral })
    }
  }
}

