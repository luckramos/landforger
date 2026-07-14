// Wikilink — an inline reference to a Page by Slug (CONTEXT.md — "Wikilink"),
// ported from the validated spike. Mention extended: the node keeps `id` (the
// Slug); the label attr is never displayed and never serialized. The markdown
// spec is overridden per ADR 0001 to `[[slug]]` instead of Mention's default
// `[mention id="…" label="…"]` shortcode, so files stay portable and
// canonical-by-slug — renames rewrite nothing.
//
// This registers the node for rendering and serialization only. The `@` and
// `[[` suggestion menus that insert wikilinks are issue #21's slice.

import type { JSONContent, MarkdownToken } from '@tiptap/core'
import Mention, { type MentionOptions } from '@tiptap/extension-mention'
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react'
import styles from './WikiLink.module.css'

export interface WikiLinkOptions extends MentionOptions {
  /**
   * Looks up the LIVE title for a Slug at render time — titles are never
   * baked into the Markdown file (ADR 0001). Returning `undefined` marks the
   * Slug as unresolved (a Ghost link): the chip renders `[[slug]]` in the
   * ghost style.
   */
  resolveTitle: (slug: string) => string | undefined
}

interface WikiLinkToken extends MarkdownToken {
  slug: string
}

/** The chip: live title looked up by Slug; ghost style when the Slug doesn't resolve. */
function WikiLinkChip({ node, extension }: NodeViewProps) {
  const slug: string = node.attrs.id ?? ''
  const title = (extension.options as WikiLinkOptions).resolveTitle(slug)
  const ghost = title === undefined
  return (
    <NodeViewWrapper
      as="span"
      className={ghost ? `${styles.chip} ${styles.ghost}` : styles.chip}
      data-wikilink={slug}
      title={`[[${slug}]]`}
    >
      {ghost ? `[[${slug}]]` : title}
    </NodeViewWrapper>
  )
}

export const WikiLink = Mention.extend<WikiLinkOptions>({
  name: 'wikilink',

  addOptions() {
    return {
      ...this.parent?.(),
      resolveTitle: () => undefined,
    } as WikiLinkOptions
  },

  // -- markdown overrides (replace Mention's inherited createInlineMarkdownSpec) --
  markdownTokenName: 'wikilink',

  markdownTokenizer: {
    name: 'wikilink',
    level: 'inline' as const,
    start: (src: string) => src.indexOf('[['),
    tokenize(src: string): WikiLinkToken | undefined {
      const match = /^\[\[([a-z0-9]+(?:-[a-z0-9]+)*)\]\]/.exec(src)
      if (!match) return undefined
      return { type: 'wikilink', raw: match[0], slug: match[1] }
    },
  },

  parseMarkdown(token: MarkdownToken): JSONContent {
    return { type: 'wikilink', attrs: { id: (token as WikiLinkToken).slug } }
  },

  renderMarkdown(node: JSONContent): string {
    return `[[${node.attrs?.id ?? ''}]]`
  },

  addNodeView() {
    return ReactNodeViewRenderer(WikiLinkChip)
  },
})
