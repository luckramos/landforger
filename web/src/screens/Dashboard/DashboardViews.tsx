import { useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import type { Category, Page, PropertyDef } from '../../domain/types'
import { upsertCategoryTemplate } from '../../domain/properties'
import { CategoryTemplateDialog } from '../../properties/CategoryTemplateDialog'
import { useUiStore } from '../../state/uiStore'
import { icons } from '../../icons'
import type { DashboardOutletContext } from './DashboardShell'
import { CATEGORY_META, categoryMeta } from './categoryMeta'
import styles from './DashboardViews.module.css'

function PageCard({ page, worldSlug }: { page: Page; worldSlug: string }) {
  const meta = categoryMeta(page.category)
  return (
    <Link
      to={`/w/${worldSlug}/p/${page.slug}`}
      className={styles.pageCard}
      style={{ '--category-color': `var(--cat-${page.category})` } as React.CSSProperties}
      aria-label={`${page.title}, ${page.summary}`}
    >
      {page.cover && <div className={styles.cover} style={{ backgroundImage: `linear-gradient(180deg, transparent, color-mix(in oklab, var(--bg) 72%, transparent)), url(${page.cover})` }} />}
      <div className={styles.cardBody}>
        <span className={styles.eyebrow} style={{ color: 'var(--category-color)' }}>{meta?.label}</span>
        <h2>{page.title}</h2>
        <p>{page.summary}</p>
        <div className={styles.chips}>{page.tags.slice(0, 4).map((tag) => <span key={tag}>#{tag}</span>)}</div>
      </div>
    </Link>
  )
}

export function DashboardHome() {
  const { world, pages } = useOutletContext<DashboardOutletContext>()
  const recent = [...pages].sort((a, b) => b.updated.localeCompare(a.updated) || a.title.localeCompare(b.title)).slice(0, 7)

  return (
    <main className={styles.home}>
      <header className={styles.hero}>
        <span className={styles.eyebrow}>World atlas · {world.genre}</span>
        <h1>{world.name}</h1>
        <div>{world.body.trim().split(/\n\s*\n/).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
      </header>

      <section className={styles.categories} aria-label="Categories">
        {CATEGORY_META.map((item, index) => {
          const count = pages.filter((page) => page.category === item.category).length
          return (
            <Link
              key={item.category}
              to={`/w/${world.slug}/c/${item.category}`}
              className={styles.categoryCard}
              style={{
                '--category-color': `var(--cat-${item.category})`,
                animationDelay: `calc(var(--mo, 1) * ${index * 45}ms)`,
              } as React.CSSProperties}
              aria-label={`${item.label} ${count}`}
            >
              <span><item.icon /></span><h2>{item.label}</h2><b>{count}</b><small>Pages</small>
            </Link>
          )
        })}
      </section>

      <section className={styles.recent} aria-label="Recently edited">
        <header><div><span className={styles.eyebrow}>Live archive</span><h2>Recently edited</h2></div><span>{pages.length} Pages</span></header>
        <div>
          {recent.map((page) => {
            const meta = categoryMeta(page.category)
            return (
              <Link key={page.slug} to={`/w/${world.slug}/p/${page.slug}`}>
                <span className={styles.pageIcon} style={{ color: `var(--cat-${page.category})` }}>{meta && <meta.icon size={17} />}</span>
                <strong>{page.title}</strong><span>{meta?.label}</span>
                <time dateTime={page.updated}>{new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(page.updated))}</time>
              </Link>
            )
          })}
        </div>
      </section>
    </main>
  )
}

export function DashboardList() {
  const { category = '', tag = '' } = useParams()
  const { world, pages, repository, readOnly } = useOutletContext<DashboardOutletContext>()
  const motionScale = useUiStore((state) => state.motionScale)
  const [templateOpen, setTemplateOpen] = useState(false)
  const meta = categoryMeta(category)
  const filtered = pages.filter((page) => (meta ? page.category === meta.category : page.tags.includes(tag)))
  const heading = meta?.label ?? `#${tag}`

  const saveTemplate = (target: Category, properties: PropertyDef[]) => {
    const categoryTemplates = upsertCategoryTemplate(world.categoryTemplates, target, properties)
    repository.updateWorld(world.slug, { categoryTemplates }).catch(() => {})
    setTemplateOpen(false)
  }

  return (
    <main className={styles.list}>
      <header className={styles.listHeader}>
        <span className={styles.listIcon} style={{ color: meta ? `var(--cat-${meta.category})` : 'var(--bronze-light)' }}>{meta ? <meta.icon size={28} /> : '#'}</span>
        <div><span className={styles.eyebrow}>{meta ? 'Category' : 'Tag collection'}</span><h1>{heading}</h1><p>{filtered.length} {filtered.length === 1 ? 'Page' : 'Pages'} charted here</p></div>
        {meta && !readOnly && (
          <div className={styles.headerActions}>
            <Link
              className={styles.addPage}
              to={`/w/${world.slug}/new?category=${meta.category}`}
              aria-label={`New ${meta.label} page`}
              title={`New ${meta.label} page`}
            >
              <icons.add size={18} />
            </Link>
            <button
              type="button"
              className={styles.templateEdit}
              aria-label={`Edit ${meta.label} template`}
              title={`Edit ${meta.label} template`}
              onClick={() => setTemplateOpen(true)}
            >
              <icons.edit size={17} />
            </button>
          </div>
        )}
      </header>
      <section className={styles.pageGrid} aria-label={`${heading} Pages`}>
        {filtered.map((page) => <PageCard key={page.slug} page={page} worldSlug={world.slug} />)}
      </section>
      {filtered.length === 0 && <p className={styles.empty}>Nothing has been charted here yet.</p>}

      <AnimatePresence>
        {meta && templateOpen && (
          <CategoryTemplateDialog
            world={world}
            category={meta.category}
            motionScale={motionScale}
            onClose={() => setTemplateOpen(false)}
            onSave={saveTemplate}
          />
        )}
      </AnimatePresence>
    </main>
  )
}
