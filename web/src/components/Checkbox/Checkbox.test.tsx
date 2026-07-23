import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Checkbox } from './Checkbox'

describe('Checkbox', () => {
  it('renders a native checkbox with its label as the accessible name', () => {
    render(<Checkbox>Remember me</Checkbox>)
    const box = screen.getByRole('checkbox', { name: 'Remember me' })
    expect((box as HTMLInputElement).type).toBe('checkbox')
  })

  it('reflects the controlled checked state', () => {
    const { rerender } = render(<Checkbox checked readOnly>Era-linked</Checkbox>)
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true)
    rerender(<Checkbox checked={false} readOnly>Era-linked</Checkbox>)
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false)
  })

  it('fires onChange when toggled', () => {
    const onChange = vi.fn()
    render(<Checkbox checked={false} onChange={onChange}>Apply template</Checkbox>)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Apply template' }))
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('blocks interaction while disabled', () => {
    const onChange = vi.fn()
    render(<Checkbox disabled onChange={onChange}>Off</Checkbox>)
    const box = screen.getByRole('checkbox', { name: 'Off' }) as HTMLInputElement
    expect(box.disabled).toBe(true)
    fireEvent.click(box)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('supports a standalone box via aria-label', () => {
    render(<Checkbox aria-label="Select row" />)
    expect(screen.getByRole('checkbox', { name: 'Select row' })).toBeTruthy()
  })

  it('passes through className to the root label', () => {
    render(<Checkbox className="custom">Labelled</Checkbox>)
    const box = screen.getByRole('checkbox', { name: 'Labelled' })
    expect(box.closest('label')?.className).toMatch(/custom/)
  })
})
