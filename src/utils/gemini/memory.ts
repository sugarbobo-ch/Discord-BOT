import { Message } from 'discord.js'
import { getUserMemory, setUserMemory, getUserMemorySetting } from '../db'
import { executeGenAI, MODEL_NAME, getResponseText } from './core'

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
  aiResponse: string,
  repliedMsg?: { author: string; content: string }
): Promise<void> {
  // 檢查使用者是否開啟記憶功能，若關閉則不進行長期記憶更新
  if (!getUserMemorySetting(targetUserId)) {
    return
  }

  const currentMemory = getUserMemory(targetUserId)

  // 建立對話內容
  let dialogueContext = ''
  if (repliedMsg) {
    dialogueContext += `[被回覆者] ${repliedMsg.author}: "${repliedMsg.content}"\n`
  }
  dialogueContext += `[發言者 (目標對象)] ${targetUserName}: "${userMessage}"\n`
  dialogueContext += `[AI 回覆]: "${aiResponse}"`

  const reflectionPrompt = `你是一個記憶分析助手。
我們現在「只」想提取並更新使用者「${targetUserName}」的個人特徵與長期記憶。

以下是「${targetUserName}」目前的長期記憶 Profile：
"""
${currentMemory || '目前尚無記憶。'}
"""

以下是最新的一輪對話上下文（請特別注意誰是 [發言者]）：
"""
${dialogueContext}
"""

請分析上述對話，並遵循以下「嚴格規則」：
1. 【重要】只能分析 [發言者 (目標對象)] ${targetUserName} 的偏好、個性、職業、生活狀態或態度。
2. 【禁止】絕對不能將 [被回覆者] 或 AI 說的話與特徵，誤記到 ${targetUserName} 的 Profile 中。
   - 範例：如果 [被回覆者] 說「我討厭吃番茄」，而 ${targetUserName} 回覆「我也是」，你可以記下 "${targetUserName} 討厭吃番茄"。
   - 範例：如果 [被回覆者] 說「我明天要去日本」，${targetUserName} 回覆「祝你一路順風」，你「絕對不能」記下 ${targetUserName} 要去日本。
3. 結合舊的 Profile 進行增刪修，回傳更新後的繁體中文條列清單。
4. 若無任何關於 ${targetUserName} 的長期資訊更新，請僅回覆「無變化」。`

  try {
    const response = await executeGenAI(ai =>
      ai.models.generateContent({
        model: MODEL_NAME,
        contents: [{ role: 'user', parts: [{ text: reflectionPrompt }] }]
      })
    )

    const reflectionResult = getResponseText(response)?.trim()

    if (reflectionResult && reflectionResult !== '無變化' && reflectionResult.length > 5) {
      console.log(`[Memory Updated] Target: ${targetUserName} (${targetUserId}) | Profile:\n${reflectionResult}`)
      setUserMemory(targetUserId, reflectionResult)
    }
  } catch (err: any) {
    console.warn(`[Memory Reflection Failed] User: ${targetUserId} | Error:`, err.message)
  }
}
