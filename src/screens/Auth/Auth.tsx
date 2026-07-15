import { useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/Button/Button'
import { prefersReducedMotion } from '../../components/motionPrefs'
import { useSessionStore } from '../../state/sessionStore'
import styles from './Auth.module.css'
import { useFieldStagger } from './useFieldStagger'

type Mode = 'login' | 'signup'

const SHAKE_ANIMATION = 'authShake calc(var(--mo, 1) * 480ms) var(--ease-shake)'

function EyeIcon({ crossed }: { crossed: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M1 8s2.5-4.5 7-4.5S15 8 15 8s-2.5 4.5-7 4.5S1 8 1 8Z" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2" />
      {crossed && <line x1="2" y1="14" x2="14" y2="2" stroke="currentColor" strokeWidth="1.2" />}
    </svg>
  )
}

const COPY: Record<Mode, { eyebrow: string; heading: string; subtext: string; submit: string }> = {
  login: {
    eyebrow: 'Sign in',
    heading: 'Chart your worlds.',
    subtext: 'Continue where you left off — every page, map, and era waiting.',
    submit: 'Enter your worlds',
  },
  signup: {
    eyebrow: 'Begin the atlas',
    heading: 'Forge a new account.',
    subtext: 'Start a blank cosmos or bring your notes to life.',
    submit: 'Forge your account',
  },
}

/** The Auth screen (`/login`) — dark split-screen login/signup, per design-inventory.md §2.1. */
export function Auth() {
  const navigate = useNavigate()
  const login = useSessionStore((s) => s.login)

  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('sera@landforger.io')
  const [password, setPassword] = useState('saltandcinder')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const formRef = useRef<HTMLFormElement>(null)
  useFieldStagger(formRef, mode)

  const copy = COPY[mode]

  function toggleMode() {
    setMode((m) => (m === 'login' ? 'signup' : 'login'))
    setError(null)
  }

  function shakeForm() {
    const form = formRef.current
    if (!form) return
    form.style.animation = 'none'
    void form.offsetWidth // force reflow so the shake can replay on repeated failures
    if (!prefersReducedMotion()) form.style.animation = SHAKE_ANIMATION
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (submitting) return

    const missingName = mode === 'signup' && name.trim() === ''
    const missingCreds = email.trim() === '' || password.trim() === ''
    if (missingName || missingCreds) {
      setError(
        missingName
          ? 'Enter your name, email, and password to continue.'
          : 'Enter your email and password to continue.',
      )
      shakeForm()
      return
    }

    // Demo auth: any credentials pass. The route swap is wrapped in a View
    // Transition, so there's nothing to wait for — the old delay only existed
    // to let the burst disc finish expanding.
    setError(null)
    setSubmitting(true)
    login({ name: 'Sera Valen', email })
    navigate('/worlds', { viewTransition: true })
  }

  const imageTransform = mode === 'signup' ? 'translateX(100%)' : 'translateX(0%)'
  const formTransform = mode === 'signup' ? 'translateX(-100%)' : 'translateX(0%)'

  return (
    <main className={styles.stage}>
      <section className={styles.imagePanel} style={{ transform: imageTransform }}>
        <div className={styles.drift} aria-hidden="true" />
        <div className={styles.imageContent}>
          <div className={styles.wordmark}>
            <img src="/landforger.svg" alt="LandForger" />
          </div>
          <div className={styles.imageFooter}>
            <span className={styles.eyebrow}>Worldbuilding Studio</span>
            <p className={styles.tagline}>Chart the drowned coast, one vale at a time.</p>
          </div>
        </div>
      </section>

      <section className={styles.formPanel} style={{ transform: formTransform }}>
        <form ref={formRef} className={styles.form} onSubmit={handleSubmit} noValidate>
          <span className={styles.eyebrow} data-stagger>
            {copy.eyebrow}
          </span>
          <h1 className={styles.heading} data-stagger>
            {copy.heading}
          </h1>
          <p className={styles.subtext} data-stagger>
            {copy.subtext}
          </p>

          {mode === 'signup' && (
            <div className={styles.field} data-stagger>
              <label htmlFor="auth-name">Name</label>
              <input id="auth-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Sera Valen" />
            </div>
          )}

          <div className={styles.field} data-stagger>
            <label htmlFor="auth-email">Email</label>
            <input id="auth-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          <div className={styles.field} data-stagger>
            <label htmlFor="auth-password">Password</label>
            <div className={styles.passwordRow}>
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className={styles.eyeButton}
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <EyeIcon crossed={showPassword} />
              </button>
            </div>
          </div>

          {mode === 'login' && (
            <div className={styles.rowBetween} data-stagger>
              <button
                type="button"
                role="checkbox"
                aria-checked={rememberMe}
                className={styles.checkboxRow}
                onClick={() => setRememberMe((v) => !v)}
              >
                <span className={styles.checkboxBox} data-checked={rememberMe || undefined} aria-hidden="true" />
                <span>Remember me</span>
              </button>
              <a href="#forgot" className={styles.forgotLink} onClick={(e) => e.preventDefault()}>
                Forgot?
              </a>
            </div>
          )}

          {mode === 'signup' && (
            <p className={styles.terms} data-stagger>
              By continuing you agree to the{' '}
              <a href="#terms" onClick={(e) => e.preventDefault()}>
                Cartographer&apos;s Terms
              </a>{' '}
              and{' '}
              <a href="#privacy" onClick={(e) => e.preventDefault()}>
                Privacy Charter
              </a>
              .
            </p>
          )}

          {error && (
            <div className={styles.errorRow} role="alert">
              <span aria-hidden="true">⚠</span> {error}
            </div>
          )}

          <Button type="submit" className={styles.submitButton} data-stagger disabled={submitting}>
            {copy.submit}
          </Button>

          <div className={styles.hintChip} data-stagger>
            Demo build — any credentials sign you straight in.
          </div>

          <div className={styles.footer} data-stagger>
            {mode === 'login' ? (
              <>
                New to LandForger?{' '}
                <button type="button" className={styles.linkButton} onClick={toggleMode}>
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already charting worlds?{' '}
                <button type="button" className={styles.linkButton} onClick={toggleMode}>
                  Sign in instead
                </button>
              </>
            )}
          </div>
        </form>
      </section>

    </main>
  )
}
