import { describe, expect, it } from 'vitest'
import { renderMarkdownHtml } from './markdown'

describe('renderMarkdownHtml', () => {
  it('renders markdown to schema HTML (headings, marks, lists)', () => {
    const html = renderMarkdownHtml('# Title\n\n**bold** text\n\n- a\n- b')
    expect(html).toContain('<h1>Title</h1>')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toMatch(/<li/)
  })

  it('keeps safe link hrefs but strips javascript: (the headless serialize path is not otherwise guarded)', () => {
    const safe = renderMarkdownHtml('[ok](https://example.com)')
    expect(safe).toContain('href="https://example.com"')

    const unsafe = renderMarkdownHtml('[x](javascript:alert(1))')
    expect(unsafe).not.toContain('javascript:')
    expect(unsafe).toContain('x') // link text survives, href removed
  })
})
