// Wikilink — an inline reference to a Page by Slug (CONTEXT.md — "Wikilink"),
// ported from the validated spike. Mention extended: the node keeps `id` (the
// Slug); the label attr is never displayed and never serialized. The markdown
// spec is overridden per ADR 0001 to `[[slug]]` instead of Mention's default
// `[mention id="…" label="…"]` shortcode, so files stay portable and
// canonical-by-slug — renames rewrite nothing.
//
// The `@` and `[[` suggestion plugins share this node while keeping separate
// plugin keys, so their query state and undo history remain independent.

import type { JSONContent, MarkdownToken } from '@tiptap/core'
import Mention, { type MentionOptions } from '@tiptap/extension-mention'
import { PluginKey } from '@tiptap/pm/state'
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react'
import { useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties } from 'react'
import { WikiLinkRegistry, type WikiLinkPage } from '../WikiLinkRegistry'
import { canonicalWikilinkRegex, wikilinkMarkdown } from '../../domain/wikilink'
import { categoryMeta } from '../../screens/Dashboard/categoryMeta'
import { categoryIcons } from '../../icons'
import { suggestionMenuRenderer, type SuggestionMenuItem } from './SuggestionMenu'
import styles from './WikiLink.module.css'

interface WikiLinkSuggestionItem extends WikiLinkPage, SuggestionMenuItem {}

export const wikiLinkAtPluginKey = new PluginKey('wikilink-at')
export const wikiLinkBracketsPluginKey = new PluginKey('wikilink-brackets')

export interface WikiLinkOptions extends MentionOptions<WikiLinkSuggestionItem> {
  /**
   * Looks up the LIVE title for a Slug at render time — titles are never
   * baked into the Markdown file (ADR 0001). Returning `undefined` marks the
   * Slug as unresolved (a Ghost link): the chip renders `[[slug]]` in the
   * ghost style.
   */
  resolveTitle: (slug: string) => string | undefined
  registry: WikiLinkRegistry
  onNavigate: (slug: string) => void
}

interface WikiLinkToken extends MarkdownToken {
  slug: string
}

const WIKILINK_AT_START = canonicalWikilinkRegex('', true)

/** The chip: live title looked up by Slug; ghost style when the Slug doesn't resolve. */
function WikiLinkChip({ node, extension }: NodeViewProps) {
  const slug: string = node.attrs.id ?? ''
  const options = extension.options as WikiLinkOptions
  const revision = useSyncExternalStore(
    options.registry.subscribe,
    options.registry.getRevision,
    options.registry.getRevision,
  )
  void revision
  const page = options.registry.get(slug)
  // `meta` and `chipCatStyle` stay in sync: Category is a closed 7-value union
  // and CATEGORY_META + the --cat-* tokens all cover the same 7, so a resolved
  // page always yields a meta and a --chip-cat.
  const meta = page ? categoryMeta(page.category) : undefined
  const chipCatStyle: CSSProperties | undefined = page
    ? ({ '--chip-cat': `var(--cat-${page.category})` } as CSSProperties)
    : undefined
  const title = page?.title ?? options.resolveTitle(slug)
  const ghost = title === undefined
  const chipRef = useRef<HTMLElement | null>(null)
  const previewRef = useRef<HTMLElement | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [preview, setPreview] = useState<{ left: number; top: number; positioned: boolean }>({
    left: 8,
    top: 8,
    positioned: false,
  })

  const positionPreview = useCallback(() => {
    const chip = chipRef.current
    const card = previewRef.current
    if (!chip || !card) return
    const rect = chip.getBoundingClientRect()
    const { width, height } = card.getBoundingClientRect()
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
    const below = rect.bottom + 10
    // Prefer below the chip; flip above only when it would overflow.
    const top = below + height > window.innerHeight - 8
      ? Math.max(8, rect.top - height - 10)
      : below
    setPreview({ left, top, positioned: true })
  }, [])

  useLayoutEffect(() => {
    if (!previewOpen || !page) return
    positionPreview()
    window.addEventListener('resize', positionPreview)
    window.addEventListener('scroll', positionPreview, true)
    return () => {
      window.removeEventListener('resize', positionPreview)
      window.removeEventListener('scroll', positionPreview, true)
    }
  }, [page, positionPreview, previewOpen])

  const navigate = () => options.onNavigate(slug)
  return (
    <NodeViewWrapper
      as="span"
      ref={chipRef}
      className={ghost ? `${styles.chip} ${styles.ghost}` : styles.chip}
      style={chipCatStyle}
      data-wikilink={slug}
      title={wikilinkMarkdown(slug)}
      role="link"
      tabIndex={0}
      onMouseEnter={() => {
        if (!page) return
        setPreview((current) => ({ ...current, positioned: false }))
        setPreviewOpen(true)
      }}
      onMouseLeave={() => setPreviewOpen(false)}
      onClick={navigate}
      onKeyDown={(event: React.KeyboardEvent) => {
        if (event.key === 'Enter') navigate()
      }}
    >
      {meta && (
        <span className={styles.categoryIcon} aria-hidden="true">
          <meta.icon size={14} />
        </span>
      )}
      {ghost ? wikilinkMarkdown(slug) : title}
      {/* Portaled to <body>: the card is `position: fixed`, and the Page/route
          entrance animations transform its ancestors — a transformed ancestor
          becomes the containing block and would re-anchor the card far from
          the chip. On <body> it stays pinned to the measured chip rect.
          It also keeps this card out of the DOM ProseMirror manages. */}
      {previewOpen && page && createPortal(
        <span
          ref={previewRef}
          role="tooltip"
          className={styles.preview}
          style={{
            left: preview.left,
            top: preview.top,
            visibility: preview.positioned ? 'visible' : 'hidden',
            '--chip-cat': `var(--cat-${page.category})`,
          } as CSSProperties}
          data-preview-category={page.category}
        >
          <span className={styles.previewCategory}>
            {meta && <meta.icon size={13} />}
            {page.category}
          </span>
          <strong className={styles.previewTitle}>{page.title}</strong>
          {page.summary && <span className={styles.previewSummary}>{page.summary}</span>}
          {page.tags.length > 0 && (
            <span className={styles.previewTags}>
              {page.tags.map((tag) => <span key={tag}>{tag}</span>)}
            </span>
          )}
        </span>,
        document.body,
      )}
    </NodeViewWrapper>
  )
}

function wikiLinkSuggestion(
  char: '@' | '[[',
  pluginKey: PluginKey,
  registry: WikiLinkRegistry,
) {
  return {
    char,
    pluginKey,
    allowedPrefixes: char === '[[' ? null : [' ', '\n'],
    items: ({ query }: { query: string }) =>
      registry.search(query).map((page): WikiLinkSuggestionItem => ({
        ...page,
        id: page.slug,
        label: page.title,
        description: page.category,
        icon: categoryIcons[page.category],
        accent: `var(--cat-${page.category})`,
      })),
    render: suggestionMenuRenderer<WikiLinkSuggestionItem>(`Pages (${char})`),
    placement: 'bottom-start' as const,
    offset: { mainAxis: 7, crossAxis: 0 },
  }
}

export function buildWikiLinkSuggestions(registry: WikiLinkRegistry) {
  return [
    wikiLinkSuggestion('@', wikiLinkAtPluginKey, registry),
    wikiLinkSuggestion('[[', wikiLinkBracketsPluginKey, registry),
  ]
}

export const WikiLink = Mention.extend<WikiLinkOptions>({
  name: 'wikilink',

  addOptions() {
    return {
      ...this.parent?.(),
      resolveTitle: () => undefined,
      registry: new WikiLinkRegistry(),
      onNavigate: () => undefined,
      suggestions: [],
    } as WikiLinkOptions
  },

  // -- markdown overrides (replace Mention's inherited createInlineMarkdownSpec) --
  markdownTokenName: 'wikilink',

  markdownTokenizer: {
    name: 'wikilink',
    level: 'inline' as const,
    start: (src: string) => src.indexOf('[['),
    tokenize(src: string): WikiLinkToken | undefined {
      const match = WIKILINK_AT_START.exec(src)
      if (!match) return undefined
      return { type: 'wikilink', raw: match[0], slug: match[1] }
    },
  },

  parseMarkdown(token: MarkdownToken): JSONContent {
    return { type: 'wikilink', attrs: { id: (token as WikiLinkToken).slug } }
  },

  renderMarkdown(node: JSONContent): string {
    return wikilinkMarkdown(node.attrs?.id ?? '')
  },

  addNodeView() {
    return ReactNodeViewRenderer(WikiLinkChip)
  },
})
