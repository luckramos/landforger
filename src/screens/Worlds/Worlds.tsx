import { useEffect, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { Link, useNavigate } from 'react-router-dom'
import { UserMenu } from '../../components/UserMenu/UserMenu'
import type { World } from '../../domain/types'
import type { CreateWorldInput } from '../../repository/WorldRepository'
import { getRepository } from '../../state/repository'
import { useSessionStore } from '../../state/sessionStore'
import { icons } from '../../icons'
import { CreateWorldModal } from './CreateWorldModal'
import { WorldCard } from './WorldCard'
import { WorldsSpotlight } from './WorldsSpotlight'
import styles from './Worlds.module.css'

function dateline(now = new Date()): string {
  return now
    .toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    .toUpperCase()
}

/** The Worlds screen (`/worlds`) — glass header, greeting, world grid, create modal (design-inventory.md §2.2). */
export function Worlds() {
  const navigate = useNavigate()
  const user = useSessionStore((s) => s.user)
  const firstName = (user?.name ?? 'Sera Valen').split(/\s+/)[0]

  const [worlds, setWorlds] = useState<World[] | null>(null)
  const [entryCounts, setEntryCounts] = useState<Record<string, number>>({})
  const [creating, setCreating] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const repository = getRepository()
      const loaded = await repository.listWorlds()
      if (cancelled) return
      setWorlds(loaded)
      const counts: Record<string, number> = {}
      await Promise.all(
        loaded.map(async (world) => {
          counts[world.slug] = (await repository.listPages(world.slug)).length
        }),
      )
      if (!cancelled) setEntryCounts({ ...counts })
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const handleSearchShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
      } else if (event.key === 'Escape') {
        setSearchOpen(false)
      }
    }
    document.addEventListener('keydown', handleSearchShortcut)
    return () => document.removeEventListener('keydown', handleSearchShortcut)
  }, [])

  async function handleCreate(input: CreateWorldInput) {
    const world = await getRepository().createWorld(input)
    setCreating(false)
    navigate(`/w/${world.slug}`)
  }

  function selectWorld(world: World) {
    navigate(`/w/${world.slug}`, { viewTransition: true })
  }

  return (
    <main className={styles.screen}>
      <header className={styles.header}>
        <Link to="/worlds" className={styles.brand} aria-label="LandForger home">
          <img className={styles.brandFull} src="/landforger.svg" alt="LandForger" />
          <img className={styles.brandIcon} src="/landforger-icon.svg" alt="" aria-hidden="true" />
        </Link>

        <button type="button" className={styles.searchTrigger} onClick={() => setSearchOpen(true)}>
          <icons.search size={16} /> <span>Search worlds…</span><kbd>⌘K</kbd>
        </button>

        <div className={styles.rightChrome}>
          <UserMenu />
        </div>
      </header>

      <section className={styles.greeting}>
        <span className={styles.dateline}>{dateline()}</span>
        <h1 className={styles.welcome}>Welcome back, {firstName}.</h1>
        <p className={styles.subtext}>Your atlases are where you left them. Pick a world or forge a new one.</p>
      </section>

      <section className={styles.grid} aria-label="Your worlds">
        <button type="button" className={styles.createCard} onClick={() => setCreating(true)}>
          <span className={styles.createGlyph} aria-hidden="true">
            +
          </span>
          <span className={styles.createLabel}>Forge a new world</span>
          <span className={styles.createHint}>A blank cosmos or a starter structure</span>
        </button>

        {(worlds ?? []).map((world, index) => (
          <WorldCard
            key={world.slug}
            world={world}
            entryCount={entryCounts[world.slug] ?? 0}
            index={index}
            onClick={() => selectWorld(world)}
          />
        ))}
      </section>

      <AnimatePresence>
        {creating && <CreateWorldModal onCancel={() => setCreating(false)} onCreate={handleCreate} />}
      </AnimatePresence>

      <AnimatePresence>
        {searchOpen && worlds && (
          <WorldsSpotlight worlds={worlds} entryCounts={entryCounts} onClose={() => setSearchOpen(false)} />
        )}
      </AnimatePresence>
    </main>
  )
}
