import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { AnimatePresence } from 'motion/react'
import { useNavigate } from 'react-router-dom'
import { NavigationBurst } from '../../components/NavigationBurst/NavigationBurst'
import { useNavigationBurst } from '../../components/NavigationBurst/useNavigationBurst'
import { UserMenu } from '../../components/UserMenu/UserMenu'
import type { World } from '../../domain/types'
import type { CreateWorldInput } from '../../repository/WorldRepository'
import { getRepository } from '../../state/repository'
import { useSessionStore } from '../../state/sessionStore'
import { useUiStore } from '../../state/uiStore'
import { CreateWorldModal } from './CreateWorldModal'
import { WorldCard } from './WorldCard'
import styles from './Worlds.module.css'

function Wordmark() {
  return (
    <span className={styles.wordmark}>
      <img src="/landforger-icon.svg" alt="" aria-hidden="true" width="22" height="22" />
      LandForger
    </span>
  )
}

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
  const motionScale = useUiStore((state) => state.motionScale)
  const { burst, begin } = useNavigationBurst(navigate, motionScale)

  const [worlds, setWorlds] = useState<World[] | null>(null)
  const [entryCounts, setEntryCounts] = useState<Record<string, number>>({})
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)

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

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (needle === '') return worlds ?? []
    return (worlds ?? []).filter(
      (world) => world.name.toLowerCase().includes(needle) || world.logline.toLowerCase().includes(needle),
    )
  }, [worlds, query])

  async function handleCreate(input: CreateWorldInput) {
    const world = await getRepository().createWorld(input)
    setCreating(false)
    navigate(`/w/${world.slug}`)
  }

  function selectWorld(world: World, event: MouseEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    begin({
      to: `/w/${world.slug}`,
      label: world.name,
      color: world.color,
      origin: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
    })
  }

  return (
    <main className={styles.screen}>
      <header className={styles.header}>
        <Wordmark />
        <input
          type="search"
          className={styles.search}
          placeholder="Search worlds…"
          aria-label="Search worlds"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <UserMenu />
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

        {filtered.map((world, index) => (
          <WorldCard
            key={world.slug}
            world={world}
            entryCount={entryCounts[world.slug] ?? 0}
            index={index}
            onClick={(event) => selectWorld(world, event)}
          />
        ))}

        {worlds !== null && filtered.length === 0 && query.trim() !== '' && (
          <p className={styles.empty}>No worlds match &ldquo;{query.trim()}&rdquo;.</p>
        )}
      </section>

      <AnimatePresence>
        {creating && <CreateWorldModal onCancel={() => setCreating(false)} onCreate={handleCreate} />}
      </AnimatePresence>

      {burst && <NavigationBurst color={burst.color} label={burst.label} origin={burst.origin} />}
    </main>
  )
}
