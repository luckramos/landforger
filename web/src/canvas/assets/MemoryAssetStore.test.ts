import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryAssetStore } from './MemoryAssetStore'

describe('MemoryAssetStore (AssetStore contract)', () => {
  beforeEach(() => {
    // happy-dom's createObjectURL may return undefined; stub a deterministic URL.
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => `blob:mock/${(blob as Blob).size}`)
  })
  afterEach(() => vi.restoreAllMocks())

  it('stores a blob and returns reference metadata (id, mime, size)', async () => {
    const store = new MemoryAssetStore()
    const blob = new Blob(['hello world'], { type: 'image/png' })
    const asset = await store.putAsset(blob)
    expect(asset.id).toMatch(/^asset-/)
    expect(asset.mime).toBe('image/png')
    expect(asset.size).toBe(blob.size)
  })

  it('serves an object URL for a stored asset and undefined for a missing one', async () => {
    const store = new MemoryAssetStore()
    const { id } = await store.putAsset(new Blob(['x'], { type: 'image/jpeg' }))
    expect(await store.getAssetUrl(id)).toMatch(/^blob:mock\//)
    expect(await store.getAssetUrl('asset-does-not-exist')).toBeUndefined()
  })

  it('deletes an asset so it no longer resolves (and delete is idempotent)', async () => {
    const store = new MemoryAssetStore()
    const { id } = await store.putAsset(new Blob(['x'], { type: 'image/png' }))
    await store.deleteAsset(id)
    expect(await store.getAssetUrl(id)).toBeUndefined()
    await expect(store.deleteAsset(id)).resolves.toBeUndefined() // idempotent
  })

  it('decodes a stored blob as text (for Markdown previews) and undefined when gone', async () => {
    const store = new MemoryAssetStore()
    const { id } = await store.putAsset(new Blob(['# Title\n\nBody'], { type: 'text/markdown' }))
    expect(await store.getAssetText(id)).toBe('# Title\n\nBody')
    expect(await store.getAssetText('asset-missing')).toBeUndefined()
  })

  it('issues distinct ids for distinct puts', async () => {
    const store = new MemoryAssetStore()
    const a = await store.putAsset(new Blob(['a'], { type: 'image/png' }))
    const b = await store.putAsset(new Blob(['b'], { type: 'image/png' }))
    expect(a.id).not.toBe(b.id)
  })
})
