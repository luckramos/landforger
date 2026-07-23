import { useLayoutEffect, type RefObject } from 'react'
import { prefersReducedMotion } from '../../components/motionPrefs'

/**
 * Replays the `fieldIn` stagger on every `[data-stagger]` descendant of
 * `containerRef`, both on mount and whenever `replayKey` changes (the mode
 * toggle) — the animation-restart idiom (animation-catalog.md §3.1):
 * `animation:'none'`, force a reflow, then re-set the full `animation`
 * shorthand with a render-computed per-index delay.
 */
export function useFieldStagger(containerRef: RefObject<HTMLElement | null>, replayKey: unknown): void {
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const elements = Array.from(container.querySelectorAll<HTMLElement>('[data-stagger]'))
    const reduced = prefersReducedMotion()

    for (const [i, el] of elements.entries()) {
      el.style.animation = 'none'
      void el.offsetWidth // force reflow so the same keyframe can replay
      if (reduced) {
        el.style.animation = ''
        el.style.opacity = '1'
        el.style.transform = 'none'
      } else {
        el.style.animation = `authFieldIn calc(var(--mo, 1) * 560ms) var(--ease-house) calc(var(--mo, 1) * ${i * 62}ms) both`
      }
    }
  }, [containerRef, replayKey])
}
