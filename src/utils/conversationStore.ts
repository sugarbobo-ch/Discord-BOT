import { getDb } from './db'
import type { CallerIntentAnalysis } from './conversation'
import type { EvidenceBlock } from './evidence'

export type ConversationEventEvidence = Omit<EvidenceBlock, 'content'>

export interface ConversationEventInput {
  messageId: string
  channelId: string
  guildId?: string | null
  callerUserId: string
  threadId: string
  parentMessageId?: string | null
  selectedMessageIds: readonly string[]
  droppedMessageIds?: readonly string[]
  evidenceBlocks?: readonly EvidenceBlock[]
  intent: CallerIntentAnalysis
  observedAt?: number
}

export interface ConversationEvent {
  messageId: string
  channelId: string
  guildId: string | null
  callerUserId: string
  threadId: string
  parentMessageId: string | null
  selectedMessageIds: string[]
  droppedMessageIds: string[]
  evidenceBlocks: ConversationEventEvidence[]
  intent: CallerIntentAnalysis
  analysisVersion: string
  observedAt: number
}

function uniqueStrings(values: readonly string[] | undefined): string[] {
  return Array.from(new Set((values || []).filter(value => typeof value === 'string' && value)))
}

function serialize(values: readonly string[] | undefined): string {
  return JSON.stringify(uniqueStrings(values))
}

function serializeEvidence(values: readonly EvidenceBlock[] | undefined): string {
  return JSON.stringify(
    (values || []).map(({ sourceId, speakerId, threadId, sourceType, status, timestamp, entityKeys }) => ({
      sourceId,
      speakerId,
      threadId,
      sourceType,
      status,
      timestamp,
      entityKeys: uniqueStrings(entityKeys ? [...entityKeys] : [])
    }))
  )
}

function parseEvidence(value: unknown): ConversationEventEvidence[] {
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is ConversationEventEvidence =>
        item &&
        typeof item.sourceId === 'string' &&
        typeof item.speakerId === 'string' &&
        typeof item.threadId === 'string' &&
        typeof item.sourceType === 'string' &&
        typeof item.status === 'string' &&
        typeof item.timestamp === 'number'
    )
  } catch {
    return []
  }
}

function parseStringArray(value: unknown): string[] {
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : []
  } catch {
    return []
  }
}

/** Store routing/intent metadata without persisting message content. */
export function recordConversationEvent(event: ConversationEventInput): void {
  if (!event.messageId || !event.channelId || !event.callerUserId || !event.threadId) return

  try {
    const db = getDb()
    db.prepare(
      `
      INSERT INTO conversation_events (
        message_id,
        channel_id,
        guild_id,
        caller_user_id,
        thread_id,
        parent_message_id,
        selected_message_ids,
        dropped_message_ids,
        evidence_blocks,
        addressee_ids,
        entity_keys,
        dialogue_act,
        intent,
        needs_external_fact,
        confidence,
        analysis_version,
        observed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(message_id) DO UPDATE SET
        channel_id = excluded.channel_id,
        guild_id = excluded.guild_id,
        caller_user_id = excluded.caller_user_id,
        thread_id = excluded.thread_id,
        parent_message_id = excluded.parent_message_id,
        selected_message_ids = excluded.selected_message_ids,
        dropped_message_ids = excluded.dropped_message_ids,
        evidence_blocks = excluded.evidence_blocks,
        addressee_ids = excluded.addressee_ids,
        entity_keys = excluded.entity_keys,
        dialogue_act = excluded.dialogue_act,
        intent = excluded.intent,
        needs_external_fact = excluded.needs_external_fact,
        confidence = excluded.confidence,
        analysis_version = excluded.analysis_version,
        observed_at = excluded.observed_at
    `
    ).run(
      event.messageId,
      event.channelId,
      event.guildId || null,
      event.callerUserId,
      event.threadId,
      event.parentMessageId || null,
      serialize(event.selectedMessageIds),
      serialize(event.droppedMessageIds),
      serializeEvidence(event.evidenceBlocks),
      serialize(event.intent.addresseeIds),
      serialize(event.intent.entityKeys),
      event.intent.dialogueAct,
      event.intent.intent,
      event.intent.needsExternalFact ? 1 : 0,
      event.intent.confidence,
      'rule-v1',
      event.observedAt ?? Date.now()
    )
  } catch (error) {
    console.error('[Conversation Event] Failed to persist routing metadata:', error)
  }
}

export function getConversationEvent(messageId: string): ConversationEvent | null {
  try {
    const db = getDb()
    const row = db
      .prepare('SELECT * FROM conversation_events WHERE message_id = ?')
      .get(messageId) as any
    if (!row) return null

    return {
      messageId: row.message_id,
      channelId: row.channel_id,
      guildId: row.guild_id || null,
      callerUserId: row.caller_user_id,
      threadId: row.thread_id,
      parentMessageId: row.parent_message_id || null,
      selectedMessageIds: parseStringArray(row.selected_message_ids),
      droppedMessageIds: parseStringArray(row.dropped_message_ids),
      evidenceBlocks: parseEvidence(row.evidence_blocks),
      intent: {
        addresseeIds: parseStringArray(row.addressee_ids),
        dialogueAct: row.dialogue_act,
        intent: row.intent,
        entityKeys: parseStringArray(row.entity_keys),
        needsExternalFact: row.needs_external_fact === 1,
        confidence: Number(row.confidence)
      },
      analysisVersion: row.analysis_version,
      observedAt: Number(row.observed_at)
    }
  } catch (error) {
    console.error('[Conversation Event] Failed to read routing metadata:', error)
    return null
  }
}
