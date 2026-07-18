import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PageWidthControl } from '../screens/PageWidthControl'
import {
  DEFAULT_USER_SETTINGS,
  MAX_PAGE_WIDTH,
  MIN_PAGE_WIDTH,
  setUiStorage,
  useUiStore,
} from '../state/uiStore'
import { createInMemoryStorage } from './testStorage'

beforeEach(() => {
  setUiStorage(createInMemoryStorage())
  useUiStore.setState({ activeUserId: undefined, settingsByUser: {}, ...DEFAULT_USER_SETTINGS })
})

afterEach(() => {
  cleanup()
  setUiStorage(null)
})

describe('uiStore pageWidth', () => {
  it('defaults to the minimum (current fixed) measure', () => {
    expect(useUiStore.getState().pageWidth).toBe(MIN_PAGE_WIDTH)
  })

  it('clamps below the minimum and above the maximum', () => {
    useUiStore.getState().setPageWidth(100)
    expect(useUiStore.getState().pageWidth).toBe(MIN_PAGE_WIDTH)
    useUiStore.getState().setPageWidth(99999)
    expect(useUiStore.getState().pageWidth).toBe(MAX_PAGE_WIDTH)
  })

  it('rounds fractional widths and rejects non-finite input', () => {
    useUiStore.getState().setPageWidth(800.6)
    expect(useUiStore.getState().pageWidth).toBe(801)
    useUiStore.getState().setPageWidth(Number.NaN)
    expect(useUiStore.getState().pageWidth).toBe(MIN_PAGE_WIDTH)
  })

  it('persists per user and reloads the saved width on re-activation', () => {
    useUiStore.getState().activateUser('scribe@ninth-vale.test')
    useUiStore.getState().setPageWidth(880)
    expect(useUiStore.getState().pageWidth).toBe(880)

    // Sign out, then back in — the saved measure comes back from storage.
    useUiStore.getState().activateUser(undefined)
    expect(useUiStore.getState().pageWidth).toBe(MIN_PAGE_WIDTH)
    useUiStore.getState().activateUser('scribe@ninth-vale.test')
    expect(useUiStore.getState().pageWidth).toBe(880)
  })

  it('preserves the other setting when only one is changed', () => {
    useUiStore.getState().activateUser('scribe@ninth-vale.test')
    useUiStore.getState().setMotionScale(1.4)
    useUiStore.getState().setPageWidth(760)

    useUiStore.getState().activateUser(undefined)
    useUiStore.getState().activateUser('scribe@ninth-vale.test')
    expect(useUiStore.getState().motionScale).toBe(1.4)
    expect(useUiStore.getState().pageWidth).toBe(760)
  })
})

describe('uiStore toolbarAnchor', () => {
  it('defaults to the top dock', () => {
    expect(useUiStore.getState().toolbarAnchor).toBe('top')
  })

  it('normalizes anything but "bottom" back to "top"', () => {
    useUiStore.getState().setToolbarAnchor('bottom')
    expect(useUiStore.getState().toolbarAnchor).toBe('bottom')
    useUiStore.getState().setToolbarAnchor('sideways' as never)
    expect(useUiStore.getState().toolbarAnchor).toBe('top')
  })

  it('persists per user and reloads the saved dock on re-activation', () => {
    useUiStore.getState().activateUser('scribe@ninth-vale.test')
    useUiStore.getState().setToolbarAnchor('bottom')
    expect(useUiStore.getState().toolbarAnchor).toBe('bottom')

    // Sign out (back to default), then in — the saved dock returns from storage.
    useUiStore.getState().activateUser(undefined)
    expect(useUiStore.getState().toolbarAnchor).toBe('top')
    useUiStore.getState().activateUser('scribe@ninth-vale.test')
    expect(useUiStore.getState().toolbarAnchor).toBe('bottom')
  })
})

describe('PageWidthControl', () => {
  it('renders a slider bounded by the given min/max at the current value', () => {
    render(<PageWidthControl value={800} min={MIN_PAGE_WIDTH} max={MAX_PAGE_WIDTH} onChange={() => {}} />)
    const slider = screen.getByRole('slider', { name: 'Page width' }) as HTMLInputElement
    expect(slider.min).toBe(String(MIN_PAGE_WIDTH))
    expect(slider.max).toBe(String(MAX_PAGE_WIDTH))
    expect(slider.value).toBe('800')
  })

  it('reports the width in px and calls onChange with a number', () => {
    const onChange = vi.fn()
    render(<PageWidthControl value={800} min={MIN_PAGE_WIDTH} max={MAX_PAGE_WIDTH} onChange={onChange} />)
    // getByText throws if the readout is absent, so this asserts its presence.
    expect(screen.getByText('800px').textContent).toBe('800px')

    fireEvent.change(screen.getByRole('slider', { name: 'Page width' }), { target: { value: '920' } })
    expect(onChange).toHaveBeenCalledWith(920)
  })

  it('stays mounted and interactive with no focus-mode fade flag', () => {
    render(<PageWidthControl value={800} min={MIN_PAGE_WIDTH} max={MAX_PAGE_WIDTH} onChange={() => {}} />)
    const control = screen.getByRole('slider', { name: 'Page width' }).parentElement
    // The measure control is always available now — no distraction-free hide.
    expect(control?.hasAttribute('data-focus')).toBe(false)
  })
})
