import type { Category, Page } from '../domain/types'

export interface FuzzyMatch {
  score: number
  indices: number[]
}

export interface SearchableCategory {
  category: Category
  label: string
}

interface SpotlightResultBase {
  title: string
  score: number
  matchIndices: number[]
}

export interface SpotlightPageResult extends SpotlightResultBase {
  kind: 'page'
  slug: string
  category: Category
  summary: string
}

export interface SpotlightCategoryResult extends SpotlightResultBase {
  kind: 'category'
  category: Category
}

export type SpotlightResult = SpotlightPageResult | SpotlightCategoryResult

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/** The shared character boundary for matching and rendering highlights. */
export function splitGraphemes(value: string): string[] {
  return Array.from(graphemeSegmenter.segment(value), ({ segment }) => segment)
}

/**
 * Matches query characters in order. Every match is worth one point; the
 * design adds four for a consecutive run and three when the query starts at
 * the start of the candidate. Returned indices are the highlight source of
 * truth, so rendering can never disagree with ranking.
 */
export function fuzzyMatch(candidate: string, rawQuery: string): FuzzyMatch | null {
  const queryCharacters = splitGraphemes(rawQuery.trim()).map((character) => character.toLocaleLowerCase())
  if (queryCharacters.length === 0) return { score: 0, indices: [] }

  const candidateCharacters = splitGraphemes(candidate).map((character) => character.toLocaleLowerCase())
  const indices: number[] = []
  let previousIndex = -1
  let score = 0

  for (const character of queryCharacters) {
    let index = -1
    for (let candidateIndex = previousIndex + 1; candidateIndex < candidateCharacters.length; candidateIndex += 1) {
      if (candidateCharacters[candidateIndex].startsWith(character)) {
        index = candidateIndex
        break
      }
    }
    if (index === -1) return null

    score += 1
    if (indices.length > 0 && index === previousIndex + 1) score += 4
    if (indices.length === 0 && index === 0) score += 3
    indices.push(index)
    previousIndex = index
  }

  return { score, indices }
}

export function searchSpotlight(
  query: string,
  pages: readonly Page[],
  categories: readonly SearchableCategory[],
): SpotlightResult[] {
  const pageResults = pages.flatMap<SpotlightPageResult>((page) => {
    const match = fuzzyMatch(page.title, query)
    return match
      ? [{
          kind: 'page',
          slug: page.slug,
          category: page.category,
          title: page.title,
          summary: page.summary,
          score: match.score,
          matchIndices: match.indices,
        }]
      : []
  })

  const categoryResults = categories.flatMap<SpotlightCategoryResult>((item) => {
    const match = fuzzyMatch(item.label, query)
    return match
      ? [{
          kind: 'category',
          category: item.category,
          title: item.label,
          score: match.score,
          matchIndices: match.indices,
        }]
      : []
  })

  return [...pageResults, ...categoryResults].sort(
    (left, right) => right.score - left.score || left.title.localeCompare(right.title),
  )
}
