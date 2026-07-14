import type { Category, Page } from './types'
import { canonicalWikilinkRegex, wikilinkMarkdown } from './wikilink'

export type BacklinkKind = 'body' | 'relation' | 'era-membership'

/** A derived inverse reference. It is never persisted alongside the Page. */
export interface Backlink {
  sourceSlug: string
  sourceTitle: string
  sourceCategory: Category
  kinds: BacklinkKind[]
  snippet: string
}

const CANONICAL_WIKILINK = canonicalWikilinkRegex('g')

function isEscaped(source: string, index: number): boolean {
  let slashes = 0
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === '\\'; cursor -= 1) slashes += 1
  return slashes % 2 === 1
}

/**
 * Masks Markdown code (fenced and inline), where wikilink-looking bytes are
 * literal text. Keeping offsets intact also makes snippets deterministic.
 */
function maskCode(source: string): string {
  // split('') preserves UTF-16 offsets used by regex match.index.
  const chars = source.split('')
  let fence: { marker: string; size: number } | undefined
  let offset = 0

  for (const line of source.split(/(?<=\n)/)) {
    const content = line.endsWith('\n') ? line.slice(0, -1) : line
    if (fence) {
      chars.fill(' ', offset, offset + content.length)
      const closingFence = new RegExp(`^ {0,3}\\${fence.marker}{${fence.size},}[ \\t]*$`)
      if (closingFence.test(content)) fence = undefined
    } else {
      const openingFence = /^ {0,3}(`{3,}|~{3,})/.exec(content)
      if (openingFence) {
        fence = { marker: openingFence[1][0], size: openingFence[1].length }
        chars.fill(' ', offset, offset + content.length)
      } else if (/^(?: {4}|\t)/.test(content)) {
        // CommonMark indented code block: wikilink-looking bytes stay literal.
        chars.fill(' ', offset, offset + content.length)
      }
    }
    offset += line.length
  }

  const withoutFences = chars.join('')
  for (let i = 0; i < withoutFences.length; i += 1) {
    if (withoutFences[i] !== '`' || isEscaped(withoutFences, i)) continue
    let size = 1
    while (withoutFences[i + size] === '`') size += 1
    const closing = withoutFences.indexOf('`'.repeat(size), i + size)
    if (closing === -1) continue
    chars.fill(' ', i, closing + size)
    i = closing + size - 1
  }
  return chars.join('')
}

/** Canonical Slugs in a body, deduplicated in first-appearance order. */
export function extractWikilinkSlugs(body: string): string[] {
  const searchable = maskCode(body)
  const slugs: string[] = []
  const seen = new Set<string>()
  for (const match of searchable.matchAll(CANONICAL_WIKILINK)) {
    if (match.index === undefined || isEscaped(body, match.index) || seen.has(match[1])) continue
    seen.add(match[1])
    slugs.push(match[1])
  }
  return slugs
}

function relationSlugs(page: Page): string[] {
  return page.customProperties.flatMap((property) =>
    property.type === 'relation' && Array.isArray(property.value) ? property.value : [],
  )
}

function titleizeSlug(slug: string): string {
  return slug
    .split('-')
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ')
}

function bodySnippet(body: string, targetSlug: string): string {
  const token = wikilinkMarkdown(targetSlug)
  const searchable = maskCode(body)
  let index = searchable.indexOf(token)
  while (index !== -1 && isEscaped(body, index)) index = searchable.indexOf(token, index + token.length)
  if (index === -1) return ''
  const start = Math.max(0, index - 70)
  const end = Math.min(body.length, index + token.length + 90)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < body.length ? '…' : ''
  return `${prefix}${body.slice(start, end)}${suffix}`
    .replace(canonicalWikilinkRegex('g'), (_, slug: string) => titleizeSlug(slug))
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Builds the inverse index from Markdown bodies, Relation values and (for an
 * Era target) Page era membership. Multiple edges collapse into one source.
 */
export function deriveBacklinks(pages: Page[], targetSlug: string): Backlink[] {
  const target = pages.find((page) => page.slug === targetSlug)
  const backlinks: Backlink[] = []

  for (const source of pages) {
    const kinds: BacklinkKind[] = []
    if (extractWikilinkSlugs(source.body).includes(targetSlug)) kinds.push('body')
    if (relationSlugs(source).includes(targetSlug)) kinds.push('relation')
    if (target?.category === 'eras' && source.eras.includes(targetSlug)) kinds.push('era-membership')
    if (kinds.length === 0) continue

    const relationLabels = source.customProperties
      .filter(
        (property) =>
          property.type === 'relation' && Array.isArray(property.value) && property.value.includes(targetSlug),
      )
      .map((property) => property.label)
    const snippet = kinds.includes('body')
      ? bodySnippet(source.body, targetSlug)
      : kinds.includes('era-membership')
        ? `Member of ${target?.title ?? titleizeSlug(targetSlug)}`
        : `Relation: ${relationLabels.join(', ')}`

    backlinks.push({
      sourceSlug: source.slug,
      sourceTitle: source.title,
      sourceCategory: source.category,
      kinds,
      snippet,
    })
  }

  return backlinks.sort(
    (a, b) => a.sourceCategory.localeCompare(b.sourceCategory) || a.sourceTitle.localeCompare(b.sourceTitle),
  )
}
