import { describe, expect, it } from 'vitest'
import type { CanvasItem } from '../types'
import {
  eraseItemsAlongSegment,
  marqueeSelection,
  screenToCanvasPoint,
  smoothStrokePath,
  snapRectToGrid,
  zoomViewportAt,
} from '../canvasDomain'

const items: CanvasItem[] = [
  { id: 'note', kind: 'sticky', x: 8, y: 8, width: 80, height: 64, color: '#ffd166', text: 'Tide notes' },
  { id: 'far', kind: 'shape', x: 240, y: 180, width: 64, height: 64, color: '#7bdff2', shape: 'diamond' },
  {
    id: 'stroke',
    kind: 'stroke',
    x: 0,
    y: 0,
    width: 100,
    height: 20,
    color: '#fff',
    points: [{ x: 110, y: 100 }, { x: 160, y: 100 }, { x: 200, y: 110 }],
  },
]

describe('reference canvas domain', () => {
  it('snaps position and size to the 8px grid', () => {
    expect(snapRectToGrid({ x: 13, y: 18, width: 45, height: 51 })).toEqual({ x: 16, y: 16, width: 48, height: 48 })
  })

  it('keeps the canvas point under the cursor fixed while zooming', () => {
    const viewport = { panX: 20, panY: 10, zoom: 1 }
    expect(screenToCanvasPoint({ x: 100, y: 60 }, viewport)).toEqual({ x: 80, y: 50 })
    expect(zoomViewportAt(viewport, { x: 100, y: 60 }, 2)).toEqual({ panX: -60, panY: -40, zoom: 2 })
  })

  it('marquee-selects every item intersecting the drag rectangle', () => {
    expect(marqueeSelection(items, { x: 0, y: 0, width: 120, height: 120 })).toEqual(['note', 'stroke'])
  })

  it('erases cards and strokes hit by a pointer segment', () => {
    expect(eraseItemsAlongSegment(items, { x: 90, y: 100 }, { x: 180, y: 100 }).map((item) => item.id)).toEqual(['note', 'far'])
    expect(eraseItemsAlongSegment(items, { x: 0, y: 40 }, { x: 100, y: 40 }).map((item) => item.id)).toEqual(['far', 'stroke'])
  })

  it('turns sampled pencil points into a quadratic-smoothed SVG path', () => {
    expect(smoothStrokePath([{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 16, y: 8 }, { x: 24, y: 8 }])).toBe(
      'M 0 0 Q 8 0 12 4 Q 16 8 20 8 L 24 8',
    )
  })
})
