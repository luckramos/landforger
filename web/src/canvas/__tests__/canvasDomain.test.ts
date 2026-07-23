import { describe, expect, it } from 'vitest'
import { smoothStrokePath } from '../canvasDomain'

describe('reference canvas stroke smoothing', () => {
  it('turns sampled pencil points into a quadratic-smoothed SVG path', () => {
    const path = smoothStrokePath([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 0 },
      { x: 30, y: 10 },
    ])
    expect(path.startsWith('M 0 0')).toBe(true)
    expect(path).toContain('Q')
    expect(path.trimEnd().endsWith('L 30 10')).toBe(true)
  })

  it('degrades gracefully for zero, one and two points', () => {
    expect(smoothStrokePath([])).toBe('')
    expect(smoothStrokePath([{ x: 3, y: 4 }])).toBe('M 3 4')
    expect(smoothStrokePath([{ x: 0, y: 0 }, { x: 5, y: 5 }])).toBe('M 0 0 L 5 5')
  })
})
