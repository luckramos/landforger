import { makeAssetId, type AssetStore, type StoredAsset } from './AssetStore'

/**
 * In-memory AssetStore. Used as the test seam (happy-dom has no IndexedDB) and
 * as a graceful fallback when IndexedDB is unavailable at runtime. Blobs live
 * only for the session — not durable, unlike the IndexedDB store.
 */
export class MemoryAssetStore implements AssetStore {
  private readonly blobs = new Map<string, Blob>()

  async putAsset(blob: Blob): Promise<StoredAsset> {
    const id = makeAssetId()
    this.blobs.set(id, blob)
    return { id, mime: blob.type, size: blob.size }
  }

  async getAssetUrl(id: string): Promise<string | undefined> {
    const blob = this.blobs.get(id)
    if (!blob) return undefined
    return URL.createObjectURL(blob)
  }

  async getAssetText(id: string): Promise<string | undefined> {
    return this.blobs.get(id)?.text()
  }

  async deleteAsset(id: string): Promise<void> {
    this.blobs.delete(id)
  }
}
