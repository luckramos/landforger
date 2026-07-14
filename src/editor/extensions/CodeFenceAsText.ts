// Parse-side degradation guard, ported from the validated spike. With
// `codeBlock` disabled (no Code block in v1), `@tiptap/markdown` has NO
// handler for marked's `code` token and its fallback parser returns `null`
// — a fenced code block is silently DROPPED on load (verified against
// `@tiptap/markdown`'s `parseFallbackToken`; see
// docs/research/tiptap-research.md §2.2 risk 1 and the spike's README
// finding #2). This extension registers a handler for that token so a
// hostile/hand-written fence degrades to a plain paragraph of literal text
// instead of vanishing — the same "unknown/disabled tokens degrade to text,
// never vanish" guarantee generalizes to any future disabled/unknown token
// that needs one.

import { Extension } from '@tiptap/core'
import type { JSONContent } from '@tiptap/core'

interface MarkedCodeToken {
  raw?: string
  text?: string
}

export const CodeFenceAsText = Extension.create({
  name: 'codeFenceAsText',
  markdownTokenName: 'code',
  parseMarkdown(token: MarkedCodeToken): JSONContent {
    const text = (token.raw ?? token.text ?? '').replace(/\n+$/, '')
    return { type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }
  },
})
