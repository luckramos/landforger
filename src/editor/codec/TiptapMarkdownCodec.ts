// PageBodyCodec over @tiptap/markdown's MarkdownManager, used fully headless
// (no Editor, no DOM). Ported from the validated spike
// (landforger-spike/prototype-tiptap-spike/src/codec.ts).
//
// GFM is ON so standard pipe tables tokenize and round-trip through the Table
// extension (its own tokenizer only supplements tables that contain code-span
// pipes; plain tables rely on marked's GFM table block). Task-list syntax does
// not need GFM — @tiptap/markdown detects `- [ ]` items itself — but strike
// (`~~…~~`) does, so this also makes strikethrough round-trip on parse.
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
      markedOptions: { gfm: true },
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
