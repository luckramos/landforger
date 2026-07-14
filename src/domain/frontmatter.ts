import { parseYaml, stringifyYaml, type YamlValue } from './yaml'

const DELIMITER = '---'

export interface FrontmatterDocument {
  data: { [key: string]: YamlValue }
  body: string
}

/** Splits `---\n<yaml>\n---\n<body>` into its parsed frontmatter and raw body. */
export function splitFrontmatter(raw: string): FrontmatterDocument {
  const opening = `${DELIMITER}\n`
  if (!raw.startsWith(opening)) return { data: {}, body: raw }

  const closing = `\n${DELIMITER}\n`
  const closingIndex = raw.indexOf(closing, opening.length)
  if (closingIndex === -1) return { data: {}, body: raw }

  const yamlText = raw.slice(opening.length, closingIndex + 1)
  const body = raw.slice(closingIndex + closing.length)
  const data = parseYaml(yamlText)
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('Frontmatter must parse to a mapping')
  }
  return { data, body }
}

/** Joins parsed frontmatter and a body back into a Markdown string. */
export function joinFrontmatter(data: { [key: string]: YamlValue }, body: string): string {
  return `${DELIMITER}\n${stringifyYaml(data)}\n${DELIMITER}\n${body}`
}
