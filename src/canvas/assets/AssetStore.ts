/**
 * The asset seam for canvas reference nodes. File bytes (images now; PDFs / MD
 * later) live here, never in `_world.md` — the canvas model stores only a
 * reference (see `NodeSource` in `../types`). Injected app-wide beside
 * `WorldRepository`; an IndexedDB implementation ships today and a Cloudflare R2
 * client is the intended drop-in later (the map's out-of-scope note).
 */
export interface StoredAsset {
  id: string
  mime: string
  size: number
}

export interface AssetStore {
  /** Persist a blob and return its reference metadata. */
  putAsset(blob: Blob): Promise<StoredAsset>
  /** An object URL for the stored blob, or undefined if the asset is gone. */
  getAssetUrl(id: string): Promise<string | undefined>
  /** The stored blob decoded as UTF-8 text (for Markdown previews), or undefined if gone. */
  getAssetText(id: string): Promise<string | undefined>
  /** Remove a stored blob (no-op if already absent). */
  deleteAsset(id: string): Promise<void>
}

let counter = 0

export function makeAssetId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `asset-${crypto.randomUUID()}`
  counter += 1
  return `asset-${Date.now()}-${counter}`
}
