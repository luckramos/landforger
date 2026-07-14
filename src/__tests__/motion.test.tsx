import { readFileSync } from 'node:fs'
import { render } from '@testing-library/react'
import { act } from 'react'
import { describe, expect, it } from 'vitest'
import { MotionRoot } from '../App'
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

describe('motion scale root sync', () => {
  it('persists settings per user and restores each user independently', () => {
    const storage = createInMemoryStorage()
    setUiStorage(storage)
    resetUiStore()

    useUiStore.getState().activateUser('sera@landforger.io')
    useUiStore.getState().setMotionScale(1.5)
    useUiStore.getState().setBodyFont('sans')
    useUiStore.getState().activateUser('mira@landforger.io')

    expect(useUiStore.getState()).toMatchObject({ motionScale: 1, bodyFont: 'serif' })
    useUiStore.getState().setMotionScale(0.5)

    resetUiStore()
    useUiStore.getState().activateUser('SERA@LANDFORGER.IO')
    expect(useUiStore.getState()).toMatchObject({ motionScale: 1.5, bodyFont: 'sans' })
    useUiStore.getState().activateUser('mira@landforger.io')
    expect(useUiStore.getState()).toMatchObject({ motionScale: 0.5, bodyFont: 'serif' })

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

  it('applies the selected Page body font live', () => {
    useSessionStore.setState({ user: { name: 'Sera Valen', email: 'sera@landforger.io' } })
    render(<MotionRoot><div /></MotionRoot>)

    act(() => useUiStore.getState().setBodyFont('sans'))
    expect(document.documentElement.style.getPropertyValue('--page-body-font')).toBe('var(--font-sans)')
    act(() => useUiStore.getState().setBodyFont('serif'))
    expect(document.documentElement.style.getPropertyValue('--page-body-font')).toBe('var(--font-serif)')

    const editorCss = readFileSync('src/editor/PageEditor.module.css', 'utf8')
    expect(editorCss).toContain('font-family: var(--page-body-font, var(--font-serif))')
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

  it('Spotlight uses the design open motion scaled by --mo', () => {
    const css = readFileSync('src/screens/Dashboard/SpotlightSearch.module.css', 'utf8')
    expect(css).toContain('calc(var(--mo, 1) * 160ms)')
    expect(css).toContain('calc(var(--mo, 1) * 200ms)')
    expect(css).toContain('var(--ease-house)')
  })

  it('keeps the eight dead prototype keyframes absent', () => {
    const cssFiles = [
      'src/styles/tokens.css',
      'src/screens/Auth/Auth.module.css',
      'src/screens/Worlds/Worlds.module.css',
      'src/screens/Dashboard/DashboardShell.module.css',
      'src/maps/MapScreen.module.css',
      'src/graph/GraphPanel.module.css',
    ].map((file) => readFileSync(file, 'utf8')).join('\n')

    for (const dead of ['lf-ring', 'lf-glowPulse', 'wf-drift', 'lw-shimmer', 'star-twinkle', 'arrow-draw', 'mp-bob', 'mp-tlOpen']) {
      expect(cssFiles).not.toContain(`@keyframes ${dead}`)
    }
  })

  it('guards the Maps load-bearing drill, crossfade and navigation-burst timings', () => {
    const css = readFileSync('src/maps/MapScreen.module.css', 'utf8')
    const source = readFileSync('src/maps/MapScreen.tsx', 'utf8')
    expect(css).toContain('calc(var(--mo,1) * 600ms) var(--ease-map-zoom)')
    expect(css).toContain('calc(var(--mo,1) * 520ms) ease')
    expect(css).toContain('calc(var(--mo,1) * 620ms) var(--ease-burst)')
    expect(source).toContain('640 * motionScale')
    expect(source).toContain('prefersReducedMotion() ? 60')
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
