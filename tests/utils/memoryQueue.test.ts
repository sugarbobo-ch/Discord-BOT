import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest'
import {
  MemoryWriteQueue,
  type MemoryWriteJob,
  type MemoryWriteOperation
} from '../../src/utils/gemini/memoryQueue'
import { getDb } from '../../src/utils/db'

const makeJob = (id: string): MemoryWriteJob => ({
  userId: `user-${id}`,
  targetUserName: `User ${id}`,
  userMessage: `我喜歡測試偏好 ${id}`
})

describe('MemoryWriteQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('serializes writes and enforces the minimum interval between attempts', async () => {
    const starts: string[] = []
    let resolveFirst: (() => void) | undefined
    const operation: MemoryWriteOperation = vi.fn(async (job, hooks) => {
      await hooks.beforeAttempt()
      starts.push(job.userId)
      if (job.userId === 'user-1') {
        await new Promise<void>(resolve => {
          resolveFirst = resolve
        })
      }
      return { results: [{ id: job.userId }] }
    })
    const queue = new MemoryWriteQueue({ operation, minIntervalMs: 15_000 })

    const first = queue.enqueue(makeJob('1'))
    const second = queue.enqueue(makeJob('2'))
    await vi.advanceTimersByTimeAsync(0)
    expect(starts).toEqual(['user-1'])
    expect(queue.getStatus().queueDepth).toBe(1)

    resolveFirst?.()
    await vi.advanceTimersByTimeAsync(0)
    expect(starts).toEqual(['user-1'])

    await vi.advanceTimersByTimeAsync(14_999)
    expect(starts).toEqual(['user-1'])
    await vi.advanceTimersByTimeAsync(1)
    expect(starts).toEqual(['user-1', 'user-2'])

    await expect(first).resolves.toMatchObject({ status: 'stored', addedCount: 1 })
    await expect(second).resolves.toMatchObject({ status: 'stored', addedCount: 1 })
  })

  test('classifies empty results as no_memory without retrying', async () => {
    const operation: MemoryWriteOperation = vi.fn(async (_job, hooks) => {
      await hooks.beforeAttempt()
      return { results: [] }
    })
    const queue = new MemoryWriteQueue({ operation, minIntervalMs: 0 })

    await expect(queue.enqueue(makeJob('empty'))).resolves.toMatchObject({
      status: 'no_memory',
      addedCount: 0,
      attempts: 1
    })
    expect(operation).toHaveBeenCalledTimes(1)
    expect(queue.getStatus().counters).toMatchObject({ success: 0, no_memory: 1 })
  })

  test('counts rate limits and succeeds after a retry', async () => {
    let calls = 0
    const operation: MemoryWriteOperation = vi.fn(async (_job, hooks) => {
      await hooks.beforeAttempt()
      calls++
      if (calls === 1) {
        hooks.onRateLimited(32_000)
        await hooks.onRetryWait(32_000)
        await hooks.beforeAttempt()
      }
      return { results: [{ id: 'stored' }] }
    })
    const queue = new MemoryWriteQueue({ operation, minIntervalMs: 0 })

    const resultPromise = queue.enqueue(makeJob('retry'))
    await vi.advanceTimersByTimeAsync(0)
    expect(queue.getStatus().counters.rate_limited).toBe(1)
    await vi.advanceTimersByTimeAsync(32_000)
    await expect(resultPromise).resolves.toMatchObject({ status: 'stored', attempts: 2 })
    expect(queue.getStatus().counters).toMatchObject({ success: 1, rate_limited: 1 })
  })

  test('records permanent failure when the operation rejects', async () => {
    const operation: MemoryWriteOperation = vi.fn(async (_job, hooks) => {
      await hooks.beforeAttempt()
      throw new Error('invalid memory payload')
    })
    const queue = new MemoryWriteQueue({ operation, minIntervalMs: 0 })

    await expect(queue.enqueue(makeJob('failure'))).resolves.toMatchObject({
      status: 'failed',
      failureCategory: 'permanent'
    })
    expect(queue.getStatus().counters.permanent_failure).toBe(1)
  })

  test('rejects new jobs when the queue is full', async () => {
    const operation: MemoryWriteOperation = vi.fn(
      () => new Promise(() => undefined)
    )
    const queue = new MemoryWriteQueue({ operation, maxQueueSize: 1, maxDurationMs: 1_000 })

    const first = queue.enqueue(makeJob('first'))
    await vi.advanceTimersByTimeAsync(0)
    const second = await queue.enqueue(makeJob('second'))

    expect(second).toMatchObject({ status: 'failed', failureCategory: 'queue_full' })
    expect(queue.getStatus().counters.permanent_failure).toBe(1)
    await vi.advanceTimersByTimeAsync(1_000)
    await expect(first).resolves.toMatchObject({ status: 'failed', failureCategory: 'expired' })
  })

  test('marks a job expired when its retry wait exceeds the time budget', async () => {
    const operation: MemoryWriteOperation = vi.fn(async (_job, hooks) => {
      await hooks.beforeAttempt()
      await hooks.onRetryWait(2_000)
      await hooks.beforeAttempt()
      return { results: [{ id: 'never-reached' }] }
    })
    const queue = new MemoryWriteQueue({
      operation,
      minIntervalMs: 0,
      maxDurationMs: 1_000
    })

    const resultPromise = queue.enqueue(makeJob('expired'))
    await vi.runAllTimersAsync()

    await expect(resultPromise).resolves.toMatchObject({
      status: 'failed',
      failureCategory: 'expired',
      attempts: 1
    })
  })

  test('enforces the maximum attempt count through the operation hook', async () => {
    const operation: MemoryWriteOperation = vi.fn(async (_job, hooks) => {
      for (let i = 0; i < 7; i++) await hooks.beforeAttempt()
      return { results: [] }
    })
    const queue = new MemoryWriteQueue({ operation, minIntervalMs: 0, maxAttempts: 6 })

    await expect(queue.enqueue(makeJob('attempt-limit'))).resolves.toMatchObject({
      status: 'failed',
      failureCategory: 'permanent',
      attempts: 6
    })
    expect(queue.getStatus().counters.permanent_failure).toBe(1)
  })

  test('mirrors successful queued writes into provenance metadata', async () => {
    const database = getDb()
    const operation: MemoryWriteOperation = vi.fn(async (_job, hooks) => {
      await hooks.beforeAttempt()
      return { results: [{ id: 'queue-provenance-test' }] }
    })
    const queue = new MemoryWriteQueue({ operation, minIntervalMs: 0 })

    await expect(
      queue.enqueue({
        ...makeJob('provenance'),
        metadata: {
          kind: 'profile',
          subjectUserId: 'user-provenance',
          threadId: 'thread:provenance',
          sourceMessageIds: ['message-provenance'],
          sourceAuthorIds: ['user-provenance'],
          sourceType: 'human_message',
          epistemicStatus: 'asserted',
          confidence: 0.9
        }
      })
    ).resolves.toMatchObject({ status: 'stored' })

    const row = database
      .prepare('SELECT scope_user_id, thread_id, source_message_ids FROM memory_records WHERE memory_id = ?')
      .get('queue-provenance-test') as any
    expect(row).toEqual({
      scope_user_id: 'user-provenance',
      thread_id: 'thread:provenance',
      source_message_ids: '["message-provenance"]'
    })
    database.prepare('DELETE FROM memory_records WHERE memory_id = ?').run('queue-provenance-test')
  })
})
