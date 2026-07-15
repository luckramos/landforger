import { motion } from 'motion/react'
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode, Ref } from 'react'
import { useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { icons } from '../../icons'
import { useUiStore } from '../../state/uiStore'
import { EASE_HOUSE, overlayExitTransition, prefersReducedMotion } from '../motionPrefs'
import styles from './DockableWindow.module.css'

interface Geometry {
  x: number
  y: number
  width: number
  height: number
}

interface PointerOperation {
  kind: 'drag' | 'resize'
  startX: number
  startY: number
  geometry: Geometry
}

export interface DockableWindowHandle {
  /** Docks the window to a floating pane, so whatever it covers stays visible. */
  dock: () => void
}

export interface DockableWindowProps {
  title: string
  subtitle?: string
  children: ReactNode
  onClose: () => void
  toolbar?: ReactNode
  initialState?: 'fullscreen' | 'floating'
  icon?: ReactNode
  accent?: string
  ref?: Ref<DockableWindowHandle>
}

const MIN_WIDTH = 560
const MIN_HEIGHT = 360
const HEADER_HEIGHT = 52

/* Entry states. Both are transform-only: the geometry they are spread over is
   already final, so the mount delta is zero and no morph can occur. */
/** Mirrors `lw-view-in` (DashboardShell.module.css) — the app's route transition. */
const FULLSCREEN_ENTRY = { opacity: 0, y: 10, scale: 0.994 }
/** A floating window is not a page: it pops in place, origin at its own centre. */
const FLOATING_ENTRY = { opacity: 0, scale: 0.96 }

function viewport() {
  return {
    width: typeof window === 'undefined' ? 1440 : window.innerWidth,
    height: typeof window === 'undefined' ? 900 : window.innerHeight,
  }
}

function defaultFloatingGeometry(): Geometry {
  const size = viewport()
  const width = Math.min(820, size.width - 80)
  const height = Math.min(620, size.height - 126)
  return { x: Math.max(20, size.width - width - 40), y: 86, width, height }
}

function clampGeometry(geometry: Geometry): Geometry {
  const size = viewport()
  const width = Math.min(size.width, Math.max(MIN_WIDTH, geometry.width))
  const height = Math.min(size.height, Math.max(MIN_HEIGHT, geometry.height))
  return {
    x: Math.min(size.width - 72, Math.max(0, geometry.x)),
    y: Math.min(size.height - HEADER_HEIGHT, Math.max(0, geometry.y)),
    width,
    height,
  }
}

/**
 * Shared shell for Timeline, Graph and Reference Canvas. Motion owns the
 * interruptible 340ms geometry morph; pointer tracking writes geometry with
 * a zero-duration transition so the window stays under the cursor.
 */
export function DockableWindow({
  title,
  subtitle,
  children,
  onClose,
  toolbar,
  initialState = 'fullscreen',
  icon = <icons.panel size={16} aria-hidden="true" />,
  accent = 'var(--bronze)',
  ref,
}: DockableWindowProps) {
  const [mode, setMode] = useState<'fullscreen' | 'floating'>(initialState)
  const [minimized, setMinimized] = useState(false)
  const [floating, setFloating] = useState(defaultFloatingGeometry)
  const [pointerOperation, setPointerOperation] = useState<PointerOperation>()
  const floatingRef = useRef(floating)
  const motionScale = useUiStore((state) => state.motionScale)
  floatingRef.current = floating

  useEffect(() => {
    if (!pointerOperation) return
    const onMove = (event: PointerEvent) => {
      const dx = event.clientX - pointerOperation.startX
      const dy = event.clientY - pointerOperation.startY
      setFloating(
        clampGeometry(
          pointerOperation.kind === 'drag'
            ? { ...pointerOperation.geometry, x: pointerOperation.geometry.x + dx, y: pointerOperation.geometry.y + dy }
            : {
                ...pointerOperation.geometry,
                width: pointerOperation.geometry.width + dx,
                height: pointerOperation.geometry.height + dy,
              },
        ),
      )
    }
    const onUp = () => setPointerOperation(undefined)
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp, { once: true })
    return () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
    }
  }, [pointerOperation])

  useEffect(() => {
    const onResize = () => setFloating((current) => clampGeometry(current))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const geometry = useMemo(() => {
    const size = viewport()
    if (minimized) {
      const width = Math.min(460, size.width - 32)
      return { left: size.width - width - 20, top: size.height - HEADER_HEIGHT - 18, width, height: HEADER_HEIGHT }
    }
    if (mode === 'fullscreen') return { left: 0, top: 0, width: size.width, height: size.height }
    return { left: floating.x, top: floating.y, width: floating.width, height: floating.height }
  }, [floating, minimized, mode])

  const beginPointerOperation = (kind: PointerOperation['kind'], event: ReactPointerEvent) => {
    if (mode !== 'floating' || minimized || event.button !== 0) return
    if (kind === 'drag' && (event.target as HTMLElement).closest('button, input, textarea, select, a, [role="button"]')) return
    event.preventDefault()
    setPointerOperation({ kind, startX: event.clientX, startY: event.clientY, geometry: floatingRef.current })
  }

  /* Lets panel content dock the window when it navigates the page underneath —
     the geometry morph below animates the change like any other dock. */
  useImperativeHandle(ref, () => ({
    dock: () => {
      setMinimized(false)
      setMode('floating')
    },
  }), [])

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
      style={{ '--dock-accent': accent } as CSSProperties}
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
            <button type="button" aria-label="Restore window" onClick={() => setMinimized(false)}><icons.windowRestore size={16} aria-hidden="true" /></button>
          ) : (
            <>
              <button
                type="button"
                aria-label={mode === 'fullscreen' ? 'Float window' : 'Maximize window'}
                onClick={() => setMode((current) => (current === 'fullscreen' ? 'floating' : 'fullscreen'))}
              >
                {mode === 'fullscreen' ? <icons.windowFloat size={16} aria-hidden="true" /> : <icons.windowMaximize size={16} aria-hidden="true" />}
              </button>
              <button type="button" aria-label="Minimize window" onClick={() => setMinimized(true)}><icons.windowMinimize size={16} aria-hidden="true" /></button>
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
