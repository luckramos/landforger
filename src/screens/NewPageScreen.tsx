import { useEffect, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom'
import { propertyFromDefinition, templatePropertiesFor, upsertCategoryTemplate } from '../domain/properties'
import type { Category, CustomProperty, PropertyDef, World } from '../domain/types'
import { Button } from '../components/Button/Button'
import { icons } from '../icons'
import { CategoryTemplateDialog } from '../properties/CategoryTemplateDialog'
import { ImageInput } from '../properties/ImageInput'
import { PropertyInput } from '../properties/PropertyInput'
import type { WorldRepository } from '../repository/WorldRepository'
import { getRepository } from '../state/repository'
import { useUiStore } from '../state/uiStore'
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
  const [searchParams] = useSearchParams()
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
  const [templateOpen, setTemplateOpen] = useState(false)
  const [error, setError] = useState('')
  const motionScale = useUiStore((state) => state.motionScale)

  useEffect(() => {
    repo.getWorld(worldSlug).then(setWorld).catch(() => setError("This World couldn't be loaded."))
  }, [repo, worldSlug])

  // Deep link from a Category header ("+ New page"): pre-select that Category
  // and seed its template once the World is loaded, so the form opens ready.
  const presetCategory = searchParams.get('category')
  useEffect(() => {
    if (!world || category || !presetCategory) return
    if (!CATEGORY_META.some((meta) => meta.category === presetCategory)) return
    setCategory(presetCategory as Category)
    setProperties(templatePropertiesFor(world, presetCategory as Category).map(propertyFromDefinition))
  }, [world, category, presetCategory])

  const selectCategory = (next: Category) => {
    setCategory(next)
    setProperties(
      (world ? templatePropertiesFor(world, next) : []).map(propertyFromDefinition),
    )
  }

  // Edit the selected Category's template in place, then reseed the open form
  // from it — keeping any values already entered for fields that survived.
  const saveTemplate = (target: Category, definitions: PropertyDef[]) => {
    if (!world) return
    const categoryTemplates = upsertCategoryTemplate(world.categoryTemplates, target, definitions)
    const nextWorld = { ...world, categoryTemplates }
    setWorld(nextWorld)
    if (category === target) {
      setProperties((current) => {
        const entered = new Map(current.map((property) => [property.key, property.value]))
        return templatePropertiesFor(nextWorld, target).map((definition) => {
          const seeded = propertyFromDefinition(definition)
          return entered.has(definition.key) ? { ...seeded, value: entered.get(definition.key)! } : seeded
        })
      })
    }
    setTemplateOpen(false)
    repo.updateWorld(worldSlug, { categoryTemplates }).then(setWorld).catch(() => setWorld(world))
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
          <div className={styles.formHead}>
            <span className={styles.step}>Describe your {SINGULAR[category]}</span>
            <button type="button" className={styles.templateEdit} onClick={() => setTemplateOpen(true)}>
              <icons.edit size={14} /> Edit template
            </button>
          </div>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Title</span>
            <input className={`${styles.input} ${styles.titleInput}`} aria-label="Title" autoFocus placeholder={`Name this ${SINGULAR[category]}`} value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Summary</span>
            <textarea className={`${styles.input} ${styles.textarea}`} aria-label="Summary" placeholder="A line or two on what this is." value={summary} onChange={(event) => setSummary(event.target.value)} />
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Tags</span>
            <input className={styles.input} aria-label="Tags" placeholder="coastal, mystery" value={tags} onChange={(event) => setTags(event.target.value)} />
          </label>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Cover</span>
            <ImageInput variant="banner" label="Cover" value={cover} onChange={(next) => setCover(next ?? '')} />
          </div>

          {properties.map((property, index) => (
            <div className={styles.field} key={property.key}>
              <span className={styles.fieldLabel}>{property.label}</span>
              <PropertyInput
                property={property}
                pages={pages}
                filled
                onChange={(value) => setProperties((current) => current.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, value } : candidate))}
              />
            </div>
          ))}

          <div className={styles.actions}>
            <Button type="submit" className={styles.createButton} disabled={!title.trim()}>
              Create {SINGULAR[category]}<icons.arrowRight size={16} weight="bold" />
            </Button>
          </div>
        </form>
      ) : (
        <p className={styles.hint}>Choose a category above to name and describe your entry.</p>
      )}

      <AnimatePresence>
        {templateOpen && category && (
          <CategoryTemplateDialog
            world={world}
            category={category}
            motionScale={motionScale}
            onClose={() => setTemplateOpen(false)}
            onSave={saveTemplate}
          />
        )}
      </AnimatePresence>
    </main>
  )
}
