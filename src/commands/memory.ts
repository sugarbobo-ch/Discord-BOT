import { 
  Message, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ComponentType,
  ChatInputCommandInteraction,
  MessageFlags,
  StringSelectMenuBuilder
} from 'discord.js'
import { Command } from './command.interface'
import { setUserMemorySetting } from '../utils/db'
import { executeMemoryOp } from '../utils/gemini/mem0'
import path from 'path'

let DatabaseSync: any
try {
  DatabaseSync = eval("require('node:sqlite')").DatabaseSync
} catch (err) {
  console.error('Failed to load native node:sqlite:', err)
}

/**
 * 從 SQLite 資料庫直接讀取特定使用者的所有長期記憶 (由新到舊排序)
 */
function getMemoriesFromDB(userId: string): any[] {
  try {
    const dbPath = path.join(process.cwd(), 'config', 'bobo_mem0_vectors.db')
    const db = new DatabaseSync(dbPath)
    const query = `
      SELECT id, payload FROM vectors
      WHERE json_extract(payload, '$.user_id') = ?
      ORDER BY json_extract(payload, '$.updatedAt') DESC, json_extract(payload, '$.createdAt') DESC
    `
    const rows = db.prepare(query).all(userId) as any[]
    return rows.map(r => {
      const payload = JSON.parse(r.payload)
      return {
        id: r.id,
        memory: payload.data,
        createdAt: payload.createdAt,
        updatedAt: payload.updatedAt || payload.createdAt
      }
    })
  } catch (err) {
    console.error('Failed to query SQLite in getMemoriesFromDB:', err)
    return []
  }
}

/**
 * 獲取所有記憶條目（如果是測試環境則使用 mock 的 getAll，生產環境則直接查詢 SQLite）
 */
async function getMemoriesForSubcommand(userId: string): Promise<any[]> {
  if (process.env.NODE_ENV === 'test') {
    const searchRes = await executeMemoryOp<any>(memory => memory.getAll({ filters: { user_id: userId }, topK: 1000 }))
    return searchRes?.results || []
  }
  return getMemoriesFromDB(userId)
}

/**
 * 處理長期記憶查看的共用核心邏輯（支援 Embed 與分頁按鈕以及排序，並實作動態分頁載入）
 */
async function handleViewMemory(
  target: Message | ChatInputCommandInteraction,
  userId: string,
  username: string,
  sortParam: string,
  isEphemeral: boolean
) {
  let totalCount = 0
  const results: any[] = []

  if (process.env.NODE_ENV === 'test') {
    const testResults = await getMemoriesForSubcommand(userId)
    totalCount = testResults.length
    results.push(...testResults)
  } else {
    try {
      const dbPath = path.join(process.cwd(), 'config', 'bobo_mem0_vectors.db')
      const db = new DatabaseSync(dbPath)
      const row = db.prepare(`
        SELECT COUNT(*) as count FROM vectors 
        WHERE json_extract(payload, '$.user_id') = ?
      `).get(userId) as { count: number } | undefined
      totalCount = row ? row.count : 0
    } catch (err) {
      console.error('Failed to get totalCount in handleViewMemory:', err)
    }
  }

  if (totalCount === 0) {
    const replyOptions: any = { content: `🔍 目前沒有關於你的長期記憶喔！快跟波波多聊聊天吧。` }
    if (isEphemeral) replyOptions.flags = MessageFlags.Ephemeral
    await target.reply(replyOptions)
    return
  }

  let dbOffset = 0
  const dbFetchLimit = 50

  const fetchMoreMemories = () => {
    if (results.length >= totalCount) return
    try {
      const dbPath = path.join(process.cwd(), 'config', 'bobo_mem0_vectors.db')
      const db = new DatabaseSync(dbPath)
      const query = `
        SELECT id, payload FROM vectors
        WHERE json_extract(payload, '$.user_id') = ?
        ORDER BY json_extract(payload, '$.updatedAt') DESC, json_extract(payload, '$.createdAt') DESC
        LIMIT ? OFFSET ?
      `
      const rows = db.prepare(query).all(userId, dbFetchLimit, dbOffset) as any[]
      dbOffset += rows.length
      for (const r of rows) {
        try {
          const payload = JSON.parse(r.payload)
          results.push({
            id: r.id,
            memory: payload.data,
            createdAt: payload.createdAt,
            updatedAt: payload.updatedAt || payload.createdAt
          })
        } catch {}
      }
    } catch (err) {
      console.error('Failed to fetchMoreMemories:', err)
    }
  }

  const fetchAllMemories = () => {
    if (results.length >= totalCount) return
    try {
      const dbPath = path.join(process.cwd(), 'config', 'bobo_mem0_vectors.db')
      const db = new DatabaseSync(dbPath)
      const remaining = totalCount - results.length
      const query = `
        SELECT id, payload FROM vectors
        WHERE json_extract(payload, '$.user_id') = ?
        ORDER BY json_extract(payload, '$.updatedAt') DESC, json_extract(payload, '$.createdAt') DESC
        LIMIT ? OFFSET ?
      `
      const rows = db.prepare(query).all(userId, remaining, dbOffset) as any[]
      dbOffset += rows.length
      for (const r of rows) {
        try {
          const payload = JSON.parse(r.payload)
          results.push({
            id: r.id,
            memory: payload.data,
            createdAt: payload.createdAt,
            updatedAt: payload.updatedAt || payload.createdAt
          })
        } catch {}
      }
    } catch (err) {
      console.error('Failed to fetchAllMemories:', err)
    }
  }

  const isSortingNewest = sortParam !== '舊到新' && sortParam !== '字母' && sortParam !== 'oldest' && sortParam !== 'abc'

  // 初始載入：如果是按時間從新到舊排序，則採用 lazy load（一次拉 50 筆），否則直接拉取全部進行排序
  if (process.env.NODE_ENV !== 'test') {
    if (isSortingNewest) {
      fetchMoreMemories()
    } else {
      fetchAllMemories()
    }
  }

  let sortLabel = '時間新到舊'
  const getSortedResults = () => {
    const sorted = [...results]
    if (sortParam === '舊到新' || sortParam === 'oldest') {
      sorted.sort((a: any, b: any) => new Date(a.updatedAt || a.createdAt || 0).getTime() - new Date(b.updatedAt || b.createdAt || 0).getTime())
      sortLabel = '時間舊到新'
    } else if (sortParam === '字母' || sortParam === 'abc') {
      sorted.sort((a: any, b: any) => a.memory.localeCompare(b.memory, 'zh-Hant-TW'))
      sortLabel = '字母排序'
    } else {
      sorted.sort((a: any, b: any) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime())
      sortLabel = '時間新到舊'
    }
    return sorted
  }

  const itemsPerPage = 10
  const totalPages = Math.ceil(totalCount / itemsPerPage)
  let currentPage = 1

  const generateEmbed = (page: number) => {
    const sorted = getSortedResults()
    const startIndex = (page - 1) * itemsPerPage
    const pageItems = sorted.slice(startIndex, startIndex + itemsPerPage)

    const embed = new EmbedBuilder()
      .setColor('#FF9900')
      .setTitle(`🧠 波波對「${username}」的長期記憶`)
      .setDescription(`目前總共記住了 **${totalCount}** 條記憶 (排序方式: \`${sortLabel}\`)`)
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

  let isDeleteModeActive = false

  const generateButtons = (page: number, deleteMode: boolean) => {
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
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('toggle_delete')
        .setLabel(deleteMode ? '❌ 關閉刪除' : '🗑️ 刪除模式')
        .setStyle(deleteMode ? ButtonStyle.Danger : ButtonStyle.Secondary)
    )
    return row
  }

  const generateSelectMenu = (page: number) => {
    const sorted = getSortedResults()
    const startIndex = (page - 1) * itemsPerPage
    const pageItems = sorted.slice(startIndex, startIndex + itemsPerPage)

    if (pageItems.length === 0) return null

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('delete_memory_select')
      .setPlaceholder('🗑️ 選擇要刪除的單條記憶...')
      .addOptions(
        pageItems.map((item: any, index: number) => {
          const globalIndex = startIndex + index + 1
          const label = `刪除第 #${globalIndex} 條記憶`
          let description = item.memory
          if (description.length > 95) {
            description = description.substring(0, 95) + '...'
          }
          return {
            label,
            description,
            value: `delete_${item.id}`
          }
        })
      )

    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu)
  }

  const replyOptions: any = {
    embeds: [generateEmbed(currentPage)],
    components: [generateButtons(currentPage, isDeleteModeActive)]
  }
  if (isEphemeral) {
    replyOptions.flags = MessageFlags.Ephemeral
    replyOptions.fetchReply = true
  }

  const response = (await target.reply(replyOptions)) as any

  // 建立 collector 以便處理換頁、複製全部按鈕、切換刪除模式及下拉選單刪除
  const collector = response.createMessageComponentCollector({
    time: 60000,
    filter: (i: any) => i.user.id === userId
  })

  collector.on('collect', async (i: any) => {
    if (i.customId === 'prev_page') {
      currentPage = Math.max(1, currentPage - 1)
      const newMenuRow = isDeleteModeActive ? generateSelectMenu(currentPage) : null
      await i.update({
        embeds: [generateEmbed(currentPage)],
        components: newMenuRow 
          ? [generateButtons(currentPage, isDeleteModeActive), newMenuRow] 
          : [generateButtons(currentPage, isDeleteModeActive)]
      })
    } else if (i.customId === 'next_page') {
      currentPage = Math.min(totalPages, currentPage + 1)

      // 當切換到第四頁(31-40)或更後面，且資料庫還有尚未拉取的資料時，提前異步拉取另外 50 筆
      const nextLimit = (currentPage + 1) * itemsPerPage
      if (isSortingNewest && results.length < totalCount && results.length - nextLimit <= 10) {
        fetchMoreMemories()
      }

      const newMenuRow = isDeleteModeActive ? generateSelectMenu(currentPage) : null
      await i.update({
        embeds: [generateEmbed(currentPage)],
        components: newMenuRow 
          ? [generateButtons(currentPage, isDeleteModeActive), newMenuRow] 
          : [generateButtons(currentPage, isDeleteModeActive)]
      })
    } else if (i.customId === 'copy_all') {
      const sorted = getSortedResults()
      const rawContent = sorted.map((item: any, idx: number) => {
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
    } else if (i.customId === 'toggle_delete') {
      isDeleteModeActive = !isDeleteModeActive
      const newMenuRow = isDeleteModeActive ? generateSelectMenu(currentPage) : null
      await i.update({
        embeds: [generateEmbed(currentPage)],
        components: newMenuRow 
          ? [generateButtons(currentPage, isDeleteModeActive), newMenuRow] 
          : [generateButtons(currentPage, isDeleteModeActive)]
      })
    } else if (i.customId === 'delete_memory_select') {
      const value = i.values[0]
      if (value.startsWith('delete_')) {
        const memoryId = value.substring(7)
        const sorted = getSortedResults()
        const deletedItem = sorted.find((item: any) => item.id === memoryId)
        const deletedText = deletedItem ? deletedItem.memory : '未知記憶'

        await i.deferReply({ flags: MessageFlags.Ephemeral })

        try {
          // 1. 執行刪除
          await executeMemoryOp(memory => memory.delete(memoryId))
          
          // 2. 重新拉取記憶
          const updatedResults = await getMemoriesForSubcommand(userId)
          
          // 更新 results 與 totalCount
          results.length = 0
          results.push(...updatedResults)
          totalCount = updatedResults.length
          dbOffset = updatedResults.length

          const newTotalPages = Math.ceil(totalCount / itemsPerPage)
          currentPage = Math.min(currentPage, newTotalPages) || 1

          await i.editReply({
            content: `🗑️ 已成功刪除長期記憶：「${deletedText}」`
          })

          if (totalCount === 0) {
            const emptyReplyOptions = {
              content: `🔍 目前沒有關於你的長期記憶喔！快跟波波多聊聊天吧。`,
              embeds: [],
              components: []
            }
            if ('editReply' in target && typeof target.editReply === 'function') {
              await target.editReply(emptyReplyOptions)
            } else {
              await response.edit(emptyReplyOptions)
            }
            collector.stop()
          } else {
            const newMenuRow = isDeleteModeActive ? generateSelectMenu(currentPage) : null
            const newReplyOptions = {
              embeds: [generateEmbed(currentPage)],
              components: newMenuRow 
                ? [generateButtons(currentPage, isDeleteModeActive), newMenuRow] 
                : [generateButtons(currentPage, isDeleteModeActive)]
            }

            if ('editReply' in target && typeof target.editReply === 'function') {
              await target.editReply(newReplyOptions)
            } else {
              await response.edit(newReplyOptions)
            }
          }
        } catch (err: any) {
          console.error('Failed to delete memory:', err)
          await i.followUp({
            content: `❌ 刪除記憶時發生錯誤：${err.message}`,
            flags: MessageFlags.Ephemeral
          })
        }
      }
    }
  })

  collector.on('end', async () => {
    if (totalCount === 0) return

    const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('prev').setLabel('◀️ 上一頁').setStyle(ButtonStyle.Primary).setDisabled(true),
      new ButtonBuilder().setCustomId('next').setLabel('下一頁 ▶️').setStyle(ButtonStyle.Primary).setDisabled(true),
      new ButtonBuilder().setCustomId('copy').setLabel('📋 複製全部').setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder()
        .setCustomId('toggle_delete')
        .setLabel(isDeleteModeActive ? '❌ 關閉刪除' : '🗑️ 刪除模式')
        .setStyle(isDeleteModeActive ? ButtonStyle.Danger : ButtonStyle.Secondary)
        .setDisabled(true)
    )

    const disabledSelectRow = isDeleteModeActive ? generateSelectMenu(currentPage) : null
    if (disabledSelectRow) {
      const selectMenu = disabledSelectRow.components[0]
      selectMenu.setDisabled(true)
    }

    const disabledComponents = disabledSelectRow ? [disabledRow, disabledSelectRow] : [disabledRow]

    try {
      if ('editReply' in target && typeof target.editReply === 'function') {
        await target.editReply({ components: disabledComponents as any })
      } else {
        await response.edit({ components: disabledComponents as any })
      }
    } catch {
      // 忽略編輯失敗的錯誤
    }
  })
}

export class MemoryCommand implements Command {
  public names = ['記憶', 'memory', '我的記憶']

  public slashData = [
    {
      name: '記憶',
      description: '長期記憶功能管理與查看',
      options: [
        {
          name: '查看',
          description: '查看波波對你記錄的長期記憶',
          type: 1, // SUB_COMMAND
          options: [
            {
              name: '排序',
              description: '排序方式 (新到舊、舊到新、字母)',
              type: 3, // STRING
              required: false,
              choices: [
                { name: '時間新到舊', value: '新到舊' },
                { name: '時間舊到新', value: '舊到新' },
                { name: '字母排序', value: '字母' }
              ]
            }
          ]
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
          name: '刪除',
          description: '刪除波波對你記錄的特定長期記憶',
          type: 1, // SUB_COMMAND
          options: [
            {
              name: '標記',
              description: '要刪除的記憶編號 (例如：3) 或關鍵字 (例如：蘋果)',
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
      description: '快速查看波波對你記錄的長期記憶',
      options: [
        {
          name: '排序',
          description: '排序方式 (新到舊、舊到新、字母)',
          type: 3, // STRING
          required: false,
          choices: [
            { name: '時間新到舊', value: '新到舊' },
            { name: '時間舊到新', value: '舊到新' },
            { name: '字母排序', value: '字母' }
          ]
        }
      ]
    }
  ]

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
• \`!記憶 刪除 <編號或關鍵字>\` - 刪除特定記憶條目。可以指定列表編號（如 \`3\`）或關鍵字（如 \`蘋果\`）。
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
        await executeMemoryOp(memory => memory.deleteAll({ userId }))
        await message.reply(`🧹 長期記憶已成功清除！`)
      } else if (subcommand === '設定' || subcommand === 'set') {
        const content = args.slice(1).join(' ').trim()
        if (!content) {
          await message.reply(`❌ 請提供記憶內容。格式：\`!記憶 設定 <內容>\``)
          return
        }
        const statusMessage = await message.reply(`🔍 正在處理並設定長期記憶，請稍候...`)
        try {
          await executeMemoryOp(async (memory) => {
            await memory.deleteAll({ userId })
            await memory.add(content, { userId })
          })
          await statusMessage.edit(`✍️ 長期記憶已設定為：\n${content}`)
        } catch (err: any) {
          console.error('Error setting memory:', err)
          await statusMessage.edit(`❌ 處理記憶指令時發生錯誤：${err.message}`)
        }
      } else if (subcommand === '刪除' || subcommand === 'delete' || subcommand === 'remove') {
        const targetParam = args.slice(1).join(' ').trim()
        if (!targetParam) {
          await message.reply(`❌ 請提供欲刪除的記憶編號或關鍵字。格式：\`!記憶 刪除 <編號或關鍵字>\``)
          return
        }

        const statusMessage = await message.reply(`🔍 正在處理中，請稍候...`)
        try {
          const results = await getMemoriesForSubcommand(userId)

          if (results.length === 0) {
            await statusMessage.edit(`🔍 目前沒有關於你的長期記憶喔！`)
            return
          }

          const idx = parseInt(targetParam, 10)
          if (!isNaN(idx) && idx > 0) {
            results.sort((a: any, b: any) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime())
            if (idx > results.length) {
              await statusMessage.edit(`❌ 輸入的編號超出範圍！目前共有 **${results.length}** 條記憶。`)
              return
            }
            const targetItem = results[idx - 1]
            await executeMemoryOp(memory => memory.delete(targetItem.id))
            await statusMessage.edit(`🗑️ 已成功刪除第 ${idx} 條記憶：「${targetItem.memory}」`)
          } else {
            const matchedItems = results.filter((item: any) => item.memory.toLowerCase().includes(targetParam.toLowerCase()))
            if (matchedItems.length === 0) {
              await statusMessage.edit(`🔍 找不到任何含有「${targetParam}」的記憶條目。`)
              return
            }

            for (const item of matchedItems) {
              await executeMemoryOp(memory => memory.delete(item.id))
            }
            await statusMessage.edit(`🗑️ 已成功刪除 **${matchedItems.length}** 條包含「${targetParam}」的記憶！\n${matchedItems.map((item: any, i: number) => `${i + 1}. ${item.memory}`).join('\n')}`)
          }
        } catch (err: any) {
          console.error('Error deleting memory:', err)
          await statusMessage.edit(`❌ 處理刪除指令時發生錯誤：${err.message}`)
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
        await executeMemoryOp(memory => memory.deleteAll({ userId }))
        await interaction.reply({ content: `🧹 長期記憶已成功清除！`, flags: MessageFlags.Ephemeral })
      } else if (subcommand === '設定') {
        const content = interaction.options.getString('內容')?.trim()
        if (!content) {
          await interaction.reply({ content: `❌ 請提供記憶內容。`, flags: MessageFlags.Ephemeral })
          return
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral })
        try {
          await executeMemoryOp(async (memory) => {
            await memory.deleteAll({ userId })
            await memory.add(content, { userId })
          })
          await interaction.editReply({ content: `✍️ 長期記憶已設定為：\n${content}` })
        } catch (err: any) {
          console.error('Error setting memory slash:', err)
          await interaction.editReply({ content: `❌ 處理記憶時發生錯誤：${err.message}` })
        }
      } else if (subcommand === '刪除') {
        const targetParam = interaction.options.getString('標記')?.trim()
        if (!targetParam) {
          await interaction.reply({ content: `❌ 請提供欲刪除的記憶編號或關鍵字。`, flags: MessageFlags.Ephemeral })
          return
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral })
        try {
          const results = await getMemoriesForSubcommand(userId)

          if (results.length === 0) {
            await interaction.editReply({ content: `🔍 目前沒有關於你的長期記憶喔！` })
            return
          }

          const idx = parseInt(targetParam, 10)
          if (!isNaN(idx) && idx > 0) {
            results.sort((a: any, b: any) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime())
            if (idx > results.length) {
              await interaction.editReply({ content: `❌ 輸入的編號超出範圍！目前共有 **${results.length}** 條記憶。` })
              return
            }
            const targetItem = results[idx - 1]
            await executeMemoryOp(memory => memory.delete(targetItem.id))
            await interaction.editReply({ content: `🗑️ 已成功刪除第 ${idx} 條記憶：「${targetItem.memory}」` })
          } else {
            const matchedItems = results.filter((item: any) => item.memory.toLowerCase().includes(targetParam.toLowerCase()))
            if (matchedItems.length === 0) {
              await interaction.editReply({ content: `🔍 找不到任何含有「${targetParam}」的記憶條目。` })
              return
            }

            for (const item of matchedItems) {
              await executeMemoryOp(memory => memory.delete(item.id))
            }
            await interaction.editReply({
              content: `🗑️ 已成功刪除 **${matchedItems.length}** 條包含「${targetParam}」的記憶！\n${matchedItems.map((item: any, i: number) => `${i + 1}. ${item.memory}`).join('\n')}`
            })
          }
        } catch (err: any) {
          console.error('Error deleting memory slash:', err)
          await interaction.editReply({ content: `❌ 處理刪除時發生錯誤：${err.message}` })
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

