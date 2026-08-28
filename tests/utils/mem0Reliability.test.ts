import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest'
import {
  classifyMemoryError,
  executeMemoryOp,
  Memory
} from '../../src/utils/gemini/mem0'
import { getApiKeys } from '../../src/utils/gemini/core'
import auth from '../../config/auth.json'

const originalAuthApiKeys = (auth as any).geminiApiKeys
const originalAuthApiKey = (auth as any).geminiApiKey
const originalAuthApiKeyNew = (auth as any).geminiApiKeyNew

describe('Mem0 operation reliability', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    process.env.GEMINI_API_KEYS = 'mem0_reliability_key'
    process.env.GEMINI_API_KEY = ''
    ;(auth as any).geminiApiKeys = []
    ;(auth as any).geminiApiKey = undefined
    ;(auth as any).geminiApiKeyNew = undefined
  })

  afterEach(() => {
    vi.useRealTimers()
    process.env.GEMINI_API_KEYS = ''
    ;(auth as any).geminiApiKeys = originalAuthApiKeys
    ;(auth as any).geminiApiKey = originalAuthApiKey
    ;(auth as any).geminiApiKeyNew = originalAuthApiKeyNew
  })

  test('retries nested extraction 429 after the RetryInfo delay', async () => {
    let calls = 0
    const sleep = vi.fn((ms: number) => vi.advanceTimersByTimeAsync(ms))
    const operation = vi.fn(async () => {
      calls++
      if (calls === 1) {
        const cause = Object.assign(new Error('ApiError'), {
          status: 429,
          message:
            '{"error":{"status":"RESOURCE_EXHAUSTED","details":[{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"32s"}]}}'
        })
        throw Object.assign(new Error('LLM extraction failed'), { cause })
      }
      return 'ok'
    })

    const promise = executeMemoryOp(() => operation(), {
      memoryFactory: () => ({}),
      sleep,
      maxAttempts: 2
    })
    await vi.runAllTimersAsync()

    await expect(promise).resolves.toBe('ok')
    expect(operation).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledWith(32_000)
  })

  test('does not retry permanent errors', async () => {
    process.env.GEMINI_API_KEYS = 'mem0_permanent_key'
    const operation = vi.fn(async () => {
      throw new Error('invalid user scope')
    })

    await expect(
      executeMemoryOp(() => operation(), {
        memoryFactory: () => ({})
      })
    ).rejects.toMatchObject({ category: 'permanent' })
    expect(operation).toHaveBeenCalledTimes(1)
  })

  test('rotates to a ready key immediately after a rate limit', async () => {
    process.env.GEMINI_API_KEYS = 'mem0_rotate_key_1,mem0_rotate_key_2'
    const usedKeys: string[] = []
    let calls = 0
    const operation = vi.fn(async () => {
      calls++
      usedKeys.push(calls === 1 ? 'mem0_rotate_key_1' : 'mem0_rotate_key_2')
      if (calls === 1) {
        throw Object.assign(new Error('RESOURCE_EXHAUSTED'), { status: 429 })
      }
      return 'ok'
    })

    await expect(
      executeMemoryOp(
        memory => {
          usedKeys.push((memory as any).key)
          return operation()
        },
        {
          memoryFactory: key => ({ key }),
          maxAttempts: 2
        }
      )
    ).resolves.toBe('ok')
    expect(usedKeys).toContain('mem0_rotate_key_1')
    expect(usedKeys).toContain('mem0_rotate_key_2')
  })

  test('waits for the earliest RetryInfo cooldown when every key is rate limited', async () => {
    process.env.GEMINI_API_KEYS = 'mem0_cooldown_key_1,mem0_cooldown_key_2'
    let calls = 0
    const sleep = vi.fn((ms: number) => vi.advanceTimersByTimeAsync(ms))
    const operation = vi.fn(async () => {
      calls++
      if (calls <= 2) {
        throw Object.assign(new Error('{"error":{"status":"RESOURCE_EXHAUSTED","details":[{"retryDelay":"32s"}]}}'), {
          status: 429
        })
      }
      return 'ok'
    })

    const promise = executeMemoryOp(() => operation(), {
      memoryFactory: () => ({}),
      sleep,
      maxAttempts: 3
    })
    await vi.runAllTimersAsync()

    await expect(promise).resolves.toBe('ok')
    expect(operation).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledWith(32_000)
  })

  test('waits for the earliest cooldown across keys instead of the failed key delay', async () => {
    process.env.GEMINI_API_KEYS = 'mem0_earliest_key_1,mem0_earliest_key_2'
    const keys = getApiKeys()
    keys[1].cooldownUntil = Date.now() + 2_000
    const sleep = vi.fn((ms: number) => vi.advanceTimersByTimeAsync(ms))
    let calls = 0

    const promise = executeMemoryOp(
      memory => {
        calls++
        if (calls === 1) {
          expect((memory as any).key).toBe('mem0_earliest_key_1')
          throw Object.assign(new Error('RESOURCE_EXHAUSTED'), { status: 429 })
        }
        return Promise.resolve('ok')
      },
      {
        memoryFactory: key => ({ key }),
        sleep,
        maxAttempts: 2
      }
    )
    await vi.runAllTimersAsync()

    await expect(promise).resolves.toBe('ok')
    expect(sleep).toHaveBeenCalledWith(2_000)
  })

  test('parses Retry-After values without a seconds suffix', () => {
    const classified = classifyMemoryError(
      Object.assign(new Error('Retry-After: 5'), { status: 429 })
    )
    expect(classified.category).toBe('rate_limit')
    expect(classified.retryAfterMs).toBe(5_000)
  })

  test('Mem0 Memory.add propagates an extraction 429 instead of resolving empty results', async () => {
    const originalFetch = global.fetch
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as any
    try {
      const memory: any = new (Memory as any)({
        disableHistory: true,
        llm: {
          provider: 'google',
          config: { apiKey: 'test', model: 'gemma-4-31b-it' }
        },
        embedder: {
          provider: 'google',
          config: { apiKey: 'test', model: 'gemini-embedding-001', embeddingDims: 3 }
        },
        vectorStore: { provider: 'memory', config: { dimension: 3, dbPath: ':memory:' } }
      })
      memory.embedder.embed = vi.fn().mockResolvedValue([0, 0, 0])
      memory.llm.generateResponse = vi
        .fn()
        .mockRejectedValue(Object.assign(new Error('quota exceeded'), { status: 429 }))

      await expect(memory.add('我喜歡測試', { userId: 'mem0-propagation-test' })).rejects.toMatchObject({
        name: 'LLMError'
      })
    } finally {
      global.fetch = originalFetch
    }
  })
})
