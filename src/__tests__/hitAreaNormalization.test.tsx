import { readFileSync } from 'node:fs'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LocalStorageWorldRepository } from '../repository/LocalStorageWorldRepository'
import { fixtureFiles } from '../repository/fixtures'
import { AppRoutes } from '../routes'
import { setRepository } from '../state/repository'
import { resetDockStore, setDockStorage } from '../state/dockStore'
import { createInMemoryStorage } from './testStorage'

// Hit-area normalization (#59 / PRD #56): every interactive control in the
// chrome keeps its visible size, but the pointer target grows to the 40px
// desktop floor. The house pattern is a positioned pseudo-element
// (`::after`) with a negative `inset`, sized so the control's painted box
// plus the inset on each side clears 40px.
//
// Defect this rework fixes: a pseudo-element's target can legitimately
// exceed 40px, but in a *packed row* (small gap between same-class
// siblings) an over-sized inset reaches past the gap and paints on top of
// the neighbour's own visible box. Because ::after paints in DOM order, a
// later sibling's enlarged target then wins every hit-test in the overlap
// zone — clicking one control silently activates another. The fix for each
// packed row is either (a) raise the row's gap so the pitch (size + gap) is
// at least the enlarged target width, so targets can at most abut, or
// (b) grow the target on only the axis that's actually tight (Category
// pills, Map actions), so the tight axis never reaches the row's gap.
//
// happy-dom has no layout engine, so the actual computed hit box can't be
// measured (per PRD #56's Testing Decisions) — these tests parse the real
// numbers (size / gap / inset) out of the CSS text and assert the
// non-overlap inequality algebraically. That's what would have caught the
// original defect: `2 * |inset| + size <= size + gap`, i.e. target <= pitch.

/** Pull the first `-?\d+(\.\d+)?` captured by `pattern` out of `css`, or throw. */
function num(css: string, label: string, pattern: RegExp): number {
  const match = css.match(pattern)
  if (!match) throw new Error(`${label}: pattern not found (${pattern})`)
  return Number(match[1])
}

/** size + gap (the pitch) must be >= size + 2*|inset| (the target) — targets can at most abut. */
function assertPitchClearsTarget(size: number, gap: number, inset: number) {
  const pitch = size + gap
  const target = size + 2 * Math.abs(inset)
  expect(target).toBeGreaterThanOrEqual(40) // still clears the desktop floor
  expect(pitch).toBeGreaterThanOrEqual(target) // …but never overlaps a neighbour
}

describe('hit-area normalization (#59): packed-row targets never overlap a neighbour', () => {
  it('Reference Canvas tools/shape-picker: 25px buttons, 15px gap, -7.5px inset', () => {
    const css = readFileSync('src/canvas/ReferenceCanvasPanel.module.css', 'utf8')
    const size = num(css, 'tools button width', /\.tools button,\n\.shapePicker button \{[^}]*width: (-?\d+(?:\.\d+)?)px/)
    const toolsGap = num(css, 'tools gap', /\.tools \{[^}]*gap: (-?\d+(?:\.\d+)?)px/)
    const shapePickerGap = num(css, 'shapePicker gap', /\.shapePicker \{[^}]*gap: (-?\d+(?:\.\d+)?)px/)
    const inset = num(css, 'tools/shapePicker inset', /\.tools button::after,\n\.shapePicker button::after \{[^}]*inset: (-?\d+(?:\.\d+)?)px/)
    assertPitchClearsTarget(size, toolsGap, inset)
    assertPitchClearsTarget(size, shapePickerGap, inset)
  })

  it('Reference Canvas zoom controls: 18px side buttons, 22px gap, -11px inset', () => {
    const css = readFileSync('src/canvas/ReferenceCanvasPanel.module.css', 'utf8')
    const gap = num(css, 'canvas zoomControls gap', /\.zoomControls \{ display: grid; grid-template-columns: 18px 1fr 18px; gap: (-?\d+(?:\.\d+)?)px/)
    const height = num(css, 'canvas zoomControls button height', /\.zoomControls button \{[^}]*height: (-?\d+(?:\.\d+)?)px/)
    const inset = num(css, 'canvas zoomControls inset', /\.zoomControls button::after \{[^}]*inset: (-?\d+(?:\.\d+)?)px/)
    assertPitchClearsTarget(height, gap, inset)
  })

  it('Reference Canvas palette: restructured to real 40px grid cells (no pseudo-element, so no possible overlap) with an 11px inner dot', () => {
    const css = readFileSync('src/canvas/ReferenceCanvasPanel.module.css', 'utf8')
    expect(css).toContain('grid-template-columns: repeat(4, 40px);')
    expect(css).toMatch(/\.palette button \{[^}]*width: 40px;[^}]*height: 40px;/)
    expect(css).toMatch(/\.palette \.dot \{[^}]*width: 11px;[^}]*height: 11px;/)
    // Real grid cells, not an enlarged pseudo-element target — nothing to overlap.
    expect(css).not.toMatch(/\.palette button::after/)
  })

  it('editor toolbar: 29px buttons, 11px gap, -5.5px inset', () => {
    const css = readFileSync('src/editor/PageEditor.module.css', 'utf8')
    const gap = num(css, 'toolbar gap', /\.toolbar \{[^}]*gap: (-?\d+(?:\.\d+)?)px/)
    const size = num(css, 'button height', /\.button \{[^}]*height: (-?\d+(?:\.\d+)?)px/)
    const inset = num(css, 'button inset', /\.button::after \{[^}]*inset: (-?\d+(?:\.\d+)?)px/)
    assertPitchClearsTarget(size, gap, inset)
  })

  it('Relationship Graph Category pills: only the tight (vertical) axis grows, so the row gap is irrelevant', () => {
    const css = readFileSync('src/graph/GraphPanel.module.css', 'utf8')
    // Asymmetric inset: "-Npx 0" means 0 horizontal growth, so the target
    // can never reach into the row's gap — the overlap-prevention argument
    // doesn't depend on the gap value at all, unlike the other rows.
    const match = css.match(/\.categories button::after \{[^}]*inset: (-?\d+(?:\.\d+)?)px 0;/)
    expect(match).toBeTruthy()
    const verticalInset = Number(match![1])
    const border = 1
    const padding = num(css, 'categories button padding', /\.categories button \{[^}]*padding: (\d+)px/)
    // line-height is pinned to 1 so the content row's height is provably
    // max(icon 12px, text line-box == font-size == 11px) == 12px.
    expect(css).toMatch(/\.categories button \{[^}]*line-height: 1;/)
    const contentHeight = 12
    const nativeHeight = 2 * border + 2 * padding + contentHeight
    const targetHeight = nativeHeight + 2 * Math.abs(verticalInset)
    expect(targetHeight).toBeGreaterThanOrEqual(40)
  })

  it('Relationship Graph zoom controls: 32px buttons, 8px gap, -4px inset', () => {
    const css = readFileSync('src/graph/GraphPanel.module.css', 'utf8')
    const gap = num(css, 'graph zoomControls gap', /\.zoomControls \{[^}]*gap: (-?\d+(?:\.\d+)?)px/)
    const size = num(css, 'graph zoomControls button width', /\.zoomControls button \{[^}]*width: (-?\d+(?:\.\d+)?)px/)
    const inset = num(css, 'graph zoomControls inset', /\.zoomControls button::after \{[^}]*inset: (-?\d+(?:\.\d+)?)px;/)
    assertPitchClearsTarget(size, gap, inset)
  })

  it('DockableWindow controls: 30px buttons, 10px gap, -5px inset', () => {
    const css = readFileSync('src/components/DockableWindow/DockableWindow.module.css', 'utf8')
    const gap = num(css, 'controls gap', /\.controls \{[^}]*gap: (-?\d+(?:\.\d+)?)px/)
    const size = num(css, 'controls button width', /\.controls button \{[^}]*width: (-?\d+(?:\.\d+)?)px/)
    const inset = num(css, 'controls inset', /\.controls button::after \{[^}]*inset: (-?\d+(?:\.\d+)?)px/)
    assertPitchClearsTarget(size, gap, inset)
  })

  it('Map actions: only the tight (vertical) axis grows to the floor; horizontal growth is capped at half the row gap', () => {
    const css = readFileSync('src/maps/MapScreen.module.css', 'utf8')
    const gap = num(css, 'mapActions gap', /\.mapActions \{[^}]*gap: (-?\d+(?:\.\d+)?)px/)
    const height = num(css, 'mapActions button height', /\.mapActions button,\.mapActions a \{[^}]*height: (-?\d+(?:\.\d+)?)px/)
    const match = css.match(/\.mapActions button::after,\.mapActions a::after \{[^}]*inset: (-?\d+(?:\.\d+)?)px (-?\d+(?:\.\d+)?)px;/)
    expect(match).toBeTruthy()
    const verticalInset = Number(match![1])
    const horizontalInset = Number(match![2])
    // Vertical: isolated (no row above/below), so just needs to clear the floor.
    expect(height + 2 * Math.abs(verticalInset)).toBeGreaterThanOrEqual(40)
    // Horizontal: the safety property is 2*|inset| <= gap (both neighbours
    // grow toward each other by |inset| and can at most meet at the midpoint).
    expect(2 * Math.abs(horizontalInset)).toBeLessThanOrEqual(gap)
    // And it still has to clear the floor for the narrowest (icon-only) button:
    // icon 16 + padding 10*2 + border 1*2 = 38px native width.
    const narrowestNativeWidth = 38
    expect(narrowestNativeWidth + 2 * Math.abs(horizontalInset)).toBeGreaterThanOrEqual(40)
  })

  it('Properties steppers: the ::after can only reach the numberInput, never the other stepper — 26px buttons, 14px gap, -7px inset', () => {
    const css = readFileSync('src/properties/Properties.module.css', 'utf8')
    const gap = num(css, 'numberField gap', /\.numberField \{[^}]*gap: (-?\d+(?:\.\d+)?)px/)
    const size = num(css, 'stepButton width', /\.stepButton \{[^}]*width: (-?\d+(?:\.\d+)?)px/)
    const inset = num(css, 'stepButton inset', /\.stepButton::after \{[^}]*inset: (-?\d+(?:\.\d+)?)px/)
    assertPitchClearsTarget(size, gap, inset)
  })

  it('Properties row icon buttons (settings gear + remove): 26px buttons (14 icon + 5+5 padding + 1+1 border), 14px gap, -7px inset', () => {
    const css = readFileSync('src/properties/Properties.module.css', 'utf8')
    const gap = num(css, 'rowActions gap', /\.rowActions \{[^}]*gap: (-?\d+(?:\.\d+)?)px/)
    const icon = 14
    const padding = num(css, 'iconButton padding', /\.iconButton, \.topActions button \{[^}]*padding: (-?\d+(?:\.\d+)?)px/)
    const border = 1
    const size = icon + 2 * padding + 2 * border
    const inset = num(css, 'iconButton inset', /\.iconButton::after, \.topActions button::after \{[^}]*inset: (-?\d+(?:\.\d+)?)px/)
    assertPitchClearsTarget(size, gap, inset)
  })

  it('Dashboard nav items: stacked vertically, 36px rows, 4px column gap, -2px vertical inset', () => {
    const css = readFileSync('src/screens/Dashboard/DashboardShell.module.css', 'utf8')
    expect(css).toMatch(/\.primaryNav, \.bottomNav \{[^}]*display: flex;[^}]*flex-direction: column;[^}]*gap: 4px;/)
    const gap = num(css, 'primaryNav/bottomNav gap', /\.primaryNav, \.bottomNav \{[^}]*gap: (-?\d+(?:\.\d+)?)px/)
    const size = num(css, 'navItem height', /\.navItem \{[^}]*height: (-?\d+(?:\.\d+)?)px/)
    const match = css.match(/\.navItem::after \{[^}]*inset: (-?\d+(?:\.\d+)?)px 0;/)
    expect(match).toBeTruthy()
    const inset = Number(match![1])
    assertPitchClearsTarget(size, gap, inset)
  })
})

describe('hit-area normalization (#59): isolated / already-safe controls keep a plain negative-inset ::after', () => {
  it('Dashboard shell: icon button, topbar buttons, search trigger', () => {
    const css = readFileSync('src/screens/Dashboard/DashboardShell.module.css', 'utf8')
    expect(css).toContain(".iconButton { width: 26px; height: 26px;")
    expect(css).toContain('.iconButton::after { content: \'\'; position: absolute; inset: -8px; }')
    expect(css).toContain(".topbarButton { display: grid; width: 30px; height: 30px;")
    expect(css).toContain('.topbarButton::after { content: \'\'; position: absolute; inset: -6px; }')
    expect(css).toContain(".searchTrigger { position: relative;")
    expect(css).toContain('.searchTrigger::after { content: \'\'; position: absolute; inset: -4px 0; }')
  })

  it('Properties: the date trigger is the sole control in its field — isolated', () => {
    const css = readFileSync('src/properties/Properties.module.css', 'utf8')
    expect(css).toContain('.dateTrigger::after {')
    expect(css).toContain('inset: -8px;')
  })

  it('Auth: the password-reveal eye is isolated inside its input', () => {
    const css = readFileSync('src/screens/Auth/Auth.module.css', 'utf8')
    expect(css).toContain('.eyeButton::after {')
    expect(css).toContain('inset: -6px;')
  })

  it('the User Menu avatar trigger is isolated', () => {
    const css = readFileSync('src/components/UserMenu/UserMenu.module.css', 'utf8')
    expect(css).toContain('.avatar::after {')
    expect(css).toContain('inset: -4px;')
  })

  it('Maps: the touching zoom segments get a direct size bump (a pseudo-element would be clipped)', () => {
    const css = readFileSync('src/maps/MapScreen.module.css', 'utf8')
    expect(css).toContain('.zoomControls button { min-width: 40px; height: 40px;')
    expect(css).not.toContain('min-width: 34px')
  })

  it('Timeline occurrence buttons are separated by a non-interactive span, not another button', () => {
    const css = readFileSync('src/timeline/TimelinePanel.module.css', 'utf8')
    expect(css).toContain('.occurrences button::after { content: \'\'; position: absolute; inset: -8px; }')
  })

  it('Page action pills use a padding bump, not ::after, and never overlap in the packed row', () => {
    const css = readFileSync('src/screens/PageScreen.module.css', 'utf8')
    // Skinny-row exception (ADR 0002): these pills deliberately sit below the
    // 40px desktop floor. The padding bump (not ::after) is kept so the packed
    // 8px-gap row still can't overlap — a smaller box only makes that safer.
    expect(css).toContain('padding: 5px 11px;')
    expect(css).not.toContain('.pageAction::after')
    expect(css).toContain('gap: 8px;')
  })

  it('Create World genre chips use a padding bump, not ::after, and never overlap in the packed row', () => {
    const css = readFileSync('src/screens/Worlds/CreateWorldModal.module.css', 'utf8')
    expect(css).toContain('padding: 13px 12px;')
    expect(css).not.toContain('.chip::after')
    expect(css).toContain('gap: 8px;')
  })

  it('every hit-area ::after collapses to nothing under prefers-reduced-motion (none animate, so none opt out of the universal collapse)', () => {
    const files = [
      'src/canvas/ReferenceCanvasPanel.module.css',
      'src/screens/Dashboard/DashboardShell.module.css',
      'src/properties/Properties.module.css',
      'src/screens/Auth/Auth.module.css',
      'src/editor/PageEditor.module.css',
      'src/components/DockableWindow/DockableWindow.module.css',
      'src/components/UserMenu/UserMenu.module.css',
      'src/graph/GraphPanel.module.css',
      'src/maps/MapScreen.module.css',
      'src/timeline/TimelinePanel.module.css',
    ]
    for (const file of files) {
      const css = readFileSync(file, 'utf8')
      const hitAreaRules = css.match(/::after(?:,\s*\n?[^{]*::after)*\s*{[^}]*}/g) ?? []
      for (const rule of hitAreaRules) {
        expect(rule).not.toMatch(/transition|animation/)
      }
    }
  })
})

describe('hit-area normalization (#59): Reference Canvas palette behaviour', () => {
  let repository: LocalStorageWorldRepository
  let storage: Storage

  beforeEach(() => {
    storage = createInMemoryStorage()
    repository = new LocalStorageWorldRepository(storage, fixtureFiles)
    setRepository(repository)
    setDockStorage(createInMemoryStorage())
    resetDockStore()
  })

  afterEach(() => {
    setRepository(undefined)
    setDockStorage(null)
  })

  it('a swatch button paints its color on an inner 11px dot, not on the 40px button itself', async () => {
    render(
      <MemoryRouter initialEntries={['/w/ninth-vale?panel=canvas']}>
        <AppRoutes />
      </MemoryRouter>,
    )
    await act(async () => {})

    const dialog = await screen.findByRole('dialog', { name: 'Reference canvas' })
    const swatch = within(dialog).getAllByRole('button', { name: /^Use color/ })[0]

    // The color moved off the button (which is now just the 40px hit target)…
    expect(swatch.style.background).toBe('')
    // …and onto an inner element that carries the color as its painted style.
    const dot = swatch.querySelector('span')
    expect(dot).toBeTruthy()
    expect(dot!.style.background).not.toBe('')
    expect(swatch.getAttribute('aria-pressed')).not.toBeNull()
  })
})
