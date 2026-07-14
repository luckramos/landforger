// Shared popup list for all three Suggestion triggers, rendered via the
// v3.27+ managed-mount path (props.mount -> floating-ui positioning).

import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion'
import { createRoot, type Root } from 'react-dom/client'

type ListRenderOptions<T> = {
  label: (item: T) => string
  onSelect: (item: T, props: SuggestionProps<T>) => void
}

export function createListRender<T>({ label, onSelect }: ListRenderOptions<T>) {
  return () => {
    let el: HTMLDivElement | null = null
    let root: Root | null = null
    let unmount: (() => void) | null = null
    let selected = 0
    let current: SuggestionProps<T> | null = null

    const rerender = () => {
      if (!root || !current) return
      const props = current
      root.render(
        <div className="popup-list">
          {props.items.length === 0 && <div className="popup-empty">No results</div>}
          {props.items.map((item, i) => (
            <button
              key={i}
              className={i === selected ? 'popup-item selected' : 'popup-item'}
              onMouseDown={e => {
                e.preventDefault()
                onSelect(item, props)
              }}
            >
              {label(item)}
            </button>
          ))}
        </div>,
      )
    }

    return {
      onStart(props: SuggestionProps<T>) {
        current = props
        selected = 0
        el = document.createElement('div')
        el.className = 'popup'
        root = createRoot(el)
        rerender()
        // v3.27+ managed mounting + positioning (floating-ui inside the plugin)
        unmount = (props as any).mount ? (props as any).mount(el) : manualMount(el, props)
      },
      onUpdate(props: SuggestionProps<T>) {
        current = props
        if (selected >= props.items.length) selected = 0
        rerender()
      },
      onKeyDown({ event }: SuggestionKeyDownProps) {
        if (!current) return false
        if (event.key === 'ArrowDown') {
          selected = (selected + 1) % Math.max(current.items.length, 1)
          rerender()
          return true
        }
        if (event.key === 'ArrowUp') {
          selected = (selected - 1 + Math.max(current.items.length, 1)) % Math.max(current.items.length, 1)
          rerender()
          return true
        }
        if (event.key === 'Enter') {
          const item = current.items[selected]
          if (item) onSelect(item, current)
          return true
        }
        return false
      },
      onExit() {
        unmount?.()
        const r = root
        setTimeout(() => r?.unmount()) // avoid sync-unmount-during-render warning
        el?.remove()
        el = null
        root = null
        current = null
      },
    }
  }
}

// Fallback if props.mount is unavailable: fixed position at the cursor rect.
function manualMount<T>(el: HTMLElement, props: SuggestionProps<T>): () => void {
  document.body.appendChild(el)
  el.style.position = 'absolute'
  const rect = props.clientRect?.()
  if (rect) {
    el.style.left = `${rect.left + window.scrollX}px`
    el.style.top = `${rect.bottom + window.scrollY + 4}px`
  }
  return () => el.remove()
}
