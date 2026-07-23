import { icons } from '../icons'
import styles from './Properties.module.css'

interface NumberInputProps {
  value: number
  label: string
  disabled?: boolean
  onChange: (value: number) => void
}

/** Number field with −/+ steppers and the native spinner suppressed. */
export function NumberInput({ value, label, disabled = false, onChange }: NumberInputProps) {
  const current = Number.isFinite(value) ? value : 0
  const commit = (next: number) => onChange(Number.isFinite(next) ? next : 0)

  return (
    <div className={styles.numberField} data-disabled={disabled || undefined}>
      <button type="button" className={styles.stepButton} aria-label={`Decrease ${label}`} disabled={disabled} onClick={() => commit(current - 1)}>
        <icons.minus size={13} />
      </button>
      <input
        className={styles.numberInput}
        aria-label={label}
        inputMode="decimal"
        disabled={disabled}
        value={Number.isFinite(value) ? String(value) : ''}
        onChange={(event) => {
          const raw = event.target.value.trim()
          if (raw === '' || raw === '-') { commit(0); return }
          const parsed = Number(raw)
          if (!Number.isNaN(parsed)) commit(parsed)
        }}
      />
      <button type="button" className={styles.stepButton} aria-label={`Increase ${label}`} disabled={disabled} onClick={() => commit(current + 1)}>
        <icons.add size={13} />
      </button>
    </div>
  )
}
