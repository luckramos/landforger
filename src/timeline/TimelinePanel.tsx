import type { FormEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { DockableWindow } from '../components/DockableWindow/DockableWindow'
import { prefersReducedMotion } from '../components/motionPrefs'
import { buildTimeline, reorderEras } from '../domain/timeline'
import type { Page, World } from '../domain/types'
import type { WorldRepository } from '../repository/WorldRepository'
import styles from './TimelinePanel.module.css'

export interface TimelinePanelProps {
  world: World
  pages: Page[]
  repository: WorldRepository
  focusPage?: string
  onClose: () => void
  onNavigatePage: (slug: string) => void
}

type Mode = 'timeline' | 'manage'

export function TimelinePanel({ world, pages, repository, focusPage, onClose, onNavigatePage }: TimelinePanelProps) {
  const [currentWorld, setCurrentWorld] = useState(world)
  const [currentPages, setCurrentPages] = useState(pages)
  const [mode, setMode] = useState<Mode>('timeline')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [occurrence, setOccurrence] = useState(0)
  const [pulseEra, setPulseEra] = useState<string>()
  const [createOpen, setCreateOpen] = useState(false)
  const [dragOver, setDragOver] = useState<number>()
  const dragFromRef = useRef<number | undefined>(undefined)
  const dragOverRef = useRef<number | undefined>(undefined)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => setCurrentWorld(world), [world])
  useEffect(() => setCurrentPages(pages), [pages])

  const timeline = useMemo(() => buildTimeline(currentWorld, currentPages), [currentPages, currentWorld])
  const focus = focusPage ? currentPages.find((page) => page.slug === focusPage) : undefined
  const occurrences = focus ? currentWorld.eraOrder.filter((eraSlug) => focus.eras.includes(eraSlug)) : []
  const activeEraTitle = timeline.find((era) => era.page.slug === currentWorld.activeEra)?.page.title

  useEffect(() => setOccurrence(0), [focusPage])

  useEffect(() => {
    const eraSlug = occurrences[occurrence]
    if (!eraSlug) return
    let cancelScroll = () => {}
    setExpanded((current) => new Set(current).add(eraSlug))
    setPulseEra(eraSlug)
    const pulseTimer = window.setTimeout(() => setPulseEra((current) => (current === eraSlug ? undefined : current)), 1000)
    const scrollTimer = window.setTimeout(() => {
      cancelScroll = scrollToEra(scrollRef.current, eraSlug)
    }, 90)
    return () => {
      window.clearTimeout(pulseTimer)
      window.clearTimeout(scrollTimer)
      cancelScroll()
    }
  }, [occurrence, occurrences.join('|')])

  const setActiveEra = async (eraSlug: string) => {
    const updated = await repository.updateWorld(currentWorld.slug, { activeEra: eraSlug })
    setCurrentWorld(updated)
  }

  const finishReorder = async () => {
    const from = dragFromRef.current
    const to = dragOverRef.current
    dragFromRef.current = undefined
    dragOverRef.current = undefined
    setDragOver(undefined)
    if (from === undefined || to === undefined) return
    const eraOrder = reorderEras(currentWorld.eraOrder, from, to)
    if (eraOrder === currentWorld.eraOrder) return
    setCurrentWorld((current) => ({ ...current, eraOrder }))
    const updated = await repository.updateWorld(currentWorld.slug, { eraOrder })
    setCurrentWorld(updated)
  }

  const createEra = async (input: { title: string; dateLabel: string; summary: string }) => {
    await repository.createPage(currentWorld.slug, {
      title: input.title,
      category: 'eras',
      summary: input.summary,
      customProperties: [{ key: 'datelabel', label: 'Date Label', type: 'text', value: input.dateLabel }],
    })
    const [updatedWorld, updatedPages] = await Promise.all([
      repository.getWorld(currentWorld.slug),
      repository.listPages(currentWorld.slug),
    ])
    if (updatedWorld) setCurrentWorld(updatedWorld)
    setCurrentPages(updatedPages)
    setCreateOpen(false)
  }

  const toolbar = (
    <div className={styles.headerTools}>
      {occurrences.length > 0 && (
        <div className={styles.occurrences} aria-label={`Occurrences of ${focus?.title}`}>
          <button type="button" aria-label="Previous occurrence" onClick={() => setOccurrence((current) => (current - 1 + occurrences.length) % occurrences.length)}>◀</button>
          <span>{occurrence + 1} / {occurrences.length}</span>
          <button type="button" aria-label="Next occurrence" onClick={() => setOccurrence((current) => (current + 1) % occurrences.length)}>▶</button>
        </div>
      )}
      <div className={styles.modeToggle}>
        <button type="button" aria-pressed={mode === 'timeline'} onClick={() => setMode('timeline')}>Timeline</button>
        <button type="button" aria-pressed={mode === 'manage'} onClick={() => setMode('manage')}>Manage order</button>
      </div>
    </div>
  )

  return (
    <DockableWindow
      title="Timeline"
      subtitle={`${timeline.length} ${timeline.length === 1 ? 'Era' : 'Eras'}`}
      onClose={onClose}
      toolbar={toolbar}
    >
      <div className={styles.panel}>
        <div className={styles.activeBar}>
          <span className={styles.activeDot} />
          <span>{activeEraTitle ? `Active Era: ${activeEraTitle}` : 'No Active Era'}</span>
          {timeline.length > 0 && <button type="button" onClick={() => setCreateOpen(true)}>＋ Create Era</button>}
        </div>

        {mode === 'timeline' ? (
          <div ref={scrollRef} className={styles.scroll} data-tlscroll>
            {timeline.map((era, index) => {
              const isExpanded = expanded.has(era.page.slug)
              const isActive = currentWorld.activeEra === era.page.slug
              return (
                <article
                  key={era.page.slug}
                  className={styles.era}
                  data-active={isActive || undefined}
                  data-occurrence={occurrences.includes(era.page.slug) ? 'true' : undefined}
                  data-pulse={pulseEra === era.page.slug ? 'true' : undefined}
                  data-testid={`timeline-era-${era.page.slug}`}
                  data-era={era.page.slug}
                  style={{ animationDelay: `${Math.min(index, 8) * 55}ms` }}
                >
                  <div className={styles.rail} aria-hidden="true"><i /><span /></div>
                  <div className={styles.card}>
                    <button
                      type="button"
                      className={styles.expand}
                      aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${era.page.title}`}
                      aria-expanded={isExpanded}
                      onClick={() => setExpanded((current) => toggleSet(current, era.page.slug))}
                    >
                      <span className={isExpanded ? styles.caretOpen : styles.caret}>▶</span>
                      <span>
                        <strong>{era.page.title}</strong>
                        <small>{era.dateLabel}</small>
                      </span>
                      <b>{era.memberCount} {era.memberCount === 1 ? 'Page' : 'Pages'}</b>
                    </button>
                    <p>{era.page.summary}</p>
                    <button
                      type="button"
                      className={styles.activeButton}
                      aria-label={`Make ${era.page.title} the Active Era`}
                      aria-pressed={isActive}
                      onClick={() => void setActiveEra(era.page.slug)}
                    >
                      {isActive ? '● Active Era' : '○ Set active'}
                    </button>
                    {isExpanded && (
                      <div className={styles.members}>
                        {[...era.members.entries()].map(([category, entries]) => (
                          <section key={category}>
                            <h3>{category}</h3>
                            <div>
                              {entries.map((page, memberIndex) => (
                                <a
                                  key={page.slug}
                                  href={`/w/${currentWorld.slug}/p/${page.slug}`}
                                  aria-label={page.title}
                                  style={{ animationDelay: `calc(var(--mo, 1) * ${memberIndex * 40}ms)` }}
                                  onClick={(event) => {
                                    event.preventDefault()
                                    onNavigatePage(page.slug)
                                  }}
                                >
                                  <span style={{ color: `var(--cat-${page.category})` }}>◆</span>{page.title}
                                </a>
                              ))}
                            </div>
                          </section>
                        ))}
                        {era.memberCount === 0 && <p className={styles.noMembers}>No Pages belong to this Era yet.</p>}
                      </div>
                    )}
                  </div>
                </article>
              )
            })}
            {timeline.length === 0 && <EmptyTimeline onCreate={() => setCreateOpen(true)} />}
          </div>
        ) : (
          <div className={styles.manage}>
            <header><span>Drag Eras into the order your history follows.</span><b>{timeline.length} Eras</b></header>
            {timeline.map((era, index) => (
              <div
                key={era.page.slug}
                className={styles.manageRow}
                data-testid={`manage-era-${era.page.slug}`}
                data-drop-before={dragOver === index || undefined}
                draggable
                onDragStart={() => {
                  dragFromRef.current = index
                  dragOverRef.current = index
                }}
                onDragEnter={(event) => {
                  event.preventDefault()
                  dragOverRef.current = index
                  setDragOver(index)
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragEnd={() => void finishReorder()}
              >
                <span className={styles.grip}>⠿</span>
                <span className={styles.order}>{String(index + 1).padStart(2, '0')}</span>
                <span><strong>{era.page.title}</strong><small>{era.dateLabel}</small></span>
                {currentWorld.activeEra === era.page.slug && <b>Active Era</b>}
              </div>
            ))}
            {timeline.length === 0 && <EmptyTimeline onCreate={() => setCreateOpen(true)} />}
          </div>
        )}
      </div>
      {createOpen && <CreateEraForm onCancel={() => setCreateOpen(false)} onCreate={createEra} />}
    </DockableWindow>
  )
}

function EmptyTimeline({ onCreate }: { onCreate: () => void }) {
  return (
    <div className={styles.empty}>
      <span>◴</span>
      <h3>No Eras yet</h3>
      <p>Give this World its first chapter in time.</p>
      <button type="button" onClick={onCreate}>Create first Era</button>
    </div>
  )
}

function CreateEraForm({ onCancel, onCreate }: { onCancel: () => void; onCreate: (input: { title: string; dateLabel: string; summary: string }) => Promise<void> }) {
  const [submitting, setSubmitting] = useState(false)
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const title = String(data.get('title') ?? '').trim()
    if (!title) return
    setSubmitting(true)
    void onCreate({ title, dateLabel: String(data.get('dateLabel') ?? '').trim(), summary: String(data.get('summary') ?? '').trim() })
      .catch(() => setSubmitting(false))
  }
  return (
    <div className={styles.createScrim} role="presentation">
      <form className={styles.createForm} aria-label="Create Era" onSubmit={submit}>
        <span className={styles.formEyebrow}>New chapter</span>
        <h3>Create an Era</h3>
        <label>Era title<input name="title" autoFocus /></label>
        <label>Date Label<input name="dateLabel" placeholder="Year 512 of the Ember Cycle" /></label>
        <label>Summary<textarea name="summary" rows={3} /></label>
        <div><button type="button" onClick={onCancel}>Cancel</button><button type="submit" disabled={submitting}>Create Era</button></div>
      </form>
    </div>
  )
}

function toggleSet(current: Set<string>, value: string): Set<string> {
  const next = new Set(current)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

function scrollToEra(container: HTMLDivElement | null, eraSlug: string): () => void {
  const target = container?.querySelector<HTMLElement>(`[data-era="${eraSlug}"]`)
  if (!container || !target) return () => {}
  const destination = Math.max(0, target.offsetTop - 24)
  if (prefersReducedMotion() || typeof requestAnimationFrame !== 'function') {
    container.scrollTop = destination
    return () => {}
  }
  const start = container.scrollTop
  const distance = destination - start
  const duration = Math.min(560, 220 + Math.abs(distance) * 0.45)
  const startedAt = performance.now()
  let frame = 0
  const tick = (now: number) => {
    const progress = Math.min(1, (now - startedAt) / duration)
    container.scrollTop = start + distance * (1 - Math.pow(1 - progress, 3))
    if (progress < 1) frame = requestAnimationFrame(tick)
  }
  frame = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(frame)
}
