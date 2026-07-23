/**
 * True when the user (or test environment) requests reduced motion.
 * CSS handles most of the reduced-motion collapse globally (`global.css`);
 * this is only for the handful of JS-timed things CSS can't shorten on its
 * own (a `setTimeout` navigation delay, a Motion `transition.duration`).
 */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

/** JS mirror of --ease-house (tokens.css) for Motion transitions. */
export const EASE_HOUSE = [0.22, 0.61, 0.36, 1] as const

/** Motion transition shared by every dismissible overlay exit (catalog: 120–160ms, house curve). */
export function overlayExitTransition(motionScale: number) {
  return { duration: prefersReducedMotion() ? 0 : 0.14 * motionScale, ease: EASE_HOUSE }
}

/**
 * Shared fade/rise variants for a staggered dialog chunk (heading, fields,
 * actions). Chunks share one shape; only the offset between them and the
 * per-chunk transition (both below) carry the timing.
 */
export const DIALOG_CHUNK_VARIANTS = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0 },
}

/**
 * Parent `variants` for a staggered Property / page-lifecycle / Category
 * dialog: the container itself doesn't move, it only offsets its chunk
 * children's entrance by ~100ms (`staggerChildren`), collapsing to a single
 * simultaneous reveal under reduced motion.
 */
export function dialogContainerVariants(motionScale: number) {
  return {
    hidden: {},
    visible: { transition: { staggerChildren: prefersReducedMotion() ? 0 : 0.1 * motionScale } },
  }
}

/** Per-chunk entrance transition: a critically damped spring, never bouncy. */
export function dialogChunkTransition(motionScale: number) {
  return prefersReducedMotion()
    ? { duration: 0 }
    : { type: 'spring' as const, duration: 0.3 * motionScale, bounce: 0 }
}

/**
 * Anchored popover menu (Add-property, Select value): scales/fades open from
 * its anchor while staggering its rows in, and fades out on exit. Collapses
 * to an instant reveal under reduced motion. Rows use `anchoredMenuRowVariants`.
 */
export function anchoredMenuVariants(motionScale: number) {
  const reduced = prefersReducedMotion()
  return {
    hidden: { opacity: 0, scale: 0.96, y: -6 },
    visible: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: reduced
        ? { duration: 0 }
        : {
            type: 'spring' as const,
            duration: 0.28 * motionScale,
            bounce: 0,
            staggerChildren: 0.028 * motionScale,
            delayChildren: 0.03 * motionScale,
          },
    },
    exit: { opacity: 0, scale: 0.98, y: -4, transition: overlayExitTransition(motionScale) },
  }
}

/** A single row inside an anchored popover menu: a critically-damped rise. */
export function anchoredMenuRowVariants() {
  const reduced = prefersReducedMotion()
  return {
    hidden: { opacity: 0, y: -5 },
    visible: {
      opacity: 1,
      y: 0,
      transition: reduced ? { duration: 0 } : { type: 'spring' as const, stiffness: 640, damping: 42, mass: 0.6 },
    },
  }
}

/**
 * DockableWindow's float/maximize glyph cross-fade (opacity/scale/blur, via
 * `AnimatePresence`): a critically damped spring, never bouncy, collapsing
 * to zero duration under reduced motion.
 */
export function iconCrossfadeTransition(motionScale: number) {
  return prefersReducedMotion()
    ? { duration: 0 }
    : { type: 'spring' as const, duration: 0.3 * motionScale, bounce: 0 }
}
