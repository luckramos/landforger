import type { ChangeEvent, CSSProperties, DragEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Link, useParams } from 'react-router-dom'
import type { MapFolder, Page, World } from '../domain/types'
import { icons } from '../icons'
import { getRepository } from '../state/repository'
import {
  childFolders,
  createFolder,
  createMapInFolder,
  deleteFolder,
  deleteMap,
  folderHasAncestor,
  folderPath,
  mapsInFolder,
  moveFolder,
  moveMapToFolder,
  renameFolder,
  reparentMap,
  resolveMapImage,
  setMapChart,
  setMapEraLinked,
  setRootMap,
  type MapCollectionState,
} from './mapDomain'
import { MapChartEditor } from './MapChartEditor'
import { persistMapCollection } from './mapPersistence'
import { LibrarySpotlight } from './LibrarySpotlight'
import { categoryMeta } from '../screens/Dashboard/categoryMeta'
import { fuzzyMatch } from '../search/spotlightSearch'
import { UserMenu } from '../components/UserMenu/UserMenu'
import styles from './MapLibrary.module.css'
import { overlayExitTransition } from '../components/motionPrefs'
import { useUiStore } from '../state/uiStore'

type LoadState = 'loading' | 'ready' | 'missing' | 'error'
interface Dragging { type: 'map' | 'folder'; id: string }

function fileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Image could not be read'))
    reader.onerror = () => reject(reader.error ?? new Error('Image could not be read'))
    reader.readAsDataURL(file)
  })
}

/** Depth-first flattening of the folder tree for indented <select> options. */
function flattenFolders(folders: readonly MapFolder[], parent: string | undefined, depth: number): { id: string; name: string; depth: number }[] {
  return childFolders(folders, parent).flatMap((folder) => [
    { id: folder.id, name: folder.name, depth },
    ...flattenFolders(folders, folder.id, depth + 1),
  ])
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`

/** The Library: a cartographer's chart archive. Maps are chart plates, folders are flat-file drawers, both organized under a breadcrumb path. */
export function MapLibrary() {
  const motionScale = useUiStore((state) => state.motionScale)
  const { world: worldSlug = '' } = useParams()
  const repository = getRepository()
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [world, setWorld] = useState<World>()
  const [pages, setPages] = useState<Page[]>([])
  const [folderId, setFolderId] = useState<string>()
  const [gearMapId, setGearMapId] = useState<string>()
  const [folderMenuId, setFolderMenuId] = useState<string>()
  const [rootConfirmId, setRootConfirmId] = useState<string>()
  const [deleteMapId, setDeleteMapId] = useState<string>()
  const [deleteFolderId, setDeleteFolderId] = useState<string>()
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [draftTitle, setDraftTitle] = useState('')
  const [draftFolder, setDraftFolder] = useState('')
  const [draftFolderName, setDraftFolderName] = useState('')
  const [draftFolderParent, setDraftFolderParent] = useState('')
  const [pinPickerOpen, setPinPickerOpen] = useState(false)
  const [pinQuery, setPinQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [dragging, setDragging] = useState<Dragging>()
  const [dragOver, setDragOver] = useState<string>()
  const addMapInputRef = useRef<HTMLInputElement>(null)

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
        setLoadState('ready')
      })
      .catch(() => !cancelled && setLoadState('error'))
    return () => { cancelled = true }
  }, [repository, worldSlug])

  const pageBySlug = useMemo(() => new Map(pages.map((page) => [page.slug, page])), [pages])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  if (loadState !== 'ready' || !world) {
    return (
      <main className={styles.state}>
        <span>Map Library</span>
        <h1>{loadState === 'missing' ? 'World not found' : loadState === 'error' ? "The Library couldn't be loaded." : 'Cataloguing charts…'}</h1>
        <Link to={`/w/${worldSlug}`}>Back to World</Link>
      </main>
    )
  }

  const folders = world.mapFolders
  const persist = (state: MapCollectionState) => persistMapCollection(repository, world, state, setWorld)
  // The World's Eras, oldest→newest, for the per-era chart editor.
  const eraPages = world.eraOrder.map((slug) => pageBySlug.get(slug)).filter((page): page is Page => page !== undefined)
  const worldState = (): MapCollectionState => ({ rootMap: world.rootMap, maps: world.maps, pins: world.pins, mapFolders: folders })
  // Charts persist live — like on the Map screen — so the card preview updates
  // the instant an image lands, independent of the staged title/folder Save.
  const changeChart = (mapId: string, key: string, image?: string) => void persist(setMapChart(worldState(), mapId, key, image))
  const changeEraLinked = (mapId: string, eraLinked: boolean) => void persist(setMapEraLinked(worldState(), mapId, eraLinked, world.activeEra, world.eraOrder))
  const path = folderPath(folders, folderId)
  const subfolders = childFolders(folders, folderId)
  const visibleMaps = mapsInFolder(world.maps, folderId)
  const folderTree = flattenFolders(folders, undefined, 0)

  const gearMap = gearMapId ? world.maps.find((map) => map.id === gearMapId) : undefined
  const menuFolder = folderMenuId ? folders.find((folder) => folder.id === folderMenuId) : undefined
  const rootConfirmMap = rootConfirmId ? world.maps.find((map) => map.id === rootConfirmId) : undefined
  const currentRootMap = world.rootMap ? world.maps.find((map) => map.id === world.rootMap) : undefined
  const deleteMapTarget = deleteMapId ? world.maps.find((map) => map.id === deleteMapId) : undefined
  const deleteFolderTarget = deleteFolderId ? folders.find((folder) => folder.id === deleteFolderId) : undefined
  // Pins a Map may hang off: on another Map, free (or already ours), and — per
  // the brief — pinned to a Location Page. Fuzzy-ranked while the picker searches.
  const linkablePins = gearMap
    ? world.pins.filter((pin) => pin.mapId !== gearMap.id && (!pin.childMap || pin.childMap === gearMap.id) && pageBySlug.get(pin.pageSlug)?.category === 'locations')
    : []
  const pinResults = pinQuery.trim()
    ? linkablePins
        .map((pin) => ({ pin, match: fuzzyMatch(pageBySlug.get(pin.pageSlug)?.title ?? pin.pageSlug, pinQuery) }))
        .filter((entry): entry is { pin: typeof entry.pin; match: NonNullable<typeof entry.match> } => entry.match !== null)
        .sort((a, b) => b.match.score - a.match.score)
        .map((entry) => entry.pin)
    : linkablePins
  const currentPin = gearMap?.parentPin ? world.pins.find((pin) => pin.id === gearMap.parentPin) : undefined
  const currentPinLabel = currentPin ? (pageBySlug.get(currentPin.pageSlug)?.title ?? currentPin.pageSlug) : undefined
  const LocationIcon = categoryMeta('locations')?.icon

  const openFolder = (id?: string) => { setFolderId(id); setNewFolderOpen(false) }

  const onAddMapFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const dataUrl = await fileAsDataUrl(file)
    const title = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'New map'
    await persist(createMapInFolder(world, title, folderId, dataUrl))
  }

  const submitNewFolder = () => {
    if (!newFolderName.trim()) { setNewFolderOpen(false); return }
    void persist(createFolder(world, newFolderName, folderId))
    setNewFolderName('')
    setNewFolderOpen(false)
  }

  // Name + Folder are drafts, committed together on Save; the Pin link and
  // Root/Delete stay immediate (they're deliberate, one-shot actions).
  const saveMapSettings = () => {
    if (!gearMap) return
    const title = draftTitle.trim() || gearMap.title
    const renamed = world.maps.map((map) => map.id === gearMap.id ? { ...map, title } : map)
    void persist(moveMapToFolder({ rootMap: world.rootMap, pins: world.pins, mapFolders: folders, maps: renamed }, gearMap.id, draftFolder || undefined))
    setGearMapId(undefined)
  }

  const saveFolderSettings = () => {
    if (!menuFolder) return
    void persist(moveFolder(renameFolder(world, menuFolder.id, draftFolderName), menuFolder.id, draftFolderParent || undefined))
    setFolderMenuId(undefined)
  }

  const linkPin = (pinId?: string) => {
    if (!gearMap) return
    void persist(reparentMap(world, gearMap.id, pinId))
    setPinPickerOpen(false)
  }

  const requestRoot = (mapId: string) => {
    setGearMapId(undefined)
    if (world.rootMap && world.rootMap !== mapId) setRootConfirmId(mapId)
    else void persist(setRootMap(world, mapId))
  }

  const endDrag = () => { setDragging(undefined); setDragOver(undefined) }
  const startDrag = (type: Dragging['type'], id: string) => (event: DragEvent) => {
    setDragging({ type, id })
    event.dataTransfer.effectAllowed = 'move'
  }
  const allowDrop = (target: string) => (event: DragEvent) => {
    if (!dragging) return
    event.preventDefault()
    setDragOver(target)
  }
  const dropInto = (target: string | undefined, key: string) => (event: DragEvent) => {
    event.preventDefault()
    if (!dragging) return
    if (dragging.type === 'map') void persist(moveMapToFolder(world, dragging.id, target))
    else if (dragging.id !== target) void persist(moveFolder(world, dragging.id, target))
    endDrag()
    void key
  }

  const dismiss = () => { setGearMapId(undefined); setFolderMenuId(undefined); setRootConfirmId(undefined); setDeleteMapId(undefined); setDeleteFolderId(undefined); setPinPickerOpen(false) }
  const isEmptyView = subfolders.length === 0 && visibleMaps.length === 0 && !newFolderOpen

  return (
    <main className={styles.screen}>
      <header className={styles.topbar}>
        <nav className={styles.crumbs} aria-label="Breadcrumb">
          <Link to={`/w/${world.slug}/map`} className={styles.crumbRoot} title="Back to World Map"><icons.map size={15} /><span>World Map</span></Link>
          <Link to={`/w/${world.slug}`} className={styles.crumbWorld} title={world.name}>{world.name}</Link>
          <h1 className={styles.crumbCurrent} aria-current="page"><span className={styles.crumbLabel}>Map Library</span></h1>
        </nav>

        <button type="button" className={styles.searchTrigger} onClick={() => setSearchOpen(true)}><icons.search size={16} /> <span>Search the library…</span><kbd>⌘K</kbd></button>

        <div className={styles.rightChrome}>
          <div className={styles.headerActions}>
            <button type="button" className={styles.ghostBtn} onClick={() => { setNewFolderOpen(true); setNewFolderName('') }}><icons.add size={15} /> <span>New folder</span></button>
            <button type="button" className={styles.primaryBtn} onClick={() => addMapInputRef.current?.click()}><icons.upload size={15} /> <span>Add map</span></button>
            <input ref={addMapInputRef} className={styles.hiddenFile} type="file" accept="image/*" aria-label="Upload a map image" onChange={(event) => void onAddMapFile(event)} />
          </div>
          <UserMenu />
        </div>
      </header>

      <div className={styles.content}>
      <nav className={styles.breadcrumb} aria-label="Folder path">
        <button
          type="button"
          className={styles.crumb}
          data-current={folderId === undefined || undefined}
          data-dragover={dragOver === 'root' || undefined}
          onClick={() => openFolder(undefined)}
          onDragOver={allowDrop('root')}
          onDragLeave={() => dragOver === 'root' && setDragOver(undefined)}
          onDrop={dropInto(undefined, 'root')}
        ><icons.worlds size={13} /> {world.name}</button>
        {path.map((folder) => (
          <span key={folder.id} className={styles.crumbGroup}>
            <i aria-hidden="true">/</i>
            <button
              type="button"
              className={styles.crumb}
              data-current={folder.id === folderId || undefined}
              data-dragover={dragOver === `crumb:${folder.id}` || undefined}
              onClick={() => openFolder(folder.id)}
              onDragOver={allowDrop(`crumb:${folder.id}`)}
              onDragLeave={() => dragOver === `crumb:${folder.id}` && setDragOver(undefined)}
              onDrop={dropInto(folder.id, `crumb:${folder.id}`)}
            >{folder.name}</button>
          </span>
        ))}
      </nav>

      {isEmptyView ? (
        <section className={styles.empty}>
          <span className={styles.drawerFront} aria-hidden="true"><i /></span>
          <h2>{folderId ? 'This drawer is empty' : 'Nothing filed yet'}</h2>
          <p>Add a map to drop a chart in{folderId ? ' here' : ''}, or make a folder to sort what’s coming.</p>
        </section>
      ) : (
        <div className={styles.body}>
          {(subfolders.length > 0 || newFolderOpen) && (
            <section aria-label="Folders">
              <h2 className={styles.groupLabel}>Drawers</h2>
              <div className={styles.drawerGrid}>
                {newFolderOpen && (
                  <div className={styles.newDrawer}>
                    <span className={styles.pull} aria-hidden="true" />
                    <input
                      autoFocus
                      aria-label="New folder name"
                      placeholder="Folder name"
                      value={newFolderName}
                      onChange={(event) => setNewFolderName(event.target.value)}
                      onKeyDown={(event) => { if (event.key === 'Enter') submitNewFolder(); if (event.key === 'Escape') setNewFolderOpen(false) }}
                      onBlur={submitNewFolder}
                    />
                  </div>
                )}
                {subfolders.map((folder) => {
                  const charts = mapsInFolder(world.maps, folder.id).length
                  const drawers = childFolders(folders, folder.id).length
                  return (
                    <article
                      key={folder.id}
                      className={styles.drawer}
                      aria-label={folder.name}
                      draggable
                      onDragStart={startDrag('folder', folder.id)}
                      onDragEnd={endDrag}
                      data-dragging={(dragging?.type === 'folder' && dragging.id === folder.id) || undefined}
                      data-dragover={dragOver === folder.id || undefined}
                      onDragOver={allowDrop(folder.id)}
                      onDragLeave={() => dragOver === folder.id && setDragOver(undefined)}
                      onDrop={dropInto(folder.id, folder.id)}
                    >
                      <button type="button" className={styles.drawerOpen} onClick={() => openFolder(folder.id)}>
                        <span className={styles.pull} aria-hidden="true" />
                        <span className={styles.drawerName}>{folder.name}</span>
                        <span className={styles.drawerCount}>{plural(charts, 'chart')}{drawers > 0 ? ` · ${plural(drawers, 'drawer')}` : ''}</span>
                      </button>
                      <button type="button" className={styles.drawerMenu} aria-label={`${folder.name} settings`} onClick={() => { setFolderMenuId(folder.id); setDraftFolderName(folder.name); setDraftFolderParent(folder.parentFolder ?? '') }}><icons.kebab size={16} /></button>
                    </article>
                  )
                })}
              </div>
            </section>
          )}

          {visibleMaps.length > 0 && (
            <section aria-label="Maps">
              <h2 className={styles.groupLabel}>Charts</h2>
              <div className={styles.gallery}>
                {visibleMaps.map((map, index) => {
                  const isRoot = world.rootMap === map.id
                  const image = resolveMapImage(map, world.activeEra, world.eraOrder)
                  const parentPage = map.parentPin ? world.pins.find((pin) => pin.id === map.parentPin) : undefined
                  const parentTitle = parentPage ? (pageBySlug.get(parentPage.pageSlug)?.title ?? parentPage.pageSlug) : undefined
                  return (
                    <article
                      key={map.id}
                      aria-label={map.title}
                      className={styles.card}
                      draggable
                      onDragStart={startDrag('map', map.id)}
                      onDragEnd={endDrag}
                      data-dragging={(dragging?.type === 'map' && dragging.id === map.id) || undefined}
                      style={{ '--card-index': index } as CSSProperties}
                    >
                      <Link className={styles.preview} to={`/w/${world.slug}/map/${map.id}`}>
                        {image ? <img src={image} alt="" /> : <span>No image</span>}
                        {isRoot && <b>Root Map</b>}
                        {map.eraLinked && (() => {
                          const charted = Object.values(map.images).filter(Boolean).length
                          return <b className={styles.chartsBadge} title={`Redrawn across ${charted} ${charted === 1 ? 'era' : 'eras'}`}><icons.timeline size={12} /> {charted} {charted === 1 ? 'chart' : 'charts'}</b>
                        })()}
                      </Link>
                      <div className={styles.cardBody}>
                        <span className={styles.cardTitle}>{map.title}</span>
                        <button type="button" className={styles.gear} aria-label={`${map.title} settings`} onClick={() => { setGearMapId(map.id); setDraftTitle(map.title); setDraftFolder(map.folder ?? ''); setPinPickerOpen(false) }}><icons.settings size={16} /></button>
                        <p className={styles.cardMeta}>{isRoot ? 'The World opens here' : parentTitle ? `Opens from ${parentTitle}` : 'Top level · in the Library'}</p>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          )}
        </div>
      )}
      </div>

      <AnimatePresence>
        {searchOpen && (
          <LibrarySpotlight
            worldSlug={world.slug}
            maps={world.maps}
            folders={folders}
            onClose={() => setSearchOpen(false)}
            onOpenFolder={(id) => { setSearchOpen(false); openFolder(id) }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {gearMap && (
          <motion.div className={styles.scrim} onMouseDown={(event) => event.target === event.currentTarget && dismiss()} initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={overlayExitTransition(motionScale)}>
            <motion.section role="dialog" aria-label={`${gearMap.title} settings`} className={styles.sheet} initial={false} exit={{ opacity: 0, y: 7, scale: 0.98 }} transition={overlayExitTransition(motionScale)}>
              <header>
                <div><span>Map settings</span><h2>{gearMap.title}</h2></div>
                <button type="button" aria-label="Close Map settings" onClick={() => setGearMapId(undefined)}><icons.close /></button>
              </header>
              <div className={styles.field}>
                <span>Name</span>
                <input className={styles.textInput} aria-label="Map name" value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && saveMapSettings()} />
              </div>
              <label className={styles.field}>
                <span>Folder</span>
                <select aria-label="Folder" value={draftFolder} onChange={(event) => setDraftFolder(event.target.value)}>
                  <option value="">Library root</option>
                  {folderTree.map((folder) => <option key={folder.id} value={folder.id}>{' '.repeat(folder.depth * 2)}{folder.name}</option>)}
                </select>
              </label>
              <div className={styles.field}>
                <span>Location Pin</span>
                <div className={styles.pinRow}>
                  <button type="button" className={styles.linkPinBtn} data-linked={currentPinLabel ? 'true' : undefined} onClick={() => { setPinPickerOpen(true); setPinQuery('') }}>
                    {currentPinLabel ? <><icons.marker size={15} /> {currentPinLabel}</> : <><icons.add size={15} /> Link to a location Pin</>}
                  </button>
                  {gearMap.parentPin && <button type="button" className={styles.pinUnlink} aria-label="Remove Pin link" onClick={() => linkPin(undefined)}><icons.unlink size={15} /></button>}
                </div>
              </div>
              <div className={styles.field}>
                <span>Chart</span>
                <MapChartEditor
                  map={gearMap}
                  eraPages={eraPages}
                  eraOrder={world.eraOrder}
                  activeEra={world.activeEra}
                  onEraLinkedChange={(eraLinked) => changeEraLinked(gearMap.id, eraLinked)}
                  onChartChange={(key, image) => changeChart(gearMap.id, key, image)}
                />
              </div>
              <div className={styles.sheetActions}>
                <button type="button" disabled={world.rootMap === gearMap.id} onClick={() => requestRoot(gearMap.id)}>Set as Root Map</button>
                <button type="button" className={styles.danger} onClick={() => { setGearMapId(undefined); setDeleteMapId(gearMap.id) }}>Delete Map</button>
              </div>
              <div className={styles.sheetFooter}>
                <button type="button" onClick={() => setGearMapId(undefined)}>Cancel</button>
                <button type="button" className={styles.saveBtn} onClick={saveMapSettings}>Save</button>
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {menuFolder && (
          <motion.div className={styles.scrim} onMouseDown={(event) => event.target === event.currentTarget && dismiss()} initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={overlayExitTransition(motionScale)}>
            <motion.section role="dialog" aria-label={`${menuFolder.name} settings`} className={styles.sheet} initial={false} exit={{ opacity: 0, y: 7, scale: 0.98 }} transition={overlayExitTransition(motionScale)}>
              <header>
                <div><span>Folder</span><h2>{menuFolder.name}</h2></div>
                <button type="button" aria-label="Close folder settings" onClick={() => setFolderMenuId(undefined)}><icons.close /></button>
              </header>
              <div className={styles.field}>
                <span>Name</span>
                <input className={styles.textInput} aria-label="Folder name" value={draftFolderName} onChange={(event) => setDraftFolderName(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && saveFolderSettings()} />
              </div>
              <label className={styles.field}>
                <span>Move into</span>
                <select aria-label="Move folder into" value={draftFolderParent} onChange={(event) => setDraftFolderParent(event.target.value)}>
                  <option value="">Library root</option>
                  {folderTree
                    .filter((folder) => folder.id !== menuFolder.id && !folderHasAncestor(folders, folder.id, menuFolder.id))
                    .map((folder) => <option key={folder.id} value={folder.id}>{' '.repeat(folder.depth * 2)}{folder.name}</option>)}
                </select>
              </label>
              <div className={styles.sheetActions}>
                <button type="button" className={styles.danger} onClick={() => { setFolderMenuId(undefined); setDeleteFolderId(menuFolder.id) }}>Delete folder</button>
              </div>
              <div className={styles.sheetFooter}>
                <button type="button" onClick={() => setFolderMenuId(undefined)}>Cancel</button>
                <button type="button" className={styles.saveBtn} onClick={saveFolderSettings}>Save</button>
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {pinPickerOpen && gearMap && (
          <motion.div className={styles.pinScrim} onMouseDown={(event) => event.target === event.currentTarget && setPinPickerOpen(false)} initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={overlayExitTransition(motionScale)}>
            <motion.section role="dialog" aria-label="Link a location Pin" className={styles.picker} initial={false} exit={{ opacity: 0, y: 7, scale: 0.98 }} transition={overlayExitTransition(motionScale)}>
              <header>
                <div><span>Location Pin</span><h2>Link {gearMap.title}</h2></div>
                <button type="button" aria-label="Close Pin picker" onClick={() => setPinPickerOpen(false)}><icons.close /></button>
              </header>
              <input type="search" className={styles.pickerSearch} aria-label="Search location Pins" placeholder="Search locations…" autoFocus value={pinQuery} onChange={(event) => setPinQuery(event.target.value)} />
              <div className={styles.pickerList}>
                {pinResults.map((pin) => {
                  const onMap = world.maps.find((candidate) => candidate.id === pin.mapId)
                  const active = gearMap.parentPin === pin.id
                  return (
                    <button type="button" key={pin.id} className={styles.pickerItem} data-active={active || undefined} onClick={() => linkPin(pin.id)}>
                      {LocationIcon && <i className={styles.pickerIcon}><LocationIcon size={16} /></i>}
                      <span>{pageBySlug.get(pin.pageSlug)?.title ?? pin.pageSlug}<small>on {onMap?.title ?? pin.mapId}</small></span>
                      {active && <b aria-hidden="true"><icons.check size={15} /></b>}
                    </button>
                  )
                })}
                {pinResults.length === 0 && <p className={styles.pickerEmpty}>{linkablePins.length === 0 ? 'No location Pins yet — pin a Location Page onto another Map first.' : 'No location Pins match that search.'}</p>}
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {rootConfirmMap && (
          <motion.div className={styles.scrim} onMouseDown={(event) => event.target === event.currentTarget && dismiss()} initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={overlayExitTransition(motionScale)}>
            <motion.section role="dialog" aria-label={`Change Root Map to ${rootConfirmMap.title}`} className={styles.confirm} initial={false} exit={{ opacity: 0, y: 7, scale: 0.98 }} transition={overlayExitTransition(motionScale)}>
              <span className={styles.confirmEyebrow}>Change Root Map</span>
              <h2>{rootConfirmMap.title}</h2>
              <p>This World opens at <strong>{currentRootMap?.title ?? 'another chart'}</strong> today. Make {rootConfirmMap.title} the Root Map instead?</p>
              <div>
                <button type="button" onClick={() => setRootConfirmId(undefined)}>Keep {currentRootMap?.title ?? 'current'}</button>
                <button type="button" className={styles.rootConfirmBtn} onClick={() => { setRootConfirmId(undefined); void persist(setRootMap(world, rootConfirmMap.id)) }}>Make it Root</button>
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteMapTarget && (
          <motion.div className={styles.scrim} onMouseDown={(event) => event.target === event.currentTarget && dismiss()} initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={overlayExitTransition(motionScale)}>
            <motion.section role="dialog" aria-label={`Delete ${deleteMapTarget.title}`} className={styles.confirm} initial={false} exit={{ opacity: 0, y: 7, scale: 0.98 }} transition={overlayExitTransition(motionScale)}>
              <span className={styles.confirmEyebrow} data-danger>Delete Map</span>
              <h2>{deleteMapTarget.title}</h2>
              <p>Its Pins will vanish. Any child Maps return to the Library.</p>
              <div>
                <button type="button" onClick={() => setDeleteMapId(undefined)}>Cancel</button>
                <button type="button" className={styles.danger} aria-label={`Confirm delete ${deleteMapTarget.title}`} onClick={() => { setDeleteMapId(undefined); void persist(deleteMap(world, deleteMapTarget.id)) }}>Delete Map</button>
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteFolderTarget && (
          <motion.div className={styles.scrim} onMouseDown={(event) => event.target === event.currentTarget && dismiss()} initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={overlayExitTransition(motionScale)}>
            <motion.section role="dialog" aria-label={`Delete ${deleteFolderTarget.name} folder`} className={styles.confirm} initial={false} exit={{ opacity: 0, y: 7, scale: 0.98 }} transition={overlayExitTransition(motionScale)}>
              <span className={styles.confirmEyebrow}>Delete folder</span>
              <h2>{deleteFolderTarget.name}</h2>
              <p>The charts and any nested drawers move up to {deleteFolderTarget.parentFolder ? folders.find((folder) => folder.id === deleteFolderTarget.parentFolder)?.name : 'the Library root'}. Nothing is deleted.</p>
              <div>
                <button type="button" onClick={() => setDeleteFolderId(undefined)}>Cancel</button>
                <button type="button" className={styles.danger} onClick={() => { setDeleteFolderId(undefined); void persist(deleteFolder(world, deleteFolderTarget.id)) }}>Delete folder</button>
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  )
}
