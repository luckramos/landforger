import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'motion/react'
import { Button } from '../components/Button/Button'
import { overlayExitTransition } from '../components/motionPrefs'
import { useUiStore } from '../state/uiStore'
import styles from './LinkDialog.module.css'

interface LinkDialogProps {
  onSubmit: (href: string) => void
  onCancel: () => void
}

/**
 * The canvas's "add a link" dialog — the project's own modal (portal + scrim +
 * focus-trapped panel), replacing the native `window.prompt`. Submits an http(s)
 * URL; the Add button stays disabled until one is entered.
 */
export function LinkDialog({ onSubmit, onCancel }: LinkDialogProps) {
  const motionScale = useUiStore((state) => state.motionScale)
  const [href, setHref] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => inputRef.current?.focus(), [])

  const valid = /^https?:\/\/\S+/i.test(href.trim())
  const submit = () => { if (valid) onSubmit(href.trim()) }

  return createPortal(
    <motion.div
      className={styles.scrim}
      onPointerDown={onCancel}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={overlayExitTransition(motionScale)}
    >
      <motion.div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label="Add a link"
        initial={{ opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        transition={overlayExitTransition(motionScale)}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel()
          if (event.key === 'Enter') submit()
        }}
      >
        <span className={styles.eyebrow}>Link node</span>
        <h2 className={styles.title}>Add a link</h2>
        <label className={styles.fieldLabel} htmlFor="canvas-link-url">URL</label>
        <input
          ref={inputRef}
          id="canvas-link-url"
          className={styles.input}
          type="url"
          inputMode="url"
          value={href}
          placeholder="https://…"
          aria-label="Link URL"
          onChange={(event) => setHref(event.target.value)}
        />
        <div className={styles.actions}>
          <button type="button" className={styles.cancelButton} onClick={onCancel}>Cancel</button>
          <Button type="button" disabled={!valid} onClick={submit}>Add link</Button>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  )
}
