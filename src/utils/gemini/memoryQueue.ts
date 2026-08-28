import {
  classifyMemoryError,
  executeMemoryOp,
  MemoryOperationError,
  type MemoryErrorCategory
} from './mem0'
import {
  buildMemoryMetadata,
  memoryRepository,
  type MemoryProvenance
} from '../memoryRepository'

export const MEMORY_WRITE_MIN_INTERVAL_MS = 15_000
export const MEMORY_WRITE_MAX_DURATION_MS = 15 * 60 * 1000
export const MEMORY_WRITE_MAX_ATTEMPTS = 6
export const MEMORY_WRITE_MAX_QUEUE_SIZE = 1_000

export interface MemoryWriteJob {
  userId: string
  targetUserName: string
  userMessage: string
  metadata?: MemoryProvenance
}

export interface MemoryWriteOperationHooks {
  beforeAttempt: () => Promise<void>
  onRateLimited: (retryAfterMs: number) => void
  onRetryWait: (waitMs: number) => Promise<void>
}

export interface MemoryWriteOperationContext {
  deadlineAt: number
  maxAttempts: number
}

export type MemoryWriteOperation = (
  job: MemoryWriteJob,
  hooks: MemoryWriteOperationHooks,
  context: MemoryWriteOperationContext
) => Promise<{ results?: unknown[] }>

export type MemoryWriteOutcome = {
  status: 'stored' | 'no_memory' | 'failed' | 'skipped'
  addedCount: number
  attempts: number
  enqueuedAt: number
  startedAt?: number
  finishedAt: number
  failureCategory?: MemoryErrorCategory | 'queue_full' | 'expired'
}

export interface MemoryWriteCounters {
  success: number
  no_memory: number
  rate_limited: number
  permanent_failure: number
}

export interface MemoryWriteStatus {
  startedAt: number
  queueDepth: number
  active: boolean
  oldestQueuedAgeMs: number
  retryWaitMs: number
  counters: MemoryWriteCounters
}

interface QueuedJob {
  job: MemoryWriteJob
  enqueuedAt: number
  resolve: (outcome: MemoryWriteOutcome) => void
}

export interface MemoryWriteQueueOptions {
  operation?: MemoryWriteOperation
  minIntervalMs?: number
  maxDurationMs?: number
  maxAttempts?: number
  maxQueueSize?: number
  now?: () => number
  sleep?: (delayMs: number) => Promise<void>
}

function createDefaultOperation(): MemoryWriteOperation {
  return async (job, hooks, context) => {
    const dialogueContext = `[發言者 (目標對象)] ${job.targetUserName}: "${job.userMessage}"`
    const addOptions: { userId: string; metadata?: Record<string, unknown> } = {
      userId: job.userId
    }
    if (job.metadata) {
      addOptions.metadata = buildMemoryMetadata({
        scopeUserId: job.userId,
        value: job.userMessage,
        ...job.metadata
      })
    }
    return executeMemoryOp(memory => memory.add(dialogueContext, addOptions), {
      maxAttempts: context.maxAttempts,
      deadlineAt: context.deadlineAt,
      beforeAttempt: hooks.beforeAttempt,
      onRateLimited: retryAfterMs => hooks.onRateLimited(retryAfterMs),
      onRetryWait: hooks.onRetryWait
    })
  }
}

/**
 * A single-worker FIFO queue for automatic memory writes. The queue intentionally
 * lives in process memory: pending jobs and counters reset when the bot restarts.
 */
export class MemoryWriteQueue {
  private readonly operation: MemoryWriteOperation
  private readonly minIntervalMs: number
  private readonly maxDurationMs: number
  private readonly maxAttempts: number
  private readonly maxQueueSize: number
  private readonly now: () => number
  private readonly sleep: (delayMs: number) => Promise<void>
  private readonly queue: QueuedJob[] = []
  private workerRunning = false
  private activeJob: QueuedJob | null = null
  private lastAttemptStartedAt = 0
  private retryWaitUntil = 0
  private activeAttempts = 0
  private readonly counters: MemoryWriteCounters = {
    success: 0,
    no_memory: 0,
    rate_limited: 0,
    permanent_failure: 0
  }
  private readonly startedAt: number

  constructor(options: MemoryWriteQueueOptions = {}) {
    this.operation = options.operation || createDefaultOperation()
    this.minIntervalMs = Math.max(0, options.minIntervalMs ?? MEMORY_WRITE_MIN_INTERVAL_MS)
    this.maxDurationMs = Math.max(1, options.maxDurationMs ?? MEMORY_WRITE_MAX_DURATION_MS)
    this.maxAttempts = Math.max(1, options.maxAttempts ?? MEMORY_WRITE_MAX_ATTEMPTS)
    this.maxQueueSize = Math.max(1, options.maxQueueSize ?? MEMORY_WRITE_MAX_QUEUE_SIZE)
    this.now = options.now || (() => Date.now())
    this.sleep = options.sleep || ((delayMs: number) => new Promise(resolve => setTimeout(resolve, delayMs)))
    this.startedAt = this.now()
  }

  public enqueue(job: MemoryWriteJob): Promise<MemoryWriteOutcome> {
    const enqueuedAt = this.now()
    if (this.queue.length + (this.activeJob ? 1 : 0) >= this.maxQueueSize) {
      const outcome = this.createFailureOutcome(job, enqueuedAt, 'queue_full')
      this.counters.permanent_failure++
      this.logOutcome(job, outcome)
      return Promise.resolve(outcome)
    }

    return new Promise(resolve => {
      this.queue.push({ job, enqueuedAt, resolve })
      void this.pump()
    })
  }

  public getStatus(): MemoryWriteStatus {
    const now = this.now()
    return {
      startedAt: this.startedAt,
      queueDepth: this.queue.length,
      active: this.activeJob !== null,
      oldestQueuedAgeMs: this.queue.length > 0 ? Math.max(0, now - this.queue[0].enqueuedAt) : 0,
      retryWaitMs: Math.max(0, this.retryWaitUntil - now),
      counters: { ...this.counters }
    }
  }

  /** Test/support hook to stop retaining queued jobs between isolated runs. */
  public reset(): void {
    const now = this.now()
    while (this.queue.length > 0) {
      const queued = this.queue.shift()!
      const outcome = this.createFailureOutcome(queued.job, queued.enqueuedAt, 'expired')
      this.counters.permanent_failure++
      queued.resolve(outcome)
    }
    this.activeJob = null
    this.activeAttempts = 0
    this.retryWaitUntil = 0
    this.lastAttemptStartedAt = now
  }

  private async pump(): Promise<void> {
    if (this.workerRunning) return
    this.workerRunning = true
    try {
      while (this.queue.length > 0) {
        const queued = this.queue.shift()!
        await this.process(queued)
      }
    } finally {
      this.workerRunning = false
    }
  }

  private async process(queued: QueuedJob): Promise<void> {
    const startedAt = this.now()
    const deadlineAt = queued.enqueuedAt + this.maxDurationMs
    this.activeJob = queued
    this.activeAttempts = 0

    try {
      if (startedAt >= deadlineAt) {
        const outcome = this.createFailureOutcome(queued.job, queued.enqueuedAt, 'expired', startedAt)
        this.counters.permanent_failure++
        queued.resolve(outcome)
        this.logOutcome(queued.job, outcome)
        return
      }

      const result = await this.withDeadline(
        this.operation(
          queued.job,
          {
            beforeAttempt: async () => this.beforeAttempt(deadlineAt),
            onRateLimited: retryAfterMs => {
              this.counters.rate_limited++
              console.log(
                `[MemoryWrite] ${JSON.stringify({
                  event: 'rate_limited',
                  userId: queued.job.userId,
                  retryAfterMs,
                  queueDepth: this.queue.length
                })}`
              )
            },
            onRetryWait: async waitMs => this.wait(waitMs, deadlineAt)
          },
          { deadlineAt, maxAttempts: this.maxAttempts }
        ),
        deadlineAt
      )

      if (!result || !Array.isArray(result.results)) {
        throw new MemoryOperationError('Mem0 returned an invalid add result.', {
          category: 'permanent'
        })
      }

      if (queued.job.metadata) {
        try {
          memoryRepository.recordAddResults(
            {
              scopeUserId: queued.job.userId,
              value: queued.job.userMessage,
              ...queued.job.metadata
            },
            result
          )
        } catch (metadataError) {
          console.error('[MemoryWrite] Failed to persist provenance metadata:', metadataError)
        }
      }

      const addedCount = result.results.length
      const status = addedCount > 0 ? 'stored' : 'no_memory'
      if (status === 'stored') this.counters.success++
      else this.counters.no_memory++

      const outcome: MemoryWriteOutcome = {
        status,
        addedCount,
        attempts: this.activeAttempts,
        enqueuedAt: queued.enqueuedAt,
        startedAt,
        finishedAt: this.now()
      }
      queued.resolve(outcome)
      this.logOutcome(queued.job, outcome)
    } catch (error: unknown) {
      const classified = classifyMemoryError(error)
      const failureCategory: MemoryWriteOutcome['failureCategory'] =
        this.now() >= deadlineAt
          ? 'expired'
          : classified.category === 'rate_limit' || classified.category === 'transient'
            ? 'permanent'
            : classified.category
      const outcome = this.createFailureOutcome(
        queued.job,
        queued.enqueuedAt,
        failureCategory,
        startedAt,
        this.activeAttempts
      )
      this.counters.permanent_failure++
      queued.resolve(outcome)
      this.logOutcome(queued.job, outcome)
    } finally {
      this.activeJob = null
      this.activeAttempts = 0
      this.retryWaitUntil = 0
    }
  }

  private async beforeAttempt(deadlineAt: number): Promise<void> {
    if (this.activeAttempts >= this.maxAttempts) {
      throw new MemoryOperationError('Mem0 operation exceeded its attempt budget.', {
        category: 'permanent'
      })
    }
    if (this.now() >= deadlineAt) {
      throw new MemoryOperationError('Mem0 operation exceeded its time budget.', {
        category: 'permanent'
      })
    }

    const earliestStart = this.lastAttemptStartedAt + this.minIntervalMs
    const waitMs = Math.max(0, earliestStart - this.now())
    if (waitMs > 0) await this.wait(waitMs, deadlineAt)
    if (this.now() >= deadlineAt) {
      throw new MemoryOperationError('Mem0 operation exceeded its time budget.', {
        category: 'permanent'
      })
    }
    this.lastAttemptStartedAt = this.now()
    this.activeAttempts++
  }

  private async withDeadline<T>(operation: Promise<T>, deadlineAt: number): Promise<T> {
    const remainingMs = Math.max(0, deadlineAt - this.now())
    if (remainingMs <= 0) {
      throw new MemoryOperationError('Mem0 operation exceeded its time budget.', {
        category: 'permanent'
      })
    }

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<T>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(
          new MemoryOperationError('Mem0 operation exceeded its time budget.', {
            category: 'permanent'
          })
        )
      }, remainingMs)
    })

    try {
      return await Promise.race([operation, timeout])
    } finally {
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle)
    }
  }

  private async wait(waitMs: number, deadlineAt: number): Promise<void> {
    const boundedWait = Math.max(0, Math.min(waitMs, Math.max(0, deadlineAt - this.now())))
    if (boundedWait <= 0) return
    this.retryWaitUntil = this.now() + boundedWait
    try {
      await this.sleep(boundedWait)
    } finally {
      this.retryWaitUntil = 0
    }
    if (this.now() >= deadlineAt && waitMs > boundedWait) {
      throw new MemoryOperationError('Mem0 operation exceeded its time budget.', {
        category: 'permanent'
      })
    }
  }

  private createFailureOutcome(
    job: MemoryWriteJob,
    enqueuedAt: number,
    failureCategory: MemoryWriteOutcome['failureCategory'],
    startedAt?: number,
    attempts = this.activeAttempts
  ): MemoryWriteOutcome {
    return {
      status: 'failed',
      addedCount: 0,
      attempts,
      enqueuedAt,
      ...(startedAt === undefined ? {} : { startedAt }),
      finishedAt: this.now(),
      failureCategory
    }
  }

  private logOutcome(job: MemoryWriteJob, outcome: MemoryWriteOutcome): void {
    console.log(
      `[MemoryWrite] ${JSON.stringify({
        event: 'completed',
        userId: job.userId,
        status: outcome.status,
        addedCount: outcome.addedCount,
        attempts: outcome.attempts,
        failureCategory: outcome.failureCategory,
        queueDepth: this.queue.length,
        waitMs: outcome.finishedAt - outcome.enqueuedAt
      })}`
    )
  }
}

export const memoryWriteQueue = new MemoryWriteQueue()

export const enqueueMemoryWrite = (job: MemoryWriteJob): Promise<MemoryWriteOutcome> =>
  memoryWriteQueue.enqueue(job)

export const getMemoryWriteStatus = (): MemoryWriteStatus => memoryWriteQueue.getStatus()
