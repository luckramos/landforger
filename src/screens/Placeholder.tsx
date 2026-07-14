import { useParams, useSearchParams } from 'react-router-dom'
import styles from './Placeholder.module.css'

interface ScreenFrameProps {
  title: string
  detail?: string
}

/** Shared placeholder frame until each screen's slice lands. */
function ScreenFrame({ title, detail }: ScreenFrameProps) {
  const [searchParams] = useSearchParams()
  const panel = searchParams.get('panel')
  return (
    <main className={styles.screen}>
      <span className={styles.eyebrow}>LandForger</span>
      <h1 className={styles.title}>{title}</h1>
      {detail && <span className={styles.detail}>{detail}</span>}
      {panel && <span className={styles.panelBadge}>panel: {panel} (placeholder)</span>}
    </main>
  )
}

export function Placeholder({ name }: { name: string }) {
  const params = useParams()
  const detail = Object.entries(params)
    .map(([key, value]) => `${key}: ${value}`)
    .join(' · ')
  return <ScreenFrame title={name} detail={detail || undefined} />
}

export function NotFound() {
  return <ScreenFrame title="Nothing charted here" detail="This path is off the map — soft 404" />
}
