import { describe, expect, it } from 'vitest'
import { parseYaml, stringifyYaml, type YamlValue } from '../domain/yaml'

describe('hand-rolled YAML-subset codec', () => {
  it('round-trips flat scalars (string, number, boolean, null)', () => {
    const value = { title: 'Sera Valen', age: 29, active: true, cover: null }
    expect(parseYaml(stringifyYaml(value))).toEqual(value)
  })

  it('round-trips flat string arrays, including empty arrays', () => {
    const value = { tags: ['protagonist', 'cartographer', 'coastal'], eras: [] }
    expect(parseYaml(stringifyYaml(value))).toEqual(value)
  })

  it('quotes scalars that would otherwise be ambiguous, and round-trips them', () => {
    const value = {
      summary: 'Yr 512: the tide turns.',
      empty: '',
      looksNumeric: '29',
      leadingDash: '-not-a-list-item',
      colonPhrase: 'title: with a colon',
    }
    const yaml = stringifyYaml(value)
    expect(parseYaml(yaml)).toEqual(value)
  })

  it('round-trips strings with embedded newlines without truncation or key leakage', () => {
    const value = {
      summary: 'First line of the summary.\nSecond line, which must survive.\nthird: not a key',
      windowsStyle: 'carriage\r\nreturn',
      after: 'still here',
    }
    const yaml = stringifyYaml(value)
    const parsed = parseYaml(yaml)
    expect(parsed).toEqual(value)
    // The newline must be escaped into the scalar, never emitted literally —
    // a literal newline would truncate the value and mint a bogus top-level key.
    expect(Object.keys(parsed as object)).toEqual(['summary', 'windowsStyle', 'after'])
  })

  it('round-trips nested mappings', () => {
    const value = {
      slug: 'ninth-vale',
      images: { 'era-founding': '/maps/a.svg', 'era-charts': '/maps/b.svg' },
    }
    expect(parseYaml(stringifyYaml(value))).toEqual(value)
  })

  it('round-trips a sequence of mappings (block style)', () => {
    const value = {
      maps: [
        { id: 'drowned-coast', title: 'The Drowned Coast', eraLinked: true },
        { id: 'duskwater', title: 'Duskwater', eraLinked: false },
      ],
    }
    expect(parseYaml(stringifyYaml(value))).toEqual(value)
  })

  it('round-trips a sequence of mappings with nested arrays and maps inside items', () => {
    const value: YamlValue = {
      pins: [
        { id: 'pin-1', pageSlug: 'sera', eras: ['era-charts', 'era-saltcinder'], x: 40, y: 58 },
        { id: 'pin-2', pageSlug: 'ninth-vale', eras: [], x: 62.5, y: 35 },
      ],
      categoryTemplates: [
        {
          category: 'characters',
          properties: [
            { key: 'aliases', label: 'Aliases', type: 'text' },
            { key: 'affiliations', label: 'Affiliations', type: 'relation', targetCategories: ['organizations'] },
          ],
        },
      ],
    }
    expect(parseYaml(stringifyYaml(value))).toEqual(value)
  })

  it('is idempotent: stringifying a parsed document twice yields the same text', () => {
    const value = {
      title: 'Sera Valen',
      tags: ['protagonist', 'coastal'],
      properties: [{ key: 'age', label: 'Age', type: 'number', value: 29 }],
    }
    const once = stringifyYaml(value)
    const twice = stringifyYaml(parseYaml(once))
    expect(twice).toBe(once)
  })

  it('parses an empty document to an empty object', () => {
    expect(parseYaml('')).toEqual({})
    expect(parseYaml('   \n  \n')).toEqual({})
  })
})
