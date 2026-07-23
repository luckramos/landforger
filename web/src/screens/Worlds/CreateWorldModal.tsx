import { useState } from 'react'
import type { CSSProperties } from 'react'
import { motion } from 'motion/react'
import { Button } from '../../components/Button/Button'
import { ColorPickerField } from '../../components/ColorPicker/ColorPickerField'
import { overlayExitTransition } from '../../components/motionPrefs'
import { useUiStore } from '../../state/uiStore'
import type { World } from '../../domain/types'
import type { CreateWorldInput, CreateWorldTemplate } from '../../repository/WorldRepository'
import styles from './CreateWorldModal.module.css'
import { BRONZE_HEX, GENRE_PRESETS, genreColor } from './genres'
import { WorldCard } from './WorldCard'

interface CreateWorldModalProps {
  onCancel: () => void
  onCreate: (input: CreateWorldInput) => void
}

/** A stand-in World for the live card preview column — never persisted. */
function previewWorld(name: string, logline: string, genre: string, color: string): World {
  return {
    slug: 'preview',
    name: name.trim() === '' ? 'Unnamed world' : name,
    genre,
    color,
    logline: logline.trim() === '' ? 'A premise waiting to be written.' : logline,
    eraOrder: [],
    activeEra: '',
    categoryTemplates: [],
    maps: [],
    pins: [],
    mapFolders: [],
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    body: '',
  }
}

const TEMPLATES: { id: CreateWorldTemplate; title: string; blurb: string }[] = [
  { id: 'blank', title: 'Blank cosmos', blurb: 'An empty world. Every property is yours to invent.' },
  { id: 'starter', title: 'Starter structure', blurb: 'Seeds the default Category Templates for all seven categories.' },
]

/** The "Forge a new world" modal (design-inventory.md §2.2): name, premise, genre chips + a
 *  from-scratch custom color studio, template choice, and a live card preview. */
export function CreateWorldModal({ onCancel, onCreate }: CreateWorldModalProps) {
  const motionScale = useUiStore((state) => state.motionScale)
  const [name, setName] = useState('')
  const [logline, setLogline] = useState('')
  /** Selected preset name, or `null` when the world is on a custom genre. */
  const [genrePreset, setGenrePreset] = useState<string | null>(GENRE_PRESETS[0].name)
  const [customGenre, setCustomGenre] = useState('')
  const [customColor, setCustomColor] = useState(BRONZE_HEX)
  const [template, setTemplate] = useState<CreateWorldTemplate>('starter')

  const isCustom = genrePreset === null
  const genre = isCustom ? customGenre.trim() || 'Custom' : genrePreset
  const color = isCustom
    ? customColor
    : genreColor(GENRE_PRESETS.find((g) => g.name === genrePreset)?.hue ?? 38)
  const canCreate = name.trim() !== ''

  function handleCreate() {
    if (!canCreate) return
    onCreate({ name: name.trim(), logline: logline.trim(), genre, color, template })
  }

  return (
    <motion.div
      className={styles.scrim}
      onClick={onCancel}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={overlayExitTransition(motionScale)}
    >
      <motion.div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label="Forge a new world"
        initial={false}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        transition={overlayExitTransition(motionScale)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.formColumn}>
          <span className={styles.eyebrow}>New world</span>
          <h2 className={styles.title}>Forge a new world</h2>
          <p className={styles.lede}>Name it, set its premise, and give it a color it can be recognized by.</p>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="cw-name">
              Name
            </label>
            <input
              id="cw-name"
              className={`${styles.control} ${styles.nameInput}`}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="The Ninth Vale"
              autoFocus
            />
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="cw-premise">
              Premise
            </label>
            <textarea
              id="cw-premise"
              className={styles.control}
              value={logline}
              onChange={(e) => setLogline(e.target.value)}
              placeholder="One line on what this world is about…"
              rows={2}
            />
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Genre</span>
            <div className={styles.chipRow}>
              {GENRE_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  className={styles.chip}
                  data-selected={genrePreset === preset.name || undefined}
                  style={{ '--chip-color': genreColor(preset.hue) } as CSSProperties}
                  onClick={() => setGenrePreset(preset.name)}
                >
                  {preset.name}
                </button>
              ))}
              <button
                type="button"
                className={`${styles.chip} ${styles.customChip}`}
                data-selected={isCustom || undefined}
                style={{ '--chip-color': customColor } as CSSProperties}
                onClick={() => setGenrePreset(null)}
                aria-expanded={isCustom}
              >
                <span className={styles.customDot} aria-hidden="true" />
                Custom
              </button>
            </div>

            <div className={styles.studio} data-open={isCustom || undefined}>
              <div className={styles.studioInner} inert={!isCustom}>
                <div className={styles.studioGrid}>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel} htmlFor="cw-genre-name">
                      Genre name
                    </label>
                    <input
                      id="cw-genre-name"
                      className={styles.control}
                      type="text"
                      value={customGenre}
                      onChange={(e) => setCustomGenre(e.target.value)}
                      placeholder="Solarpunk, Weird West…"
                    />
                    <span className={styles.fieldLabel}>Color</span>
                    <ColorPickerField value={customColor} onChange={setCustomColor} label="Custom world color" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Template</span>
            <div className={styles.templateRow}>
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={styles.templateBox}
                  data-selected={template === t.id || undefined}
                  onClick={() => setTemplate(t.id)}
                >
                  <span className={styles.templateMark} aria-hidden="true" />
                  <strong>{t.title}</strong>
                  <span>{t.blurb}</span>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.actions}>
            <button type="button" className={styles.cancelButton} onClick={onCancel}>
              Cancel
            </button>
            <Button type="button" disabled={!canCreate} onClick={handleCreate}>
              Create world
            </Button>
          </div>
        </div>

        <div className={styles.previewColumn} aria-hidden="true">
          <span className={styles.previewLabel}>Preview</span>
          <WorldCard world={previewWorld(name, logline, genre, color)} entryCount={0} interactive={false} />
          <p className={styles.previewNote}>This is how the world will read in your library.</p>
        </div>
      </motion.div>
    </motion.div>
  )
}
