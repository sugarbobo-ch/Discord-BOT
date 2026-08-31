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
  maxSources = 3
): string {
  const sources = extractGoogleSearchSources(response).slice(0, maxSources)
  if (sources.length === 0) return reply

  // 避免重複附加已經在回答中引用過的來源網址
  const unreferencedSources = sources.filter(s => !reply.includes(s.url))
  if (unreferencedSources.length === 0) return reply

  const renderedLines: string[] = []
  let currentLen = reply.length + '\n\n**來源**\n'.length

  for (const source of unreferencedSources) {
    const fullLine = `- [${source.title}](${source.url})`
    if (currentLen + fullLine.length + 1 <= 1900) {
      renderedLines.push(fullLine)
      currentLen += fullLine.length + 1
    } else {
      const shortLine = `- ${source.title}`
      if (currentLen + shortLine.length + 1 <= 1900) {
        renderedLines.push(shortLine)
        currentLen += shortLine.length + 1
      }
    }
  }

  if (renderedLines.length === 0) return reply
  return `${reply}\n\n**來源**\n${renderedLines.join('\n')}`
}
