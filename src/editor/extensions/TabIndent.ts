// Tab owns indentation across the whole editor instead of leaking to browser
// focus. In a list (task or bullet/ordered) Tab nests / Shift-Tab lifts; in
// plain text Tab inserts a real tab character and Shift-Tab removes one leading
// tab. Both always consume the key (return true) so the caret never jumps out
// of the sheet — matching Obsidian/Notion, where Tab indents rather than
// escaping the editor.
//
// The `\t` survives a full Markdown round-trip (verified: the PageBodyCodec
// serializes it verbatim and the ProseMirror surface renders it via the
// injected `white-space: pre-wrap`; `tab-size` in PageEditor.module.css sets
// the visible width).
//
// High `priority` so this keymap is tried before the list extensions' own
// Tab/Shift-Tab bindings — this extension is the single owner of the key.

import { Extension } from '@tiptap/core'

export const TabIndent = Extension.create({
  name: 'tabIndent',
  priority: 1000,

  addKeyboardShortcuts() {
    const sink = (name: string) => {
      // sinkListItem is a no-op on the first item; we consume Tab regardless.
      this.editor.commands.sinkListItem(name)
      return true
    }
    const lift = (name: string) => {
      this.editor.commands.liftListItem(name)
      return true
    }

    return {
      Tab: () => {
        const { editor } = this
        if (editor.isActive('taskItem')) return sink('taskItem')
        if (editor.isActive('listItem')) return sink('listItem')
        editor.commands.insertContent('\t')
        return true
      },
      'Shift-Tab': () => {
        const { editor } = this
        if (editor.isActive('taskItem')) return lift('taskItem')
        if (editor.isActive('listItem')) return lift('listItem')
        // Outdent plain text: drop one tab immediately before the caret.
        const { selection } = editor.state
        if (selection.empty) {
          const { $from } = selection
          const before = $from.parent.textBetween(
            Math.max(0, $from.parentOffset - 1),
            $from.parentOffset,
          )
          if (before === '\t') {
            editor.commands.deleteRange({ from: selection.from - 1, to: selection.from })
          }
        }
        return true
      },
    }
  },
})
