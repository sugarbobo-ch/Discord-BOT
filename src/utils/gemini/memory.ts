import { ChatInputCommandInteraction, Message } from 'discord.js'
import { getUserMemorySetting } from '../db'
import {
  extractConversationEntityKeys,
  routeConversation,
  type ConversationRoutingResult,
  type ConversationMessage
} from '../conversation'
import {
  buildMemoryMetadata,
  memoryRepository,
  type MemoryCandidate,
  type MemoryProvenance
} from '../memoryRepository'
import { extractDeterministicStockEntities } from '../stock'
import { classifyMemoryError, executeMemoryOp, MemoryOperationError } from './mem0'
import { enqueueMemoryWrite, getMemoryWriteStatus, type MemoryWriteOutcome } from './memoryQueue'

export { getMemoryWriteStatus }
export type { MemoryWriteOutcome }

export interface HybridContextOptions {
  /** Keep the legacy broad history when false; Bobo enables routing explicitly. */
  route?: boolean
  /** Use the command's user prompt instead of the raw Discord message content. */
  currentContent?: string
  now?: number
  minThreadScore?: number
  onRoute?: (routing: ConversationRoutingResult) => void
}

export type HybridContextTarget = Message | ChatInputCommandInteraction

function isMessageTarget(target: HybridContextTarget): target is Message {
  return !('commandName' in target)
}

function toConversationMessage(
  target: HybridContextTarget,
  contentOverride?: string,
  timestampOverride?: number
): ConversationMessage {
  const rawTarget = target as any
  const content =
    contentOverride ?? (typeof rawTarget.content === 'string' ? rawTarget.content : '')
  const deterministicEntities = extractDeterministicStockEntities(content)
  const entityKeys = [
    ...extractConversationEntityKeys(content),
    ...deterministicEntities.map(entity => `stock:${entity.ticker}`)
  ]

  return {
    id: String(rawTarget.id),
    authorId: String(rawTarget.author?.id ?? rawTarget.user?.id ?? ''),
    content,
    timestamp:
      timestampOverride ??
      (typeof rawTarget.createdTimestamp === 'number' ? rawTarget.createdTimestamp : Date.now()),
    replyToId: isMessageTarget(target) ? target.reference?.messageId || null : null,
    entityKeys
  }
}

export async function setMemoryDirect(
  userId: string,
  content: string,
  maxDurationMs = 60_000,
  provenance: Partial<MemoryProvenance> = {}
): Promise<MemoryWriteOutcome> {
  const startedAt = Date.now()
  const enqueuedAt = startedAt
  let attempts = 0
  const candidate: MemoryCandidate = {
    scopeUserId: userId,
    value: content,
    kind: 'profile',
    subjectUserId: userId,
    sourceType: 'human_message',
    epistemicStatus: 'asserted',
    confidence: 1,
    observedAt: startedAt,
    extractorVersion: 'manual-profile-v1',
    ...provenance
  }
  try {
    const result = await executeMemoryOp(
      async memory => {
        const addResult = await memory.add(content, {
          userId,
          metadata: buildMemoryMetadata(candidate)
        })
        if (!addResult || !Array.isArray(addResult.results)) {
          throw new MemoryOperationError('Mem0 returned an invalid add result.', {
            category: 'permanent'
          })
        }

        // Do not remove existing memories unless the replacement produced at least
        // one identifiable memory. This keeps a no-memory result or failed extraction
        // from destroying the user's existing profile.
        if (addResult.results.length > 0) {
          const newIds = new Set(
            addResult.results
              .map((item: any) => item?.id)
              .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
          )
          if (newIds.size > 0) {
            const existing = await memory.getAll({ filters: { user_id: userId }, topK: 1000 })
            if (!existing || !Array.isArray(existing.results)) {
              throw new MemoryOperationError('Mem0 returned an invalid memory list.', {
                category: 'permanent'
              })
            }
            const deletedIds: string[] = []
            for (const item of existing.results) {
              if (item?.id && !newIds.has(item.id)) {
                await memory.delete(item.id)
                deletedIds.push(item.id)
              }
            }
            memoryRepository.deleteRecords(deletedIds)
          }
        }
        return addResult
      },
      {
        maxAttempts: 4,
        deadlineAt: startedAt + maxDurationMs,
        beforeAttempt: () => {
          attempts++
        }
      }
    )

    if (!result || !Array.isArray(result.results)) {
      throw new MemoryOperationError('Mem0 returned an invalid add result.', {
        category: 'permanent'
      })
    }

    memoryRepository.recordAddResults(candidate, result)

    const addedCount = result.results.length
    return {
      status: addedCount > 0 ? 'stored' : 'no_memory',
      addedCount,
      attempts,
      enqueuedAt,
      startedAt,
      finishedAt: Date.now()
    }
  } catch (error: unknown) {
    const classified = classifyMemoryError(error)
    return {
      status: 'failed',
      addedCount: 0,
      attempts,
      enqueuedAt,
      startedAt,
      finishedAt: Date.now(),
      failureCategory: classified.category
    }
  }
}

/**
 * 獲取混合式對話上下文（最近訊息 + 顯式回覆鏈）
 * @param message 當前發送的訊息
 * @param recentLimit 最近要抓取的頻道訊息數量限制 (預設為 50 筆)
 * @param maxReplyDepth 追溯顯式回覆鏈的最大深度 (預設為 5 筆)
 * @param options 可選擇是否只保留目前訊息所屬的 conversation thread
 */
export async function getHybridContext(
  target: HybridContextTarget,
  recentLimit = 50,
  maxReplyDepth = 5,
  options: HybridContextOptions = {}
): Promise<Message[]> {
  const messageMap = new Map<string, Message>()
  const channel = (target as any).channel
  const isMessage = isMessageTarget(target)

  // 1. 抓取最近的頻道訊息 (捕捉平鋪討論)
  try {
    const fetchOptions: { limit: number; before?: string } = { limit: recentLimit }
    // Interactions do not represent a Discord message. Never use their ID as a
    // message cursor; fetch the latest channel history instead.
    if (isMessage && target.id) fetchOptions.before = target.id
    const fetched = await channel.messages.fetch(fetchOptions)
    if (fetched && typeof fetched.forEach === 'function') {
      fetched.forEach((msg: Message) => messageMap.set(msg.id, msg))
    }
  } catch (err: any) {
    console.warn('Failed to fetch recent messages in getHybridContext:', err.message)
  }

  // 2. 追溯顯式回覆鏈 (確保跨度較長的回覆脈絡不中斷)
  let currentMsg: Message | null = isMessage ? target : null
  let depth = 0
  while (currentMsg && depth < maxReplyDepth) {
    if (currentMsg.reference && currentMsg.reference.messageId) {
      try {
        const parentId = currentMsg.reference.messageId
        let parentMsg = messageMap.get(parentId)
        if (!parentMsg) {
          parentMsg = (await channel.messages.fetch(parentId)) as Message
          if (!parentMsg) break
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

  if (options.route) {
    const currentTimestamp =
      options.now ??
      (isMessage && typeof target.createdTimestamp === 'number'
        ? target.createdTimestamp
        : Date.now())
    const routing = routeConversation(
      toConversationMessage(target, options.currentContent, currentTimestamp),
      sortedMessages.map(msg => toConversationMessage(msg)),
      {
        now: currentTimestamp,
        minScore: options.minThreadScore
      }
    )
    options.onRoute?.(routing)
    const selectedIds = new Set(routing.selectedMessages.map(msg => msg.id))
    console.log(
      `[Conversation Router] thread=${routing.threadId} parent=${routing.parentId || 'new'} selected=${selectedIds.size}/${sortedMessages.length}`
    )
    return sortedMessages.filter(msg => selectedIds.has(msg.id))
  }

  return sortedMessages
}

/**
 * 在背景分析對話並更新使用者的長期記憶 Profile
 */
export function updateMemoryInBackground(
  targetUserId: string,
  targetUserName: string,
  userMessage: string,
  _aiResponse: string,
  metadata?: MemoryProvenance
): Promise<MemoryWriteOutcome> {
  // 檢查使用者是否開啟記憶功能，若關閉則不進行長期記憶更新
  if (!getUserMemorySetting(targetUserId)) {
    return Promise.resolve({
      status: 'skipped',
      addedCount: 0,
      attempts: 0,
      enqueuedAt: Date.now(),
      finishedAt: Date.now()
    })
  }

  return enqueueMemoryWrite({
    userId: targetUserId,
    targetUserName,
    userMessage,
    metadata
  })
}
