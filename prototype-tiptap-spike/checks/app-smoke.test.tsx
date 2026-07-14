// scratch smoke (not part of npm run check): mount the full App in happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it } from 'vitest'
import App from '../src/App'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

it('App mounts, loads all13.md into the editor, fills the MD pane', async () => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(<App />)
  })
  await act(async () => {
    await new Promise(r => setTimeout(r, 50))
  })
  const editorText = host.querySelector('.tiptap')?.textContent ?? ''
  const mdPane = host.querySelector('.md-pane')?.textContent ?? ''
  console.log('editor text head:', JSON.stringify(editorText.slice(0, 80)))
  console.log('md pane head:', JSON.stringify(mdPane.slice(0, 80)))
  console.log('chip count:', host.querySelectorAll('.chip').length)
  expect(editorText).toContain('port city on the edge')
  expect(mdPane).toContain('# Duskwater')
  expect(mdPane).toContain('[[sera]]')
  expect(host.querySelectorAll('.chip').length).toBeGreaterThan(0)

  // Q4 visual: rename via the button -> chips re-render, MD pane unchanged
  const mdBefore = host.querySelector('.md-pane')?.textContent ?? ''
  const button = [...host.querySelectorAll('button')].find(b => b.textContent?.includes('Rename'))!
  await act(async () => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  const chipsText = [...host.querySelectorAll('.chip')].map(c => c.textContent).join('|')
  const mdAfter = host.querySelector('.md-pane')?.textContent ?? ''
  console.log('chips after rename:', chipsText)
  expect(chipsText).toContain('Duskwater Deep')
  expect(mdAfter).toBe(mdBefore)
  expect(mdAfter).not.toContain('Duskwater Deep')
  await act(async () => root.unmount())
})
