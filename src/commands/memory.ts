import { Message } from 'discord.js'
import { Command } from './command.interface'
import { getUserMemorySetting, setUserMemorySetting } from '../utils/db'
import { getMemory } from '../utils/gemini/mem0'

export class MemoryCommand implements Command {
  public names = ['記憶', 'memory', '我的記憶']

  public async execute(message: Message, args: string[]): Promise<void> {
    const commandTrigger = message.content.trim().split(/\s+/)[0].substring(1).toLowerCase()
    const isAlias = commandTrigger === '我的記憶'

    const subcommand = isAlias ? '查看' : args[0]?.trim()
    const userId = message.author.id
    const username = message.member?.displayName || message.author.username

    const usageInstructions = `🧠 **長期記憶管理指令使用說明**
• \`!記憶 查看\` - 查看波波對你記錄的長期記憶。
• \`!記憶 清除\` - 清除波波對你記錄的長期記憶。
• \`!記憶 設定 <內容>\` - 手動設定波波對你的長期記憶。
• \`!記憶 開啟\` - 開啟波波對你的記憶功能。
• \`!記憶 關閉\` - 關閉波波對你的記憶功能。
• \`!我的記憶\` - 快速查看波波對你記錄的長期記憶。`

    if (!subcommand) {
      await message.reply(usageInstructions)
      return
    }

    try {
      if (subcommand === '查看' || subcommand === 'view' || subcommand === 'show') {
        const memory = getMemory()
        const searchRes = await memory.getAll({ filters: { user_id: userId } })
        const profile = searchRes && searchRes.results && searchRes.results.length > 0
          ? searchRes.results.map((r: any) => `• ${r.memory}`).join('\n')
          : ''

        if (!profile) {
          await message.reply(`🔍 目前沒有關於你的長期記憶喔！快跟波波多聊聊天吧。`)
        } else {
          await message.reply(`🧠 **波波對「${username}」的長期記憶**：\n${profile}`)
        }
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
        const memory = getMemory()
        await memory.deleteAll({ userId })
        await memory.add(content, { userId })
        await message.reply(`✍️ 長期記憶已設定為：\n${content}`)
      } else if (subcommand === '開啟' || subcommand === 'enable') {
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
}

