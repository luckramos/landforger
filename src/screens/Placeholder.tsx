import { useParams } from 'react-router-dom'
import styles from './Placeholder.module.css'

interface PlaceholderProps {
  name: string
}

/** Temporary stand-in for every screen until its slice lands. */
export function Placeholder({ name }: PlaceholderProps) {
  const params = useParams()
  const detail = Object.entries(params)
    .map(([key, value]) => `${key}: ${value}`)
    .join(' · ')
  return (
    <main className={styles.screen}>
      <span className={styles.eyebrow}>LandForger</span>
      <h1 className={styles.title}>{name}</h1>
      {detail && <span className={styles.detail}>{detail}</span>}
    </main>
  )
}

export function NotFound() {
  return (
    <main className={styles.screen}>
      <span className={styles.eyebrow}>LandForger</span>
      <h1 className={styles.title}>Nothing charted here</h1>
      <span className={styles.detail}>This path is off the map — soft 404</span>
    </main>
  )
}
