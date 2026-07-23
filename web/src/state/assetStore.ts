import type { AssetStore } from '../canvas/assets/AssetStore'
import { IndexedDbAssetStore } from '../canvas/assets/IndexedDbAssetStore'
import { MemoryAssetStore } from '../canvas/assets/MemoryAssetStore'

let instance: AssetStore | undefined

/**
 * App-wide `AssetStore` singleton for canvas reference-node bytes. Lazily
 * IndexedDB-backed (durable across reload); degrades to an in-memory store when
 * IndexedDB is unavailable so the canvas never crashes on construction.
 */
export function getAssetStore(): AssetStore {
  if (!instance) {
    instance = typeof indexedDB !== 'undefined' ? new IndexedDbAssetStore() : new MemoryAssetStore()
  }
  return instance
}

/** Test-only seam: inject an AssetStore (e.g. the in-memory fake), or reset. */
export function setAssetStore(store: AssetStore | undefined): void {
  instance = store
}
