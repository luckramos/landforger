import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_DOCK_PREFS,
  dockZIndex,
  resetDockStore,
  setDockStorage,
  useDockStore,
} from '../state/dockStore'
import { createInMemoryStorage } from './testStorage'

let storage: Storage

beforeEach(() => {
  storage = createInMemoryStorage()
  setDockStorage(storage)
  resetDockStore()
})

afterEach(() => {
  setDockStorage(null)
  resetDockStore()
})

describe('dockStore', () => {
  it('starts with every panel closed and no persisted mode opinion', () => {
    const { panels, zOrder } = useDockStore.getState()
    expect(panels.graph.open).toBe(false)
    // Absent mode is the signal the window falls back to its own defaultMode.
    expect(panels.graph.mode).toBeUndefined()
    expect(panels.graph.geometry).toEqual(DEFAULT_DOCK_PREFS.graph.geometry)
    expect(zOrder).toEqual([])
  })

  it('persists mode and geometry per user and restores them on activateUser', () => {
    const { activateUser, setMode, setGeometry } = useDockStore.getState()
    activateUser('Sera@LandForger.io')
    setMode('graph', 'floating')
    setGeometry('graph', { x: 120, y: 90, width: 700, height: 480 })

    // A different user must not inherit the first user's habits.
    useDockStore.getState().activateUser('other@landforger.io')
    expect(useDockStore.getState().panels.graph.mode).toBeUndefined()

    // Email casing must not fork the record.
    useDockStore.getState().activateUser('sera@landforger.io')
    expect(useDockStore.getState().panels.graph.mode).toBe('floating')
    expect(useDockStore.getState().panels.graph.geometry).toEqual({ x: 120, y: 90, width: 700, height: 480 })
  })

  it('does not persist open or minimized state', () => {
    const { activateUser, open, setMinimized } = useDockStore.getState()
    activateUser('sera@landforger.io')
    open('timeline')
    setMinimized('timeline', true)

    resetDockStore()
    useDockStore.getState().activateUser('sera@landforger.io')
    expect(useDockStore.getState().panels.timeline.open).toBe(false)
    expect(useDockStore.getState().panels.timeline.minimized).toBe(false)
  })

  it('clamps restored geometry into the current viewport', () => {
    const { activateUser, setGeometry } = useDockStore.getState()
    activateUser('sera@landforger.io')
    // Store a window parked far off the right edge of a wider monitor.
    setGeometry('canvas', { x: 5000, y: 4000, width: 820, height: 620 })

    resetDockStore()
    useDockStore.getState().activateUser('sera@landforger.io')
    const restored = useDockStore.getState().panels.canvas.geometry
    expect(restored.x).toBeLessThanOrEqual(window.innerWidth)
    expect(restored.y).toBeLessThanOrEqual(window.innerHeight)
  })

  it('opens a panel at the top of the z-order and focus brings a panel to front', () => {
    const { open, focus } = useDockStore.getState()
    open('graph')
    open('timeline')
    expect(useDockStore.getState().zOrder).toEqual(['graph', 'timeline'])
    expect(dockZIndex(useDockStore.getState().zOrder, 'timeline')).toBeGreaterThan(
      dockZIndex(useDockStore.getState().zOrder, 'graph'),
    )

    focus('graph')
    expect(useDockStore.getState().zOrder).toEqual(['timeline', 'graph'])
    expect(dockZIndex(useDockStore.getState().zOrder, 'graph')).toBeGreaterThan(
      dockZIndex(useDockStore.getState().zOrder, 'timeline'),
    )
  })

  it('closing removes the panel from the z-order and keeps its prefs', () => {
    const { open, setMode, close } = useDockStore.getState()
    open('graph')
    setMode('graph', 'floating')
    close('graph')
    expect(useDockStore.getState().zOrder).toEqual([])
    expect(useDockStore.getState().panels.graph.open).toBe(false)
    expect(useDockStore.getState().panels.graph.mode).toBe('floating')
  })

  it('survives corrupt stored JSON without throwing', () => {
    storage.setItem('landforger:dock:v1', '{ this is not json')
    expect(() => useDockStore.getState().activateUser('sera@landforger.io')).not.toThrow()
    expect(useDockStore.getState().panels.graph.mode).toBeUndefined()
  })

  it('keeps working when storage is unavailable', () => {
    setDockStorage(null)
    resetDockStore()
    const { activateUser, setMode } = useDockStore.getState()
    activateUser('sera@landforger.io')
    expect(() => setMode('graph', 'floating')).not.toThrow()
    expect(useDockStore.getState().panels.graph.mode).toBe('floating')
  })
})
