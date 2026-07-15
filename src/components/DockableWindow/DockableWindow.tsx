import { motion } from 'motion/react'
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { icons } from '../../icons'
import {
  clampGeometry,
  dockZIndex,
  useDockStore,
  type DockGeometry,
  type DockMode,
  type DockPanelId,
} from '../../state/dockStore'
import { useUiStore } from '../../state/uiStore'
import { EASE_HOUSE, overlayExitTransition, prefersReducedMotion } from '../motionPrefs'
import styles from './DockableWindow.module.css'

interface PointerOperation {
  kind: 'drag' | 'resize'
  startX: number
  startY: number
  geometry: DockGeometry
}

export interface DockableWindowProps {
  panelId: DockPanelId
  title: string
  subtitle?: string
  children: ReactNode
  onClose: () => void
  toolbar?: ReactNode
  /** Fallback mode used only when the user has no persisted mode for this panel. */
  defaultMode?: DockMode
  icon?: ReactNode
  accent?: string
}

const HEADER_HEIGHT = 52

/* Entry states. Both are transform-only: the geometry they are spread over is
   already final, so the mount delta is zero and no morph can occur. */
/** Mirrors `lw-view-in` (DashboardShell.module.css) — the app's route transition. */
const FULLSCREEN_ENTRY = { opacity: 0, y: 10, scale: 0.994 }
/** A floating window is not a Page: it pops in place, origin at its own centre. */
const FLOATING_ENTRY = { opacity: 0, scale: 0.96 }

/**
 * Shared shell for Timeline, Graph and Reference Canvas. All window state lives
 * in the dock store (keyed by panelId); Motion owns the interruptible 340ms
 * geometry morph, while pointer tracking writes geometry with a zero-duration
 * transition so the window stays under the cursor.
 */
export function DockableWindow({
  panelId,
  title,
  subtitle,
  children,
  onClose,
  toolbar,
  defaultMode = 'fullscreen',
  icon = <icons.panel size={16} aria-hidden="true" />,
  accent = 'var(--bronze)',
}: DockableWindowProps) {
  const panel = useDockStore((state) => state.panels[panelId])
  const zOrder = useDockStore((state) => state.zOrder)
  const setMode = useDockStore((state) => state.setMode)
  const setMinimized = useDockStore((state) => state.setMinimized)
  const setGeometry = useDockStore((state) => state.setGeometry)
  const focus = useDockStore((state) => state.focus)
  const motionScale = useUiStore((state) => state.motionScale)
  const [pointerOperation, setPointerOperation] = useState<PointerOperation>()

  const { minimized } = panel
  const mode = panel.mode ?? defaultMode

  useEffect(() => {
    if (!pointerOperation) return
    const onMove = (event: PointerEvent) => {
      const dx = event.clientX - pointerOperation.startX
      const dy = event.clientY - pointerOperation.startY
      setGeometry(
        panelId,
        pointerOperation.kind === 'drag'
          ? { ...pointerOperation.geometry, x: pointerOperation.geometry.x + dx, y: pointerOperation.geometry.y + dy }
          : {
              ...pointerOperation.geometry,
              width: pointerOperation.geometry.width + dx,
              height: pointerOperation.geometry.height + dy,
            },
      )
    }
    const onUp = () => setPointerOperation(undefined)
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp, { once: true })
    return () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
    }
  }, [panelId, pointerOperation, setGeometry])

  useEffect(() => {
    const onResize = () => setGeometry(panelId, clampGeometry(useDockStore.getState().panels[panelId].geometry))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [panelId, setGeometry])

  const width = typeof window === 'undefined' ? 1440 : window.innerWidth
  const height = typeof window === 'undefined' ? 900 : window.innerHeight
  const geometry = minimized
    ? (() => {
        const barWidth = Math.min(460, width - 32)
        return { left: width - barWidth - 20, top: height - HEADER_HEIGHT - 18, width: barWidth, height: HEADER_HEIGHT }
      })()
    : mode === 'fullscreen'
      ? { left: 0, top: 0, width, height }
      : { left: panel.geometry.x, top: panel.geometry.y, width: panel.geometry.width, height: panel.geometry.height }

  const beginPointerOperation = (kind: PointerOperation['kind'], event: ReactPointerEvent) => {
    if (mode !== 'floating' || minimized || event.button !== 0) return
    if (kind === 'drag' && (event.target as HTMLElement).closest('button, input, textarea, select, a, [role="button"]')) return
    event.preventDefault()
    setPointerOperation({ kind, startX: event.clientX, startY: event.clientY, geometry: panel.geometry })
  }

  const reduced = prefersReducedMotion()
  const dockState = minimized ? 'minimized' : mode
  const entry = mode === 'fullscreen' ? FULLSCREEN_ENTRY : FLOATING_ENTRY
  const entryDuration = reduced ? 0 : (mode === 'fullscreen' ? 0.3 : 0.2) * motionScale
  const entryTransition = { duration: entryDuration, ease: EASE_HOUSE }

  return (
    <motion.section
      className={styles.window}
      role="dialog"
      aria-modal="false"
      aria-label={title}
      data-dock-state={dockState}
      data-dragging={pointerOperation ? 'true' : undefined}
      style={{ '--dock-accent': accent, zIndex: dockZIndex(zOrder, panelId) } as CSSProperties}
      onPointerDown={() => focus(panelId)}
      /* Geometry belongs in `initial`: without it Motion resolves the start
         value from the DOM, which for a fixed element with no offsets is its
         static position beside the sidebar — and the window flies in from
         there. With it, the mount delta is zero and only the transforms move. */
      initial={{ ...geometry, ...entry }}
      animate={{ ...geometry, opacity: 1, y: 0, scale: 1, borderRadius: mode === 'fullscreen' && !minimized ? 0 : 12 }}
      exit={{ opacity: 0, transition: overlayExitTransition(motionScale) }}
      transition={{
        duration: reduced || pointerOperation ? 0 : 0.34 * motionScale,
        ease: EASE_HOUSE,
        opacity: entryTransition,
        y: entryTransition,
        scale: entryTransition,
      }}
    >
      <header
        className={styles.header}
        data-testid="dockable-drag-handle"
        onPointerDown={(event) => beginPointerOperation('drag', event)}
      >
        <span className={styles.mark}>{icon}</span>
        <div className={styles.heading}>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {!minimized && toolbar}
        <div className={styles.controls}>
          {minimized ? (
            <button type="button" aria-label="Restore window" onClick={() => setMinimized(panelId, false)}><icons.windowRestore size={16} aria-hidden="true" /></button>
          ) : (
            <>
              <button
                type="button"
                aria-label={mode === 'fullscreen' ? 'Float window' : 'Maximize window'}
                onClick={() => setMode(panelId, mode === 'fullscreen' ? 'floating' : 'fullscreen')}
              >
                {mode === 'fullscreen' ? <icons.windowFloat size={16} aria-hidden="true" /> : <icons.windowMaximize size={16} aria-hidden="true" />}
              </button>
              <button type="button" aria-label="Minimize window" onClick={() => setMinimized(panelId, true)}><icons.windowMinimize size={16} aria-hidden="true" /></button>
            </>
          )}
          <button type="button" aria-label={`Close ${title}`} onClick={onClose}><icons.windowClose size={16} aria-hidden="true" /></button>
        </div>
      </header>
      <div className={styles.body} aria-hidden={minimized || undefined}>{children}</div>
      {!minimized && mode === 'floating' && (
        <button
          type="button"
          className={styles.resizeHandle}
          aria-label="Resize window"
          onPointerDown={(event) => beginPointerOperation('resize', event)}
        />
      )}
    </motion.section>
  )
}
