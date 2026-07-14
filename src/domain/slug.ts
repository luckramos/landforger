/**
 * A Page's Slug: kebab-case from the title at creation, immutable
 * thereafter (CONTEXT.md — "Slug"). Renaming a Page changes its title,
 * never its Slug; collisions resolve by numeric suffix (`sera-2`).
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Appends `-2`, `-3`, … to `base` until it no longer collides with `existingSlugs`. */
export function resolveSlugCollision(base: string, existingSlugs: string[]): string {
  const taken = new Set(existingSlugs)
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}
