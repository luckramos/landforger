import type { JSONContent } from '@tiptap/core'

/**
 * The seam between a Page's Markdown body (the file's source of truth) and
 * the editor's tiptap JSON document. Every read/write of a Page's rich-text
 * body should go through an implementation of this interface — never call
 * `@tiptap/markdown` (or any future replacement) directly outside one.
 *
 * Kept swappable on purpose: the tiptap-research spike flagged
 * `@tiptap/markdown` as an early-release package, so a `prosemirror-markdown`
 * or hand-rolled remark implementation should be a drop-in replacement behind
 * this interface if the beta ever disappoints (docs/research/tiptap-research.md §2.2).
 */
export interface PageBodyCodec {
  /** Markdown body -> tiptap JSON. Unknown/disabled tokens must degrade to plain text, never vanish. */
  parse(markdown: string): JSONContent
  /** tiptap JSON -> Markdown body, in the codec's canonical form (e.g. `:::` callouts, `[[slug]]` wikilinks). */
  serialize(doc: JSONContent): string
}
