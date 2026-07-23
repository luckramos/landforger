import { describe, expect, it } from 'vitest'
import { resolveSlugCollision, slugify } from '../domain/slug'

describe('slugify', () => {
  it('kebab-cases a title', () => {
    expect(slugify('Sera Valen')).toBe('sera-valen')
    expect(slugify('The Ninth Vale')).toBe('the-ninth-vale')
  })

  it('strips punctuation and collapses whitespace', () => {
    expect(slugify("Cartographers' Guild")).toBe('cartographers-guild')
    expect(slugify('The Sundering!!  (Part One)')).toBe('the-sundering-part-one')
  })

  it('trims leading/trailing dashes left over from stripped punctuation', () => {
    expect(slugify('  -- Hollow King -- ')).toBe('hollow-king')
  })
})

describe('resolveSlugCollision', () => {
  it('returns the base slug unchanged when there is no collision', () => {
    expect(resolveSlugCollision('sera', [])).toBe('sera')
    expect(resolveSlugCollision('sera', ['corin'])).toBe('sera')
  })

  it('suffixes -2 on first collision, -3 on the next, etc.', () => {
    expect(resolveSlugCollision('sera', ['sera'])).toBe('sera-2')
    expect(resolveSlugCollision('sera', ['sera', 'sera-2'])).toBe('sera-3')
    expect(resolveSlugCollision('sera', ['sera', 'sera-2', 'sera-3'])).toBe('sera-4')
  })

  it('does not get confused by an existing slug that merely contains the base as a substring', () => {
    expect(resolveSlugCollision('sera', ['sera-valen'])).toBe('sera')
  })
})
