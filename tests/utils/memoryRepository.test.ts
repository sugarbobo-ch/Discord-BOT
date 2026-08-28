import { beforeAll, afterEach, describe, expect, test, vi } from 'vitest'
import { getDb } from '../../src/utils/db'
import { MemoryRepository, type MemoryCandidate } from '../../src/utils/memoryRepository'

const database = getDb()
const mockMemory = {
  add: vi.fn(),
  search: vi.fn()
}

const execute = async <T>(fn: (memory: any) => Promise<T>): Promise<T> => fn(mockMemory)

const candidate = (id: string, overrides: Partial<MemoryCandidate> = {}): MemoryCandidate => ({
  scopeUserId: 'repo-scope-user',
  value: `我喜歡測試 ${id}`,
  kind: 'profile',
  subjectUserId: 'repo-scope-user',
  threadId: 'thread:repo',
  canonicalEntityIds: ['stock:6515'],
  sourceMessageIds: [`source-${id}`],
  sourceAuthorIds: ['repo-scope-user'],
  sourceType: 'human_message',
  epistemicStatus: 'asserted',
  confidence: 0.9,
  observedAt: 1_000,
  extractorVersion: 'test-v1',
  ...overrides
})

describe('MemoryRepository', () => {
  beforeAll(() => {
    database.exec(
      "CREATE TABLE IF NOT EXISTS memory_records (memory_id TEXT PRIMARY KEY, scope_user_id TEXT NOT NULL, kind TEXT NOT NULL, subject_user_id TEXT, thread_id TEXT, canonical_entity_ids TEXT NOT NULL DEFAULT '[]', value TEXT NOT NULL, source_message_ids TEXT NOT NULL DEFAULT '[]', source_author_ids TEXT NOT NULL DEFAULT '[]', source_type TEXT NOT NULL, epistemic_status TEXT NOT NULL, confidence REAL NOT NULL, observed_at INTEGER NOT NULL, valid_until INTEGER, extractor_version TEXT NOT NULL)"
    )
  })

  afterEach(() => {
    vi.resetAllMocks()
    database.prepare('DELETE FROM memory_records WHERE memory_id LIKE ?').run('repo-test-%')
  })

  test('adds to Mem0 with provenance metadata and mirrors returned IDs', async () => {
    mockMemory.add.mockResolvedValue({
      results: [{ id: 'repo-test-add', memory: '我喜歡測試 repo-test-add' }]
    })
    const repository = new MemoryRepository({ database, execute, now: () => 2_000 })

    const result = await repository.addCandidate(candidate('add'))

    expect(result.records[0]).toMatchObject({
      id: 'repo-test-add',
      scopeUserId: 'repo-scope-user',
      threadId: 'thread:repo',
      canonicalEntityIds: ['stock:6515'],
      sourceMessageIds: ['source-add']
    })
    expect(mockMemory.add).toHaveBeenCalledWith(
      '我喜歡測試 add',
      expect.objectContaining({
        userId: 'repo-scope-user',
        metadata: expect.objectContaining({
          kind: 'profile',
          subject_user_id: 'repo-scope-user',
          thread_id: 'thread:repo',
          canonical_entity_ids: ['stock:6515'],
          source_type: 'human_message',
          epistemic_status: 'asserted'
        })
      })
    )

    const row = database
      .prepare('SELECT scope_user_id, kind, value FROM memory_records WHERE memory_id = ?')
      .get('repo-test-add') as any
    expect(row).toEqual({
      scope_user_id: 'repo-scope-user',
      kind: 'profile',
      value: '我喜歡測試 repo-test-add'
    })
  })

  test('filters by caller, subject, thread, kind and entity after Mem0 search', async () => {
    const repository = new MemoryRepository({ database, execute, now: () => 2_000 })
    repository.recordAddResults(candidate('match'), { results: [{ id: 'repo-test-match' }] })
    repository.recordAddResults(candidate('wrong-thread', { threadId: 'thread:other' }), {
      results: [{ id: 'repo-test-wrong-thread' }]
    })
    repository.recordAddResults(candidate('retracted', { epistemicStatus: 'retracted' }), {
      results: [{ id: 'repo-test-retracted' }]
    })
    mockMemory.search.mockResolvedValue({
      results: [
        { id: 'repo-test-match', memory: 'match', score: 0.8, attributedTo: 'user' },
        { id: 'repo-test-wrong-thread', memory: 'wrong thread', score: 0.99, attributedTo: 'user' },
        { id: 'repo-test-retracted', memory: 'retracted', score: 1, attributedTo: 'user' }
      ]
    })

    const result = await repository.search('測試', {
      scopeUserId: 'repo-scope-user',
      subjectUserId: 'repo-scope-user',
      threadId: 'thread:repo',
      kinds: ['profile'],
      statuses: ['asserted', 'verified'],
      canonicalEntityIds: ['stock:6515'],
      topK: 5,
      includeLegacyUser: false
    })

    expect(result.results.map(item => item.id)).toEqual(['repo-test-match'])
    expect(mockMemory.search).toHaveBeenCalledWith('測試', {
      filters: {
        user_id: 'repo-scope-user',
        subject_user_id: 'repo-scope-user',
        thread_id: 'thread:repo',
        kind: 'profile',
        canonical_entity_id: 'stock:6515'
      },
      topK: 40
    })
  })

  test('never returns legacy assistant memories but can retain legacy user memories', async () => {
    const repository = new MemoryRepository({ database, execute })
    mockMemory.search.mockResolvedValue({
      results: [
        {
          id: 'repo-test-legacy-assistant',
          memory: '錯誤模型回答',
          score: 0.99,
          attributedTo: 'assistant'
        },
        { id: 'repo-test-legacy-user', memory: '使用者偏好', score: 0.6, attributedTo: 'user' }
      ]
    })

    const result = await repository.search('偏好', {
      scopeUserId: 'repo-scope-user',
      topK: 5,
      includeLegacyUser: true
    })

    expect(result.results.map(item => item.id)).toEqual(['repo-test-legacy-user'])
    expect(result.results[0].record.extractorVersion).toBe('legacy-unclassified')
    expect(result.results[0].trusted).toBe(false)
  })
})
