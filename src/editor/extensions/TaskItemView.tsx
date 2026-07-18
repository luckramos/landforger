// TaskItem, re-skinned to the house Checkbox (issue: editor to-do rows shipped
// the raw native checkbox from @tiptap/extension-list's default node view).
// We keep TaskItem's schema, markdown round-trip and split/sink/lift commands
// untouched — only the *rendering* (a React node view drawing <Checkbox/>) and
// the keyboard map (Tab is consumed inside a task list so it indents instead of
// blurring the editor) are overridden.

import { TaskItem } from '@tiptap/extension-list'
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react'
import { Checkbox } from '../../components/Checkbox/Checkbox'

function TaskItemView({ node, editor, updateAttributes }: NodeViewProps) {
  const checked = node.attrs.checked === true
  const label = `Task item checkbox for ${node.textContent || 'empty task item'}`

  return (
    <NodeViewWrapper as="li" data-type="taskItem" data-checked={checked}>
      {/* contentEditable=false so the caret never lands on the control and the
          checkbox lives outside the text ProseMirror manages. */}
      <span data-task-control contentEditable={false}>
        <Checkbox
          checked={checked}
          aria-label={label}
          // Keep the editor selection: don't let the box steal the caret.
          onMouseDown={(event) => event.preventDefault()}
          // Read-only Pages show the state but can't toggle it.
          onClick={(event) => { if (!editor.isEditable) event.preventDefault() }}
          onChange={(event) => {
            if (!editor.isEditable) return
            updateAttributes({ checked: event.currentTarget.checked })
          }}
        />
      </span>
      <NodeViewContent as="div" data-task-content />
    </NodeViewWrapper>
  )
}

/**
 * TaskItem re-skinned to the house Checkbox. Only the node view changes — the
 * base keeps its Enter (split) and markdown round-trip; Tab/Shift-Tab nesting
 * is owned globally by the TabIndent extension. Configured with `nested: true`
 * at the call site so sub-tasks work.
 */
export const CheckboxTaskItem = TaskItem.extend({
  addNodeView() {
    return ReactNodeViewRenderer(TaskItemView)
  },
})
