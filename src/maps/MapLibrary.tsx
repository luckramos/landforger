import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Link, useParams } from 'react-router-dom'
import type { Page, World } from '../domain/types'
import { getRepository } from '../state/repository'
import { deleteMap, reparentMap, resolveMapImage, setRootMap, type MapCollectionState } from './mapDomain'
import { persistMapCollection } from './mapPersistence'
import styles from './MapLibrary.module.css'
import { overlayExitTransition } from '../components/motionPrefs'
import { useUiStore } from '../state/uiStore'

type LoadState = 'loading' | 'ready' | 'missing' | 'error'

export function MapLibrary() {
  const motionScale = useUiStore((state) => state.motionScale)
  const { world: worldSlug = '' } = useParams()
  const repository = getRepository()
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [world, setWorld] = useState<World>()
  const [pages, setPages] = useState<Page[]>([])
  const [draftTitlesByMapId, setDraftTitlesByMapId] = useState<Record<string, string>>({})
  const [deleteTarget, setDeleteTarget] = useState<string>()

  useEffect(() => {
    let cancelled = false
    Promise.all([repository.getWorld(worldSlug), repository.listPages(worldSlug)])
      .then(([loadedWorld, loadedPages]) => {
        if (cancelled) return
        if (!loadedWorld) {
          setLoadState('missing')
          return
        }
        setWorld(loadedWorld)
        setPages(loadedPages)
        setDraftTitlesByMapId(Object.fromEntries(loadedWorld.maps.map((map) => [map.id, map.title])))
        setLoadState('ready')
      })
      .catch(() => !cancelled && setLoadState('error'))
    return () => { cancelled = true }
  }, [repository, worldSlug])

  const pageBySlug = useMemo(() => new Map(pages.map((page) => [page.slug, page])), [pages])

  if (loadState !== 'ready' || !world) {
    return (
      <main className={styles.state}>
        <span>Map Library</span>
        <h1>{loadState === 'missing' ? 'World not found' : loadState === 'error' ? "The Library couldn't be loaded." : 'Cataloguing charts…'}</h1>
        <Link to={`/w/${worldSlug}`}>Back to World</Link>
      </main>
    )
  }

  const persist = (state: MapCollectionState) => persistMapCollection(repository, world, state, setWorld)

  const saveName = (mapId: string) => {
    const title = draftTitlesByMapId[mapId]?.trim()
    if (!title) return
    void persist({
      rootMap: world.rootMap,
      pins: world.pins,
      maps: world.maps.map((map) => map.id === mapId ? { ...map, title } : map),
    })
  }

  const mapPendingDeletion = deleteTarget ? world.maps.find((map) => map.id === deleteTarget) : undefined

  return (
    <main className={styles.screen}>
      <header className={styles.header}>
        <div>
          <Link to={`/w/${world.slug}/map`}>‹ World Map</Link>
          <span>{world.name}</span>
        </div>
        <h1>Map Library</h1>
        <p>Manage every chart, its place in the hierarchy, and the Root Map.</p>
      </header>

      {world.maps.length === 0 ? (
        <section className={styles.empty}>
          <h2>No Maps yet</h2>
          <p>Create a child Map from any Pin inspector to begin the Library.</p>
        </section>
      ) : (
        <section className={styles.gallery} aria-label="Maps">
          {world.maps.map((map) => {
            const isRoot = world.rootMap === map.id
            const parent = map.parentMap ? world.maps.find((candidate) => candidate.id === map.parentMap) : undefined
            const image = resolveMapImage(map, world.activeEra, world.eraOrder)
            const eligiblePins = world.pins.filter((pin) => pin.mapId !== map.id && (!pin.childMap || pin.childMap === map.id))
            return (
              <article key={map.id} aria-label={map.title} className={styles.card}>
                <Link className={styles.preview} to={`/w/${world.slug}/map/${map.id}`}>
                  {image ? <img src={image} alt="" /> : <span>No image</span>}
                  {isRoot && <b>Root Map</b>}
                </Link>
                <div className={styles.cardBody}>
                  <label>
                    <span>Map name</span>
                    <input aria-label="Map name" value={draftTitlesByMapId[map.id] ?? map.title} onChange={(event) => setDraftTitlesByMapId((current) => ({ ...current, [map.id]: event.target.value }))} />
                  </label>
                  <button type="button" onClick={() => saveName(map.id)}>Save name</button>
                  <p>{parent ? `Child of ${parent.title}` : isRoot ? 'The World opens here' : 'Unparented · in Library'}</p>
                  <label>
                    <span>Parent placement</span>
                    <select
                      aria-label="Parent placement"
                      value={map.parentPin ?? ''}
                      onChange={(event) => void persist(reparentMap(world, map.id, event.target.value || undefined))}
                    >
                      <option value="">No parent · keep in Library</option>
                      {eligiblePins.map((pin) => {
                        const parentMap = world.maps.find((candidate) => candidate.id === pin.mapId)
                        const page = pageBySlug.get(pin.pageSlug)
                        return <option key={pin.id} value={pin.id}>{page?.title ?? pin.pageSlug} on {parentMap?.title ?? pin.mapId}</option>
                      })}
                    </select>
                  </label>
                  <div className={styles.actions}>
                    <button type="button" disabled={isRoot} onClick={() => void persist(setRootMap(world, map.id))}>Set as Root Map</button>
                    <button type="button" className={styles.danger} onClick={() => setDeleteTarget(map.id)}>Delete Map</button>
                  </div>
                </div>
              </article>
            )
          })}
        </section>
      )}

      <AnimatePresence>
      {mapPendingDeletion && (
        <motion.div className={styles.scrim} initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={overlayExitTransition(motionScale)}>
          <motion.section role="dialog" aria-label={`Delete ${mapPendingDeletion.title}`} className={styles.confirm} initial={false} exit={{ opacity: 0, y: 7, scale: 0.98 }} transition={overlayExitTransition(motionScale)}>
            <span>Delete Map</span>
            <h2>{mapPendingDeletion.title}</h2>
            <p>Its Pins will vanish. Direct child Maps will return to the Library.</p>
            <div>
              <button type="button" onClick={() => setDeleteTarget(undefined)}>Cancel</button>
              <button
                type="button"
                className={styles.danger}
                aria-label={`Confirm delete ${mapPendingDeletion.title}`}
                onClick={() => {
                  setDeleteTarget(undefined)
                  void persist(deleteMap(world, mapPendingDeletion.id))
                }}
              >Delete Map</button>
            </div>
          </motion.section>
        </motion.div>
      )}
      </AnimatePresence>
    </main>
  )
}
