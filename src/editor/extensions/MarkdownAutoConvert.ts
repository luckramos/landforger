// Catch-all markdown conversion for the cases input rules can't reach. An input
// rule only fires when the completing character (`)`) is typed *last* at the
// caret — so it misses "type the parens first, fill the URL in after", pasted
// markdown, or edits made in the middle of a line. This plugin converts any
// complete `![alt](url)` / `[text](url)` in a textblock the moment the caret
// leaves that block (Enter, arrow to another line, click elsewhere) or the
// editor loses focus. Scanning the one block that was left keeps it cheap:
// a single `textBetween` + two regexes on a short string, once per boundary —
// never per keystroke, and never while the caret is still inside (so a URL
// mid-type is never converted early).

import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state'
import { Mapping } from '@tiptap/pm/transform'

const IMAGE_RE = /!\[([^\]]*)]\((\S+?)\)/g
const LINK_RE = /(?<!!)\[([^\]]+)]\((\S+?)\)/g
// The slash "Image" block seeds this src; leaving the untouched template alone
// avoids turning a placeholder the user hasn't filled in into a broken image.
const PLACEHOLDER_SRC = 'url'

const autoConvertKey = new PluginKey('markdownAutoConvert')

interface Hit {
  from: number
  to: number
  node?: PMNode
  text?: string
  marks?: PMNode['marks']
}

/**
 * Rewrite every complete image/link markdown span in the textblock that owns
 * `blockStart`. Returns whether the transaction was touched. Applies hits
 * right-to-left so each replacement leaves the earlier positions valid.
 */
function convertBlock(tr: Transaction, blockStart: number): boolean {
  const $block = tr.doc.resolve(blockStart)
  if (!$block.parent.isTextblock) return false
  const start = $block.start()
  const end = $block.end()
  // leafText '￼' makes every inline atom (a wikilink chip, say) count as one
  // character, so a regex index over `text` maps 1:1 onto a document position.
  const text = tr.doc.textBetween(start, end, '\n', '￼')
  const { schema } = tr.doc.type
  const imageType = schema.nodes.image
  const linkType = schema.marks.link

  const hits: Hit[] = []
  if (imageType) {
    IMAGE_RE.lastIndex = 0
    for (let m = IMAGE_RE.exec(text); m; m = IMAGE_RE.exec(text)) {
      const [full, alt, src] = m
      if (src === PLACEHOLDER_SRC) continue
      hits.push({ from: start + m.index, to: start + m.index + full.length, node: imageType.create({ src, alt: alt || null }) })
    }
  }
  if (linkType) {
    LINK_RE.lastIndex = 0
    for (let m = LINK_RE.exec(text); m; m = LINK_RE.exec(text)) {
      const [full, label, href] = m
      hits.push({ from: start + m.index, to: start + m.index + full.length, text: label, marks: [linkType.create({ href })] })
    }
  }
  if (hits.length === 0) return false

  hits.sort((a, b) => b.from - a.from)
  for (const hit of hits) {
    if (hit.node) tr.replaceWith(hit.from, hit.to, hit.node)
    else if (hit.text != null) tr.replaceWith(hit.from, hit.to, schema.text(hit.text, hit.marks))
  }
  return true
}

/** Content-start of the textblock a resolved position sits in, or null if none. */
function blockStartOf(doc: PMNode, pos: number): number | null {
  const $pos = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)))
  if (!$pos.parent.isTextblock) return null
  return $pos.start()
}

export const MarkdownAutoConvert = Extension.create({
  name: 'markdownAutoConvert',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: autoConvertKey,
        // Convert the block the caret just left.
        appendTransaction(transactions, oldState, newState) {
          if (transactions.some((tr) => tr.getMeta(autoConvertKey))) return null
          if (!transactions.some((tr) => tr.docChanged || tr.selectionSet)) return null

          const mapping = new Mapping()
          transactions.forEach((tr) => mapping.appendMapping(tr.mapping))
          const leftBlock = blockStartOf(newState.doc, mapping.map(oldState.selection.from))
          const currentBlock = blockStartOf(newState.doc, newState.selection.from)
          if (leftBlock === null || leftBlock === currentBlock) return null

          const tr = newState.tr
          if (!convertBlock(tr, leftBlock)) return null
          tr.setMeta(autoConvertKey, true)
          return tr
        },
        props: {
          // Convert the caret's block when focus leaves the editor entirely.
          handleDOMEvents: {
            blur: (view) => {
              const block = blockStartOf(view.state.doc, view.state.selection.from)
              if (block === null) return false
              const tr = view.state.tr
              if (convertBlock(tr, block)) {
                tr.setMeta(autoConvertKey, true)
                view.dispatch(tr)
              }
              return false
            },
          },
        },
      }),
    ]
  },
})
