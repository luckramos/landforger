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

/** Motion transition shared by every dismissible overlay exit (catalog: 120–160ms). */
export function overlayExitTransition(motionScale: number) {
  return { duration: prefersReducedMotion() ? 0 : 0.14 * motionScale, ease: 'easeOut' as const }
}
