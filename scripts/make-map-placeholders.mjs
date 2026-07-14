#!/usr/bin/env node
/**
 * Generates placeholder SVG map images for the Ninth Vale fixture world.
 *
 * The design project's real map PNGs (`maps/*.png`) are not fetched here —
 * per the fixtures ticket, these are stand-ins: dark background (#080807),
 * the map's title (and, for era-linked maps, the era's date label) in mono
 * type, and a bronze (#B0824A) border. Swap them for the real design PNGs
 * once they're available; `_world.md` only cares about the file paths.
 *
 * Run with: node scripts/make-map-placeholders.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '..', 'public', 'maps')

const BG = '#080807'
const BRONZE = '#B0824A'
const TEXT = 'rgba(245,241,234,0.92)'
const MUTED = 'rgba(245,241,234,0.55)'

function svg(title, subtitle) {
  const width = 1600
  const height = 1080
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="0" y="0" width="${width}" height="${height}" fill="${BG}" />
  <rect x="12" y="12" width="${width - 24}" height="${height - 24}" fill="none" stroke="${BRONZE}" stroke-width="6" />
  <line x1="12" y1="12" x2="${width - 12}" y2="${height - 12}" stroke="${BRONZE}" stroke-width="1" opacity="0.15" />
  <line x1="${width - 12}" y1="12" x2="12" y2="${height - 12}" stroke="${BRONZE}" stroke-width="1" opacity="0.15" />
  <text x="${width / 2}" y="${height / 2 - 10}" text-anchor="middle" font-family="Georgia, serif" font-size="56" fill="${TEXT}">${title}</text>
  ${
    subtitle
      ? `<text x="${width / 2}" y="${height / 2 + 46}" text-anchor="middle" font-family="monospace" font-size="24" letter-spacing="2" fill="${MUTED}">${subtitle.toUpperCase()}</text>`
      : ''
  }
</svg>
`
}

const files = {
  // The Drowned Coast — root map, era-linked. `era-drowning` is deliberately
  // missing (fixtures coverage item 3: an era-linked map missing one image).
  'drowned-coast-founding.svg': svg('The Drowned Coast', 'Before the First Sounding'),
  'drowned-coast-charts.svg': svg('The Drowned Coast', 'Year 512 of the Ember Cycle'),
  'drowned-coast-saltcinder.svg': svg('The Drowned Coast', 'This turning of the tide'),
  // Single-image maps.
  'ninth-vale.svg': svg('The Ninth Vale'),
  'duskwater.svg': svg('Duskwater'),
  'ashthorn-keep.svg': svg('Ashthorn Keep', 'Floor Plan'),
}

mkdirSync(outDir, { recursive: true })
for (const [filename, content] of Object.entries(files)) {
  writeFileSync(join(outDir, filename), content, 'utf8')
  console.log(`wrote public/maps/${filename}`)
}
