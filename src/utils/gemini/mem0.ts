import path from 'path'
import { getApiKey, getApiKeys } from './core'

// Mock optional modules to prevent require errors during top-level imports in mem0ai
const mockModule = () => {
  // @ts-ignore
  const Module = require('module')
  const originalRequire = Module.prototype.require
  const ignoredPrefixes = [
    'ollama',
    '@supabase',
    'redis',
    'pg',
    '@qdrant',
    '@azure',
    '@cloudflare',
    'cloudflare',
    'groq-sdk',
    '@mistralai',
    '@anthropic-ai',
    '@langchain'
  ]
  Module.prototype.require = function (this: any, requestPath: string) {
    if (ignoredPrefixes.some(prefix => requestPath === prefix || requestPath.startsWith(prefix + '/'))) {
      return {}
    }
    return originalRequire.apply(this, arguments)
  }
}

mockModule()

// Dynamically resolve the absolute path to node_modules/mem0ai/dist/oss/index.js
// using require.resolve to prevent CommonJS package exports check failure.
// @ts-ignore
const mem0MainPath = require.resolve('mem0ai')
const mem0Dir = path.dirname(path.dirname(mem0MainPath))
const mem0OssPath = path.join(mem0Dir, 'dist', 'oss', 'index.js')
// @ts-ignore
const { Memory } = require(mem0OssPath)

export function getMemory(apiKeyOverride?: string): any {
  const apiKey = apiKeyOverride || getApiKey()
  return new Memory({
    customInstructions: 'Please write all extracted memories in Traditional Chinese (繁體中文). 所有提取的記憶都必須使用繁體中文（台灣語境，例如「大冰奶」、「三色豆」、「股票大賠」等）記錄，不要使用英文或簡體中文。',
    embedder: {
      provider: 'google',
      config: {
        apiKey: apiKey,
        model: 'gemini-embedding-001',
        embeddingDims: 768
      }
    },
    llm: {
      provider: 'google',
      config: {
        apiKey: apiKey,
        model: 'gemma-4-31b-it'
      }
    },
    vectorStore: {
      provider: 'memory',
      config: {
        dimension: 768,
        dbPath: path.join(process.cwd(), 'config', 'bobo_mem0_vectors.db')
      }
    },
    historyDbPath: path.join(process.cwd(), 'config', 'bobo_mem0_history.db')
  })
}

export type MemoryErrorCategory = 'rate_limit' | 'transient' | 'auth' | 'permanent'

export class MemoryOperationError extends Error {
  public readonly category: MemoryErrorCategory
  public readonly status?: number | string
  public readonly retryAfterMs?: number

  constructor(
    message: string,
    options: {
      category: MemoryErrorCategory
      status?: number | string
      retryAfterMs?: number
      cause?: unknown
    }
  ) {
    super(message)
    this.name = 'MemoryOperationError'
    this.category = options.category
    this.status = options.status
    this.retryAfterMs = options.retryAfterMs
    if (options.cause !== undefined) {
      this.cause = options.cause
    }
  }
}

export interface ExecuteMemoryOpOptions {
  /** Dependency injection seam for deterministic tests; production defaults to getMemory. */
  memoryFactory?: (apiKey: string) => any
  sleep?: (delayMs: number) => Promise<void>
  now?: () => number
  maxAttempts?: number
  deadlineAt?: number
  onRateLimited?: (retryAfterMs: number, error: MemoryOperationError) => void | Promise<void>
  onRetryWait?: (waitMs: number) => void | Promise<void>
  beforeAttempt?: () => void | Promise<void>
}

const DEFAULT_RATE_LIMIT_RETRY_MS = 60_000
const DEFAULT_TRANSIENT_RETRY_MS = 120_000

function collectErrorSignals(error: unknown): unknown[] {
  const signals: unknown[] = []
  const pending: unknown[] = [error]
  const visited = new Set<unknown>()

  while (pending.length > 0) {
    const current = pending.shift()
    if (current === null || current === undefined || visited.has(current)) continue
    if (typeof current === 'object' || typeof current === 'function') visited.add(current)
    signals.push(current)

    if (typeof current === 'object' || typeof current === 'function') {
      const value = current as any
      pending.push(value.cause, value.error, value.response, value.response?.data, value.details)
    }
  }

  return signals
}

function signalText(signal: unknown): string {
  if (typeof signal === 'string') return signal
  if (signal instanceof Error) return `${signal.name}: ${signal.message}`
  try {
    return JSON.stringify(signal) || String(signal)
  } catch {
    return String(signal)
  }
}

function parseRetryAfterMs(text: string): number | undefined {
  const retryDelayMatch = text.match(/retryDelay\s*["']?\s*:\s*["']?(\d+(?:\.\d+)?)s/i)
  if (retryDelayMatch) return Math.ceil(Number(retryDelayMatch[1]) * 1000)

  const retryInMatch = text.match(
    /retry(?:-|\s+)?(?:after|in)?\s*[:=]?\s*["']?(\d+(?:\.\d+)?)\s*(ms|s)?/i
  )
  if (retryInMatch) {
    const unit = retryInMatch[2]?.toLowerCase()
    return Math.ceil(Number(retryInMatch[1]) * (unit === 'ms' ? 1 : 1000))
  }
  return undefined
}

export function classifyMemoryError(error: unknown): MemoryOperationError {
  if (error instanceof MemoryOperationError) return error

  const signals = collectErrorSignals(error)
  const texts = signals.map(signalText)
  const combinedText = texts.join(' ')
  const statusSignal = signals.find(signal => {
    const status = (signal as any)?.status ?? (signal as any)?.statusCode
    return status !== undefined && status !== null
  }) as any
  const rawStatus = statusSignal?.status ?? statusSignal?.statusCode
  const numericStatus = Number(rawStatus)
  const status = Number.isFinite(numericStatus) ? numericStatus : rawStatus

  const isRateLimited =
    status === 429 ||
    /RESOURCE_EXHAUSTED|quota exceeded|rate limit|too many requests/i.test(combinedText)
  const isAuth = status === 401 || status === 403
  const isTransient =
    [500, 502, 503, 504].includes(Number(status)) ||
    /ECONNABORTED|timeout|connect(?:ion)? failed|internal error|temporarily unavailable/i.test(
      combinedText
    )

  if (isRateLimited) {
    return new MemoryOperationError('Mem0 operation was rate limited.', {
      category: 'rate_limit',
      status,
      retryAfterMs: parseRetryAfterMs(combinedText) || DEFAULT_RATE_LIMIT_RETRY_MS,
      cause: error
    })
  }
  if (isAuth) {
    return new MemoryOperationError('Mem0 operation was rejected by authentication or permissions.', {
      category: 'auth',
      status,
      cause: error
    })
  }
  if (isTransient) {
    return new MemoryOperationError('Mem0 operation failed temporarily.', {
      category: 'transient',
      status,
      retryAfterMs: DEFAULT_TRANSIENT_RETRY_MS,
      cause: error
    })
  }
  return new MemoryOperationError(
    error instanceof Error ? error.message : String(error || 'Mem0 operation failed.'),
    { category: 'permanent', status, cause: error }
  )
}

/**
 * Encapsulates Mem0 operations with key rotation and RetryInfo-aware backoff.
 * The callback is retried only for rate-limit/transient failures; permanent errors
 * are surfaced immediately to the caller.
 */
export async function executeMemoryOp<T>(
  fn: (memory: any) => Promise<T>,
  options: ExecuteMemoryOpOptions = {}
): Promise<T> {
  const keys = getApiKeys()
  if (keys.length === 0) {
    throw new MemoryOperationError('Gemini API key is not configured.', {
      category: 'permanent'
    })
  }

  const now = options.now || (() => Date.now())
  const sleep = options.sleep || ((delayMs: number) => new Promise<void>(resolve => setTimeout(resolve, delayMs)))
  const maxAttempts = Math.max(1, options.maxAttempts ?? 4)
  const memoryFactory = options.memoryFactory || getMemory
  const triedKeys = new Set<string>()
  let attempts = 0
  let lastError: MemoryOperationError | null = null

  while (attempts < maxAttempts) {
    const currentTime = now()
    if (options.deadlineAt !== undefined && currentTime >= options.deadlineAt) break

    const availableKeys = keys.filter(k => k.cooldownUntil <= currentTime && !triedKeys.has(k.key))
    if (availableKeys.length === 0) {
      const readyKeys = keys.filter(k => k.cooldownUntil <= currentTime)
      if (readyKeys.length > 0) {
        triedKeys.clear()
        continue
      }

      const earliestCooldown = Math.min(...keys.map(k => k.cooldownUntil))
      const waitMs = Math.max(0, earliestCooldown - currentTime)
      if (waitMs <= 0) {
        triedKeys.clear()
        continue
      }
      const boundedWait =
        options.deadlineAt === undefined
          ? waitMs
          : Math.min(waitMs, Math.max(0, options.deadlineAt - currentTime))
      if (boundedWait <= 0) break
      if (options.onRetryWait) await options.onRetryWait(boundedWait)
      else await sleep(boundedWait)
      continue
    }

    const selectedKeyInfo = availableKeys[0]
    const key = selectedKeyInfo.key
    triedKeys.add(key)
    attempts++

    try {
      await options.beforeAttempt?.()
      return await fn(memoryFactory(key))
    } catch (error: unknown) {
      const classified = classifyMemoryError(error)
      lastError = classified
      if (classified.category === 'permanent' || classified.category === 'auth') {
        throw classified
      }

      const retryAfterMs =
        classified.retryAfterMs ||
        (classified.category === 'rate_limit'
          ? DEFAULT_RATE_LIMIT_RETRY_MS
          : DEFAULT_TRANSIENT_RETRY_MS)
      selectedKeyInfo.cooldownUntil = now() + retryAfterMs

      if (classified.category === 'rate_limit') {
        await options.onRateLimited?.(retryAfterMs, classified)
      }

      if (attempts >= maxAttempts) break
      if (options.deadlineAt !== undefined && now() >= options.deadlineAt) break

      // If another key is ready, the next loop rotates immediately. Otherwise it
      // waits until the selected key's server-provided cooldown expires.
      const anotherReadyKey = keys.some(k => k.cooldownUntil <= now() && !triedKeys.has(k.key))
      if (!anotherReadyKey) {
        const currentRetryTime = now()
        const earliestCooldown = Math.min(...keys.map(k => k.cooldownUntil))
        const waitMs = Math.min(
          Math.max(0, earliestCooldown - currentRetryTime),
          options.deadlineAt === undefined
            ? Number.POSITIVE_INFINITY
            : Math.max(0, options.deadlineAt - currentRetryTime)
        )
        if (waitMs > 0) {
          if (options.onRetryWait) await options.onRetryWait(waitMs)
          else await sleep(waitMs)
        }
      }
    }
  }

  throw (
    lastError ||
    new MemoryOperationError('Mem0 operation exceeded its retry budget.', {
      category: 'permanent'
    })
  )
}

export { Memory }
