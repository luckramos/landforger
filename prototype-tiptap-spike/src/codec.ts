// PageBodyCodec spike: MD body <-> tiptap JSON via @tiptap/markdown's
// MarkdownManager, used fully headless (no Editor, no DOM).
//
// Verified against installed source (@tiptap/markdown 3.27.4,
// dist/index.js): the MarkdownManager constructor flattens + priority-sorts
// the extensions itself and registers markdownTokenizer / parseMarkdown /
// renderMarkdown read from top-level extension config fields.
//
// GFM is OFF (markedOptions.gfm = false): no v1 Table block, pipe tables
// degrade to plain paragraphs. Task-list syntax does NOT need marked's GFM —
// @tiptap/markdown detects `- [ ]` items itself via its isTaskItem helper on
// the raw list item (dist/index.js, parseListToken), so To-do round-trips
// with gfm off. (Assert in checks.)

import type { JSONContent } from '@tiptap/core'
import { MarkdownManager } from '@tiptap/markdown'
import { buildBlockExtensions } from './extensions'

export function createManager(opts: { codeFenceGuard?: boolean } = {}): MarkdownManager {
  return new MarkdownManager({
    extensions: buildBlockExtensions(opts),
    markedOptions: { gfm: false },
  })
}

const manager = createManager()

export function parseMd(md: string): JSONContent {
  return manager.parse(md)
}

export function serializeMd(json: JSONContent): string {
  return manager.serialize(json)
}
