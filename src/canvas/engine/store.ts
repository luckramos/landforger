import type { CanvasItem, CanvasLink, ReferenceCanvas } from '../types'

/**
 * Normalized working state adapted from tldraw's record-store pattern (our own
 * code): items keyed by id with a derived order, links keyed by id. Kept private;
 * consumers see the derived `ReferenceCanvas` snapshot.
 */
interface InternalState {
  items: Record<string, CanvasItem>
  order: string[]
  links: Record<string, CanvasLink>
}

type Listener = () => void
type CommitListener = (snapshot: ReferenceCanvas) => void

function toInternal(canvas: ReferenceCanvas): InternalState {
  const items: Record<string, CanvasItem> = {}
  for (const item of canvas.items) items[item.id] = item
  const links: Record<string, CanvasLink> = {}
  for (const linkRecord of canvas.links) links[linkRecord.id] = linkRecord
  return { items, order: canvas.items.map((item) => item.id), links }
}

function cloneState(state: InternalState): InternalState {
  return {
    items: { ...state.items },
    order: [...state.order],
    links: { ...state.links },
  }
}

/**
 * The canvas engine's single source of truth. Live gestures mutate the working
 * state transiently (`setItem`); a gesture boundary calls `commit()` to push one
 * undo step and fire persistence. `undo`/`redo` walk a history of committed
 * snapshots. Deleting items runs a central after-delete side effect that prunes
 * any link touching them, so no dangling links survive.
 */
export class CanvasStore {
  private state: InternalState
  private history: InternalState[]
  private cursor: number
  private listeners = new Set<Listener>()
  private cached: ReferenceCanvas | null = null
  private readonly onCommit?: CommitListener

  constructor(initial: ReferenceCanvas, onCommit?: CommitListener) {
    this.state = toInternal(initial)
    this.history = [cloneState(this.state)]
    this.cursor = 0
    this.onCommit = onCommit
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): ReferenceCanvas => {
    if (!this.cached) {
      this.cached = {
        items: this.state.order.map((id) => this.state.items[id]).filter(Boolean),
        links: Object.values(this.state.links),
      }
    }
    return this.cached
  }

  private changed() {
    this.cached = null
    for (const listener of this.listeners) listener()
  }

  /** Push the current working state as one undo step and fire persistence. */
  commit = (): void => {
    // Drop any redo branch, then record the new baseline.
    this.history = this.history.slice(0, this.cursor + 1)
    this.history.push(cloneState(this.state))
    this.cursor = this.history.length - 1
    this.onCommit?.(this.getSnapshot())
  }

  addItem = (item: CanvasItem): void => {
    this.state.items[item.id] = item
    this.state.order.push(item.id)
    this.changed()
    this.commit()
  }

  /** Transient update — no history step until `commit()`. */
  setItem = (id: string, item: CanvasItem): void => {
    this.state.items[id] = item
    this.changed()
  }

  removeItems = (ids: readonly string[]): void => {
    const removing = new Set(ids)
    for (const id of removing) delete this.state.items[id]
    this.state.order = this.state.order.filter((id) => !removing.has(id))
    // After-delete side effect: prune links whose endpoints are gone.
    for (const [linkId, linkRecord] of Object.entries(this.state.links)) {
      if (removing.has(linkRecord.fromId) || removing.has(linkRecord.toId)) delete this.state.links[linkId]
    }
    this.changed()
    this.commit()
  }

  undo = (): void => {
    if (!this.canUndo()) return
    this.cursor -= 1
    this.state = cloneState(this.history[this.cursor])
    this.changed()
    this.onCommit?.(this.getSnapshot())
  }

  redo = (): void => {
    if (!this.canRedo()) return
    this.cursor += 1
    this.state = cloneState(this.history[this.cursor])
    this.changed()
    this.onCommit?.(this.getSnapshot())
  }

  canUndo = (): boolean => this.cursor > 0
  canRedo = (): boolean => this.cursor < this.history.length - 1
}
