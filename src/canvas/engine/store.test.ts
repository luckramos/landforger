import { describe, expect, it, vi } from 'vitest'
import type { CanvasItem, CanvasLink } from '../types'
import { CanvasStore } from './store'

function sticky(id: string, x = 0): CanvasItem {
  return { id, kind: 'sticky', x, y: 0, width: 40, height: 40, rotation: 0, color: '#fff', text: '' }
}
function link(id: string, fromId: string, toId: string): CanvasLink {
  return { id, fromId, toId }
}

describe('CanvasStore', () => {
  it('exposes a stable snapshot reference until a change occurs', () => {
    const store = new CanvasStore({ items: [sticky('a')], links: [] })
    const first = store.getSnapshot()
    expect(store.getSnapshot()).toBe(first) // memoized
    store.addItem(sticky('b', 100))
    expect(store.getSnapshot()).not.toBe(first)
    expect(store.getSnapshot().items.map((i) => i.id)).toEqual(['a', 'b'])
  })

  it('notifies subscribers on change', () => {
    const store = new CanvasStore({ items: [], links: [] })
    const listener = vi.fn()
    store.subscribe(listener)
    store.addItem(sticky('a'))
    expect(listener).toHaveBeenCalled()
  })

  it('commits transient edits as one undo step', () => {
    const store = new CanvasStore({ items: [sticky('a')], links: [] })
    store.setItem('a', { ...sticky('a'), x: 10 })
    store.setItem('a', { ...sticky('a'), x: 50 }) // still same gesture, no commit yet
    store.commit()
    expect(store.getSnapshot().items[0].x).toBe(50)
    store.undo()
    expect(store.getSnapshot().items[0].x).toBe(0) // back to initial, one step
  })

  it('undo/redo covers create, move and delete', () => {
    const store = new CanvasStore({ items: [], links: [] })
    store.addItem(sticky('a'))
    store.setItem('a', { ...sticky('a'), x: 200 })
    store.commit()
    store.removeItems(['a'])
    expect(store.getSnapshot().items).toHaveLength(0)

    store.undo() // un-delete
    expect(store.getSnapshot().items.map((i) => i.id)).toEqual(['a'])
    expect(store.getSnapshot().items[0].x).toBe(200)
    store.undo() // un-move
    expect(store.getSnapshot().items[0].x).toBe(0)
    store.undo() // un-create
    expect(store.getSnapshot().items).toHaveLength(0)
    store.redo() // re-create
    expect(store.getSnapshot().items).toHaveLength(1)
  })

  it('removing an item cleans up links that reference it (after-delete side effect)', () => {
    const store = new CanvasStore({ items: [sticky('a'), sticky('b', 100)], links: [link('l1', 'a', 'b')] })
    store.removeItems(['a'])
    expect(store.getSnapshot().links).toHaveLength(0)
    expect(store.getSnapshot().items.map((i) => i.id)).toEqual(['b'])
  })

  it('fires the commit callback with the derived snapshot on each committed change', () => {
    const onCommit = vi.fn()
    const store = new CanvasStore({ items: [], links: [] }, onCommit)
    store.addItem(sticky('a'))
    expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ items: expect.any(Array), links: expect.any(Array) }))
  })

  it('does not commit or notify redo past the end', () => {
    const store = new CanvasStore({ items: [], links: [] })
    expect(store.canUndo()).toBe(false)
    expect(store.canRedo()).toBe(false)
    store.addItem(sticky('a'))
    expect(store.canUndo()).toBe(true)
    store.undo()
    expect(store.canRedo()).toBe(true)
  })
})
