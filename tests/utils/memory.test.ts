import { describe, test, expect, vi, beforeEach, beforeAll } from 'vitest'
import { getDb, getUserMemory, setUserMemory, getUserMemorySetting, setUserMemorySetting } from '../../src/utils/db'
import { getHybridContext, updateMemoryInBackground } from '../../src/utils/gemini/memory'

// Mock google/genai
const { mockGenerateContent } = vi.hoisted(() => {
  return {
    mockGenerateContent: vi.fn()
  }
})

vi.mock('@google/genai', async importOriginal => {
  const actual = (await importOriginal()) as any
  return {
    ...actual,
    GoogleGenAI: class MockGoogleGenAI {
      models = {
        generateContent: mockGenerateContent
      }
    }
  }
})

// Mock mem0
const { mockAdd, mockSearch, mockGetAll, mockDeleteAll } = vi.hoisted(() => {
  return {
    mockAdd: vi.fn(),
    mockSearch: vi.fn(),
    mockGetAll: vi.fn(),
    mockDeleteAll: vi.fn()
  }
})

vi.mock('../../src/utils/gemini/mem0', () => {
  const mockMemory = {
    add: mockAdd,
    search: mockSearch,
    getAll: mockGetAll,
    deleteAll: mockDeleteAll
  }
  return {
    getMemory: () => mockMemory,
    executeMemoryOp: (fn: any) => fn(mockMemory)
  }
})

describe('Memory System Utilities', () => {
  let db: any

  beforeAll(() => {
    db = getDb()
  })

  describe('Long-term Memory Database Functions', () => {
    test('should set and get user memory profile correctly', () => {
      const testUserId = 'test_user_mem_123'
      
      // Default should be empty string
      expect(getUserMemory(testUserId)).toBe('')

      // Set memory
      setUserMemory(testUserId, '- Likes cats\n- Lives in Taipei')
      expect(getUserMemory(testUserId)).toBe('- Likes cats\n- Lives in Taipei')

      // Update memory
      setUserMemory(testUserId, '- Likes cats\n- Lives in Taipei\n- Writes TypeScript')
      expect(getUserMemory(testUserId)).toBe('- Likes cats\n- Lives in Taipei\n- Writes TypeScript')

      // Cleanup
      db.prepare('DELETE FROM user_memories WHERE user_id = ?').run(testUserId)
    })

    test('should set and get user memory setting correctly (default to true)', () => {
      const testUserId = 'test_user_setting_123'

      // Default should be true
      expect(getUserMemorySetting(testUserId)).toBe(true)

      // Set to false
      setUserMemorySetting(testUserId, false)
      expect(getUserMemorySetting(testUserId)).toBe(false)

      // Set to true
      setUserMemorySetting(testUserId, true)
      expect(getUserMemorySetting(testUserId)).toBe(true)

      // Cleanup
      db.prepare('DELETE FROM user_memories WHERE user_id = ?').run(testUserId)
    })
  })

  describe('Hybrid Short-term Context Calculation', () => {
    const mockMsg = (id: string, content: string, createdTimestamp: number, referenceId?: string) => {
      return {
        id,
        content,
        createdTimestamp,
        reference: referenceId ? { messageId: referenceId } : null,
        author: { id: 'user_1', username: 'User1' },
        member: { displayName: 'User1' },
        channel: {
          messages: {
            fetch: vi.fn()
          }
        }
      } as any
    }

    test('should fetch and combine recent messages and reply chains', async () => {
      // Setup mock messages
      // Context structure:
      // Parent 2 (id: msg_parent2, 1000) -> Parent 1 (id: msg_parent1, 2000) -> Current Msg (id: msg_curr, 3000)
      // There are also concurrent channel messages: msg_other (2500)
      const msgParent2 = mockMsg('msg_parent2', 'How are you?', 1000)
      const msgParent1 = mockMsg('msg_parent1', 'I am fine', 2000, 'msg_parent2')
      const msgCurr = mockMsg('msg_curr', 'Good to hear!', 3000, 'msg_parent1')
      const msgOther = mockMsg('msg_other', 'Hello world', 2500)

      // Mock channel fetch to return recent messages [msgOther, msgParent1] (excluding current)
      const mockChannelMessages = new Map<string, any>([
        ['msg_other', msgOther],
        ['msg_parent1', msgParent1]
      ])
      
      msgCurr.channel.messages.fetch = vi.fn().mockImplementation((options: any) => {
        if (typeof options === 'object' && options.before === 'msg_curr') {
          return Promise.resolve(mockChannelMessages)
        }
        // If tracing reply chain, fetching parent messages
        if (options === 'msg_parent1') {
          return Promise.resolve(msgParent1)
        }
        if (options === 'msg_parent2') {
          return Promise.resolve(msgParent2)
        }
        return Promise.reject(new Error('Not found'))
      })

      // We also mock message fetch on channel to support recursive lookup if it uses channel.messages.fetch(id)
      msgParent1.channel.messages.fetch = msgCurr.channel.messages.fetch

      const result = await getHybridContext(msgCurr, 5, 5)

      // Result should contain msgParent2, msgParent1, msgOther, sorted by timestamp
      expect(result.map(m => m.id)).toEqual(['msg_parent2', 'msg_parent1', 'msg_other'])
    })
  })

  describe('Long-term Memory Reflection via Mem0 in Background', () => {
    beforeEach(() => {
      vi.resetAllMocks()
      process.env.GEMINI_API_KEY = 'test_key'
    })

    test('should delegate memory addition to Mem0 with correct user scoping', async () => {
      const testUserId = 'test_user_ref_999'

      await updateMemoryInBackground(
        testUserId,
        'TestUser',
        'I love cats so much!',
        'Aww cats are great.'
      )

      expect(mockAdd).toHaveBeenCalledTimes(1)
      expect(mockAdd).toHaveBeenCalledWith(
        expect.stringContaining('[發言者 (目標對象)] TestUser: "I love cats so much!"'),
        { userId: testUserId }
      )
    })

    test('should not run reflection if user memory setting is disabled', async () => {
      const testUserId = 'test_user_ref_777'
      setUserMemorySetting(testUserId, false)

      await updateMemoryInBackground(
        testUserId,
        'TestUser',
        'I love dogs too.',
        'Dogs are cool.'
      )

      expect(mockAdd).not.toHaveBeenCalled()

      // Cleanup
      db.prepare('DELETE FROM user_memories WHERE user_id = ?').run(testUserId)
    })
  })
})

