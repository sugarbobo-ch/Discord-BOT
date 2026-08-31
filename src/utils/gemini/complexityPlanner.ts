import { getResponseText } from './core'
import {
  generateContentWithPolicy,
  type PolicyGenerationRuntime
} from './thinkingPolicy'

export interface ConversationComplexityAssessment {
  complexity: 'simple' | 'complex'
  needsMultipleSources: boolean
  reasonCategory: string
}

const PLANNER_FALLBACK: ConversationComplexityAssessment = {
  complexity: 'simple',
  needsMultipleSources: false,
  reasonCategory: 'planner_fallback'
}

export async function assessConversationComplexity(
  prompt: string,
  runtime?: PolicyGenerationRuntime
): Promise<ConversationComplexityAssessment> {
  try {
    const response = await generateContentWithPolicy(
      {
        operation: 'classification',
        request: {
          contents: [
            {
              text:
                '依使用者完整語意評估回答所需的推理深度，不得使用關鍵詞表。' +
                'simple 表示閒聊、翻譯、改寫、單一查值或可直接回答的穩定知識；' +
                'complex 表示需要多步推理、比較權衡、多來源整合、矛盾消解、長篇分析或高風險判斷。' +
                '只輸出 JSON：{"complexity":"simple|complex","needsMultipleSources":true|false,"reasonCategory":"簡短分類"}'
            },
            { text: `使用者訊息：${prompt}` }
          ],
          config: { responseMimeType: 'application/json' }
        }
      },
      runtime
    )
    const parsed = JSON.parse(getResponseText(response))
    if (parsed.complexity !== 'simple' && parsed.complexity !== 'complex') {
      return PLANNER_FALLBACK
    }
    return {
      complexity: parsed.complexity,
      needsMultipleSources: parsed.needsMultipleSources === true,
      reasonCategory:
        typeof parsed.reasonCategory === 'string' && parsed.reasonCategory.trim()
          ? parsed.reasonCategory.trim()
          : 'unspecified'
    }
  } catch (error: any) {
    console.warn('[Complexity Planner Failed]:', error.message)
    return PLANNER_FALLBACK
  }
}
