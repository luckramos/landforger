import type { Page, WorldMap } from '../domain/types'
import { eraDateLabel } from '../domain/timeline'
import { icons } from '../icons'
import { ImageInput } from '../properties/ImageInput'
import { inheritedChartEra } from './mapDomain'
import styles from './MapChartEditor.module.css'

interface MapChartEditorProps {
  map: WorldMap
  /** The World's Eras, in order — the strata a per-era Map is charted across. */
  eraPages: Page[]
  eraOrder: readonly string[]
  /** The Era whose chart is on screen right now; its stratum is marked. */
  activeEra: string
  onEraLinkedChange: (eraLinked: boolean) => void
  onChartChange: (key: string, image?: string) => void
}

/**
 * Edits how a Map is charted: one fixed image, or a chart redrawn per Era.
 * Charts are uploaded files (never links) — a Map is a static drawing of a
 * place. Shared by the on-map Chart settings and the Library's Map settings.
 */
export function MapChartEditor({ map, eraPages, eraOrder, activeEra, onEraLinkedChange, onChartChange }: MapChartEditorProps) {
  return (
    <div className={styles.editor}>
      <fieldset className={styles.chartMode}>
        <legend>How this chart is drawn</legend>
        <div className={styles.segmented} role="radiogroup" aria-label="How this chart is drawn">
          <button type="button" role="radio" aria-checked={!map.eraLinked} data-active={!map.eraLinked || undefined} onClick={() => onEraLinkedChange(false)}>One chart</button>
          <button type="button" role="radio" aria-checked={map.eraLinked} data-active={map.eraLinked || undefined} onClick={() => onEraLinkedChange(true)}><icons.timeline size={13} /> Per era</button>
        </div>
        <p className={styles.chartHint}>Pins stay put across every era — only the drawn chart ages beneath them.</p>
      </fieldset>

      {!map.eraLinked ? (
        <div className={styles.section}>
          <span className={styles.sectionLabel}>Chart image</span>
          <ImageInput
            value={map.images.all}
            label="Map chart"
            variant="square"
            size="large"
            allowLink={false}
            onChange={(value) => onChartChange('all', value)}
          />
        </div>
      ) : (
        <div className={styles.section}>
          <span className={styles.sectionLabel}>Chart for each era</span>
          <ol className={styles.strata}>
            {eraPages.map((era) => {
              const inheritsFrom = inheritedChartEra(map, era.slug, eraOrder)
              const inheritedTitle = inheritsFrom ? eraPages.find((candidate) => candidate.slug === inheritsFrom)?.title : undefined
              return (
                <li key={era.slug} className={styles.stratum} data-active={era.slug === activeEra || undefined}>
                  <div className={styles.stratumHead}>
                    <strong>{era.title}</strong>
                    {era.slug === activeEra && <em>Active</em>}
                    <small>{eraDateLabel(era)}</small>
                  </div>
                  <div className={styles.stratumChart}>
                    <ImageInput
                      value={map.images[era.slug]}
                      label={`Chart for ${era.title}`}
                      variant="square"
                      size="small"
                      allowLink={false}
                      onChange={(value) => onChartChange(era.slug, value)}
                    />
                    {!map.images[era.slug] && (
                      <p className={styles.stratumInherit}>
                        {inheritedTitle ? <><icons.levelUp size={12} /> Inherits {inheritedTitle}</> : 'No chart yet'}
                      </p>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      )}
    </div>
  )
}
