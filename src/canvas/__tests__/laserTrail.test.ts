import { describe, expect, it, vi } from 'vitest'
import { LaserTrailRenderer } from '../LaserTrailRenderer'

function svgElements() {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  const dots = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  return { path, dots }
}

describe('LaserTrailRenderer', () => {
  it('decays a 700ms trail through one imperative rAF loop', () => {
    const { path, dots } = svgElements()
    let now = 100
    let frame: FrameRequestCallback | undefined
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      frame = callback
      return 7
    })
    const renderer = new LaserTrailRenderer(path, dots, {
      now: () => now,
      requestFrame,
      cancelFrame: vi.fn(),
      reducedMotion: false,
    })

    renderer.addPoint({ x: 10, y: 20 })
    now = 160
    renderer.addPoint({ x: 30, y: 40 })

    expect(requestFrame).toHaveBeenCalledTimes(1)
    expect(path.getAttribute('d')).toContain('M 10 20')
    expect(dots.children).toHaveLength(2)

    now = 861
    frame?.(now)
    expect(path.getAttribute('d')).toBe('')
    expect(dots.children).toHaveLength(0)
  })

  it('disables decay animation under reduced motion and clears on finish', () => {
    const { path, dots } = svgElements()
    const requestFrame = vi.fn()
    const renderer = new LaserTrailRenderer(path, dots, {
      now: () => 100,
      requestFrame,
      cancelFrame: vi.fn(),
      reducedMotion: true,
    })

    renderer.addPoint({ x: 4, y: 6 })
    expect(requestFrame).not.toHaveBeenCalled()
    expect(dots.children).toHaveLength(1)
    renderer.finish()
    expect(path.getAttribute('d')).toBe('')
    expect(dots.children).toHaveLength(0)
  })
})
