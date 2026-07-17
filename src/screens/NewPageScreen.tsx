import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { propertyFromDefinition, templatePropertiesFor } from '../domain/properties'
import type { Category, CustomProperty, World } from '../domain/types'
import { Button } from '../components/Button/Button'
import { icons } from '../icons'
import { PropertyInput } from '../properties/PropertyInput'
import type { WorldRepository } from '../repository/WorldRepository'
import { getRepository } from '../state/repository'
import type { DashboardOutletContext } from './Dashboard/DashboardShell'
import { CATEGORY_META } from './Dashboard/categoryMeta'
import styles from './NewPageScreen.module.css'

const SINGULAR: Record<Category, string> = {
  stories: 'Story',
  eras: 'Era',
  characters: 'Character',
  locations: 'Location',
  items: 'Item',
  organizations: 'Organization',
  events: 'Event',
}

export interface NewPageScreenProps {
  repository?: WorldRepository
}

export function NewPageScreen({ repository }: NewPageScreenProps) {
  const { world: worldSlug = '' } = useParams()
  const navigate = useNavigate()
  const dashboard = useOutletContext<DashboardOutletContext | undefined>()
  const repo = repository ?? dashboard?.repository ?? getRepository()
  const pages = dashboard?.pages ?? []
  const [world, setWorld] = useState<World>()
  const [category, setCategory] = useState<Category>()
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [tags, setTags] = useState('')
  const [cover, setCover] = useState('')
  const [properties, setProperties] = useState<CustomProperty[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    repo.getWorld(worldSlug).then(setWorld).catch(() => setError("This World couldn't be loaded."))
  }, [repo, worldSlug])

  const selectCategory = (next: Category) => {
    setCategory(next)
    setProperties(
      (world ? templatePropertiesFor(world, next) : []).map(propertyFromDefinition),
    )
  }

  const createPage = async () => {
    if (!category || !title.trim()) return
    try {
      const created = await repo.createPage(worldSlug, {
        title: title.trim(),
        category,
        summary: summary.trim(),
        tags: tags.split(',').map((tag) => tag.trim().replace(/^#/, '')).filter(Boolean),
        ...(cover.trim() ? { cover: cover.trim() } : {}),
        customProperties: properties,
      })
      navigate(`/w/${worldSlug}/p/${created.slug}`)
    } catch {
      setError("The Page couldn't be created.")
    }
  }

  if (error) {
    return (
      <main className={styles.screen}>
        <p className={styles.state}>{error}</p>
      </main>
    )
  }
  if (!world) {
    return (
      <main className={styles.screen}>
        <p className={styles.state}>Loading World…</p>
      </main>
    )
  }

  return (
    <main className={styles.screen}>
      <header className={styles.hero}>
        <span className={styles.eyebrow}>New entry · {world.name}</span>
        <h1 className={styles.title}>What are you charting?</h1>
        <p className={styles.lede}>Pick a category to begin. This World’s template fills in the rest.</p>
      </header>

      <section className={styles.pick} aria-labelledby="pick-heading">
        <span id="pick-heading" className={styles.step}>Choose a category</span>
        <div className={styles.grid} role="group" aria-label="Page category">
          {CATEGORY_META.map((meta, index) => {
            const count = pages.filter((page) => page.category === meta.category).length
            return (
              <button
                type="button"
                key={meta.category}
                className={styles.card}
                aria-label={meta.label}
                aria-pressed={category === meta.category}
                onClick={() => selectCategory(meta.category)}
                style={{
                  '--category-color': `var(--cat-${meta.category})`,
                  animationDelay: `calc(var(--mo, 1) * ${index * 45}ms)`,
                } as React.CSSProperties}
              >
                <span className={styles.cardIcon}><meta.icon /></span>
                <h2 className={styles.cardLabel}>{meta.label}</h2>
                <b className={styles.cardCount}>{count}</b>
                <small className={styles.cardUnit}>{count === 1 ? 'Page' : 'Pages'}</small>
              </button>
            )
          })}
        </div>
      </section>

      {category ? (
        <form key={category} className={styles.form} onSubmit={(event) => { event.preventDefault(); void createPage() }}>
          <span className={styles.step}>Describe your {SINGULAR[category]}</span>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Title</span>
            <input className={`${styles.input} ${styles.titleInput}`} aria-label="Title" autoFocus placeholder={`Name this ${SINGULAR[category]}`} value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Summary</span>
            <textarea className={`${styles.input} ${styles.textarea}`} aria-label="Summary" placeholder="A line or two on what this is." value={summary} onChange={(event) => setSummary(event.target.value)} />
          </label>

          <div className={styles.pair}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Tags</span>
              <input className={styles.input} aria-label="Tags" placeholder="coastal, mystery" value={tags} onChange={(event) => setTags(event.target.value)} />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Cover</span>
              <input className={styles.input} aria-label="Cover" type="url" placeholder="Image URL" value={cover} onChange={(event) => setCover(event.target.value)} />
            </label>
          </div>

          {properties.map((property, index) => {
            const control = (
              <PropertyInput
                property={property}
                pages={pages}
                onChange={(value) => setProperties((current) => current.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, value } : candidate))}
              />
            )
            // Relation (chips) and image (dropzone) carry their own surface;
            // the scalar/trigger controls get the filled field box.
            const boxed = property.type !== 'relation' && property.type !== 'image'
            return (
              <div className={styles.field} key={property.key}>
                <span className={styles.fieldLabel}>{property.label}</span>
                {boxed ? <div className={styles.control}>{control}</div> : control}
              </div>
            )
          })}

          <div className={styles.actions}>
            <Button type="submit" className={styles.createButton} disabled={!title.trim()}>
              Create {SINGULAR[category]}<icons.arrowRight size={16} weight="bold" />
            </Button>
          </div>
        </form>
      ) : (
        <p className={styles.hint}>Choose a category above to name and describe your entry.</p>
      )}
    </main>
  )
}
