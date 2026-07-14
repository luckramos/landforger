import { readFileSync } from 'node:fs'
import { render } from '@testing-library/react'
import { act } from 'react'
import { describe, expect, it } from 'vitest'
import { MotionRoot } from '../App'
import { useUiStore } from '../state/uiStore'

describe('motion scale root sync', () => {
  it('writes --mo to the document root and tracks the store', () => {
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

  it('Spotlight uses the design open motion scaled by --mo', () => {
    const css = readFileSync('src/screens/Dashboard/SpotlightSearch.module.css', 'utf8')
    expect(css).toContain('calc(var(--mo, 1) * 160ms)')
    expect(css).toContain('calc(var(--mo, 1) * 200ms)')
    expect(css).toContain('var(--ease-house)')
  })
})
