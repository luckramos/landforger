/**
 * A minimal, hand-rolled YAML-subset codec for frontmatter.
 *
 * Why not `gray-matter`? We tried it first (per the issue). `gray-matter`'s
 * `matter()` unconditionally calls `Buffer.from(...)` on every parse
 * (`lib/to-file.js` → `lib/utils.js#toBuffer`), and its entry point does
 * `require('fs')` at module scope. Vite does not polyfill Node's `Buffer`
 * global for the browser (that's a webpack-ism), so a real browser tab
 * throws `ReferenceError: Buffer is not defined` the moment a page is
 * parsed — confirmed by deleting `globalThis.Buffer` and calling
 * `matter(...)` under plain Node. `vitest` runs on Node, so the test suite
 * would stay green while the shipped app broke. We hand-roll instead.
 *
 * This codec supports the subset of YAML our repository actually needs:
 * scalars (string/number/boolean/null), flow arrays of scalars (`[a, b]`),
 * nested block mappings, and block sequences of mappings (each item's
 * first field inline after `- `, subsequent fields indented to align). No
 * anchors, tags, multi-doc, folded/literal block scalars, or comments —
 * we control every byte of every fixture and every writer, so we don't
 * need general YAML, just a stable, readable, round-trippable one.
 */

export type YamlValue = string | number | boolean | null | YamlValue[] | { [key: string]: YamlValue }

interface Line {
  indent: number
  text: string
}

function tokenize(yamlText: string): Line[] {
  return yamlText
    .split('\n')
    .filter((raw) => raw.trim().length > 0)
    .map((raw) => {
      const indent = raw.length - raw.trimStart().length
      return { indent, text: raw.trim() }
    })
}

function splitTopLevelCommas(text: string): string[] {
  const parts: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"' && text[i - 1] !== '\\') inQuotes = !inQuotes
    if (ch === ',' && !inQuotes) {
      parts.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  if (current.trim() !== '' || parts.length > 0) parts.push(current)
  return parts
}

function unescapeQuoted(inner: string): string {
  return inner.replace(/\\(.)/g, (_, ch: string) => (ch === 'n' ? '\n' : ch === 'r' ? '\r' : ch))
}

function parseScalar(text: string): YamlValue {
  if (text.startsWith('"') && text.endsWith('"') && text.length >= 2) {
    return unescapeQuoted(text.slice(1, -1))
  }
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text)
  if (text === 'true') return true
  if (text === 'false') return false
  if (text === 'null' || text === '~') return null
  return text
}

function parseScalarOrFlow(text: string): YamlValue {
  if (text.startsWith('[') && text.endsWith(']')) {
    const inner = text.slice(1, -1).trim()
    if (inner === '') return []
    return splitTopLevelCommas(inner).map((el) => parseScalar(el.trim()))
  }
  return parseScalar(text)
}

/** Splits `key: value` / `key:` into its parts; value is `''` when the value is on following lines. */
function splitKeyValue(text: string): { key: string; value: string } {
  const sep = text.indexOf(': ')
  if (sep === -1) {
    // "key:" with nothing after it (nested value follows on later lines)
    return { key: text.endsWith(':') ? text.slice(0, -1) : text, value: '' }
  }
  return { key: text.slice(0, sep), value: text.slice(sep + 2) }
}

/** Parses the mapping/sequence rooted at `lines[pos]`, consuming every line at `indent` or deeper that belongs to it. */
function parseBlock(lines: Line[], pos: number, indent: number): [YamlValue, number] {
  if (pos >= lines.length) return [null, pos]
  const isSequence = lines[pos].text === '-' || lines[pos].text.startsWith('- ')

  if (isSequence) {
    const seq: YamlValue[] = []
    let i = pos
    while (i < lines.length && lines[i].indent === indent && (lines[i].text === '-' || lines[i].text.startsWith('- '))) {
      const rest = lines[i].text === '-' ? '' : lines[i].text.slice(2)
      if (rest === '') {
        i++
        const childIndent = i < lines.length ? lines[i].indent : indent + 2
        const [value, next] = parseBlock(lines, i, childIndent)
        seq.push(value)
        i = next
      } else if (rest.includes(': ') || rest.endsWith(':')) {
        // First field of a mapping item, inline after "- ". Subsequent fields
        // of the same item are indented to align with this field's column.
        const itemFieldIndent = indent + 2
        const { key, value: inlineValue } = splitKeyValue(rest)
        i++
        const obj: Record<string, YamlValue> = {}
        if (inlineValue === '') {
          const childIndent = i < lines.length && lines[i].indent > indent ? lines[i].indent : itemFieldIndent + 2
          const [value, next] = parseBlock(lines, i, childIndent)
          obj[key] = value
          i = next
        } else {
          obj[key] = parseScalarOrFlow(inlineValue)
        }
        while (i < lines.length && lines[i].indent === itemFieldIndent) {
          const { key: k2, value: v2 } = splitKeyValue(lines[i].text)
          i++
          if (v2 === '') {
            const childIndent = i < lines.length && lines[i].indent > itemFieldIndent ? lines[i].indent : itemFieldIndent + 2
            const [value, next] = parseBlock(lines, i, childIndent)
            obj[k2] = value
            i = next
          } else {
            obj[k2] = parseScalarOrFlow(v2)
          }
        }
        seq.push(obj)
      } else {
        seq.push(parseScalarOrFlow(rest))
        i++
      }
    }
    return [seq, i]
  }

  const obj: Record<string, YamlValue> = {}
  let i = pos
  while (i < lines.length && lines[i].indent === indent) {
    const { key, value: vtext } = splitKeyValue(lines[i].text)
    i++
    if (vtext === '') {
      if (i < lines.length && lines[i].indent > indent) {
        const [value, next] = parseBlock(lines, i, lines[i].indent)
        obj[key] = value
        i = next
      } else {
        obj[key] = null
      }
    } else {
      obj[key] = parseScalarOrFlow(vtext)
    }
  }
  return [obj, i]
}

/** Parses a YAML-subset document into a plain value tree. Empty input parses to `{}`. */
export function parseYaml(text: string): YamlValue {
  const lines = tokenize(text)
  if (lines.length === 0) return {}
  const [value] = parseBlock(lines, 0, lines[0].indent)
  return value
}

function isPlainObject(value: YamlValue): value is { [key: string]: YamlValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function needsQuoting(str: string): boolean {
  if (str === '') return true
  if (/^\s|\s$/.test(str)) return true
  if (/^[-[\]{}"'#&*!|>%@`]/.test(str)) return true
  if (/^-?\d+(\.\d+)?$/.test(str)) return true
  if (str === 'true' || str === 'false' || str === 'null' || str === '~') return true
  if (str.includes(': ') || str.endsWith(':')) return true
  if (str.includes(',') || str.includes('\n') || str.includes('\r')) return true
  return false
}

function quote(str: string): string {
  // Newlines must be escaped, not merely quoted: the tokenizer is
  // line-based, so a literal newline inside a quoted scalar would split
  // the value across lines and silently corrupt the document on parse.
  return `"${str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r')}"`
}

function scalarToText(value: string | number | boolean | null): string {
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value === null) return 'null'
  return needsQuoting(value) ? quote(value) : value
}

function flowArrayToText(value: YamlValue[]): string {
  if (value.length === 0) return '[]'
  return `[${(value as (string | number | boolean | null)[]).map(scalarToText).join(', ')}]`
}

function stringifyMapping(obj: { [key: string]: YamlValue }, indent: number): string {
  return Object.entries(obj)
    .map(([key, value]) => stringifyEntry(key, value, indent))
    .join('\n')
}

function stringifyEntry(key: string, value: YamlValue, indent: number): string {
  const pad = '  '.repeat(indent)
  if (isPlainObject(value)) {
    return `${pad}${key}:\n${stringifyMapping(value, indent + 1)}`
  }
  if (Array.isArray(value)) {
    if (value.length === 0 || value.every((v) => !isPlainObject(v))) {
      return `${pad}${key}: ${flowArrayToText(value)}`
    }
    return `${pad}${key}:\n${value.map((item) => stringifySequenceItem(item, indent + 1)).join('\n')}`
  }
  return `${pad}${key}: ${scalarToText(value)}`
}

function stringifySequenceItem(item: YamlValue, indent: number): string {
  const pad = '  '.repeat(indent)
  if (isPlainObject(item)) {
    const entries = Object.entries(item)
    if (entries.length === 0) return `${pad}-`
    const [firstKey, firstValue] = entries[0]
    // By convention every sequence-of-mappings item in our fixtures leads
    // with a plain scalar field (id/key/category) — see domain/types.ts.
    const firstLine = `${pad}- ${firstKey}: ${
      isPlainObject(firstValue) ? '' : Array.isArray(firstValue) ? flowArrayToText(firstValue) : scalarToText(firstValue)
    }`
    const rest = entries
      .slice(1)
      .map(([k, v]) => stringifyEntry(k, v, indent + 1))
      .join('\n')
    return rest ? `${firstLine}\n${rest}` : firstLine
  }
  if (Array.isArray(item)) return `${pad}- ${flowArrayToText(item)}`
  return `${pad}- ${scalarToText(item)}`
}

/** Serializes a plain value tree to the YAML-subset text `parseYaml` understands. Deterministic and idempotent. */
export function stringifyYaml(value: YamlValue): string {
  if (!isPlainObject(value)) throw new Error('stringifyYaml expects a top-level mapping')
  return stringifyMapping(value, 0)
}
