import { Message } from 'discord.js'
import { getUserMemorySetting } from '../db'
import { executeMemoryOp } from './mem0'


/**
 * 獲取混合式對話上下文（最近訊息 + 顯式回覆鏈）
 * @param message 當前發送的訊息
 * @param recentLimit 最近要抓取的頻道訊息數量限制 (預設為 50 筆)
 * @param maxReplyDepth 追溯顯式回覆鏈的最大深度 (預設為 5 筆)
 */
export async function getHybridContext(
  message: Message,
  recentLimit = 50,
  maxReplyDepth = 5
): Promise<Message[]> {
  const messageMap = new Map<string, Message>()

  // 1. 抓取最近的頻道訊息 (捕捉平鋪討論)
  try {
    const fetched = await message.channel.messages.fetch({
      limit: recentLimit,
      before: message.id
    })
    if (fetched && typeof fetched.forEach === 'function') {
      fetched.forEach((msg: Message) => messageMap.set(msg.id, msg))
    }
  } catch (err: any) {
    console.warn('Failed to fetch recent messages in getHybridContext:', err.message)
  }

  // 2. 追溯顯式回覆鏈 (確保跨度較長的回覆脈絡不中斷)
  let currentMsg = message
  let depth = 0
  while (currentMsg && depth < maxReplyDepth) {
    if (currentMsg.reference && currentMsg.reference.messageId) {
      try {
        const parentId = currentMsg.reference.messageId
        let parentMsg = messageMap.get(parentId)
        if (!parentMsg) {
          parentMsg = await message.channel.messages.fetch(parentId)
          messageMap.set(parentMsg.id, parentMsg)
        }
        currentMsg = parentMsg
        depth++
      } catch {
        break // 找不到或權限不足時停止
      }
    } else {
      break
    }
  }

  // 3. 將 Map 轉為陣列，並依「時間戳記」由舊到新排序 (符合時間線)
  const sortedMessages = Array.from(messageMap.values()).sort(
    (a, b) => a.createdTimestamp - b.createdTimestamp
  )

  return sortedMessages
}

/**
 * 在背景分析對話並更新使用者的長期記憶 Profile
 */
export async function updateMemoryInBackground(
  targetUserId: string,
  targetUserName: string,
  userMessage: string,
  aiResponse: string
): Promise<void> {
  // 檢查使用者是否開啟記憶功能，若關閉則不進行長期記憶更新
  if (!getUserMemorySetting(targetUserId)) {
    return
  }

  // 建立對話內容 (僅包含發言者與AI的回覆，確保別人的垃圾話不會污染 A 網友的專屬記憶庫)
  let dialogueContext = `[發言者 (目標對象)] ${targetUserName}: "${userMessage}"\n`
  dialogueContext += `[AI 回覆]: "${aiResponse}"`

  try {
    await executeMemoryOp(memory => memory.add(dialogueContext, { userId: targetUserId }))
    console.log(`[Memory Updated via Mem0] Target: ${targetUserName} (${targetUserId})`)
  } catch (err: any) {
    console.warn(`[Memory Reflection Failed] User: ${targetUserId} | Error:`, err.message)
  }
}

