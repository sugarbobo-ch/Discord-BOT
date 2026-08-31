import { describe, expect, test } from 'vitest'
import {
  appendGoogleSearchSources,
  extractGoogleSearchSources
} from '../../src/utils/gemini/searchGrounding'

describe('Google Search grounding sources', () => {
  const response = {
    candidates: [
      {
        groundingMetadata: {
          groundingChunks: [
            { web: { title: '官方來源', uri: 'https://example.com/official' } },
            { web: { title: '重複來源', uri: 'https://example.com/official' } },
            { web: { title: '第二來源', uri: 'https://example.com/second' } }
          ]
        }
      }
    ]
  }

  test('extracts and deduplicates sources returned by the search tool', () => {
    expect(extractGoogleSearchSources(response)).toEqual([
      { title: '官方來源', url: 'https://example.com/official' },
      { title: '第二來源', url: 'https://example.com/second' }
    ])
  })

  test('renders clickable sources only when search was actually grounded', () => {
    expect(appendGoogleSearchSources('回答內容', response)).toContain(
      '[官方來源](https://example.com/official)'
    )
    expect(appendGoogleSearchSources('回答內容', { candidates: [] })).toBe('回答內容')
  })
})
