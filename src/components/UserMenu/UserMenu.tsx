import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSessionStore } from '../../state/sessionStore'
import { useUiStore } from '../../state/uiStore'
import { overlayExitTransition } from '../motionPrefs'
import styles from './UserMenu.module.css'

const FALLBACK_USER = { name: 'Sera Valen', email: 'sera@landforger.io' }

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

/**
 * Avatar button + popover (design-inventory.md §2.5, English labels — the
 * design's Portuguese is a bug). Popover position is measured from the
 * button rect (catalog §3.3: top = rect.bottom + 9, right = innerWidth −
 * rect.right). Exit is a Motion AnimatePresence fade (PRD deviation:
 * overlays get exit fades — the design unmounts instantly).
 */
export function UserMenu() {
  const navigate = useNavigate()
  const user = useSessionStore((s) => s.user) ?? FALLBACK_USER
  const logout = useSessionStore((s) => s.logout)
  const motionScale = useUiStore((s) => s.motionScale)
  const activateUser = useUiStore((s) => s.activateUser)
  const setMotionScale = useUiStore((s) => s.setMotionScale)

  const [open, setOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, right: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  useEffect(() => activateUser(user.email), [activateUser, user.email])

  function toggle() {
    if (!open) {
      const rect = buttonRef.current?.getBoundingClientRect()
      if (rect) setPosition({ top: rect.bottom + 9, right: window.innerWidth - rect.right })
    }
    setOpen((v) => !v)
  }

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (popRef.current?.contains(target) || buttonRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  function handleLogout() {
    setOpen(false)
    logout()
    navigate('/login')
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={styles.avatar}
        data-open={open || undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="User menu"
        onClick={toggle}
      >
        {initialsOf(user.name)}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={popRef}
            className={styles.popover}
            style={{ top: position.top, right: position.right }}
            role="menu"
            initial={false}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={overlayExitTransition(motionScale)}
          >
            <div className={styles.userBlock}>
              <span className={styles.userName}>{user.name}</span>
              <span className={styles.userEmail}>{user.email}</span>
            </div>
            <button type="button" role="menuitem" className={styles.item}>
              Profile
            </button>
            <button
              type="button"
              role="menuitem"
              className={styles.item}
              aria-expanded={settingsOpen}
              onClick={() => setSettingsOpen((current) => !current)}
            >
              Settings
            </button>
            {settingsOpen && (
              <section className={styles.settings} aria-label="User settings">
                <label className={styles.motionSetting}>
                  <span><b>Motion intensity</b><output>{motionScale.toFixed(1)}×</output></span>
                  <input
                    type="range"
                    min="0.5"
                    max="1.5"
                    step="0.1"
                    value={motionScale}
                    aria-label="Motion intensity"
                    onChange={(event) => setMotionScale(event.currentTarget.valueAsNumber)}
                  />
                  <small>Higher values make transitions slower.</small>
                </label>
              </section>
            )}
            <div className={styles.divider} role="separator" />
            <button type="button" role="menuitem" className={`${styles.item} ${styles.danger}`} onClick={handleLogout}>
              Log out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
