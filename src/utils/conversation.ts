/**
 * The conversation router deliberately knows nothing about Discord or Gemini.
 * Callers provide message metadata, and this module returns the messages that
 * belong to the current conversational thread.
 */

export interface ConversationMessage {
  id: string
  authorId: string
  content: string
  /** Unix timestamp in milliseconds. */
  timestamp: number
  replyToId?: string | null
  mentionUserIds?: readonly string[]
  /** Caller-supplied canonical entity IDs, e.g. `stock:TWSE:6515`. */
  entityKeys?: readonly string[]
}

export interface ConversationEdgeScore {
  messageId: string
  total: number
  explicitReply: number
  directMention: number
  entityOverlap: number
  semanticSimilarity: number
  sameSpeakerContinuation: number
  temporalProximity: number
  conflictingEntity: number
}

export interface ConversationRoutingOptions {
  /** Current time in milliseconds. Defaults to the current message timestamp. */
  now?: number
  /** Minimum score for an implicit link. Explicit replies always link. */
  minScore?: number
}

export interface ConversationRoutingResult {
  /** Stable for the selected root while the root remains in the candidate set. */
  threadId: string
  parentId: string | null
  selectedMessages: ConversationMessage[]
  droppedMessages: ConversationMessage[]
  scores: ConversationEdgeScore[]
}

export type DialogueAct =
  | 'question'
  | 'statement'
  | 'agreement'
  | 'disagreement'
  | 'correction'
  | 'backchannel'
  | 'request_action'

export type CallerIntent =
  | 'ask_stock_fact'
  | 'ask_analysis'
  | 'ask_memory'
  | 'correct_bot'
  | 'casual_chat'
  | 'no_ai_request'

export interface CallerIntentAnalysis {
  addresseeIds: string[]
  dialogueAct: DialogueAct
  intent: CallerIntent
  entityKeys: string[]
  needsExternalFact: boolean
  confidence: number
}

export interface CallerIntentOptions {
  addresseeIds?: readonly string[]
  entityKeys?: readonly string[]
}

const DEFAULT_MIN_SCORE = 1.5
const SEMANTIC_SIGNAL_THRESHOLD = 0.08

const WEIGHTS = {
  explicitReply: 4,
  directMention: 2.5,
  entityOverlap: 1.5,
  semanticSimilarity: 1.2,
  sameSpeakerContinuation: 0.8,
  temporalProximity: 0.6,
  conflictingEntity: -2
} as const

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'be',
  'for',
  'from',
  'how',
  'i',
  'in',
  'is',
  'it',
  'me',
  'of',
  'on',
  'or',
  'that',
  'the',
  'this',
  'to',
  'what',
  'with',
  'you',
  'your',
  '的',
  '了',
  '嗎',
  '呢',
  '啊',
  '喔',
  '我',
  '你',
  '他',
  '她',
  '它',
  '是',
  '在',
  '有',
  '和',
  '與',
  '請',
  '這',
  '那',
  '一下',
  '波波',
  'bobo'
])

const NON_ENTITY_TICKERS = new Set([
  'AI',
  'OK',
  'NO',
  'YES',
  'THE',
  'THIS',
  'THAT',
  'HTTP',
  'HTTPS',
  'URL',
  'USD',
  'TWD',
  'TW',
  'TWO'
])

const CORRECTION_PATTERN = /不是|不對|錯了|搞錯|更正|糾正|修正|應該是|記錯|講錯|弄錯|不要把|別把/i
const MEMORY_PATTERN = /記憶|記得|忘記|忘了|我的紀錄|我的記錄|之前跟你說|你還記得|回憶/i
const STOCK_FACT_PATTERN = /股價|行情|代號|代碼|收盤|開盤|現價|報價|價格|多少|最新/i
const STOCK_ANALYSIS_PATTERN =
  /分析|目標價|前景|展望|會漲|會跌|買|賣|進場|退場|停損|停利|合理價|爆發|成長|怎麼看/i
const STOCK_CONTEXT_PATTERN = /股票|股價|個股|行情|台股|美股|持股|成本|買在|漲停|跌停|法說|財報|公司|科技|ETF|ADR/i
const KNOWN_STOCK_NAME_PATTERN = /台積|聯發|欣興|美光|輝達|仁寶|蘋果|鴻海|緯穎|群創|聯電|日月光|南亞科/i
const REQUEST_PATTERN = /幫我|請問|請|查一下|找一下|算一下|告訴我|能不能|可以幫/i
const AGREEMENT_PATTERN =
  /^(?:好|對|對啊|沒錯|同意|可以|行|嗯|恩|算|了解|收到|笑死|哈哈)[！!。．.、，, ]*$/i
const BACKCHANNEL_PATTERN = /^(?:嗯嗯|喔喔|哦哦|原來如此|真的假的|蛤|欸|哈哈哈)[！!。．.、，, ]*$/i

function addUnique(values: string[], value: string): void {
  if (value && !values.includes(value)) values.push(value)
}

function normalizeEntityKey(value: string): string {
  const normalized = value.trim().toLowerCase()
  const stockValue = normalized.replace(/^stock:/, '')
  const canonicalTaiwanStockMatch = stockValue.match(/^(?:twse|tpex):(\d{4,6})$/i)
  if (canonicalTaiwanStockMatch) return `stock:${canonicalTaiwanStockMatch[1]}`
  const stockMatch = stockValue.match(/^(\d{4,6})(?:\.(?:tw|two))?$/i)
  if (stockMatch) return `stock:${stockMatch[1]}`

  const usTickerMatch = stockValue.match(/^([a-z]{2,5})(?:\.(?:tw|two))?$/i)
  if (usTickerMatch) return `stock:${usTickerMatch[1].toUpperCase()}`

  return normalized.startsWith('entity:') ? normalized : `entity:${normalized}`
}

/** Extract Discord user IDs from the normal `<@id>` and nickname `<@!id>` forms. */
export function extractMentionUserIds(content: string): string[] {
  const result: string[] = []
  for (const match of content.matchAll(/<@!?(\d+)>/g)) {
    addUnique(result, match[1])
  }
  return result
}

const UNIT_OR_DATE_SUFFIX_PATTERN =
  /^(?:年|月|日|號|元|塊|樓|點|分|秒|人|位|個|隻|條|張|篇|本|倍|%|目標價|EPS|營收|財報|Q[1-4]|H[1-2]|上半年|下半年|季度|預估|預測)/i
const DATE_OR_MONEY_PREFIX_PATTERN = /(?:西元|民國|第|約|共|總共|花費|花了|門票|房號|編號)\s*$/

/**
 * Extract entity-shaped tokens without making a network request or consulting
 * an LLM. Named entities can be supplied through `entityKeys` when a domain
 * adapter has a stronger canonical lookup.
 */
export function extractConversationEntityKeys(content: string): string[] {
  const result: string[] = []
  for (const match of content.matchAll(/\b(\d{4,6})(?:[A-Za-z])?(?:\.(?:TW|TWO))?\b/gi)) {
    const rawNumber = match[1]
    const fullMatch = match[0]
    const matchIndex = match.index ?? 0
    const textAfter = content.slice(matchIndex + fullMatch.length).trimStart()
    const textBefore = content.slice(0, matchIndex).trimEnd()

    // Check if the number is followed by common unit/date/quantity words
    const hasUnitSuffix = UNIT_OR_DATE_SUFFIX_PATTERN.test(textAfter)
    const hasPrefix = DATE_OR_MONEY_PREFIX_PATTERN.test(textBefore)

    // If it has explicit stock extension like .TW/.TWO, always accept
    const hasExplicitExtension = /\.(?:TW|TWO)$/i.test(fullMatch)

    if (!hasExplicitExtension) {
      if (hasUnitSuffix || hasPrefix) {
        continue
      }
      // Common 4-digit years (e.g. 1999, 2024, 2025, 2026, 2030) when attached to temporal context or without stock action
      if (/^(?:19\d{2}|202[0-9]|203[0-9])$/.test(rawNumber)) {
        if (textBefore.endsWith('的') || textBefore.endsWith('在') || !/(?:買|賣|多|空|股|張|線|跌|漲)/.test(content)) {
          continue
        }
      }
    }

    addUnique(result, normalizeEntityKey(`stock:${rawNumber}`))
  }

  for (const match of content.matchAll(/\b([A-Z]{2,5})(?:\.(?:TW|TWO))?\b/g)) {
    const ticker = match[1].toUpperCase()
    if (!NON_ENTITY_TICKERS.has(ticker)) {
      addUnique(result, normalizeEntityKey(`stock:${ticker}`))
    }
  }

  return result
}

/**
 * Classify the caller before generation. This is intentionally a small,
 * deterministic structured classifier: Gemini may use the result as context,
 * but it cannot rewrite the routing decision or canonical entities.
 */
export function classifyCallerIntent(
  content: string,
  options: CallerIntentOptions = {}
): CallerIntentAnalysis {
  const normalized = content.trim()
  const entityKeys = Array.from(
    new Set([...extractConversationEntityKeys(normalized), ...(options.entityKeys || [])])
  )
  const addresseeIds = Array.from(
    new Set([...extractMentionUserIds(normalized), ...(options.addresseeIds || [])])
  )

  if (!normalized) {
    return {
      addresseeIds,
      dialogueAct: 'backchannel',
      intent: 'no_ai_request',
      entityKeys,
      needsExternalFact: false,
      confidence: 1
    }
  }

  const isCorrection = CORRECTION_PATTERN.test(normalized)
  const isMemoryQuestion = MEMORY_PATTERN.test(normalized)
  const hasStockSignal =
    entityKeys.some(key => key.startsWith('stock:')) ||
    STOCK_CONTEXT_PATTERN.test(normalized) ||
    KNOWN_STOCK_NAME_PATTERN.test(normalized) ||
    (STOCK_ANALYSIS_PATTERN.test(normalized) && /\d{2,}/.test(normalized))
  const isStockFact = hasStockSignal && STOCK_FACT_PATTERN.test(normalized)
  const isStockAnalysis = hasStockSignal && STOCK_ANALYSIS_PATTERN.test(normalized)
  const isQuestion =
    /[?？]/.test(normalized) ||
    /(?:嗎|什麼|怎麼|如何|哪裡|是否|能不能|可不可以|多少|為什麼)/i.test(normalized)
  const isRequest = REQUEST_PATTERN.test(normalized)

  let dialogueAct: DialogueAct = 'statement'
  let intent: CallerIntent = 'casual_chat'
  let confidence = 0.62

  if (isCorrection) {
    dialogueAct = 'correction'
    intent = 'correct_bot'
    confidence = 0.98
  } else if (isMemoryQuestion) {
    dialogueAct = isQuestion || isRequest ? 'question' : 'request_action'
    intent = 'ask_memory'
    confidence = 0.94
  } else if (isStockAnalysis) {
    dialogueAct = isRequest ? 'request_action' : 'question'
    intent = 'ask_analysis'
    confidence = 0.92
  } else if (isStockFact) {
    dialogueAct = isRequest ? 'request_action' : 'question'
    intent = 'ask_stock_fact'
    confidence = 0.93
  } else if (isRequest) {
    dialogueAct = 'request_action'
    confidence = 0.84
  } else if (AGREEMENT_PATTERN.test(normalized)) {
    dialogueAct = 'agreement'
    confidence = 0.9
  } else if (BACKCHANNEL_PATTERN.test(normalized)) {
    dialogueAct = 'backchannel'
    confidence = 0.88
  } else if (isQuestion) {
    dialogueAct = 'question'
    confidence = 0.78
  }

  return {
    addresseeIds,
    dialogueAct,
    intent,
    entityKeys,
    needsExternalFact: intent === 'ask_stock_fact' || intent === 'ask_analysis',
    confidence
  }
}

/**
 * Gate automatic profile writes.
 * Skips bot corrections, memory query requests, empty prompts, and trivial single-word backchannels.
 * Substantive user discussions, topics, interests, and questions sent to Bobo are forwarded to Mem0.
 */
export function shouldWriteMemoryCandidate(
  content: string,
  analysis = classifyCallerIntent(content)
): boolean {
  if (
    analysis.intent === 'correct_bot' ||
    analysis.intent === 'ask_memory' ||
    analysis.intent === 'no_ai_request'
  ) {
    return false
  }

  const trimmed = content.trim()
  if (!trimmed || trimmed.length <= 2) {
    return false
  }

  // Skip pure trivial backchannels/agreements (e.g. "好", "笑死", "真的", "哈哈")
  if (AGREEMENT_PATTERN.test(trimmed) || BACKCHANNEL_PATTERN.test(trimmed)) {
    return false
  }

  return true
}

function tokenize(content: string): Set<string> {
  const tokens = new Set<string>()
  const cleaned = content
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/<@!?\d+>/g, ' ')
    .trim()

  const runs = cleaned.match(/[A-Za-z0-9_]+|[\u3400-\u9fff]+/g) || []
  for (const run of runs) {
    if (/^[A-Za-z0-9_]+$/.test(run)) {
      const token = run.toLowerCase()
      if (!STOP_WORDS.has(token)) tokens.add(token)
      continue
    }

    if (run.length === 1) {
      if (!STOP_WORDS.has(run)) tokens.add(run)
      continue
    }

    // Character bigrams give Chinese messages a small, deterministic semantic
    // signal without pretending that this router is an embedding model.
    for (let index = 0; index < run.length - 1; index++) {
      const bigram = run.slice(index, index + 2)
      if (!STOP_WORDS.has(bigram)) tokens.add(bigram)
    }
  }

  return tokens
}

function getEntityKeys(message: ConversationMessage): Set<string> {
  const keys = new Set<string>()
  for (const key of [
    ...(message.entityKeys || []),
    ...extractConversationEntityKeys(message.content)
  ]) {
    if (key.trim()) keys.add(normalizeEntityKey(key))
  }
  return keys
}

function getMentionIds(message: ConversationMessage): Set<string> {
  return new Set([...(message.mentionUserIds || []), ...extractMentionUserIds(message.content)])
}

function intersectionSize(left: Set<string>, right: Set<string>): number {
  let count = 0
  for (const value of left) {
    if (right.has(value)) count++
  }
  return count
}

function lexicalSimilarity(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0
  const intersection = intersectionSize(left, right)
  if (intersection === 0) return 0

  const union = new Set([...left, ...right]).size
  const jaccard = intersection / union
  const overlapCoefficient = intersection / Math.min(left.size, right.size)
  return Math.max(jaccard, overlapCoefficient)
}

function temporalProximity(
  current: ConversationMessage,
  candidate: ConversationMessage,
  now: number
): number {
  const ageMs = Math.max(0, now - candidate.timestamp)
  return Math.exp(-ageMs / (30 * 60 * 1000))
}

/** Score one candidate edge using only deterministic metadata and lexical signals. */
export function scoreConversationEdge(
  current: ConversationMessage,
  candidate: ConversationMessage,
  now = current.timestamp
): ConversationEdgeScore {
  const currentEntities = getEntityKeys(current)
  const candidateEntities = getEntityKeys(candidate)
  const currentMentions = getMentionIds(current)
  const candidateMentions = getMentionIds(candidate)
  const semanticSimilarity = lexicalSimilarity(
    tokenize(current.content),
    tokenize(candidate.content)
  )
  const entityOverlap =
    currentEntities.size > 0 &&
    candidateEntities.size > 0 &&
    intersectionSize(currentEntities, candidateEntities) > 0
      ? 1
      : 0
  const conflictingEntity =
    currentEntities.size > 0 && candidateEntities.size > 0 && entityOverlap === 0 ? 1 : 0

  const signals = {
    explicitReply: current.replyToId === candidate.id ? 1 : 0,
    directMention:
      currentMentions.has(candidate.authorId) || candidateMentions.has(current.authorId) ? 1 : 0,
    entityOverlap,
    semanticSimilarity,
    sameSpeakerContinuation: current.authorId === candidate.authorId ? 1 : 0,
    temporalProximity: temporalProximity(current, candidate, now),
    conflictingEntity
  }

  const total =
    WEIGHTS.explicitReply * signals.explicitReply +
    WEIGHTS.directMention * signals.directMention +
    WEIGHTS.entityOverlap * signals.entityOverlap +
    WEIGHTS.semanticSimilarity * signals.semanticSimilarity +
    WEIGHTS.sameSpeakerContinuation * signals.sameSpeakerContinuation +
    WEIGHTS.temporalProximity * signals.temporalProximity +
    WEIGHTS.conflictingEntity * signals.conflictingEntity

  return { messageId: candidate.id, total, ...signals }
}

function rootIdFor(messageId: string, messagesById: Map<string, ConversationMessage>): string {
  let currentId = messageId
  const visited = new Set<string>()

  while (!visited.has(currentId)) {
    visited.add(currentId)
    const current = messagesById.get(currentId)
    if (!current?.replyToId || !messagesById.has(current.replyToId)) return currentId
    currentId = current.replyToId
  }

  return currentId
}

function isImplicitLink(score: ConversationEdgeScore, minScore: number): boolean {
  const hasTopicSignal =
    score.directMention === 1 ||
    score.entityOverlap === 1 ||
    score.semanticSimilarity >= SEMANTIC_SIGNAL_THRESHOLD
  return hasTopicSignal && score.total >= minScore
}

/**
 * Route a new message to one thread. Explicit replies are hard links; implicit
 * links need a topic signal and a score above the threshold. Otherwise a new
 * thread is opened and unrelated candidates are dropped.
 */
export function routeConversation(
  current: ConversationMessage,
  candidates: readonly ConversationMessage[],
  options: ConversationRoutingOptions = {}
): ConversationRoutingResult {
  const uniqueCandidates = Array.from(
    new Map(
      candidates
        .filter(candidate => candidate.id !== current.id)
        .map(candidate => [candidate.id, candidate])
    ).values()
  )
  const now = options.now ?? current.timestamp
  const minScore = options.minScore ?? DEFAULT_MIN_SCORE
  const scores = uniqueCandidates
    .map(candidate => scoreConversationEdge(current, candidate, now))
    .sort((left, right) => right.total - left.total)
  const messagesById = new Map(uniqueCandidates.map(candidate => [candidate.id, candidate]))

  const explicitParent = current.replyToId ? messagesById.get(current.replyToId) : undefined
  const bestImplicitParent = scores.find(score => isImplicitLink(score, minScore))
  const hasExplicitReply = Boolean(current.replyToId)
  const parent =
    explicitParent ||
    (!hasExplicitReply && bestImplicitParent
      ? messagesById.get(bestImplicitParent.messageId)
      : undefined)
  const rootId = parent ? rootIdFor(parent.id, messagesById) : current.replyToId || current.id
  const selectedIds = new Set<string>()

  if (parent) {
    // Preserve the complete known reply chain for the chosen parent.
    for (const candidate of uniqueCandidates) {
      if (rootIdFor(candidate.id, messagesById) === rootId) selectedIds.add(candidate.id)
    }
  }

  for (const score of scores) {
    if (
      score.messageId === explicitParent?.id ||
      (!hasExplicitReply && isImplicitLink(score, minScore))
    ) {
      selectedIds.add(score.messageId)
    }
  }

  const selectedMessages = uniqueCandidates
    .filter(candidate => selectedIds.has(candidate.id))
    .sort((left, right) => left.timestamp - right.timestamp)
  const droppedMessages = uniqueCandidates
    .filter(candidate => !selectedIds.has(candidate.id))
    .sort((left, right) => left.timestamp - right.timestamp)

  return {
    threadId: `thread:${rootId}`,
    parentId: parent?.id || null,
    selectedMessages,
    droppedMessages,
    scores
  }
}
