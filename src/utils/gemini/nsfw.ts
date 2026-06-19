import { ThinkingLevel } from '@google/genai'
import { executeGenAI, getApiKey, getResponseText, MODEL_NAME } from './core'

/**
 * 檢查圖片是否包含 NSFW 內容 (使用 Gemini Multimodal)
 */
export const checkImageNSFW = async (
  imageBuffer: Buffer,
  mimeType: string
): Promise<{ nsfw: boolean; reason: string }> => {
  const apiKey = getApiKey()
  if (!apiKey) {
    console.warn('Gemini API key not configured. Skipping NSFW check.')
    return { nsfw: false, reason: 'Gemini API key 未設定' }
  }

  const base64Image = imageBuffer.toString('base64')

  try {
    const response = await executeGenAI(ai =>
      ai.models.generateContent({
        model: MODEL_NAME,
        contents: [
          {
            inlineData: {
              mimeType,
              data: base64Image
            }
          },
          {
            text:
              '請分析這張圖片是否包含 NSFW (露骨色情、完全裸露如露點或露生殖器、顯著且露骨的性交暗示、極度暴力血腥) 內容。' +
              '請以一般動漫社群的大眾標準評估，對於一般的動漫插畫、Cosplay 照、泳裝、或無露點的稍微性感/暗示性插圖，只要沒有露點或露出生殖器，且無露骨的性交或生殖器動作描繪，請判定為非 NSFW (即 "nsfw": false)。' +
              '請只回覆一個 JSON 格式的物件，格式如下：' +
              '{"nsfw": true/false, "reason": "簡短的繁體中文原因"}'
          }
        ],
        config: {
          responseMimeType: 'application/json',
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.MINIMAL
          }
        }
      })
    )

    const resultText = getResponseText(response)
    if (resultText) {
      const result = JSON.parse(resultText)
      return {
        nsfw: !!result.nsfw,
        reason: result.reason || ''
      }
    } else {
      const candidate = response?.candidates?.[0]
      console.warn(
        `[Gemini NSFW Check Empty Response]\n` +
          `- Finish Reason: ${candidate?.finishReason || 'UNKNOWN'}\n` +
          `- Full Response: ${JSON.stringify(response || {})}`
      )
    }
  } catch (error: any) {
    console.error('Gemini NSFW Check Error:', error.message)
    // 若被安全機制阻擋，直接視為 NSFW 內容
    if (
      error.message?.includes('SAFETY') ||
      error.status === 400 ||
      error.response?.status === 400
    ) {
      return { nsfw: true, reason: '圖片因安全機制或格式被過濾' }
    }
  }
  return { nsfw: false, reason: '無法判定或連線超時' }
}
