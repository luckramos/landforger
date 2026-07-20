import { makeAssetId, type AssetStore, type StoredAsset } from './AssetStore'

const DB_NAME = 'landforger-canvas-assets'
const STORE = 'assets'

/**
 * Durable AssetStore backed by IndexedDB — blobs survive reload. One object
 * store keyed by asset id, each record `{ blob, mime, size }`. The R2-backed
 * store later swaps in behind the same interface (one wiring change).
 */
export class IndexedDbAssetStore implements AssetStore {
  private dbPromise?: Promise<IDBDatabase>

  private open(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1)
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE)
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      }).catch((error) => {
        // Don't cache a rejected open — a transient failure would poison every
        // later call. Clear it so the next operation retries.
        this.dbPromise = undefined
        throw error
      })
    }
    return this.dbPromise
  }

  private async run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.open()
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const request = action(tx.objectStore(STORE))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async putAsset(blob: Blob): Promise<StoredAsset> {
    const id = makeAssetId()
    await this.run('readwrite', (store) => store.put({ blob, mime: blob.type, size: blob.size }, id))
    return { id, mime: blob.type, size: blob.size }
  }

  async getAssetUrl(id: string): Promise<string | undefined> {
    const record = await this.run<{ blob: Blob } | undefined>('readonly', (store) => store.get(id))
    if (!record?.blob) return undefined
    return URL.createObjectURL(record.blob)
  }

  async getAssetText(id: string): Promise<string | undefined> {
    const record = await this.run<{ blob: Blob } | undefined>('readonly', (store) => store.get(id))
    return record?.blob?.text()
  }

  async deleteAsset(id: string): Promise<void> {
    await this.run('readwrite', (store) => store.delete(id))
  }
}
