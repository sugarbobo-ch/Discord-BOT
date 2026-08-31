import { ThinkingLevel } from '@google/genai'
import { executeGenAI, MODEL_NAME } from './core'

export type ThinkingOperation =
  | 'classification'
  | 'moderation'
  | 'lookup'
  | 'conversation'
  | 'research'
  | 'stock_analysis'
  | 'repair'

export interface ThinkingSignals {
  semanticComplexity?: 'simple' | 'complex'
  needsMultipleSources?: boolean
  needsTrendAnalysis?: boolean
  needsRecentResearch?: boolean
  validationFailed?: boolean
}

export interface ThinkingDecision {
  level: ThinkingLevel.MINIMAL | ThinkingLevel.HIGH
  reason: string
}

export interface PolicyGenerationRuntime {
  generate(request: any): Promise<any>
}

export interface PolicyGenerationRequest {
  operation: ThinkingOperation
  request: any
  signals?: ThinkingSignals
}

const defaultRuntime: PolicyGenerationRuntime = {
  generate: request => executeGenAI(ai => ai.models.generateContent(request))
}

export function decideThinking(
  operation: ThinkingOperation,
  signals: ThinkingSignals = {}
): ThinkingDecision {
  if (operation === 'repair') {
    return { level: ThinkingLevel.HIGH, reason: 'validation_repair' }
  }
  if (operation === 'research') {
    return { level: ThinkingLevel.HIGH, reason: 'source_synthesis' }
  }
  if (operation === 'stock_analysis') {
    const needsDeepAnalysis = signals.needsTrendAnalysis || signals.needsRecentResearch
    return needsDeepAnalysis
      ? { level: ThinkingLevel.HIGH, reason: 'stock_trend_or_recent_research' }
      : { level: ThinkingLevel.MINIMAL, reason: 'stock_lookup_only' }
  }
  if (operation === 'conversation') {
    const needsDeepConversation =
      signals.semanticComplexity === 'complex' || signals.needsMultipleSources
    return needsDeepConversation
      ? { level: ThinkingLevel.HIGH, reason: 'complex_conversation' }
      : { level: ThinkingLevel.MINIMAL, reason: 'simple_conversation' }
  }
  return { level: ThinkingLevel.MINIMAL, reason: `${operation}_fast_path` }
}

function canFallbackFromHigh(error: any): boolean {
  const status = error?.status || error?.response?.status
  const message = String(error?.message || '').toLowerCase()
  return (
    status === 400 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    error?.code === 'ECONNABORTED' ||
    message.includes('thinking level is not supported') ||
    message.includes('timeout') ||
    message.includes('internal error')
  )
}

function withThinkingLevel(request: any, level: ThinkingLevel.MINIMAL | ThinkingLevel.HIGH): any {
  return {
    ...request,
    model: request.model || MODEL_NAME,
    config: {
      ...(request.config || {}),
      thinkingConfig: {
        ...(request.config?.thinkingConfig || {}),
        thinkingLevel: level
      }
    }
  }
}

export async function generateContentWithPolicy(
  input: PolicyGenerationRequest,
  runtime: PolicyGenerationRuntime = defaultRuntime
): Promise<any> {
  const decision = decideThinking(input.operation, input.signals)
  console.log(
    `[Thinking Policy] operation=${input.operation} level=${decision.level} reason=${decision.reason}`
  )
  try {
    return await runtime.generate(withThinkingLevel(input.request, decision.level))
  } catch (error: any) {
    if (decision.level !== ThinkingLevel.HIGH || !canFallbackFromHigh(error)) throw error
    console.warn(
      `[Thinking Policy] HIGH failed for ${input.operation}; retrying once with MINIMAL: ${error.message}`
    )
    return runtime.generate(withThinkingLevel(input.request, ThinkingLevel.MINIMAL))
  }
}
