import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { propertyFromDefinition, templatePropertiesFor } from '../domain/properties'
import type { Category, CustomProperty, World } from '../domain/types'
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

  if (error) return <main className={styles.screen}><p>{error}</p></main>
  if (!world) return <main className={styles.screen}><p>Loading World…</p></main>

  return (
    <main className={styles.screen}>
      <header><span>New Page</span><h1>{category ? `New ${SINGULAR[category]}` : 'What are you charting?'}</h1><p>Choose a Category, then begin with this World’s current template.</p></header>
      <div className={styles.categoryGrid} aria-label="Page category">
        {CATEGORY_META.map((meta) => <button type="button" key={meta.category} aria-label={meta.label} aria-pressed={category === meta.category} onClick={() => selectCategory(meta.category)}><span style={{ color: `var(--cat-${meta.category})` }}>{meta.icon}</span>{meta.label}</button>)}
      </div>
      {category && (
        <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void createPage() }}>
          <label>Title<input aria-label="Title" autoFocus value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <label>Summary<textarea aria-label="Summary" value={summary} onChange={(event) => setSummary(event.target.value)} /></label>
          <label>Tags<input aria-label="Tags" placeholder="coastal, mystery" value={tags} onChange={(event) => setTags(event.target.value)} /></label>
          <label>Cover<input aria-label="Cover" type="url" placeholder="Image URL" value={cover} onChange={(event) => setCover(event.target.value)} /></label>
          {properties.map((property, index) => (
            <label key={property.key}>{property.label}<PropertyInput property={property} pages={dashboard?.pages ?? []} onChange={(value) => setProperties((current) => current.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, value } : candidate))} /></label>
          ))}
          <button type="submit" className={styles.create} disabled={!title.trim()}>Create {SINGULAR[category]}</button>
        </form>
      )}
    </main>
  )
}
