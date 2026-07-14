// Custom block node — the only one of the 13 v1 blocks with no official
// tiptap extension. Ported from the validated spike
// (landforger-spike/prototype-tiptap-spike/src/extensions.ts): the markdown
// docs' own `createBlockMarkdownSpec` example is literally this node.
//
// Serializes as `:::callout {type="info"}\n…\n:::` (the codec's canonical
// callout form). Note from the spike: the closer-scan regex used by
// `createBlockMarkdownSpec` needs a blank line around nested `:::` markers —
// serializer output always has it; only hand-compacted MD needs care.

import { createBlockMarkdownSpec, mergeAttributes, Node } from '@tiptap/core'

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
