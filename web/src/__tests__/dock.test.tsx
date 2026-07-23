import { readFileSync } from 'node:fs'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MotionRoot } from '../App'
import { LocalStorageWorldRepository } from '../repository/LocalStorageWorldRepository'
import { fixtureFiles } from '../repository/fixtures'
import { AppRoutes } from '../routes'
import { setRepository } from '../state/repository'
import { resetDockStore, setDockStorage, useDockStore } from '../state/dockStore'
import { useSessionStore } from '../state/sessionStore'
import { createInMemoryStorage } from './testStorage'

let dockStorage: Storage

beforeEach(() => {
  setRepository(new LocalStorageWorldRepository(createInMemoryStorage(), fixtureFiles))
  dockStorage = createInMemoryStorage()
  setDockStorage(dockStorage)
  resetDockStore()
})

afterEach(() => {
  setRepository(undefined)
  setDockStorage(null)
  resetDockStore()
})

async function renderAt(path: string) {
  const result = render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>)
  await act(async () => {})
  return result
}

/*
 * These two do NOT guard the sidebar-morph bug, and must not be mistaken for it.
 * Both passed against the broken code: Motion settles to its `animate` target
 * before the act() flush returns, so the DOM shows the same final geometry
 * whether or not `initial` carried it. The entrance is unobservable here —
 * happy-dom runs no animations, and there is no frame to catch.
 *
 * What actually guards the bug: the source-level assertion below that `initial`
 * spreads geometry, and the manual pass in issue #55.
 */
describe('dockable window resolved geometry', () => {
  it('fills the viewport when full-page', async () => {
    await renderAt('/w/ninth-vale?panel=graph')
    const dialog = await screen.findByRole('dialog', { name: 'Relationship graph' })
    expect(dialog.style.left).toBe('0px')
    expect(dialog.style.top).toBe('0px')
  })

  it('sits away from the origin when floating beside a focal Page', async () => {
    await renderAt('/w/ninth-vale/p/sera-valen?panel=graph')
    const dialog = await screen.findByRole('dialog', { name: 'Relationship graph' })
    expect(dialog.style.left).not.toBe('')
    expect(dialog.style.top).not.toBe('')
    expect(dialog.style.left).not.toBe('0px')
  })
})

describe('dockable window entrance motion', () => {
  const component = () => readFileSync('src/components/DockableWindow/DockableWindow.tsx', 'utf8')

  /*
   * happy-dom runs no animations, so these values are unobservable from the DOM.
   * This repo guards such constants by reading the source — same approach as
   * graph.test.tsx and the CSS guards in motion.test.tsx.
   */
  it('enters full-page on the same motion as the app route transition', () => {
    const shellCss = readFileSync('src/screens/Dashboard/DashboardShell.module.css', 'utf8')
    // The route transition every view already uses.
    expect(shellCss).toContain('@keyframes lw-view-in')
    expect(shellCss).toContain('translateY(10px) scale(.994)')
    expect(shellCss).toContain('calc(var(--mo, 1) * 300ms) var(--ease-house)')
    // The window's full-page entrance must be that same motion, expressed in JS.
    expect(component()).toContain('const FULLSCREEN_ENTRY = { opacity: 0, y: 10, scale: 0.994 }')
  })

  it('enters floating with a pop in place', () => {
    expect(component()).toContain('const FLOATING_ENTRY = { opacity: 0, scale: 0.96 }')
  })

  it('scales entrance durations by the motion scale and collapses under reduced motion', () => {
    // 300ms full-page (route parity), 200ms floating, multiply-is-slower.
    expect(component()).toContain("(mode === 'fullscreen' ? 0.3 : 0.2) * motionScale")
    expect(component()).toContain('reduced ? 0 :')
  })

  it('keeps the geometry morph on the house curve at 340ms', () => {
    expect(component()).toContain('0.34 * motionScale')
    expect(component()).toContain('ease: EASE_HOUSE')
  })

  it('carries the full geometry into initial so no mount morph is possible', () => {
    // The regression guard, at the source level: `initial` must spread geometry.
    expect(component()).toContain('initial={{ ...geometry,')
  })

  it('wires each mode to its own entry constant and spreads it into initial', () => {
    // Without this, the timing assertions above would pass even if the two
    // constants were swapped or bound to the wrong branch — happy-dom animates
    // nothing, so the wiring is only checkable at the source level.
    const src = component()
    expect(src).toContain("const entry = mode === 'fullscreen' ? FULLSCREEN_ENTRY : FLOATING_ENTRY")
    expect(src).toContain('initial={{ ...geometry, ...entry }}')
  })
})

describe('dockable window icon cross-fade (#66)', () => {
  const component = () => readFileSync('src/components/DockableWindow/DockableWindow.tsx', 'utf8')
  const motionPrefs = () => readFileSync('src/components/motionPrefs.ts', 'utf8')

  /*
   * The behavioral coexistence assertion lives in DockableWindow.test.tsx
   * (happy-dom can observe the DOM mid-swap). What it can't observe is the
   * actual animation values or the reduced-motion collapse — same reasoning
   * as the entrance-motion guards above — so those are guarded here at the
   * source level, reading the shared `iconCrossfadeTransition` seam.
   */
  it('wires the float/maximize toggle through AnimatePresence with the specified opacity/scale/blur cross-fade', () => {
    const src = component()
    expect(src).toContain('<AnimatePresence initial={false}>')
    expect(src).toContain("initial={{ opacity: 0, scale: 0.25, filter: 'blur(4px)' }}")
    expect(src).toContain("animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}")
    expect(src).toContain("exit={{ opacity: 0, scale: 0.25, filter: 'blur(4px)' }}")
    expect(src).toContain('transition={iconCrossfadeTransition(motionScale)}')
  })

  it('animates the cross-fade on a critically damped spring — bounce: 0 — collapsing to zero under reduced motion', () => {
    const src = motionPrefs()
    expect(src).toMatch(/export function iconCrossfadeTransition\(motionScale: number\) \{\s*return prefersReducedMotion\(\)\s*\?\s*\{ duration: 0 \}\s*:\s*\{ type: 'spring' as const, duration: 0\.3 \* motionScale, bounce: 0 \}/)
  })
})

describe('relationship graph through the store', () => {
  it('opens from the ?panel=graph deep link and strips the parameter', async () => {
    await renderAt('/w/ninth-vale?panel=graph')
    expect(await screen.findByRole('dialog', { name: 'Relationship graph' })).toBeTruthy()
    expect(useDockStore.getState().panels.graph.open).toBe(true)
    // The deep link is consumed: the store, not the URL, now owns what is open.
    expect(useDockStore.getState().panels.graph).toMatchObject({ open: true })
  })

  it('opens from the sidebar button without navigating away', async () => {
    await renderAt('/w/ninth-vale')
    expect(screen.queryByRole('dialog', { name: 'Relationship graph' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Graph view' }))
    await act(async () => {})
    expect(screen.getByRole('dialog', { name: 'Relationship graph' })).toBeTruthy()
  })

  it('stays open, mounted and unmoved when navigating underneath it', async () => {
    await renderAt('/w/ninth-vale?panel=graph')
    const dialog = await screen.findByRole('dialog', { name: 'Relationship graph' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Float window' }))
    await waitFor(() => expect(useDockStore.getState().panels.graph.mode).toBe('floating'))
    const geometryBefore = useDockStore.getState().panels.graph.geometry

    // Navigate to a Category underneath the window, via the sidebar specifically
    // (the graph's own Category filter shares the label).
    const sidebar = screen.getByRole('complementary', { name: 'World navigation' })
    fireEvent.click(within(sidebar).getByRole('link', { name: /Characters/i }))
    await act(async () => {})

    expect(screen.getByRole('dialog', { name: 'Relationship graph' })).toBeTruthy()
    expect(useDockStore.getState().panels.graph.geometry).toEqual(geometryBefore)
  })

  it('closing the graph preserves its remembered mode', async () => {
    // Sign a user in so preferences persist through the storage seam.
    useSessionStore.setState({ user: { name: 'Sera Valen', email: 'sera@landforger.io' } })
    useDockStore.getState().activateUser('sera@landforger.io')
    await renderAt('/w/ninth-vale?panel=graph')
    const dialog = await screen.findByRole('dialog', { name: 'Relationship graph' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Float window' }))
    await waitFor(() => expect(useDockStore.getState().panels.graph.mode).toBe('floating'))

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close Relationship graph' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Relationship graph' })).toBeNull())
    expect(useDockStore.getState().panels.graph.mode).toBe('floating')
  })

  it('loads the signed-in user dock prefs through the app root', async () => {
    useDockStore.getState().activateUser('sera@landforger.io')
    useDockStore.getState().setMode('graph', 'floating')
    resetDockStore()

    useSessionStore.setState({ user: { name: 'Sera Valen', email: 'sera@landforger.io' } })
    render(<MotionRoot><span>app</span></MotionRoot>)
    await waitFor(() => expect(useDockStore.getState().panels.graph.mode).toBe('floating'))
  })
})

describe('multiple dockable windows', () => {
  it('opens the Timeline and the Reference Canvas from their sidebar buttons, both on screen at once', async () => {
    await renderAt('/w/ninth-vale?panel=graph')
    await screen.findByRole('dialog', { name: 'Relationship graph' })
    const sidebar = screen.getByRole('complementary', { name: 'World navigation' })

    fireEvent.click(within(sidebar).getByRole('button', { name: 'Timeline' }))
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Reference canvas' }))
    await act(async () => {})

    expect(screen.getByRole('dialog', { name: 'Relationship graph' })).toBeTruthy()
    expect(screen.getByRole('dialog', { name: 'Timeline' })).toBeTruthy()
    expect(screen.getByRole('dialog', { name: 'Reference canvas' })).toBeTruthy()
  })

  it('opens each window from its own ?panel= deep link', async () => {
    for (const [param, name] of [
      ['timeline', 'Timeline'],
      ['canvas', 'Reference canvas'],
    ] as const) {
      resetDockStore()
      const view = await renderAt(`/w/ninth-vale?panel=${param}`)
      expect(await screen.findByRole('dialog', { name })).toBeTruthy()
      view.unmount()
    }
  })

  it('brings a background window to the front on pointer-down', async () => {
    await renderAt('/w/ninth-vale?panel=graph')
    await screen.findByRole('dialog', { name: 'Relationship graph' })
    fireEvent.click(within(screen.getByRole('complementary', { name: 'World navigation' })).getByRole('button', { name: 'Timeline' }))
    await act(async () => {})

    // The Timeline opened last, so it is on top.
    expect(useDockStore.getState().zOrder.at(-1)).toBe('timeline')
    fireEvent.pointerDown(screen.getByRole('dialog', { name: 'Relationship graph' }))
    expect(useDockStore.getState().zOrder.at(-1)).toBe('graph')
  })

  it('opening a second window never changes the first window mode', async () => {
    await renderAt('/w/ninth-vale?panel=graph')
    const graph = await screen.findByRole('dialog', { name: 'Relationship graph' })
    fireEvent.click(within(graph).getByRole('button', { name: 'Float window' }))
    await waitFor(() => expect(useDockStore.getState().panels.graph.mode).toBe('floating'))

    fireEvent.click(within(screen.getByRole('complementary', { name: 'World navigation' })).getByRole('button', { name: 'Timeline' }))
    await act(async () => {})

    // The Graph stays floating; the Timeline keeps its own (independent) mode.
    expect(useDockStore.getState().panels.graph.mode).toBe('floating')
    expect(useDockStore.getState().panels.timeline.mode).toBeUndefined()
  })
})

/*
 * The three windows share one DockLayer and one store path, so these invariants
 * should hold identically for each. Running them parametrically states that
 * equivalence outright rather than testing the Graph and assuming the rest.
 */
describe.each([
  { id: 'timeline', dialog: 'Timeline', button: 'Timeline' },
  { id: 'graph', dialog: 'Relationship graph', button: 'Graph view' },
  { id: 'canvas', dialog: 'Reference canvas', button: 'Reference canvas' },
] as const)('every dockable window ($id)', ({ id, dialog, button }) => {
  const sidebarButton = () =>
    within(screen.getByRole('complementary', { name: 'World navigation' })).getByRole('button', { name: button })

  it('reopens in the mode it was last left in', async () => {
    useSessionStore.setState({ user: { name: 'Sera Valen', email: 'sera@landforger.io' } })
    useDockStore.getState().activateUser('sera@landforger.io')
    await renderAt('/w/ninth-vale')
    fireEvent.click(sidebarButton())
    const panel = await screen.findByRole('dialog', { name: dialog })
    fireEvent.click(within(panel).getByRole('button', { name: 'Float window' }))
    await waitFor(() => expect(useDockStore.getState().panels[id].mode).toBe('floating'))

    fireEvent.click(within(panel).getByRole('button', { name: `Close ${dialog}` }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: dialog })).toBeNull())

    fireEvent.click(sidebarButton())
    const reopened = await screen.findByRole('dialog', { name: dialog })
    expect(reopened.getAttribute('data-dock-state')).toBe('floating')
  })

  it('stays open, mounted and unmoved when navigating underneath it', async () => {
    await renderAt('/w/ninth-vale')
    fireEvent.click(sidebarButton())
    const panel = await screen.findByRole('dialog', { name: dialog })
    fireEvent.click(within(panel).getByRole('button', { name: 'Float window' }))
    await waitFor(() => expect(useDockStore.getState().panels[id].mode).toBe('floating'))
    const geometryBefore = useDockStore.getState().panels[id].geometry

    const sidebar = screen.getByRole('complementary', { name: 'World navigation' })
    fireEvent.click(within(sidebar).getByRole('link', { name: /Characters/i }))
    await act(async () => {})

    expect(screen.getByRole('dialog', { name: dialog })).toBeTruthy()
    expect(useDockStore.getState().panels[id].geometry).toEqual(geometryBefore)
  })
})
