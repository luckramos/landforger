import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion'
import styles from './SuggestionMenu.module.css'

export interface SuggestionMenuItem {
  id: string
  label: string
  description: string
  icon: string
}

/** DOM renderer used by all three plugins; `props.mount` delegates positioning to floating-ui. */
export function suggestionMenuRenderer<T extends SuggestionMenuItem>(ariaLabel: string) {
  let element: HTMLDivElement | undefined
  let current: SuggestionProps<T, T> | undefined
  let selected = 0
  let unmount: (() => void) | undefined

  const draw = () => {
    if (!element || !current) return
    element.replaceChildren()
    selected = Math.min(selected, Math.max(0, current.items.length - 1))
    if (current.items.length === 0) {
      const empty = document.createElement('p')
      empty.className = styles.empty
      empty.textContent = 'No matches'
      element.append(empty)
      return
    }

    current.items.forEach((item, index) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.role = 'option'
      button.ariaSelected = String(index === selected)
      button.className = index === selected ? `${styles.item} ${styles.selected}` : styles.item
      button.setAttribute('aria-label', `${item.label} — ${item.description}`)

      const icon = document.createElement('span')
      icon.className = styles.icon
      icon.ariaHidden = 'true'
      icon.textContent = item.icon
      const copy = document.createElement('span')
      copy.className = styles.copy
      const label = document.createElement('span')
      label.className = styles.label
      label.textContent = item.label
      const description = document.createElement('span')
      description.className = styles.description
      description.textContent = item.description
      copy.append(label, description)
      button.append(icon, copy)
      button.addEventListener('mouseenter', () => {
        selected = index
        draw()
      })
      button.addEventListener('mousedown', (event) => {
        event.preventDefault()
        current?.command(item)
      })
      element?.append(button)
    })
  }

  return () => ({
    onStart(props: SuggestionProps<T, T>) {
      current = props
      selected = 0
      element = document.createElement('div')
      element.className = styles.menu
      element.role = 'listbox'
      element.setAttribute('aria-label', ariaLabel)
      draw()
      unmount = props.mount(element)
    },
    onUpdate(props: SuggestionProps<T, T>) {
      current = props
      selected = 0
      draw()
    },
    onKeyDown({ event }: SuggestionKeyDownProps) {
      if (!current || current.items.length === 0) return false
      if (event.key === 'ArrowDown') {
        selected = (selected + 1) % current.items.length
        draw()
        return true
      }
      if (event.key === 'ArrowUp') {
        selected = (selected - 1 + current.items.length) % current.items.length
        draw()
        return true
      }
      if (event.key === 'Enter') {
        current.command(current.items[selected])
        return true
      }
      return false
    },
    onExit() {
      unmount?.()
      unmount = undefined
      element = undefined
      current = undefined
    },
  })
}
