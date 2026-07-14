// PageBodyCodec over @tiptap/markdown's MarkdownManager, used fully headless
// (no Editor, no DOM). Ported from the validated spike
// (landforger-spike/prototype-tiptap-spike/src/codec.ts).
//
// GFM is OFF (markedOptions.gfm = false): no v1 Table block, so pipe tables
// degrade to plain paragraphs on parse. Task-list syntax does NOT need
// marked's GFM — @tiptap/markdown detects `- [ ]` items itself via its
// isTaskItem helper on the raw list item, so To-do round-trips with gfm off
// (asserted in src/editor/__tests__/codec.test.ts).
//
// The registered extension set always includes the CodeFenceAsText guard
// (unless explicitly disabled for the regression test): unknown/disabled
// tokens degrade to plain text, never vanish.

import type { JSONContent } from '@tiptap/core'
import { MarkdownManager } from '@tiptap/markdown'
import { buildBlockExtensions } from '../extensions'
import type { PageBodyCodec } from './PageBodyCodec'

export interface TiptapMarkdownCodecOptions {
  /** Test-only escape hatch — see `BlockExtensionOptions.codeFenceGuard`. */
  codeFenceGuard?: boolean
}

export class TiptapMarkdownCodec implements PageBodyCodec {
  private readonly manager: MarkdownManager

  constructor(opts: TiptapMarkdownCodecOptions = {}) {
    this.manager = new MarkdownManager({
      extensions: buildBlockExtensions(opts),
      markedOptions: { gfm: false },
    })
  }

  parse(markdown: string): JSONContent {
    return this.manager.parse(markdown)
  }

  serialize(doc: JSONContent): string {
    return this.manager.serialize(doc)
  }
}

/** The app's shared codec instance — parsing and serialization are stateless. */
export const pageBodyCodec: PageBodyCodec = new TiptapMarkdownCodec()
