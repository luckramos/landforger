import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { overlayExitTransition } from '../components/motionPrefs'
import { useUiStore } from '../state/uiStore'
import type { ImageOrientation, ImageSize } from '../domain/types'
import { icons } from '../icons'
import styles from './Properties.module.css'

interface ImageInputProps {
  value?: string
  /** Field name (e.g. "Cover", "Portrait") — labels the tile and its controls. */
  label: string
  disabled?: boolean
  /** `banner` is the full-width page Cover; `square` a sized property preview. */
  variant?: 'banner' | 'square'
  size?: ImageSize
  orientation?: ImageOrientation
  onChange: (value: string | undefined) => void
}

const BASE_EDGE: Record<ImageSize, number> = { small: 96, medium: 150, large: 220 }

function tileStyle(size: ImageSize, orientation: ImageOrientation): CSSProperties {
  const edge = BASE_EDGE[size]
  return orientation === 'portrait'
    ? { width: Math.round(edge * 0.75), height: edge }
    : { width: edge, height: Math.round((edge * 9) / 16) }
}

/**
 * Image field shared by the page Cover and every `image` Custom Property.
 * The tile is the only always-visible control: click it to choose a source
 * (upload a file or paste a link), or — when it already holds an image —
 * open a fixed lightbox to view, replace or clear it. The URL is never shown
 * unless the person is actively pasting one.
 */
export function ImageInput({ value, label, disabled = false, variant = 'square', size = 'medium', orientation = 'landscape', onChange }: ImageInputProps) {
  const motionScale = useUiStore((state) => state.motionScale)
  const fileRef = useRef<HTMLInputElement>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuMode, setMenuMode] = useState<'choose' | 'link'>('choose')
  const [linkDraft, setLinkDraft] = useState('')
  const [lightboxOpen, setLightboxOpen] = useState(false)

  const hasImage = value !== undefined && value.trim() !== ''
  const isBanner = variant === 'banner'
  const style = isBanner ? undefined : tileStyle(size, orientation)

  const pickFile = () => fileRef.current?.click()

  const readFile = (file: File | undefined) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => onChange(typeof reader.result === 'string' ? reader.result : undefined)
    reader.readAsDataURL(file)
  }

  const openMenu = () => { setMenuMode('choose'); setLinkDraft(value ?? ''); setMenuOpen(true) }
  const useLink = () => { onChange(linkDraft.trim() || undefined); setMenuOpen(false) }

  useEffect(() => {
    if (!menuOpen) return
    const close = (event: MouseEvent) => {
      if (anchorRef.current && !anchorRef.current.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen])

  return (
    <div className={`${styles.imageInput} ${isBanner ? styles.imageInputBanner : ''}`} ref={anchorRef}>
      <button
        type="button"
        className={styles.imageTile}
        style={style}
        disabled={disabled && !hasImage}
        aria-label={label}
        aria-expanded={hasImage ? undefined : menuOpen}
        onClick={() => (hasImage ? setLightboxOpen(true) : openMenu())}
      >
        {hasImage
          ? <img src={value} alt="" />
          : <span className={styles.imagePlaceholder}>{isBanner ? <icons.add size={14} /> : <icons.upload size={16} />} {isBanner ? 'Add cover' : 'Add image'}</span>}
      </button>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => { readFile(event.target.files?.[0]); event.target.value = '' }}
      />

      <AnimatePresence>
        {menuOpen && !disabled && (
          <motion.div
            className={styles.imageMenu}
            role="dialog"
            aria-label={`${label} source`}
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={overlayExitTransition(motionScale)}
          >
            {menuMode === 'choose' ? (
              <>
                <button type="button" className={styles.tintButton} aria-label={`Upload a file for ${label}`} onClick={() => { setMenuOpen(false); pickFile() }}><icons.upload size={14} /> Upload a file</button>
                <button type="button" className={styles.tintButton} aria-label={`Paste a link for ${label}`} onClick={() => setMenuMode('link')}><icons.link size={14} /> Paste a link</button>
              </>
            ) : (
              <>
                <input
                  className={styles.input}
                  aria-label={`Image URL for ${label}`}
                  type="url"
                  autoFocus
                  value={linkDraft}
                  placeholder="https://…"
                  onChange={(event) => setLinkDraft(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter') useLink() }}
                />
                <div className={styles.imageMenuActions}>
                  <button type="button" className={styles.tintButton} aria-label={`Cancel ${label} link`} onClick={() => setMenuMode('choose')}>Back</button>
                  <button type="button" className={styles.tintPrimary} aria-label={`Use link for ${label}`} onClick={useLink}>Use link</button>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {createPortal(
        <AnimatePresence>
          {lightboxOpen && hasImage && (
            <motion.div
              className={styles.lightbox}
              role="dialog"
              aria-label={`${label} preview`}
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={overlayExitTransition(motionScale)}
              onClick={() => setLightboxOpen(false)}
            >
              <motion.div className={styles.lightboxInner} initial={false} exit={{ opacity: 0, scale: 0.98 }} transition={overlayExitTransition(motionScale)} onClick={(event) => event.stopPropagation()}>
                <img src={value} alt="" />
                {!disabled && (
                  <div className={styles.lightboxActions}>
                    <button type="button" className={styles.tintButton} aria-label={`Replace ${label}`} onClick={() => { setLightboxOpen(false); openMenu() }}><icons.upload size={14} /> Replace</button>
                    <button type="button" className={styles.tintDanger} aria-label={`Remove ${label}`} onClick={() => { onChange(undefined); setLightboxOpen(false) }}><icons.close size={14} /> Remove</button>
                    <button type="button" className={styles.tintButton} aria-label="Close preview" onClick={() => setLightboxOpen(false)}>Close</button>
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  )
}
