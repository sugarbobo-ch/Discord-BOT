export type EvidenceSourceType =
  | 'human_message'
  | 'model_output_untrusted'
  | 'official_api'
  | 'web_search'
  | 'moderator_confirmed'

export type EvidenceStatus = 'asserted' | 'verified' | 'untrusted'

export interface EvidenceBlock {
  sourceId: string
  speakerId: string
  threadId: string
  sourceType: EvidenceSourceType
  status: EvidenceStatus
  timestamp: number
  content: string
  entityKeys?: readonly string[]
}

export interface GroundingValidationOptions {
  /** Numbers returned by an authoritative tool, normalized as strings. */
  verifiedNumbers?: readonly string[]
  /** Check current-price style claims against verifiedNumbers. */
  requireCurrentPriceEvidence?: boolean
}

export interface GroundingValidation {
  valid: boolean
  violations: string[]
}

const CURRENT_PRICE_PATTERN =
  /(?:現價|目前股價|最新股價|目前價格|最新價格|報價|收盤價|開盤價)[^\n。！？!?]{0,24}?(?<![:/\d])([0-9]+(?:\.[0-9]+)?)(?![:/\d])/giu

const NON_PRICE_SUFFIX_PATTERN =
  /^\s*(?:日(?:均線|線)?|天(?:線)?|MA|ma|分(?:鐘|K|k)?|週(?:線|均線)?|月(?:線|均線)?|季(?:線|均線)?|張|股|萬|億|兆|口|筆|點|%|％|階|檔|名|位|次|倍|元\/股|年)/i

const NON_PRICE_PREFIX_PATTERN =
  /(?:時間|日期|代號|代碼|成交量|量|張數|第|均線|MA|ma|跌破|突破|站上|站穩|回測|乖離率?|漲幅|跌幅|漲跌幅?|震幅|相較|比|距離)\s*$/i

function unique(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

/** Serialize evidence with stable fields so the model can distinguish source types. */
export function formatEvidenceBlocks(blocks: readonly EvidenceBlock[]): string {
  return blocks
    .map(block => {
      const entityText = block.entityKeys?.length
        ? `, entityKeys: ${JSON.stringify(block.entityKeys)}`
        : ''
      return `[sourceId: ${block.sourceId}, speakerId: ${block.speakerId}, threadId: ${block.threadId}, sourceType: ${block.sourceType}, status: ${block.status}, timestamp: ${new Date(block.timestamp).toISOString()}${entityText}] content: ${JSON.stringify(block.content)}`
    })
    .join('\n')
}

/**
 * Validate claims that can be checked cheaply and deterministically. Human
 * messages remain claims; only official tool values can authorize a precise
 * current-price statement.
 */
export function validateGroundedResponse(
  response: string,
  evidence: readonly EvidenceBlock[],
  options: GroundingValidationOptions = {}
): GroundingValidation {
  const violations: string[] = []
  const sourceIds = new Set(evidence.map(block => block.sourceId))
  const citations = response.matchAll(/\[sourceId:\s*([^,\]]+)/gi)
  for (const citation of citations) {
    const sourceId = citation[1].trim()
    if (!sourceIds.has(sourceId)) violations.push(`unknown sourceId: ${sourceId}`)
  }

  if (options.requireCurrentPriceEvidence) {
    const verifiedNumbers = new Set(
      unique((options.verifiedNumbers || []).map(value => String(value))).map(value =>
        Number(value).toString()
      )
    )
    for (const match of response.matchAll(CURRENT_PRICE_PATTERN)) {
      const numberStr = match[1]
      const matchIndex = match.index ?? 0
      const numberOffset = match[0].lastIndexOf(numberStr)
      const numberIndex = matchIndex + numberOffset
      const prefix = response.slice(matchIndex, numberIndex)
      const suffix = response.slice(numberIndex + numberStr.length)

      if (NON_PRICE_PREFIX_PATTERN.test(prefix) || NON_PRICE_SUFFIX_PATTERN.test(suffix)) {
        continue
      }

      const number = Number(numberStr).toString()
      if (!verifiedNumbers.has(number)) {
        violations.push(`current-price claim is not backed by verified data: ${match[1]}`)
      }
    }
  }

  return { valid: violations.length === 0, violations: unique(violations) }
}
