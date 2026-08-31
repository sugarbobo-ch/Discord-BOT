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

function cleanTitle(value: string): string {
  return value.replace(/[\[\]\r\n]/g, ' ').replace(/\s+/g, ' ').trim()
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
        title: cleanTitle(chunk.web.title || '') || rawUrl,
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
  const rendered = sources.map(source => `- [${source.title}](${source.url})`).join('\n')
  return `${reply}\n\n**來源**\n${rendered}`
}
