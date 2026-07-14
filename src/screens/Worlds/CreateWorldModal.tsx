import { useState } from 'react'
import type { World } from '../../domain/types'
import type { CreateWorldInput, CreateWorldTemplate } from '../../repository/WorldRepository'
import styles from './CreateWorldModal.module.css'
import { GENRE_PRESETS, genreColor } from './genres'
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
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    body: '',
  }
}

/** The "Forge a new world" modal (design-inventory.md §2.2): name, premise, genre chips + custom color, template choice, live preview. */
export function CreateWorldModal({ onCancel, onCreate }: CreateWorldModalProps) {
  const [name, setName] = useState('')
  const [logline, setLogline] = useState('')
  const [genre, setGenre] = useState(GENRE_PRESETS[0].name)
  const [customColor, setCustomColor] = useState('#b0824a')
  const [template, setTemplate] = useState<CreateWorldTemplate>('starter')

  const isCustom = genre === 'Custom'
  const color = isCustom ? customColor : genreColor(GENRE_PRESETS.find((g) => g.name === genre)?.hue ?? 38)
  const canCreate = name.trim() !== ''

  function handleCreate() {
    if (!canCreate) return
    onCreate({ name: name.trim(), logline: logline.trim(), genre, color, template })
  }

  return (
    <div className={styles.scrim} onClick={onCancel}>
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label="Forge a new world"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.formColumn}>
          <span className={styles.eyebrow}>New world</span>
          <h2 className={styles.title}>Forge a new world</h2>

          <div className={styles.field}>
            <label htmlFor="cw-name">Name</label>
            <input
              id="cw-name"
              className={styles.nameInput}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="The Ninth Vale"
              autoFocus
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="cw-premise">Premise</label>
            <textarea
              id="cw-premise"
              value={logline}
              onChange={(e) => setLogline(e.target.value)}
              placeholder="One line on what this world is about…"
              rows={3}
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
                  data-selected={genre === preset.name || undefined}
                  style={{ '--chip-color': genreColor(preset.hue) } as React.CSSProperties}
                  onClick={() => setGenre(preset.name)}
                >
                  {preset.name}
                </button>
              ))}
              <button
                type="button"
                className={styles.chip}
                data-selected={isCustom || undefined}
                style={{ '--chip-color': customColor } as React.CSSProperties}
                onClick={() => setGenre('Custom')}
              >
                ✎ Custom
              </button>
            </div>
            {isCustom && (
              <label className={styles.colorRow}>
                <input type="color" value={customColor} onChange={(e) => setCustomColor(e.target.value)} aria-label="Custom world color" />
                <span>{customColor}</span>
              </label>
            )}
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Template</span>
            <div className={styles.templateRow}>
              <button
                type="button"
                className={styles.templateBox}
                data-selected={template === 'blank' || undefined}
                onClick={() => setTemplate('blank')}
              >
                <strong>Blank cosmos</strong>
                <span>An empty world. Every property is yours to invent.</span>
              </button>
              <button
                type="button"
                className={styles.templateBox}
                data-selected={template === 'starter' || undefined}
                onClick={() => setTemplate('starter')}
              >
                <strong>Starter structure</strong>
                <span>Seeds the default Category Templates for all seven categories.</span>
              </button>
            </div>
          </div>

          <div className={styles.actions}>
            <button type="button" className={styles.cancelButton} onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className={styles.createButton} disabled={!canCreate} onClick={handleCreate}>
              Create world
            </button>
          </div>
        </div>

        <div className={styles.previewColumn} aria-hidden="true">
          <span className={styles.previewLabel}>Preview</span>
          <WorldCard world={previewWorld(name, logline, genre, color)} entryCount={0} interactive={false} />
        </div>
      </div>
    </div>
  )
}
