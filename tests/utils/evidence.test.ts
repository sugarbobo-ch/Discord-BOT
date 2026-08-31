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

  test('does not misclassify moving averages, volume, and timestamps as current-price claims', () => {
    const result = validateGroundedResponse(
      '欣興目前股價為 1200 元，今日收盤價跌破 60 日均線（60MA），最新報價時間為 09:51，成交量 951 張，跌幅 5%。',
      evidence,
      {
        requireCurrentPriceEvidence: true,
        verifiedNumbers: ['1200']
      }
    )

    expect(result.valid).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  test('passes real-world analyst scenario for 欣興 with 60 MA and 951 volume', () => {
    const report =
      '### **【個股緊急診斷報告：欣興 (3037.TW)】**\n' +
      '針對您持有的欣興（3037.TW）目前遭遇一字鎖跌停的劇烈波動，我已排除市場雜訊，將最新檢調事件、公司澄清以及技術面走勢進行綜合分析。\n' +
      '目前股價為 110.5 元，今日收盤價跌破 60 日均線（季線），成交量約 951 張，最新報價時間 09:51。'

    const result = validateGroundedResponse(report, evidence, {
      requireCurrentPriceEvidence: true,
      verifiedNumbers: ['110.5', '3037']
    })

    expect(result.valid).toBe(true)
    expect(result.violations).toHaveLength(0)
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

