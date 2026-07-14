import { describe, expect, it } from 'vitest'
import type { Page } from '../../domain/types'
import { CATEGORY_META } from '../../screens/Dashboard/categoryMeta'
import { fuzzyMatch, searchSpotlight } from '../spotlightSearch'

const page = (slug: string, title: string, category: Page['category'], summary = ''): Page => ({
  slug,
  title,
  category,
  summary,
  tags: [],
  eras: [],
  created: '2026-01-01T00:00:00.000Z',
  updated: '2026-01-01T00:00:00.000Z',
  customProperties: [],
  body: '',
})

describe('fuzzyMatch', () => {
  it('scores ordered per-character matches and returns the exact highlight positions', () => {
    expect(fuzzyMatch('Salt & Cinder', 'sci')).toEqual({ score: 10, indices: [0, 7, 8] })
    expect(fuzzyMatch('Salt & Cinder', 'cind')).toEqual({ score: 16, indices: [7, 8, 9, 10] })
  })

  it('rejects missing or out-of-order characters', () => {
    expect(fuzzyMatch('Sera Valen', 'rs')).toBeNull()
    expect(fuzzyMatch('Sera Valen', 'xyz')).toBeNull()
  })

  it('keeps match indices aligned with original Unicode characters', () => {
    expect(fuzzyMatch('İstanbul', 's')).toEqual({ score: 1, indices: [1] })
    expect(fuzzyMatch('🙂Atlas', 'a')).toEqual({ score: 1, indices: [1] })
  })
})

describe('searchSpotlight', () => {
  it('ranks Pages and Categories together by fuzzy score', () => {
    const results = searchSpotlight(
      'char',
      [page('cinder-harbor', 'Cinder Harbor', 'locations')],
      CATEGORY_META,
    )

    expect(results.map(({ kind, title, matchIndices }) => ({ kind, title, matchIndices }))).toEqual([
      { kind: 'category', title: 'Characters', matchIndices: [0, 1, 2, 3] },
      { kind: 'page', title: 'Cinder Harbor', matchIndices: [0, 7, 8, 9] },
    ])
  })

  it('returns the live World inventory when the query is blank', () => {
    const results = searchSpotlight('', [page('sera', 'Sera Valen', 'characters')], CATEGORY_META)

    expect(results.some((result) => result.kind === 'page' && result.slug === 'sera')).toBe(true)
    expect(results.filter((result) => result.kind === 'category')).toHaveLength(7)
  })
})
