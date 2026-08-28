import { describe, expect, test } from 'vitest'
import {
  formatEvidenceBlocks,
  validateGroundedResponse,
  type EvidenceBlock
} from '../../src/utils/evidence'

const evidence: EvidenceBlock[] = [
  {
    sourceId: 'stock-tool-1',
    speakerId: 'system',
    threadId: 'thread:6515',
    sourceType: 'official_api',
    status: 'verified',
    timestamp: 0,
    content: '6515 欣興現價 1200',
    entityKeys: ['stock:6515']
  }
]

describe('evidence blocks', () => {
  test('formats source, speaker, thread, status and timestamp', () => {
    const formatted = formatEvidenceBlocks(evidence)

    expect(formatted).toContain('sourceId: stock-tool-1')
    expect(formatted).toContain('speakerId: system')
    expect(formatted).toContain('threadId: thread:6515')
    expect(formatted).toContain('sourceType: official_api')
    expect(formatted).toContain('status: verified')
    expect(formatted).toContain('entityKeys')
  })

  test('accepts current-price claims backed by an official number', () => {
    expect(
      validateGroundedResponse('欣興目前股價是 1200 元。', evidence, {
        requireCurrentPriceEvidence: true,
        verifiedNumbers: ['1200']
      }).valid
    ).toBe(true)
  })

  test('rejects invented current-price claims and unknown citations', () => {
    const result = validateGroundedResponse(
      '欣興目前股價是 9999 元。[sourceId: missing]',
      evidence,
      { requireCurrentPriceEvidence: true, verifiedNumbers: ['1200'] }
    )

    expect(result.valid).toBe(false)
    expect(result.violations).toEqual(
      expect.arrayContaining([
        'current-price claim is not backed by verified data: 9999',
        'unknown sourceId: missing'
      ])
    )
  })
})
