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
