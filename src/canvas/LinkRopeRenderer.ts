import { catenaryPoints, polylinePath } from './engine/linkGeometry'
import { createRope, isRopeAtRest, stepRope, type Rope } from './engine/ropePhysics'
import type { CanvasPoint } from './types'

export interface LinkEndpoints {
  from: CanvasPoint
  to: CanvasPoint
}

interface RendererOptions {
  reducedMotion?: boolean
  requestFrame?: (cb: FrameRequestCallback) => number
  cancelFrame?: (handle: number) => void
}

interface LinkState {
  path: SVGPathElement
  from: CanvasPoint
  to: CanvasPoint
  rope?: Rope
  active: boolean
  settle: number
  /** The frozen resting `d` once physics settles, kept until the endpoints move again. */
  frozen?: string
}

const MOVE_EPSILON = 0.5
const SETTLE_FRAMES = 12

function moved(a: CanvasPoint, b: CanvasPoint): boolean {
  return Math.abs(a.x - b.x) > MOVE_EPSILON || Math.abs(a.y - b.y) > MOVE_EPSILON
}

/**
 * The single writer of every link string's SVG `d`. Idle and reduced-motion
 * strings show a static catenary (zero JS). When an endpoint moves, that link's
 * rope simulates on a shared rAF loop — swinging and settling — then freezes its
 * resting curve. Only links that are moving/settling run the loop; when none
 * are, the loop stops (idle links cost nothing). Imperative by design, mirroring
 * the laser renderer.
 */
export class LinkRopeRenderer {
  private readonly reducedMotion: boolean
  private readonly requestFrame: (cb: FrameRequestCallback) => number
  private readonly cancelFrame: (handle: number) => void
  private links = new Map<string, LinkState>()
  private frame?: number

  constructor(options: RendererOptions = {}) {
    this.reducedMotion = options.reducedMotion ?? false
    this.requestFrame = options.requestFrame ?? ((cb) => window.requestAnimationFrame(cb))
    this.cancelFrame = options.cancelFrame ?? ((h) => window.cancelAnimationFrame(h))
  }

  /**
   * Reconcile against the current links. Called on each React commit with the
   * live path elements and endpoints. Registers new links, drops removed ones,
   * activates any whose endpoints moved, and writes the baseline `d`.
   */
  sync(entries: { id: string; path: SVGPathElement; endpoints: LinkEndpoints }[]): void {
    const seen = new Set<string>()
    for (const { id, path, endpoints } of entries) {
      seen.add(id)
      const existing = this.links.get(id)
      if (!existing) {
        const state: LinkState = { path, from: endpoints.from, to: endpoints.to, active: false, settle: 0 }
        this.links.set(id, state)
        this.writeStatic(state)
        continue
      }
      existing.path = path
      if (moved(existing.from, endpoints.from) || moved(existing.to, endpoints.to)) {
        existing.from = endpoints.from
        existing.to = endpoints.to
        existing.frozen = undefined
        if (!this.reducedMotion) {
          existing.active = true
          existing.settle = 0
          if (!existing.rope) existing.rope = createRope(endpoints.from, endpoints.to, 12)
        } else {
          this.writeStatic(existing)
        }
      } else if (!existing.active) {
        // Idle: keep the frozen resting curve if we have one, else the catenary.
        existing.path.setAttribute('d', existing.frozen ?? this.staticPath(existing))
      }
    }
    for (const id of [...this.links.keys()]) if (!seen.has(id)) this.links.delete(id)
    this.ensureRunning()
  }

  private staticPath(state: LinkState): string {
    return polylinePath(catenaryPoints(state.from, state.to, 16))
  }

  private writeStatic(state: LinkState): void {
    state.path.setAttribute('d', this.staticPath(state))
  }

  private ensureRunning(): void {
    const anyActive = [...this.links.values()].some((s) => s.active)
    if (anyActive && this.frame === undefined) this.frame = this.requestFrame(this.tick)
  }

  private readonly tick = () => {
    this.frame = undefined
    let anyActive = false
    for (const state of this.links.values()) {
      if (!state.active) continue
      if (!state.rope) state.rope = createRope(state.from, state.to, 12)
      state.rope = stepRope(state.rope, state.from, state.to)
      state.path.setAttribute('d', polylinePath(state.rope.toPolyline(state.from, state.to)))
      if (isRopeAtRest(state.rope)) {
        state.settle += 1
        if (state.settle >= SETTLE_FRAMES) {
          state.active = false
          state.frozen = state.path.getAttribute('d') ?? undefined // freeze the resting curve
        }
      } else {
        state.settle = 0
      }
      if (state.active) anyActive = true
    }
    if (anyActive) this.frame = this.requestFrame(this.tick)
  }

  destroy(): void {
    if (this.frame !== undefined) this.cancelFrame(this.frame)
    this.frame = undefined
    this.links.clear()
  }
}
