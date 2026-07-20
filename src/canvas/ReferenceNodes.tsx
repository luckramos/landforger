import type { ChangeEvent, PointerEvent as ReactPointerEvent } from 'react'
import { useRef, useState } from 'react'
import { icons } from '../icons'
import { domainOf } from './engine/itemKinds'
import type { CanvasLinkItem, CanvasMdItem, CanvasPdfItem } from './types'
import styles from './ReferenceCanvasPanel.module.css'

const stop = (event: ReactPointerEvent) => event.stopPropagation()

function formatSize(bytes: number | undefined): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Editable display title, shared by the three reference cards. */
function TitleInput({ value, onChange, onCommit }: { value: string; onChange: (v: string) => void; onCommit: () => void }) {
  return (
    <input
      className={styles.cardTitle}
      value={value}
      placeholder="Title…"
      aria-label="Node title"
      onPointerDown={stop}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onCommit}
    />
  )
}

/** Top-right "open ↗" affordance, shown on hover. */
function OpenAffordance({ onOpen, label }: { onOpen: () => void; label: string }) {
  return (
    <button type="button" className={styles.openAffordance} aria-label={label} title={label} onPointerDown={stop} onClick={onOpen}>
      <icons.arrowRight size={14} aria-hidden="true" />
    </button>
  )
}

/** The "File unavailable" + Re-attach fallback for asset-backed cards whose bytes are gone. */
function MissingCard({ filename, accept, onReattach }: { filename: string; accept: string; onReattach: (file: File) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div className={styles.imageMissing}>
      <icons.typeImage size={22} aria-hidden="true" />
      <p>File unavailable</p>
      <span className={styles.imageFilename}>{filename}</span>
      <button type="button" className={styles.reattach} onPointerDown={stop} onClick={() => ref.current?.click()}>Re-attach</button>
      <input
        ref={ref}
        type="file"
        accept={accept}
        hidden
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          const file = event.target.files?.[0]
          if (file) onReattach(file)
          event.target.value = ''
        }}
      />
    </div>
  )
}

// --- Link -----------------------------------------------------------------

interface LinkNodeProps {
  item: CanvasLinkItem
  onTitle: (title: string) => void
  onTitleCommit: () => void
  onOpen: () => void
}

/** A web-link card: favicon + editable title + domain. Favicon falls back to a glyph. */
export function LinkNode({ item, onTitle, onTitleCommit, onOpen }: LinkNodeProps) {
  const domain = domainOf(item.source.href)
  const [faviconFailed, setFaviconFailed] = useState(false)
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`
  return (
    <div className={styles.linkBody}>
      <OpenAffordance onOpen={onOpen} label="Open link in a new tab" />
      <span className={styles.favicon} aria-hidden="true">
        {faviconFailed ? <icons.link size={18} /> : <img src={faviconUrl} alt="" width={18} height={18} onError={() => setFaviconFailed(true)} />}
      </span>
      <div className={styles.cardText}>
        <TitleInput value={item.title} onChange={onTitle} onCommit={onTitleCommit} />
        <span className={styles.cardMeta}>{domain}</span>
      </div>
    </div>
  )
}

// --- PDF -------------------------------------------------------------------

interface PdfNodeProps {
  item: CanvasPdfItem
  /** Resolved asset URL: `null` when a backing asset is missing, `undefined` while resolving. */
  url: string | null | undefined
  onTitle: (title: string) => void
  onTitleCommit: () => void
  onReattach: (file: File) => void
  onOpen: () => void
}

/** A representative PDF card: glyph + filename + size (no in-app rendering). */
export function PdfNode({ item, url, onTitle, onTitleCommit, onReattach, onOpen }: PdfNodeProps) {
  const missing = item.source.type === 'asset' && url === null
  const filename = item.source.type === 'asset' ? item.source.filename : item.source.href
  const size = item.source.type === 'asset' ? formatSize(item.source.size) : ''
  if (missing) return <MissingCard filename={filename} accept="application/pdf" onReattach={onReattach} />
  return (
    <div className={styles.docBody}>
      <OpenAffordance onOpen={onOpen} label="Open PDF in a new tab" />
      <span className={styles.docGlyph} aria-hidden="true"><icons.documentWidth size={22} /></span>
      <div className={styles.cardText}>
        <TitleInput value={item.title} onChange={onTitle} onCommit={onTitleCommit} />
        <span className={styles.cardMeta}>{[filename, size].filter(Boolean).join(' · ')}</span>
      </div>
    </div>
  )
}

// --- Markdown --------------------------------------------------------------

interface MarkdownNodeProps {
  item: CanvasMdItem
  /** Rendered HTML: `null` when the asset is missing, `undefined` while resolving. */
  html: string | null | undefined
  onTitle: (title: string) => void
  onTitleCommit: () => void
  onReattach: (file: File) => void
  onOpen: () => void
}

/** A Markdown card: a real (read-only) rendered preview that fades at the bottom. */
export function MarkdownNode({ item, html, onTitle, onTitleCommit, onReattach, onOpen }: MarkdownNodeProps) {
  const missing = html === null
  const filename = item.source.filename
  if (missing) return <MissingCard filename={filename} accept=".md,text/markdown" onReattach={onReattach} />
  return (
    <div className={styles.mdBody}>
      <OpenAffordance onOpen={onOpen} label="Open Markdown reader" />
      <div className={styles.mdPreview} aria-hidden="true">
        {/* `html` is produced by generateHTML() over the app's tiptap schema
            (renderMarkdownHtml), which emits only known node/mark types — not raw
            passthrough HTML — so this is schema-constrained, matching how the Page
            editor already renders the user's own Markdown. */}
        {html ? <div dangerouslySetInnerHTML={{ __html: html }} /> : <span className={styles.cardMeta}>Loading…</span>}
      </div>
      <div className={styles.mdFooter}>
        <icons.editorText size={14} aria-hidden="true" />
        <TitleInput value={item.title} onChange={onTitle} onCommit={onTitleCommit} />
      </div>
    </div>
  )
}
