import { readFileSync } from 'node:fs'
import { render } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MotionRoot } from '../App'
import { resetDockStore, setDockStorage } from '../state/dockStore'
import { DEFAULT_USER_SETTINGS, setUiStorage, useUiStore } from '../state/uiStore'
import { useSessionStore } from '../state/sessionStore'
import { createInMemoryStorage } from './testStorage'

function resetUiStore() {
  useUiStore.setState({
    activeUserId: undefined,
    settingsByUser: {},
    ...DEFAULT_USER_SETTINGS,
  })
}

// MotionRoot now activates the dock store for the signed-in user, so it must
// write to an injected seam here — not ambient localStorage — and reset between
// cases like the UI store already does.
beforeEach(() => {
  setDockStorage(createInMemoryStorage())
  resetDockStore()
})

afterEach(() => {
  setDockStorage(null)
  resetDockStore()
})

describe('motion scale root sync', () => {
  it('persists settings per user and restores each user independently', () => {
    const storage = createInMemoryStorage()
    setUiStorage(storage)
    resetUiStore()

    useUiStore.getState().activateUser('sera@landforger.io')
    useUiStore.getState().setMotionScale(1.5)
    useUiStore.getState().activateUser('mira@landforger.io')

    expect(useUiStore.getState()).toMatchObject({ motionScale: 1 })
    useUiStore.getState().setMotionScale(0.5)

    resetUiStore()
    useUiStore.getState().activateUser('SERA@LANDFORGER.IO')
    expect(useUiStore.getState()).toMatchObject({ motionScale: 1.5 })
    useUiStore.getState().activateUser('mira@landforger.io')
    expect(useUiStore.getState()).toMatchObject({ motionScale: 0.5 })

    setUiStorage(null)
    resetUiStore()
  })

  it('writes --mo to the document root and tracks the store', () => {
    useSessionStore.setState({ user: { name: 'Sera Valen', email: 'sera@landforger.io' } })
    render(
      <MotionRoot>
        <div />
      </MotionRoot>,
    )
    expect(document.documentElement.style.getPropertyValue('--mo')).toBe('1')

    act(() => useUiStore.getState().setMotionScale(1.5))
    expect(document.documentElement.style.getPropertyValue('--mo')).toBe('1.5')

    act(() => useUiStore.getState().setMotionScale(1))
  })

  it('placeholder screens scale their entrance by --mo (multiply-is-slower)', async () => {
    const css = readFileSync('src/screens/Placeholder.module.css', 'utf8')
    expect(css).toContain('calc(var(--mo, 1) * 300ms)')
    expect(css).toContain('var(--ease-house)')

    // and the animated class is actually applied by the component
    const { MemoryRouter } = await import('react-router-dom')
    const { NotFound } = await import('../screens/Placeholder')
    const styles = (await import('../screens/Placeholder.module.css')).default
    const { container } = render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>,
    )
    expect(container.querySelector('main')?.className).toBe(styles.screen)
  })

  it('global.css collapses animation under prefers-reduced-motion', () => {
    const css = readFileSync('src/styles/global.css', 'utf8')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toContain('animation-duration: 0.01ms !important')
    expect(css).toContain('transition-duration: 0.01ms !important')
  })

  it('global.css pins a single app-wide bronze :focus-visible ring (#41)', () => {
    const css = readFileSync('src/styles/global.css', 'utf8')
    expect(css).toContain(':focus-visible {')
    expect(css).toContain('outline: 2px solid var(--bronze)')
    // Keyboard-only: the rule must live on :focus-visible, not the plain
    // :focus pseudo-class, or mouse/pointer activation would show it too.
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(withoutComments.match(/:focus(?!-visible)/g)).toBeNull()
  })

  it('Spotlight uses the design open motion scaled by --mo', () => {
    const css = readFileSync('src/screens/Dashboard/SpotlightSearch.module.css', 'utf8')
    expect(css).toContain('calc(var(--mo, 1) * 160ms)')
    expect(css).toContain('calc(var(--mo, 1) * 200ms)')
    expect(css).toContain('var(--ease-house)')
  })

  it('keeps the dead prototype and retired burst keyframes absent', () => {
    const cssFiles = [
      'src/styles/tokens.css',
      'src/screens/Auth/Auth.module.css',
      'src/screens/Worlds/Worlds.module.css',
      'src/screens/Dashboard/DashboardShell.module.css',
      'src/maps/MapScreen.module.css',
      'src/graph/GraphPanel.module.css',
    ].map((file) => readFileSync(file, 'utf8')).join('\n')

    const deadPrototypes = ['lf-ring', 'lf-glowPulse', 'wf-drift', 'lw-shimmer', 'star-twinkle', 'arrow-draw', 'mp-bob', 'mp-tlOpen']
    // The expanding burst disc, replaced by the View Transitions route fade.
    const retiredBurst = ['auth-burst', 'auth-scrim-fade', 'auth-spin', 'auth-content-fade', 'map-navigation-burst', 'nb-expand', 'nb-fade']
    for (const dead of [...deadPrototypes, ...retiredBurst]) {
      expect(cssFiles).not.toContain(`@keyframes ${dead}`)
    }
  })

  it('guards the Maps load-bearing drill and crossfade timings', () => {
    const css = readFileSync('src/maps/MapScreen.module.css', 'utf8')
    expect(css).toContain('calc(var(--mo,1) * 600ms) var(--ease-map-zoom)')
    expect(css).toContain('calc(var(--mo,1) * 520ms) ease')
  })

  // The burst disc is retired: route changes ride the View Transitions API.
  // These pseudo-elements sit outside the universal `*` reduced-motion collapse,
  // so they need their own guard — and they must stay on the house curve/scale.
  it('routes transition through scaled, reduced-motion-safe view transitions', () => {
    const css = readFileSync('src/styles/global.css', 'utf8')
    expect(css).toContain('::view-transition-old(root)')
    expect(css).toContain('::view-transition-new(root)')
    expect(css).toContain('calc(var(--mo, 1) * 320ms) var(--ease-house)')
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*::view-transition-old\(root\),\s*::view-transition-new\(root\)/)
  })

  it('records reduced-motion verification for all five catalog screens and top-10 sign-off', () => {
    const audit = readFileSync('docs/research/motion-audit-checklist.md', 'utf8')
    for (const screenName of ['Auth', 'Worlds', 'Dashboard', 'Maps', 'UserMenu']) {
      expect(audit).toContain(screenName)
    }
    expect(audit.match(/- \[x\] \d+\./g)).toHaveLength(10)
    expect(audit).toContain('All eight dead prototype keyframes are absent')
  })
})
