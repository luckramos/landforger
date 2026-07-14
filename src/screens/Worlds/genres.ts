/** Preset genre swatches for the create-world modal (design-inventory.md §2.2). */
export interface GenrePreset {
  name: string
  hue: number
}

export const GENRE_PRESETS: GenrePreset[] = [
  { name: 'Fantasy', hue: 38 },
  { name: 'Science Fiction', hue: 255 },
  { name: 'Horror', hue: 350 },
  { name: 'Mystery', hue: 285 },
  { name: 'Historical', hue: 88 },
  { name: 'Mythic', hue: 150 },
]

/** The genre chip color formula (design-inventory.md §2.2). */
export function genreColor(hue: number): string {
  return `oklch(0.8 0.085 ${hue})`
}
