// The 13 v1 blocks + WikiLink + slash menu, wired for @tiptap/markdown.
// Spike code — see README.

import { createBlockMarkdownSpec, Extension, mergeAttributes, Node } from '@tiptap/core'
import type { AnyExtension, JSONContent } from '@tiptap/core'
import { Details, DetailsContent, DetailsSummary } from '@tiptap/extension-details'
import Image from '@tiptap/extension-image'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import Mention from '@tiptap/extension-mention'
import { PluginKey } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import { Suggestion, type SuggestionOptions } from '@tiptap/suggestion'

// ---------------------------------------------------------------------------
// Plugin keys — three distinct triggers (Q2)
// ---------------------------------------------------------------------------
export const slashPluginKey = new PluginKey('slash-menu')
export const wikiAtPluginKey = new PluginKey('wikilink-at')
export const wikiBracketPluginKey = new PluginKey('wikilink-bracket')

// ---------------------------------------------------------------------------
// Callout — the docs' createBlockMarkdownSpec example, :::callout {type="info"}
// ---------------------------------------------------------------------------
export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      type: { default: 'info' },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-callout]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-callout': node.attrs.type }), 0]
  },

  ...createBlockMarkdownSpec({
    nodeName: 'callout',
    defaultAttributes: { type: 'info' },
    allowedAttributes: ['type'],
  }),
})

// ---------------------------------------------------------------------------
// WikiLink — Mention extended: node keeps `id` (slug); label is NOT
// authoritative. Markdown spec overridden per ADR 0001: [[slug]] instead of
// the default [mention id="..." label="..."] shortcode.
// ---------------------------------------------------------------------------
export const WikiLink = Mention.extend({
  name: 'wikilink',

  // -- markdown overrides (replace the inherited createInlineMarkdownSpec) --
  markdownTokenName: 'wikilink',

  markdownTokenizer: {
    name: 'wikilink',
    level: 'inline' as const,
    start: (src: string) => src.indexOf('[['),
    tokenize(src: string) {
      const match = /^\[\[([^\]\n]+)\]\]/.exec(src)
      if (!match) return undefined
      return { type: 'wikilink', raw: match[0], slug: match[1] } as any
    },
  },

  parseMarkdown(token: any): JSONContent {
    return { type: 'wikilink', attrs: { id: token.slug } }
  },

  renderMarkdown(node: JSONContent): string {
    return `[[${node.attrs?.id ?? ''}]]`
  },
})

// ---------------------------------------------------------------------------
// Slash menu — thin Extension wrapping Suggestion({ char: '/' }).
// `render`/`items` are injected by the app; headless usage registers the
// plugin with no popup (enough for the Q2 smoke check).
// ---------------------------------------------------------------------------
export const SlashMenu = Extension.create<{ suggestion: Partial<SuggestionOptions> }>({
  name: 'slashMenu',

  addOptions() {
    return { suggestion: {} }
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: '/',
        pluginKey: slashPluginKey,
        command: ({ editor, range, props }: any) => props.run(editor, range),
        items: () => [],
        ...this.options.suggestion,
      }),
    ]
  },
})

// ---------------------------------------------------------------------------
// Code-fence degradation guard. With codeBlock disabled, @tiptap/markdown has
// NO handler for marked's `code` token and parseFallbackToken returns null —
// the fence is silently DROPPED (verified against
// node_modules/@tiptap/markdown/dist/index.js, parseFallbackToken). This tiny
// extension keeps hostile fences as literal paragraph text instead.
// ---------------------------------------------------------------------------
export const CodeFenceAsText = Extension.create({
  name: 'codeFenceAsText',
  markdownTokenName: 'code',
  parseMarkdown(token: any): JSONContent {
    const text = (token.raw ?? token.text ?? '').replace(/\n+$/, '')
    return { type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }
  },
})

// ---------------------------------------------------------------------------
// The shared block set (13 v1 blocks; no Table, no Code block)
// ---------------------------------------------------------------------------
export function buildBlockExtensions(opts: { codeFenceGuard?: boolean } = {}): AnyExtension[] {
  const { codeFenceGuard = true } = opts
  return [
    StarterKit.configure({
      codeBlock: false, // no Code block in v1
      link: { openOnClick: false },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Image,
    Details,
    DetailsSummary,
    DetailsContent,
    Callout,
    WikiLink,
    ...(codeFenceGuard ? [CodeFenceAsText] : []),
  ]
}
