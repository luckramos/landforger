// Typing `[text](url)` should become a link, the same way `![alt](url)` already
// becomes an image (that rule ships with @tiptap/extension-image; StarterKit's
// Link mark ships no such input rule, so the bracket syntax stayed literal).
//
// markInputRule can't express this: it keeps the *last* capture group as the
// visible text, but a link's visible text is the first group and the href is the
// second. So this is a hand-written InputRule that swaps the whole match for the
// display text and stamps the link mark on it. The `(?<!!)` lookbehind keeps it
// from firing on the `[alt](url)` tail of an image.

import { Extension, InputRule } from '@tiptap/core'

const MARKDOWN_LINK = /(?<!!)\[([^\]]+)]\(([^)\s]+)\)$/

export const MarkdownLinkRule = Extension.create({
  name: 'markdownLinkRule',

  addInputRules() {
    const linkType = this.editor.schema.marks.link
    if (!linkType) return []
    return [
      new InputRule({
        find: MARKDOWN_LINK,
        handler: ({ state, range, match }) => {
          const [, text, href] = match
          const { tr } = state
          tr.insertText(text, range.from, range.to)
          tr.addMark(range.from, range.from + text.length, linkType.create({ href }))
          // Don't let the mark bleed into whatever the user types next.
          tr.removeStoredMark(linkType)
        },
      }),
    ]
  },
})
