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

/**
 * 封裝執行 Mem0 操作，提供金鑰輪替與失敗重試機制
 */
export async function executeMemoryOp<T>(fn: (memory: any) => Promise<T>): Promise<T> {
  const keys = getApiKeys()
  if (keys.length === 0) {
    throw new Error('Gemini API key is not configured.')
  }

  let lastError: any = null
  const maxRetries = 3
  const baseDelayMs = process.env.NODE_ENV === 'test' ? 1 : 1000

  for (let retryAttempt = 0; retryAttempt <= maxRetries; retryAttempt++) {
    const triedKeys = new Set<string>()
    let hasTransientError = false

    for (let attempt = 0; attempt < keys.length; attempt++) {
      const now = Date.now()
      const availableKeys = keys.filter(k => !triedKeys.has(k.key))
      if (availableKeys.length === 0) {
        break
      }

      // 選擇最佳金鑰：未在冷卻期，否則選擇冷卻時間最早到期的
      let selectedKeyInfo = availableKeys.find(k => k.cooldownUntil <= now)
      if (!selectedKeyInfo) {
        selectedKeyInfo = availableKeys.reduce(
          (earliest, current) =>
            current.cooldownUntil < earliest.cooldownUntil ? current : earliest,
          availableKeys[0]
        )
      }

      const key = selectedKeyInfo.key
      triedKeys.add(key)

      try {
        const memory = getMemory(key)
        return await fn(memory)
      } catch (error: any) {
        lastError = error
        const status = error.status || error.response?.status
        const errorMessage = error.message || ''

        const isQuotaOrRateLimit =
          status === 429 ||
          errorMessage.includes('RESOURCE_EXHAUSTED') ||
          errorMessage.toLowerCase().includes('quota') ||
          errorMessage.toLowerCase().includes('limit')

        const isTransientError =
          status === 500 ||
          status === 502 ||
          status === 503 ||
          status === 504 ||
          status === 'INTERNAL' ||
          error.code === 'ECONNABORTED' ||
          errorMessage.toLowerCase().includes('timeout') ||
          errorMessage.toLowerCase().includes('connect') ||
          errorMessage.toLowerCase().includes('internal error')

        if (isQuotaOrRateLimit) {
          console.warn(
            `[Mem0 API Key Rate Limited] Key ending in ...${key.slice(-6)} failed. Switching key. Error: ${errorMessage}`
          )
          selectedKeyInfo.cooldownUntil = Date.now() + 5 * 60 * 1000 // 5 分鐘冷卻
          hasTransientError = true
        } else if (status === 403 || status === 401) {
          console.warn(
            `[Mem0 API Key Auth/Permission Error] Key ending in ...${key.slice(-6)} failed. Switching key. Error: ${errorMessage}`
          )
          selectedKeyInfo.cooldownUntil = Date.now() + 5 * 60 * 1000 // 5 分鐘冷卻
        } else if (isTransientError) {
          console.warn(
            `[Mem0 API Key Transient Error] Key ending in ...${key.slice(-6)} failed. Switching key. Error: ${errorMessage}`
          )
          selectedKeyInfo.cooldownUntil = Date.now() + 2 * 60 * 1000 // 2 分鐘冷卻
          hasTransientError = true
        } else {
          throw error
        }
      }
    }

    if (hasTransientError && retryAttempt < maxRetries) {
      const delay = baseDelayMs * Math.pow(2, retryAttempt)
      console.warn(
        `[Mem0 executeMemoryOp] All keys failed. Retrying (attempt ${retryAttempt + 1}/${maxRetries}) after ${delay}ms...`
      )
      await new Promise(resolve => setTimeout(resolve, delay))
    } else {
      break
    }
  }

  throw lastError || new Error('All API keys failed for Mem0 operation.')
}

export { Memory }
