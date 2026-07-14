import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { icons } from './index'

describe('icons barrel', () => {
  for (const [name, IconComponent] of Object.entries(icons)) {
    it(`renders an SVG for "${name}"`, () => {
      const { container } = render(<IconComponent aria-hidden="true" />)
      const svg = container.querySelector('svg')
      expect(svg).toBeTruthy()
    })
  }
})
