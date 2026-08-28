export type EvidenceSourceType =
  | 'human_message'
  | 'model_output_untrusted'
  | 'official_api'
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
  /(?:現價|目前股價|最新股價|目前價格|最新價格|報價|收盤價|開盤價)[^\n。！？!?]{0,24}?([0-9]+(?:\.[0-9]+)?)/giu

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
      const number = Number(match[1]).toString()
      if (!verifiedNumbers.has(number)) {
        violations.push(`current-price claim is not backed by verified data: ${match[1]}`)
      }
    }
  }

  return { valid: violations.length === 0, violations: unique(violations) }
}
