import { readFileSync } from 'node:fs'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LocalStorageWorldRepository } from '../repository/LocalStorageWorldRepository'
import { fixtureFiles } from '../repository/fixtures'
import { AppRoutes } from '../routes'
import { setRepository } from '../state/repository'
import { createInMemoryStorage } from './testStorage'

beforeEach(() => {
  setRepository(new LocalStorageWorldRepository(createInMemoryStorage(), fixtureFiles))
})

afterEach(() => setRepository(undefined))

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
