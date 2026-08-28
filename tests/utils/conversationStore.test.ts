import { beforeAll, describe, expect, test } from 'vitest'
import { getDb } from '../../src/utils/db'
import { getConversationEvent, recordConversationEvent } from '../../src/utils/conversationStore'

describe('conversation event store', () => {
  beforeAll(() => {
    getDb()
  })

  test('persists routing metadata without message content', () => {
    recordConversationEvent({
      messageId: 'event-message-1',
      channelId: 'channel-1',
      guildId: 'guild-1',
      callerUserId: 'caller-1',
      threadId: 'thread:parent-1',
      parentMessageId: 'parent-1',
      selectedMessageIds: ['parent-1', 'parent-2'],
      droppedMessageIds: ['other-1'],
      evidenceBlocks: [
        {
          sourceId: 'parent-1',
          speakerId: 'speaker-1',
          threadId: 'thread:parent-1',
          sourceType: 'human_message',
          status: 'asserted',
          timestamp: 120000,
          content: '不落盤的訊息內容'
        }
      ],
      observedAt: 123456,
      intent: {
        addresseeIds: ['caller-2'],
        dialogueAct: 'question',
        intent: 'ask_analysis',
        entityKeys: ['stock:6515'],
        needsExternalFact: true,
        confidence: 0.92
      }
    })

    expect(getConversationEvent('event-message-1')).toEqual({
      messageId: 'event-message-1',
      channelId: 'channel-1',
      guildId: 'guild-1',
      callerUserId: 'caller-1',
      threadId: 'thread:parent-1',
      parentMessageId: 'parent-1',
      selectedMessageIds: ['parent-1', 'parent-2'],
      droppedMessageIds: ['other-1'],
      evidenceBlocks: [
        {
          sourceId: 'parent-1',
          speakerId: 'speaker-1',
          threadId: 'thread:parent-1',
          sourceType: 'human_message',
          status: 'asserted',
          timestamp: 120000,
          entityKeys: []
        }
      ],
      intent: {
        addresseeIds: ['caller-2'],
        dialogueAct: 'question',
        intent: 'ask_analysis',
        entityKeys: ['stock:6515'],
        needsExternalFact: true,
        confidence: 0.92
      },
      analysisVersion: 'rule-v1',
      observedAt: 123456
    })

    const row = getDb()
      .prepare('SELECT * FROM conversation_events WHERE message_id = ?')
      .get('event-message-1') as any
    expect(row).not.toHaveProperty('content')

    getDb().prepare('DELETE FROM conversation_events WHERE message_id = ?').run('event-message-1')
  })

  test('updates an existing event by message ID', () => {
    const base = {
      messageId: 'event-message-2',
      channelId: 'channel-1',
      callerUserId: 'caller-1',
      threadId: 'thread:one',
      selectedMessageIds: [],
      intent: {
        addresseeIds: [],
        dialogueAct: 'statement' as const,
        intent: 'casual_chat' as const,
        entityKeys: [],
        needsExternalFact: false,
        confidence: 0.62
      }
    }
    recordConversationEvent(base)
    recordConversationEvent({
      ...base,
      threadId: 'thread:two',
      intent: { ...base.intent, intent: 'correct_bot', dialogueAct: 'correction', confidence: 0.98 }
    })

    expect(getConversationEvent('event-message-2')).toMatchObject({
      threadId: 'thread:two',
      intent: { intent: 'correct_bot', dialogueAct: 'correction', confidence: 0.98 }
    })

    getDb().prepare('DELETE FROM conversation_events WHERE message_id = ?').run('event-message-2')
  })
})
