/** The one canonical Slug grammar shared by editor Markdown and derived indexes. */
export const WIKILINK_SLUG_SOURCE = '[a-z0-9]+(?:-[a-z0-9]+)*'

export function canonicalWikilinkRegex(flags = '', anchored = false): RegExp {
  return new RegExp(`${anchored ? '^' : ''}\\[\\[(${WIKILINK_SLUG_SOURCE})\\]\\]`, flags)
}

export function wikilinkMarkdown(slug: string): string {
  return `[[${slug}]]`
}
