import { generateHTML } from '@tiptap/core'
import { buildBlockExtensions } from '../editor/extensions'
import { pageBodyCodec } from '../editor/codec/TiptapMarkdownCodec'

// The editor's block extensions, resolved once — used only to serialize a
// parsed document back to HTML for a static, read-only preview.
const extensions = buildBlockExtensions()

const SAFE_HREF = /^(https?:|mailto:|#|\/)/i

/**
 * Strip unsafe link hrefs from generated HTML. StarterKit's protocol guard runs
 * on live-editor input, NOT on this headless parse→serialize path, so a
 * `[x](javascript:…)` link would otherwise serialize a clickable
 * `<a href="javascript:…">`. Anything that isn't http(s)/mailto/anchor/relative
 * has its href removed (the text stays).
 */
function stripUnsafeHrefs(html: string): string {
  if (typeof document === 'undefined') return html
  const template = document.createElement('template')
  template.innerHTML = html
  for (const anchor of template.content.querySelectorAll('a[href]')) {
    if (!SAFE_HREF.test((anchor.getAttribute('href') ?? '').trim())) anchor.removeAttribute('href')
  }
  return template.innerHTML
}

/**
 * Render a Markdown string to HTML for a canvas Markdown-node preview, reusing
 * the app's existing tiptap + `@tiptap/markdown` pipeline (no new dependency):
 * Markdown → tiptap JSON (the shared `pageBodyCodec`) → HTML (`generateHTML`).
 * Schema-constrained (only known node/mark tags; raw HTML degrades to text) and
 * href-sanitized. Read-only.
 */
export function renderMarkdownHtml(markdown: string): string {
  return stripUnsafeHrefs(generateHTML(pageBodyCodec.parse(markdown), extensions))
}
