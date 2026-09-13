/**
 * 靜態檢查是否應跳過錯字偵測 (排除程式碼、網址、引用區塊、提及等場合)
 */
export const shouldSkipTypoCheck = (content: string, typo: string): boolean => {
  let cleanText = content

  // 1. 移除 Code Blocks / Inline Code
  cleanText = cleanText.replace(/```[\s\S]*?```/g, '')
  cleanText = cleanText.replace(/`[^`\n]+`/g, '')

  // 2. 移除 URLs
  cleanText = cleanText.replace(/https?:\/\/[^\s]+/g, '')

  // 3. 移除 Quote Lines (以 > 開頭的行)
  const lines = cleanText.split('\n')
  const nonQuoteLines = lines.filter(line => !line.trimStart().startsWith('>'))
  cleanText = nonQuoteLines.join('\n')

  // 4. 移除 Discord 特殊格式 (Mentions, Emojis, Channels, Roles)
  cleanText = cleanText.replace(/<:[a-zA-Z0-9_]+:[0-9]+>/g, '')
  cleanText = cleanText.replace(/<@[!&]?[0-9]+>/g, '')
  cleanText = cleanText.replace(/<#[0-9]+>/g, '')

  // 如果清除特殊格式後，不再包含該錯字，則跳過
  if (!cleanText.includes(typo)) {
    return true
  }

  return false
}

/**
 * 針對「因該」的嚴格本地啟發式檢查，避免誤判「因為該...」或討論錯字等情況。
 */
export const isStrictLocalTypoCheck = (content: string): boolean => {
  // 排除「因為該...」、「是因為該...」
  if (content.includes('因為該') || content.includes('是因為該')) {
    return false
  }

  // 排除討論/引述錯字的情況
  const discussPatterns = [
    /[「"']?因該[」"']?是(錯字|打錯|不是)/,
    /[「"']?應該[」"']?[打寫]成[「"']?因該/,
    /打成[「"']?因該/
  ]
  if (discussPatterns.some(pattern => pattern.test(content))) {
    return false
  }

  // 排除「因該」後接量詞或名詞的情況，例如「因該字」、「因該案」、「因該公司」
  const classifierPattern = /因該[字案項條款人國省市縣區公司行號群地廠校車員貨物事法規點線面段]/
  if (classifierPattern.test(content)) {
    return false
  }

  // 排除後接英數字的情形
  if (/因該[a-zA-Z0-9]/.test(content)) {
    return false
  }

  return true
}

export interface LocalTypoMatch {
  typo: string
  correction: string
}

const LOCAL_TYPO_RULES: Array<LocalTypoMatch & { matches: (content: string) => boolean }> = [
  {
    typo: '因該',
    correction: '應該',
    matches: content => content.includes('因該') && isStrictLocalTypoCheck(content)
  },
  {
    typo: '以經',
    correction: '已經',
    matches: content => content.includes('以經') && !/以經(?:濟|營|商|費|典|緯|歷)/.test(content)
  },
  {
    typo: '絕得',
    correction: '覺得',
    matches: content => content.includes('絕得')
  },
  {
    typo: '部會',
    correction: '不會',
    matches: content =>
      content.includes('部會') &&
      !/(?:政府|行政院|中央|地方|各|相關|主管|所屬|跨)部會/.test(content)
  },
  {
    typo: '在一次',
    correction: '再一次',
    matches: content =>
      content.includes('在一次') &&
      !/在一次(?:事故|意外|會議|活動|比賽|選舉|調查|訪談|行動|實驗|經驗|過程|中)/.test(content)
  }
]

/** Find the first common typo that can be corrected safely without an AI call. */
export const findLocalTypo = (content: string): LocalTypoMatch | null => {
  for (const rule of LOCAL_TYPO_RULES) {
    if (shouldSkipTypoCheck(content, rule.typo) || !rule.matches(content)) continue
    return { typo: rule.typo, correction: rule.correction }
  }
  return null
}
