import type { World } from '../domain/types'
import { fuzzyMatch } from './spotlightSearch'

export interface WorldSearchResult {
  slug: string
  /** The World name — the highlight target. */
  title: string
  logline: string
  score: number
  /** Match positions into `title`; empty when only the logline matched. */
  matchIndices: number[]
}

/**
 * Fuzzy-searches Worlds only — the Worlds-page counterpart to `searchSpotlight`.
 * A name hit outranks a logline-only hit (the +100 floor) so the thing you
 * typed the title of surfaces first; an empty query lists every World, ordered
 * by name, so the spotlight doubles as a launcher.
 */
export function searchWorlds(query: string, worlds: readonly World[]): WorldSearchResult[] {
  const needle = query.trim().toLocaleLowerCase()
  return worlds
    .flatMap<WorldSearchResult>((world) => {
      // Fuzzy-match the name (short, so subsequence matching reads well and
      // drives the highlight). The logline is prose — a subsequence match there
      // is far too loose for phrase queries, so it stays a literal contains.
      const nameMatch = fuzzyMatch(world.name, query)
      if (nameMatch) {
        return [{ slug: world.slug, title: world.name, logline: world.logline, score: nameMatch.score + 100, matchIndices: nameMatch.indices }]
      }
      if (needle !== '' && world.logline.toLocaleLowerCase().includes(needle)) {
        return [{ slug: world.slug, title: world.name, logline: world.logline, score: 1, matchIndices: [] }]
      }
      return []
    })
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
}
