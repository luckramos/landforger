import type { CSSProperties } from 'react'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { categoryIcons, icons } from './index'

describe('icons barrel', () => {
  for (const [name, IconComponent] of Object.entries(icons)) {
    it(`renders an SVG for "${name}"`, () => {
      const { container } = render(<IconComponent aria-hidden="true" />)
      const svg = container.querySelector('svg')
      expect(svg).toBeTruthy()
    })
  }
})

describe('category icons', () => {
  for (const [category, IconComponent] of Object.entries(categoryIcons)) {
    it(`renders a Duotone SVG for "${category}" bound to its Category color`, () => {
      const { container } = render(
        <IconComponent aria-hidden="true" style={{ '--icon-secondary-color': 'red' } as CSSProperties} />,
      )
      const svg = container.querySelector('svg')
      expect(svg).toBeTruthy()
      // Duotone weight renders a background wash path (marked with an `opacity`
      // attribute by Phosphor) alongside the outline — that's the path our CSS
      // binds to the Category color.
      expect(svg?.querySelector('path[opacity]')).toBeTruthy()
    })
  }
})
