import path from 'path'
import { getApiKey } from './core'

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

let memoryInstance: any = null

export function getMemory(): any {
  if (memoryInstance) return memoryInstance

  const apiKey = getApiKey()
  memoryInstance = new Memory({
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

  return memoryInstance
}
export { Memory }
