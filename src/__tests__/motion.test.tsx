import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MotionRoot } from '../App'
import { resetDockStore, setDockStorage } from '../state/dockStore'
import { DEFAULT_USER_SETTINGS, setUiStorage, useUiStore } from '../state/uiStore'
import { useSessionStore } from '../state/sessionStore'
import { createInMemoryStorage } from './testStorage'

// Repo-wide CSS Module discovery for the press-feedback guard (#65): a plain
// list of file paths would rot the moment a new tactile control's module is
// added, so this walks src/ itself and finds every *.module.css.
function findCssModules(root: string): string[] {
  return readdirSync(root, { recursive: true })
    .filter((entry): entry is string => typeof entry === 'string' && entry.endsWith('.module.css'))
    .map((entry) => join(root, entry))
}

function resetUiStore() {
  useUiStore.setState({
    activeUserId: undefined,
    settingsByUser: {},
    ...DEFAULT_USER_SETTINGS,
  })
}

// MotionRoot now activates the dock store for the signed-in user, so it must
// write to an injected seam here — not ambient localStorage — and reset between
// cases like the UI store already does.
beforeEach(() => {
  setDockStorage(createInMemoryStorage())
  resetDockStore()
})

afterEach(() => {
  setDockStorage(null)
  resetDockStore()
})

describe('motion scale root sync', () => {
  it('persists settings per user and restores each user independently', () => {
    const storage = createInMemoryStorage()
    setUiStorage(storage)
    resetUiStore()

    useUiStore.getState().activateUser('sera@landforger.io')
    useUiStore.getState().setMotionScale(1.5)
    useUiStore.getState().activateUser('mira@landforger.io')

    expect(useUiStore.getState()).toMatchObject({ motionScale: 1 })
    useUiStore.getState().setMotionScale(0.5)

    resetUiStore()
    useUiStore.getState().activateUser('SERA@LANDFORGER.IO')
    expect(useUiStore.getState()).toMatchObject({ motionScale: 1.5 })
    useUiStore.getState().activateUser('mira@landforger.io')
    expect(useUiStore.getState()).toMatchObject({ motionScale: 0.5 })

    setUiStorage(null)
    resetUiStore()
  })

  it('writes --mo to the document root and tracks the store', () => {
    useSessionStore.setState({ user: { name: 'Sera Valen', email: 'sera@landforger.io' } })
    render(
      <MotionRoot>
        <div />
      </MotionRoot>,
    )
    expect(document.documentElement.style.getPropertyValue('--mo')).toBe('1')

    act(() => useUiStore.getState().setMotionScale(1.5))
    expect(document.documentElement.style.getPropertyValue('--mo')).toBe('1.5')

    act(() => useUiStore.getState().setMotionScale(1))
  })

  it('placeholder screens scale their entrance by --mo (multiply-is-slower)', async () => {
    const css = readFileSync('src/screens/Placeholder.module.css', 'utf8')
    expect(css).toContain('calc(var(--mo, 1) * 300ms)')
    expect(css).toContain('var(--ease-house)')

    // and the animated class is actually applied by the component
    const { MemoryRouter } = await import('react-router-dom')
    const { NotFound } = await import('../screens/Placeholder')
    const styles = (await import('../screens/Placeholder.module.css')).default
    const { container } = render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>,
    )
    expect(container.querySelector('main')?.className).toBe(styles.screen)
  })

  it('global.css collapses animation under prefers-reduced-motion', () => {
    const css = readFileSync('src/styles/global.css', 'utf8')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toContain('animation-duration: 0.01ms !important')
    expect(css).toContain('transition-duration: 0.01ms !important')
  })

  it('global.css pins a single app-wide bronze :focus-visible ring (#41)', () => {
    const css = readFileSync('src/styles/global.css', 'utf8')
    expect(css).toContain(':focus-visible {')
    expect(css).toContain('outline: 2px solid var(--bronze)')
    // Keyboard-only: the rule must live on :focus-visible, not the plain
    // :focus pseudo-class, or mouse/pointer activation would show it too.
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(withoutComments.match(/:focus(?!-visible)/g)).toBeNull()
  })

  it('Spotlight uses the design open motion scaled by --mo', () => {
    const css = readFileSync('src/screens/Dashboard/SpotlightSearch.module.css', 'utf8')
    expect(css).toContain('calc(var(--mo, 1) * 160ms)')
    expect(css).toContain('calc(var(--mo, 1) * 200ms)')
    expect(css).toContain('var(--ease-house)')
  })

  it('keeps the dead prototype and retired burst keyframes absent', () => {
    const cssFiles = [
      'src/styles/tokens.css',
      'src/screens/Auth/Auth.module.css',
      'src/screens/Worlds/Worlds.module.css',
      'src/screens/Dashboard/DashboardShell.module.css',
      'src/maps/MapScreen.module.css',
      'src/graph/GraphPanel.module.css',
    ].map((file) => readFileSync(file, 'utf8')).join('\n')

    const deadPrototypes = ['lf-ring', 'lf-glowPulse', 'wf-drift', 'lw-shimmer', 'star-twinkle', 'arrow-draw', 'mp-bob', 'mp-tlOpen']
    // The expanding burst disc, replaced by the View Transitions route fade.
    const retiredBurst = ['auth-burst', 'auth-scrim-fade', 'auth-spin', 'auth-content-fade', 'map-navigation-burst', 'nb-expand', 'nb-fade']
    for (const dead of [...deadPrototypes, ...retiredBurst]) {
      expect(cssFiles).not.toContain(`@keyframes ${dead}`)
    }
  })

  it('guards the Maps load-bearing drill and crossfade timings', () => {
    const css = readFileSync('src/maps/MapScreen.module.css', 'utf8')
    expect(css).toContain('calc(var(--mo,1) * 600ms) var(--ease-map-zoom)')
    expect(css).toContain('calc(var(--mo,1) * 520ms) ease')
  })

  it('scopes the Map stage will-change to the active drag/zoom state, released at rest (#62)', () => {
    const css = readFileSync('src/maps/MapScreen.module.css', 'utf8')
    const lines = css.split('\n')
    // The base .stage rule must not permanently hold a promoted compositor layer.
    const baseStageRule = lines.find((line) => line.trimStart().startsWith('.stage {'))
    expect(baseStageRule).toBeDefined()
    expect(baseStageRule).not.toContain('will-change')
    // will-change is scoped to the active drag/zoom state only.
    expect(css).toContain('.stage[data-active] { will-change: transform; }')
  })

  // The burst disc is retired: route changes ride the View Transitions API.
  // These pseudo-elements sit outside the universal `*` reduced-motion collapse,
  // so they need their own guard — and they must stay on the house curve/scale.
  it('routes transition through scaled, reduced-motion-safe view transitions', () => {
    const css = readFileSync('src/styles/global.css', 'utf8')
    expect(css).toContain('::view-transition-old(root)')
    expect(css).toContain('::view-transition-new(root)')
    expect(css).toContain('calc(var(--mo, 1) * 320ms) var(--ease-house)')
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*::view-transition-old\(root\),\s*::view-transition-new\(root\)/)
  })

  it('records reduced-motion verification for all five catalog screens and top-10 sign-off', () => {
    const audit = readFileSync('docs/research/motion-audit-checklist.md', 'utf8')
    for (const screenName of ['Auth', 'Worlds', 'Dashboard', 'Maps', 'UserMenu']) {
      expect(audit).toContain(screenName)
    }
    expect(audit.match(/- \[x\] \d+\./g)).toHaveLength(10)
    expect(audit).toContain('All eight dead prototype keyframes are absent')
  })
})

/*
 * Issue #61: Property dialogs and the page-lifecycle / Category dialogs
 * split their single-container pop into staggered heading → fields → actions
 * chunks; the Map Library gallery cascades per-card. happy-dom runs no
 * animation, so — same approach as dock.test.tsx's DockableWindow guards —
 * the timing constants are guarded at the source level, and the resulting
 * DOM structure (chunk order, distinct nodes) is guarded behaviorally in
 * PageScreen.test.tsx / MapLibrary.test.tsx.
 */
describe('staggered dialog and gallery entrances (#61)', () => {
  const motionPrefs = () => readFileSync('src/components/motionPrefs.ts', 'utf8')

  it('offsets staggered dialog chunks by ~100ms, collapsing to zero under reduced motion', () => {
    const src = motionPrefs()
    expect(src).toContain('staggerChildren: prefersReducedMotion() ? 0 : 0.1 * motionScale')
  })

  it('animates each dialog chunk on a critically damped spring — bounce: 0 — collapsing under reduced motion', () => {
    const src = motionPrefs()
    expect(src).toContain("type: 'spring' as const, duration: 0.3 * motionScale, bounce: 0")
    expect(src).toMatch(/dialogChunkTransition[\s\S]*?prefersReducedMotion\(\)\s*\?\s*{ duration: 0 }/)
  })

  it('wires the Page-lifecycle dialog through the shared stagger container and chunk variants', () => {
    const src = readFileSync('src/properties/PageProperties.tsx', 'utf8')
    expect(src).toMatch(/aria-label="Page lifecycle"[\s\S]{0,200}variants={dialogContainerVariants\(motionScale\)}/)
    expect(src).toContain('<motion.h2 variants={DIALOG_CHUNK_VARIANTS} transition={dialogChunkTransition(motionScale)}>Page details</motion.h2>')
    expect(src).toContain('<motion.div className={styles.dialogFields} variants={DIALOG_CHUNK_VARIANTS} transition={dialogChunkTransition(motionScale)}>')
    expect(src).toContain('<motion.div className={styles.dialogActions} variants={DIALOG_CHUNK_VARIANTS} transition={dialogChunkTransition(motionScale)}>')
  })

  it('wires the Category Template dialog through the shared stagger container and chunk variants', () => {
    const src = readFileSync('src/properties/PageProperties.tsx', 'utf8')
    expect(src).toMatch(/aria-label={`\$\{page\.category\} Category Template`}[\s\S]{0,200}variants={dialogContainerVariants\(motionScale\)}/)
    // Three chunks in document order: heading (h2+p), fields (template rows + type picker), actions.
    const dialogIndex = src.indexOf('Category Template`}')
    const headingIndex = src.indexOf('<h2>{page.category} template</h2>', dialogIndex)
    const fieldsIndex = src.indexOf('templateDraft.map', dialogIndex)
    const actionsIndex = src.indexOf('Save Category Template', dialogIndex)
    expect(headingIndex).toBeGreaterThan(dialogIndex)
    expect(fieldsIndex).toBeGreaterThan(headingIndex)
    expect(actionsIndex).toBeGreaterThan(fieldsIndex)
  })

  it('wires the Property settings dialog (the gear popover) through the shared stagger container and chunk variants', () => {
    const src = readFileSync('src/properties/PropertySettings.tsx', 'utf8')
    expect(src).toContain('initial="hidden"')
    expect(src).toContain('animate="visible"')
    expect(src).toContain('variants={dialogContainerVariants(motionScale)}')
    expect(src).toContain('<motion.p className={styles.settingsSummary} variants={DIALOG_CHUNK_VARIANTS} transition={dialogChunkTransition(motionScale)}>')
    expect(src).toContain('<motion.div className={styles.settingsActions} variants={DIALOG_CHUNK_VARIANTS} transition={dialogChunkTransition(motionScale)}>')
  })

  it('no longer pops the whole dialog box in as one block via CSS — Motion drives the staggered chunks now', () => {
    const css = readFileSync('src/properties/Properties.module.css', 'utf8')
    expect(css).not.toContain('properties-dialog-in')
    expect(css).not.toContain('@keyframes properties-dialog-in')
  })

  it('gives each Map Library card a per-index entrance delay so the gallery cascades', () => {
    const css = readFileSync('src/maps/MapLibrary.module.css', 'utf8')
    expect(css).toContain('animation-delay: calc(var(--mo,1) * var(--card-index, 0) * 60ms);')
    // The per-card delay collapses alongside the entrance duration under reduced motion.
    expect(css).toMatch(/prefers-reduced-motion:reduce\)\s*{\s*\.card,\.preview img,\.scrim,\.confirm\s*{\s*animation-duration:\s*0ms;\s*animation-delay:\s*0ms;/)
    const component = readFileSync('src/maps/MapLibrary.tsx', 'utf8')
    expect(component).toContain("'--card-index': index")
  })
})

/*
 * Issue #65: press feedback is standardized on exactly scale(0.96) on
 * :active across every tactile control (better-ui principle 9) — the three
 * below-floor deviations (0.88, 0.9, 0.94) read as rubbery, the drift
 * (0.97, 0.98, 0.995) is inconsistent, and several controls (graph/canvas
 * tools, the editor toolbar, the Wikilink chip, Create, Cancel) previously
 * had no press reaction at all. This extends the idiom #46 established on
 * primary click targets to the long tail.
 */
describe('press feedback normalization (#65)', () => {
  // Every module #65 explicitly touches: the shared Button, the active
  // Timeline button, page-action pills, the Properties chip-remove/
  // steppers/icon buttons, the graph and canvas tool buttons, the editor
  // toolbar, the Wikilink chip, and the New Page "Create" / Create World
  // "Cancel" buttons.
  const citedModules = [
    'src/components/Button/Button.module.css',
    'src/timeline/TimelinePanel.module.css',
    'src/screens/PageScreen.module.css',
    'src/properties/Properties.module.css',
    'src/graph/GraphPanel.module.css',
    'src/canvas/ReferenceCanvasPanel.module.css',
    'src/editor/PageEditor.module.css',
    'src/editor/extensions/WikiLink.module.css',
    'src/screens/NewPageScreen.module.css',
    'src/screens/Worlds/CreateWorldModal.module.css',
  ]

  it('every cited module presses with exactly scale(0.96) on :active', () => {
    for (const file of citedModules) {
      const css = readFileSync(file, 'utf8')
      expect(css, `${file} should contain scale(0.96)`).toContain('scale(0.96)')
    }
  })

  it('the graph and canvas tool buttons gained a press reaction with transform in their transition', () => {
    const graph = readFileSync('src/graph/GraphPanel.module.css', 'utf8')
    expect(graph).toMatch(/\.categories button,\s*\.scopeToggle button,\s*\.zoomControls button\s*\{[^}]*transition:[^}]*transform[^}]*\}/)
    expect(graph).toContain(".categories button:active, .scopeToggle button:active, .zoomControls button:active { transform: scale(0.96); }")

    const canvas = readFileSync('src/canvas/ReferenceCanvasPanel.module.css', 'utf8')
    expect(canvas).toMatch(/\.tools button,\s*\.shapePicker button\s*\{[^}]*transition:\s*transform[^}]*\}/)
    // The palette swatch's press scales the inner .dot, not the transparent
    // 40px button — the button IS the hit target (#59) and must not shrink.
    expect(canvas).toContain('.palette button:active .dot { transform: scale(0.96); }')
  })

  it('the editor toolbar buttons gained a press reaction with transform in their transition', () => {
    const css = readFileSync('src/editor/PageEditor.module.css', 'utf8')
    expect(css).toMatch(/\.button\s*\{[^}]*transition:[^}]*transform calc\(var\(--mo, 1\) \* 120ms\) var\(--ease-house\)[^}]*\}/)
    expect(css).toContain('.button:active:not(:disabled) {\n  transform: scale(0.96);\n}')
  })

  it('the Wikilink chip reacts to hover as well as press, with transform in its transition', () => {
    const css = readFileSync('src/editor/extensions/WikiLink.module.css', 'utf8')
    expect(css).toMatch(/\.chip:hover\s*\{[^}]*\}/)
    expect(css).toContain('.chip:active {\n  transform: scale(0.96);\n}')
    expect(css).toMatch(/\.chip\s*\{[^}]*transition:[^}]*transform calc\(var\(--mo, 1\) \* 120ms\) var\(--ease-house\)[^}]*\}/)
  })

  it('the New Page "Create" button gained a press reaction with transform in its transition', () => {
    const css = readFileSync('src/screens/NewPageScreen.module.css', 'utf8')
    expect(css).toContain('transition: transform calc(var(--mo, 1) * 120ms) var(--ease-house);')
    expect(css).toContain('.create:active:not(:disabled) { transform: scale(0.96); }')
  })

  it('the Create World "Cancel" button gained a press reaction with transform in its transition', () => {
    const css = readFileSync('src/screens/Worlds/CreateWorldModal.module.css', 'utf8')
    expect(css).toMatch(/\.cancelButton\s*\{[^}]*transition: transform calc\(var\(--mo, 1\) \* 120ms\) var\(--ease-house\);[^}]*\}/)
    expect(css).toContain('.cancelButton:active {\n  transform: scale(0.96);\n}')
  })

  it('no :active transform below scale(0.95) survives anywhere in src/**/*.module.css', () => {
    const offenders: string[] = []
    for (const file of findCssModules('src')) {
      const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
      // Every top-level `selector { body }` block — good enough for the flat,
      // non-nested CSS Modules this repo writes (no CSS nesting is used).
      for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!selector.includes(':active')) continue
        for (const [, raw] of body.matchAll(/scale\(([\d.]+)\)/g)) {
          const value = Number(raw)
          if (value < 0.95) {
            offenders.push(`${file} :: ${selector.trim()} { ${body.trim()} }`)
          }
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('added press/hover collapses under prefers-reduced-motion (universal collapse, #41)', () => {
    // The added transitions ride plain CSS `transition`, which the global
    // `*` reduced-motion rule already collapses (asserted above in "global.css
    // collapses animation under prefers-reduced-motion"). The Wikilink chip
    // additionally re-declares its own reduced-motion collapse since its
    // hover/press are new behavior on a previously-inert element.
    const css = readFileSync('src/editor/extensions/WikiLink.module.css', 'utf8')
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce\)\s*\{\s*\.chip\s*\{\s*transition-duration:\s*0ms;/)
  })
})
