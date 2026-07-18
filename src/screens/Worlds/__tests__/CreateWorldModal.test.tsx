import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CreateWorldModal } from '../CreateWorldModal'
import type { CreateWorldInput } from '../../../repository/WorldRepository'

function open() {
  const onCreate = vi.fn<(input: CreateWorldInput) => void>()
  const onCancel = vi.fn()
  render(<CreateWorldModal onCreate={onCreate} onCancel={onCancel} />)
  const dialog = screen.getByRole('dialog', { name: 'Forge a new world' })
  return { onCreate, onCancel, dialog }
}

describe('CreateWorldModal', () => {
  it('creates with a preset genre and its derived color', () => {
    const { onCreate, dialog } = open()
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Gloamreach' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Science Fiction' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create world' }))

    expect(onCreate).toHaveBeenCalledTimes(1)
    const input = onCreate.mock.calls[0][0]
    expect(input.genre).toBe('Science Fiction')
    expect(input.color).toMatch(/^oklch\(/) // preset genres derive an OKLCH swatch
  })

  it('custom genre carries the typed name and the picker color', () => {
    const { onCreate, dialog } = open()
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Duskfall' } })

    // The custom studio is inert until Custom is chosen.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Custom' }))
    fireEvent.change(within(dialog).getByLabelText('Genre name'), { target: { value: 'Solarpunk' } })

    // Open the color popover, then set the color through the from-scratch
    // picker's hex field (deterministic without the real layout that pointer
    // dragging would need). The popover is portaled to <body>, so it's queried
    // from `screen`, not within the dialog.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Custom world color' }))
    fireEvent.change(screen.getByLabelText('Custom world color hex value'), {
      target: { value: '3fa7ff' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create world' }))

    const input = onCreate.mock.calls[0][0]
    expect(input.genre).toBe('Solarpunk')
    expect(input.color).toBe('#3fa7ff')
  })

  it('an empty custom genre name falls back to "Custom"', () => {
    const { onCreate, dialog } = open()
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Hollow Sea' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Custom' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create world' }))

    expect(onCreate.mock.calls[0][0].genre).toBe('Custom')
  })

  it('disables Create until the world is named', () => {
    const { dialog } = open()
    const create = within(dialog).getByRole('button', { name: 'Create world' }) as HTMLButtonElement
    expect(create.disabled).toBe(true)
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Named' } })
    expect(create.disabled).toBe(false)
  })
})
