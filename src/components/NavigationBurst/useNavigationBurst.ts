import { useEffect, useState } from 'react'
import type { NavigateFunction } from 'react-router-dom'
import { prefersReducedMotion } from '../motionPrefs'
import type { NavigationBurstOrigin } from './NavigationBurst'

export interface NavigationBurstState {
  to: string
  label: string
  color: string
  origin?: NavigationBurstOrigin
}

/**
 * Drives the timing half of the burst-continuity transition: holds the
 * in-flight burst (if any) and navigates once its envelope has played,
 * mirroring the Map→Page burst's ~640ms delay scaled by the motion
 * preference and collapsing to a near-instant hop under reduced motion.
 */
export function useNavigationBurst(navigate: NavigateFunction, motionScale: number) {
  const [burst, setBurst] = useState<NavigationBurstState>()

  useEffect(() => {
    if (!burst) return
    const timer = window.setTimeout(
      () => navigate(burst.to),
      prefersReducedMotion() ? 60 : 640 * motionScale,
    )
    return () => window.clearTimeout(timer)
  }, [burst, motionScale, navigate])

  const begin = (next: NavigationBurstState) => {
    if (!burst) setBurst(next)
  }

  return { burst, begin }
}
