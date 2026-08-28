import { getDb } from './db'
import { executeMemoryOp } from './gemini/mem0'

export type MemoryKind = 'episode' | 'profile' | 'claim' | 'verified_fact'
export type MemorySourceType = 'human_message' | 'official_api' | 'moderator_confirmed'
export type MemoryEpistemicStatus = 'asserted' | 'verified' | 'disputed' | 'retracted'

export interface MemoryProvenance {
  kind: MemoryKind
  subjectUserId?: string
  threadId?: string
  canonicalEntityIds?: readonly string[]
  sourceMessageIds?: readonly string[]
  sourceAuthorIds?: readonly string[]
  sourceType: MemorySourceType
  epistemicStatus: MemoryEpistemicStatus
  confidence: number
  observedAt?: number
  validUntil?: number
  extractorVersion?: string
}

export interface MemoryCandidate extends MemoryProvenance {
  scopeUserId: string
  value: string
}

export interface MemoryRecord {
  id: string
  scopeUserId: string
  kind: MemoryKind
  subjectUserId: string | null
  threadId: string | null
  canonicalEntityIds: string[]
  value: string
  sourceMessageIds: string[]
  sourceAuthorIds: string[]
  sourceType: MemorySourceType
  epistemicStatus: MemoryEpistemicStatus
  confidence: number
  observedAt: number
  validUntil: number | null
  extractorVersion: string
}

export interface MemorySearchOptions {
  scopeUserId: string
  subjectUserId?: string
  threadId?: string
  kinds?: readonly MemoryKind[]
  statuses?: readonly MemoryEpistemicStatus[]
  canonicalEntityIds?: readonly string[]
  topK?: number
  includeLegacyUser?: boolean
  now?: number
}

export interface MemorySearchResult {
  id: string
  memory: string
  score: number
  attributedTo?: string
  metadata: Record<string, unknown>
  record: MemoryRecord
  trusted: boolean
}

export interface MemorySearchResponse {
  results: MemorySearchResult[]
}

export interface MemoryAddResponse {
  results: unknown[]
  records: MemoryRecord[]
}

export interface MemoryRepositoryOptions {
  memoryFactory?: () => any
  execute?: <T>(fn: (memory: any) => Promise<T>) => Promise<T>
  database?: any
  now?: () => number
}

const DEFAULT_EXTRACTOR_VERSION = 'memory-mvp-v1'
const DEFAULT_STATUSES: MemoryEpistemicStatus[] = ['asserted', 'verified']
const DEFAULT_KINDS: MemoryKind[] = ['episode', 'profile', 'claim', 'verified_fact']

function uniqueStrings(values: readonly string[] | undefined): string[] {
  return Array.from(new Set((values || []).filter(value => typeof value === 'string' && value)))
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string')
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

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function parseTimestamp(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const numeric = Number(value)
    if (Number.isFinite(numeric) && numeric > 0) return numeric
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function normalizeCandidate(candidate: MemoryCandidate): MemoryCandidate {
  if (!candidate.scopeUserId.trim()) throw new Error('Memory scope user ID is required.')
  if (!candidate.value.trim()) throw new Error('Memory value is required.')
  return {
    ...candidate,
    scopeUserId: candidate.scopeUserId.trim(),
    value: candidate.value.trim(),
    canonicalEntityIds: uniqueStrings(candidate.canonicalEntityIds),
    sourceMessageIds: uniqueStrings(candidate.sourceMessageIds),
    sourceAuthorIds: uniqueStrings(candidate.sourceAuthorIds),
    confidence: clampConfidence(candidate.confidence),
    observedAt: candidate.observedAt ?? Date.now(),
    extractorVersion: candidate.extractorVersion || DEFAULT_EXTRACTOR_VERSION
  }
}

function optionalMetadata(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined))
}

/** Metadata passed to Mem0 and mirrored in SQLite for deterministic filtering. */
export function buildMemoryMetadata(candidate: MemoryCandidate): Record<string, unknown> {
  const normalized = normalizeCandidate(candidate)
  return optionalMetadata({
    kind: normalized.kind,
    subject_user_id: normalized.subjectUserId,
    thread_id: normalized.threadId,
    canonical_entity_ids: normalized.canonicalEntityIds,
    source_message_ids: normalized.sourceMessageIds,
    source_author_ids: normalized.sourceAuthorIds,
    canonical_entity_id: normalized.canonicalEntityIds?.[0],
    source_type: normalized.sourceType,
    epistemic_status: normalized.epistemicStatus,
    confidence: normalized.confidence,
    observed_at: normalized.observedAt,
    valid_until: normalized.validUntil,
    extractor_version: normalized.extractorVersion
  })
}

function toRecord(
  candidate: MemoryCandidate,
  id: string,
  value: string,
  overrides: Partial<MemoryRecord> = {}
): MemoryRecord {
  const normalized = normalizeCandidate(candidate)
  return {
    id,
    scopeUserId: normalized.scopeUserId,
    kind: normalized.kind,
    subjectUserId: normalized.subjectUserId || null,
    threadId: normalized.threadId || null,
    canonicalEntityIds: [...(normalized.canonicalEntityIds || [])],
    value,
    sourceMessageIds: [...(normalized.sourceMessageIds || [])],
    sourceAuthorIds: [...(normalized.sourceAuthorIds || [])],
    sourceType: normalized.sourceType,
    epistemicStatus: normalized.epistemicStatus,
    confidence: normalized.confidence,
    observedAt: normalized.observedAt!,
    validUntil: normalized.validUntil ?? null,
    extractorVersion: normalized.extractorVersion!,
    ...overrides
  }
}

function serialize(values: readonly string[]): string {
  return JSON.stringify(uniqueStrings(values))
}

function metadataRecord(
  id: string,
  scopeUserId: string,
  memory: string,
  metadata: Record<string, unknown>,
  now: number
): MemoryRecord | null {
  const kind = metadata.kind
  const sourceType = metadata.source_type
  const epistemicStatus = metadata.epistemic_status
  if (kind !== 'episode' && kind !== 'profile' && kind !== 'claim' && kind !== 'verified_fact') {
    return null
  }
  if (
    sourceType !== 'human_message' &&
    sourceType !== 'official_api' &&
    sourceType !== 'moderator_confirmed'
  ) {
    return null
  }
  if (
    epistemicStatus !== 'asserted' &&
    epistemicStatus !== 'verified' &&
    epistemicStatus !== 'disputed' &&
    epistemicStatus !== 'retracted'
  ) {
    return null
  }

  return {
    id,
    scopeUserId,
    kind,
    subjectUserId: typeof metadata.subject_user_id === 'string' ? metadata.subject_user_id : null,
    threadId: typeof metadata.thread_id === 'string' ? metadata.thread_id : null,
    canonicalEntityIds: parseStringArray(metadata.canonical_entity_ids),
    value: memory,
    sourceMessageIds: parseStringArray(metadata.source_message_ids),
    sourceAuthorIds: parseStringArray(metadata.source_author_ids),
    sourceType,
    epistemicStatus,
    confidence: clampConfidence(Number(metadata.confidence)),
    observedAt: parseTimestamp(metadata.observed_at, now),
    validUntil:
      metadata.valid_until === undefined || metadata.valid_until === null
        ? null
        : parseTimestamp(metadata.valid_until, now),
    extractorVersion:
      typeof metadata.extractor_version === 'string'
        ? metadata.extractor_version
        : DEFAULT_EXTRACTOR_VERSION
  }
}

function legacyRecord(
  id: string,
  scopeUserId: string,
  memory: string,
  raw: any,
  now: number
): MemoryRecord {
  return {
    id,
    scopeUserId,
    kind: 'profile',
    subjectUserId: scopeUserId,
    threadId: null,
    canonicalEntityIds: [],
    value: memory,
    sourceMessageIds: [],
    sourceAuthorIds: [],
    sourceType: 'human_message',
    epistemicStatus: 'asserted',
    confidence: 0.5,
    observedAt: parseTimestamp(raw.updatedAt || raw.createdAt, now),
    validUntil: null,
    extractorVersion: 'legacy-unclassified'
  }
}

function intersection(left: readonly string[], right: readonly string[]): number {
  const rightSet = new Set(right)
  return left.filter(value => rightSet.has(value)).length
}

function metadataMatches(record: MemoryRecord, options: MemorySearchOptions, now: number): boolean {
  const kinds = options.kinds || DEFAULT_KINDS
  const statuses = options.statuses || DEFAULT_STATUSES
  if (!kinds.includes(record.kind)) return false
  if (!statuses.includes(record.epistemicStatus)) return false
  if (record.epistemicStatus === 'retracted') return false
  if (options.subjectUserId && record.subjectUserId !== options.subjectUserId) return false
  if (options.threadId && record.threadId !== options.threadId) return false
  if (
    options.canonicalEntityIds &&
    options.canonicalEntityIds.length > 0 &&
    intersection(record.canonicalEntityIds, options.canonicalEntityIds) === 0
  ) {
    return false
  }
  if (record.validUntil !== null && record.validUntil <= now) return false
  return true
}

function retrievalScore(
  rawScore: unknown,
  record: MemoryRecord,
  options: MemorySearchOptions,
  now: number
): number {
  const semanticRelevance = Math.min(1, Math.max(0, Number(rawScore) || 0))
  const entityMatch =
    options.canonicalEntityIds && options.canonicalEntityIds.length > 0
      ? intersection(record.canonicalEntityIds, options.canonicalEntityIds) > 0
        ? 1
        : 0
      : 0
  const threadMatch = options.threadId && record.threadId === options.threadId ? 1 : 0
  const speakerMatch =
    options.subjectUserId && record.subjectUserId === options.subjectUserId ? 1 : 0
  const recency = Math.exp(-Math.max(0, now - record.observedAt) / (30 * 24 * 60 * 60 * 1000))
  const importance =
    record.kind === 'verified_fact'
      ? 1
      : record.kind === 'profile'
        ? 0.8
        : record.kind === 'claim'
          ? 0.5
          : 0.4
  const authorityBonus =
    record.sourceType === 'official_api' ? 0.1 : record.epistemicStatus === 'verified' ? 0.05 : 0
  return (
    0.4 * semanticRelevance +
    0.2 * entityMatch +
    0.15 * threadMatch +
    0.1 * speakerMatch +
    0.1 * recency +
    0.05 * importance +
    authorityBonus
  )
}

export class MemoryRepository {
  private readonly memoryFactory?: () => any
  private readonly execute: <T>(fn: (memory: any) => Promise<T>) => Promise<T>
  private readonly database?: any
  private readonly now: () => number

  constructor(options: MemoryRepositoryOptions = {}) {
    this.memoryFactory = options.memoryFactory
    this.execute =
      options.execute ||
      ((fn: (memory: any) => Promise<any>) =>
        executeMemoryOp(fn, {
          memoryFactory: this.memoryFactory ? () => this.memoryFactory!() : undefined
        }))
    this.database = options.database
    this.now = options.now || (() => Date.now())
  }

  private getDb(): any {
    return this.database || getDb()
  }

  public async addCandidate(candidate: MemoryCandidate): Promise<MemoryAddResponse> {
    const normalized = normalizeCandidate(candidate)
    const result = await this.execute<any>(memory =>
      memory.add(normalized.value, {
        userId: normalized.scopeUserId,
        metadata: buildMemoryMetadata(normalized)
      })
    )
    if (!result || !Array.isArray(result.results)) {
      throw new Error('Mem0 returned an invalid add result.')
    }
    const records = this.recordAddResults(normalized, result)
    return { results: result.results, records }
  }

  /** Mirror successful Mem0 IDs into SQLite provenance metadata. */
  public recordAddResults(
    candidate: MemoryCandidate,
    result: { results?: unknown[] }
  ): MemoryRecord[] {
    if (!Array.isArray(result.results)) return []
    const normalized = normalizeCandidate(candidate)
    const records: MemoryRecord[] = []
    const db = this.getDb()

    for (const item of result.results as any[]) {
      const id = typeof item?.id === 'string' ? item.id : ''
      if (!id) continue
      const value = typeof item.memory === 'string' && item.memory ? item.memory : normalized.value
      const record = toRecord(normalized, id, value)
      db.prepare(
        `
        INSERT OR REPLACE INTO memory_records (
          memory_id,
          scope_user_id,
          kind,
          subject_user_id,
          thread_id,
          canonical_entity_ids,
          value,
          source_message_ids,
          source_author_ids,
          source_type,
          epistemic_status,
          confidence,
          observed_at,
          valid_until,
          extractor_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(
        record.id,
        record.scopeUserId,
        record.kind,
        record.subjectUserId,
        record.threadId,
        serialize(record.canonicalEntityIds),
        record.value,
        serialize(record.sourceMessageIds),
        serialize(record.sourceAuthorIds),
        record.sourceType,
        record.epistemicStatus,
        record.confidence,
        record.observedAt,
        record.validUntil,
        record.extractorVersion
      )
      records.push(record)
    }
    return records
  }

  public deleteRecords(memoryIds: readonly string[]): void {
    const ids = uniqueStrings(memoryIds)
    if (ids.length === 0) return
    const placeholders = ids.map(() => '?').join(', ')
    try {
      this.getDb()
        .prepare(`DELETE FROM memory_records WHERE memory_id IN (${placeholders})`)
        .run(...ids)
    } catch (error) {
      console.error('[MemoryRepository] Failed to delete memory metadata:', error)
    }
  }

  public deleteScopeRecords(scopeUserId: string): void {
    if (!scopeUserId) return
    try {
      this.getDb().prepare('DELETE FROM memory_records WHERE scope_user_id = ?').run(scopeUserId)
    } catch (error) {
      console.error('[MemoryRepository] Failed to delete scope metadata:', error)
    }
  }

  public async search(query: string, options: MemorySearchOptions): Promise<MemorySearchResponse> {
    const normalizedQuery = query.trim()
    if (!normalizedQuery || !options.scopeUserId.trim()) return { results: [] }

    const topK = Math.max(1, options.topK ?? 8)
    const internalTopK = Math.max(topK * 4, 40)
    const now = options.now ?? this.now()
    const primaryFilters: Record<string, unknown> = { user_id: options.scopeUserId }

    // Mem0 performs the cheap scope/metadata filter before vector search. The
    // local pass below remains authoritative for multi-value and legacy records.
    if (options.subjectUserId) primaryFilters.subject_user_id = options.subjectUserId
    if (options.threadId) primaryFilters.thread_id = options.threadId
    if (options.kinds?.length === 1) primaryFilters.kind = options.kinds[0]
    if (options.statuses?.length === 1) primaryFilters.epistemic_status = options.statuses[0]
    if (options.canonicalEntityIds?.length === 1) {
      primaryFilters.canonical_entity_id = options.canonicalEntityIds[0]
    }

    const needsLegacyFallback =
      options.includeLegacyUser !== false &&
      Object.keys(primaryFilters).some(key => key !== 'user_id') &&
      !options.threadId

    const rawItems = await this.execute<any[]>(async memory => {
      const primary = await memory.search(normalizedQuery, {
        filters: primaryFilters,
        topK: internalTopK
      })
      const primaryResults = Array.isArray(primary?.results) ? primary.results : []
      if (!needsLegacyFallback) return primaryResults

      const legacyScope = await memory.search(normalizedQuery, {
        filters: { user_id: options.scopeUserId },
        topK: internalTopK
      })
      const merged = new Map<string, any>()
      for (const item of [
        ...primaryResults,
        ...(Array.isArray(legacyScope?.results) ? legacyScope.results : [])
      ]) {
        if (item?.id) merged.set(String(item.id), item)
      }
      return Array.from(merged.values())
    })

    if (!Array.isArray(rawItems) || rawItems.length === 0) return { results: [] }
    const ids = rawItems
      .map((item: any) => (typeof item?.id === 'string' ? item.id : ''))
      .filter(Boolean)
    const recordsById = this.readRecords(ids)
    const results: MemorySearchResult[] = []

    for (const raw of rawItems as any[]) {
      const id = typeof raw?.id === 'string' ? raw.id : ''
      const memory = typeof raw?.memory === 'string' ? raw.memory : ''
      if (!id || !memory) continue
      const metadata = raw?.metadata && typeof raw.metadata === 'object' ? raw.metadata : {}
      let record =
        recordsById.get(id) || metadataRecord(id, options.scopeUserId, memory, metadata, now)

      if (!record) {
        if (raw.attributedTo === 'assistant') continue
        if (options.includeLegacyUser === false && raw.attributedTo !== 'user') continue
        record = legacyRecord(id, options.scopeUserId, memory, raw, now)
      }

      if (record.scopeUserId !== options.scopeUserId) continue
      if (!metadataMatches(record, options, now)) continue

      results.push({
        id,
        memory,
        score: retrievalScore(raw.score, record, options, now),
        ...(typeof raw.attributedTo === 'string' ? { attributedTo: raw.attributedTo } : {}),
        metadata: {
          ...metadata,
          kind: record.kind,
          subject_user_id: record.subjectUserId,
          thread_id: record.threadId,
          canonical_entity_ids: record.canonicalEntityIds,
          source_message_ids: record.sourceMessageIds,
          source_author_ids: record.sourceAuthorIds,
          source_type: record.sourceType,
          epistemic_status: record.epistemicStatus,
          confidence: record.confidence,
          observed_at: record.observedAt,
          valid_until: record.validUntil,
          extractor_version: record.extractorVersion
        },
        record,
        trusted: record.sourceType !== 'human_message' || record.epistemicStatus === 'verified'
      })
    }

    results.sort((left, right) => right.score - left.score)
    return { results: results.slice(0, topK) }
  }

  private readRecords(ids: readonly string[]): Map<string, MemoryRecord> {
    const uniqueIds = uniqueStrings(ids)
    if (uniqueIds.length === 0) return new Map()
    const placeholders = uniqueIds.map(() => '?').join(', ')
    const rows = this.getDb()
      .prepare(`SELECT * FROM memory_records WHERE memory_id IN (${placeholders})`)
      .all(...uniqueIds) as any[]
    return new Map(rows.map(row => [row.memory_id, this.rowToRecord(row)]))
  }

  private rowToRecord(row: any): MemoryRecord {
    return {
      id: row.memory_id,
      scopeUserId: row.scope_user_id,
      kind: row.kind,
      subjectUserId: row.subject_user_id || null,
      threadId: row.thread_id || null,
      canonicalEntityIds: parseStringArray(row.canonical_entity_ids),
      value: row.value,
      sourceMessageIds: parseStringArray(row.source_message_ids),
      sourceAuthorIds: parseStringArray(row.source_author_ids),
      sourceType: row.source_type,
      epistemicStatus: row.epistemic_status,
      confidence: clampConfidence(Number(row.confidence)),
      observedAt: Number(row.observed_at),
      validUntil: row.valid_until === null ? null : Number(row.valid_until),
      extractorVersion: row.extractor_version
    }
  }
}

export const memoryRepository = new MemoryRepository()
