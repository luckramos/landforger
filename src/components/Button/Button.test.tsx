import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './Button'

describe('Button', () => {
  it('renders the primary variant', () => {
    render(<Button variant="primary">Enter your worlds</Button>)
    const button = screen.getByRole('button', { name: 'Enter your worlds' })
    expect(button.className).toMatch(/primary/)
  })

  it('renders the ghost variant', () => {
    render(<Button variant="ghost">Create world?</Button>)
    const button = screen.getByRole('button', { name: 'Create world?' })
    expect(button.className).toMatch(/ghost/)
  })

  it('defaults to the primary variant when none is given', () => {
    render(<Button>Default</Button>)
    const button = screen.getByRole('button', { name: 'Default' })
    expect(button.className).toMatch(/primary/)
  })

  it('blocks clicks while disabled', () => {
    const onClick = vi.fn()
    render(
      <Button disabled onClick={onClick}>
        Create world
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Create world' })
    expect((button as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('fires onClick when enabled', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Go</Button>)
    fireEvent.click(screen.getByRole('button', { name: 'Go' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('passes through type and className', () => {
    render(
      <Button type="submit" className="custom">
        Submit
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Submit' }) as HTMLButtonElement
    expect(button.type).toBe('submit')
    expect(button.className).toMatch(/custom/)
  })
})
