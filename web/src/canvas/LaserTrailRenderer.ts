import { smoothStrokePath } from './canvasDomain'
import type { CanvasPoint } from './types'

interface TimedPoint extends CanvasPoint {
  time: number
}

interface LaserTrailOptions {
  now?: () => number
  requestFrame?: (callback: FrameRequestCallback) => number
  cancelFrame?: (handle: number) => void
  reducedMotion?: boolean
}

const SVG_NS = 'http://www.w3.org/2000/svg'
const TRAIL_LIFETIME = 700

/**
 * Owns the hot laser path imperatively. React creates the two SVG hosts once;
 * every decay frame only mutates those nodes, so a pointer trail never causes
 * a component render.
 */
export class LaserTrailRenderer {
  private readonly now: () => number
  private readonly requestFrame: (callback: FrameRequestCallback) => number
  private readonly cancelFrame: (handle: number) => void
  private readonly reducedMotion: boolean
  private points: TimedPoint[] = []
  private frame?: number

  constructor(
    private readonly path: SVGPathElement,
    private readonly dots: SVGGElement,
    options: LaserTrailOptions = {},
  ) {
    this.now = options.now ?? (() => performance.now())
    // Bind to window: requestAnimationFrame/cancelAnimationFrame throw if called
    // with `this` set to anything other than the Window (which storing the bare
    // reference on the instance does). The optional overrides are used by tests.
    this.requestFrame = options.requestFrame ?? ((callback) => window.requestAnimationFrame(callback))
    this.cancelFrame = options.cancelFrame ?? ((handle) => window.cancelAnimationFrame(handle))
    this.reducedMotion = options.reducedMotion ?? false
  }

  addPoint(point: CanvasPoint): void {
    this.points.push({ ...point, time: this.now() })
    this.render(this.now())
    if (!this.reducedMotion && this.frame === undefined) this.frame = this.requestFrame(this.tick)
  }

  finish(): void {
    if (this.reducedMotion) this.clear()
  }

  clear(): void {
    this.points = []
    if (this.frame !== undefined) this.cancelFrame(this.frame)
    this.frame = undefined
    this.render(this.now())
  }

  destroy(): void {
    this.clear()
  }

  private readonly tick = (time: number) => {
    this.frame = undefined
    this.points = this.points.filter((point) => time - point.time < TRAIL_LIFETIME)
    this.render(time)
    if (this.points.length > 0) this.frame = this.requestFrame(this.tick)
  }

  private render(time: number): void {
    this.path.setAttribute('d', smoothStrokePath(this.points))
    this.dots.replaceChildren()
    for (const point of this.points) {
      const opacity = this.reducedMotion ? 1 : Math.max(0, 1 - (time - point.time) / TRAIL_LIFETIME)
      const circle = document.createElementNS(SVG_NS, 'circle')
      circle.setAttribute('cx', String(point.x))
      circle.setAttribute('cy', String(point.y))
      circle.setAttribute('r', String(3 + opacity * 2))
      circle.setAttribute('opacity', String(opacity * 0.9))
      this.dots.append(circle)
    }
  }
}
