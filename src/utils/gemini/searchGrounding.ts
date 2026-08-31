export interface GoogleSearchSource {
  title: string
  url: string
}

function isSafeWebUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function cleanTitle(value: string, rawUrl?: string): string {
  const cleaned = value.replace(/[\[\]\r\n]/g, ' ').replace(/\s+/g, ' ').trim()
  if (cleaned && !cleaned.startsWith('http')) return cleaned
  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl)
      return parsed.hostname.replace(/^www\./, '')
    } catch {}
  }
  return cleaned || '資料來源'
}

export function extractGoogleSearchSources(response: any): GoogleSearchSource[] {
  const sources: GoogleSearchSource[] = []
  const seenUrls = new Set<string>()
  for (const candidate of response?.candidates || []) {
    for (const chunk of candidate?.groundingMetadata?.groundingChunks || []) {
      const rawUrl = chunk?.web?.uri?.trim()
      if (!rawUrl || !isSafeWebUrl(rawUrl) || seenUrls.has(rawUrl)) continue
      seenUrls.add(rawUrl)
      sources.push({
        title: cleanTitle(chunk.web.title || '', rawUrl),
        url: rawUrl
      })
    }
  }
  return sources
}

export function appendGoogleSearchSources(
  reply: string,
  response: any,
  maxSources = 5
): string {
  const sources = extractGoogleSearchSources(response).slice(0, maxSources)
  if (sources.length === 0) return reply

  // 避免重複附加已經在回答中引用過的來源網址
  const unreferencedSources = sources.filter(s => !reply.includes(s.url))
  if (unreferencedSources.length === 0) return reply

  const rendered = unreferencedSources.map(source => `- [${source.title}](${source.url})`).join('\n')
  return `${reply}\n\n**來源**\n${rendered}`
}
