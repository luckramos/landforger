import type { ChangeEvent, PointerEvent as ReactPointerEvent, SyntheticEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { icons } from '../icons'
import type { CanvasImageItem } from './types'
import styles from './ReferenceCanvasPanel.module.css'

interface ImageNodeProps {
  item: CanvasImageItem
  /** Resolved bitmap URL, `null` when the asset is missing, `undefined` while resolving. */
  url: string | null | undefined
  onCaption: (caption: string) => void
  onCaptionCommit: () => void
  onReattach: (file: File) => void
  onNaturalSize: (width: number, height: number) => void
}

/**
 * An image reference node: the bitmap plus an optional caption. Falls back to a
 * "File unavailable" card with a Re-attach action when the backing asset is gone
 * (IndexedDB eviction / cleared storage) so the node never silently disappears.
 */
export function ImageNode({ item, url, onCaption, onCaptionCommit, onReattach, onNaturalSize }: ImageNodeProps) {
  const reattachRef = useRef<HTMLInputElement>(null)
  const src = item.source.type === 'url' ? item.source.href : url ?? undefined
  // A bitmap that fails to decode (corrupt bytes) or a URL that 404s degrades to
  // the same "File unavailable" card as a missing asset. Reset when the src changes
  // (e.g. after Re-attach) so a fresh file gets a fresh chance.
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])
  const missing = failed || (item.source.type === 'asset' && url === null)

  const onLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = event.currentTarget
    if (naturalWidth > 0 && naturalHeight > 0) onNaturalSize(naturalWidth, naturalHeight)
  }

  const stop = (event: ReactPointerEvent) => event.stopPropagation()
  const filename = item.source.type === 'asset' ? item.source.filename : item.source.href

  return (
    <div className={styles.imageBody}>
      {missing ? (
        <div className={styles.imageMissing}>
          <icons.typeImage size={22} aria-hidden="true" />
          <p>File unavailable</p>
          <span className={styles.imageFilename}>{filename}</span>
          <button
            type="button"
            className={styles.reattach}
            onPointerDown={stop}
            onClick={() => reattachRef.current?.click()}
          >
            Re-attach
          </button>
          <input
            ref={reattachRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              const file = event.target.files?.[0]
              if (file) onReattach(file)
              event.target.value = ''
            }}
          />
        </div>
      ) : (
        <img
          className={styles.imageBitmap}
          src={src}
          alt={item.caption || filename}
          draggable={false}
          onLoad={onLoad}
          onError={() => setFailed(true)}
        />
      )}
      <input
        className={styles.caption}
        value={item.caption}
        placeholder="Add a caption…"
        aria-label="Image caption"
        onPointerDown={stop}
        onChange={(event) => onCaption(event.target.value)}
        onBlur={onCaptionCommit}
      />
    </div>
  )
}
