import { useLayoutEffect } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { AppRoutes } from './routes'
import { useUiStore } from './state/uiStore'
import { useSessionStore } from './state/sessionStore'
import './styles/global.css'

/** Syncs the motion scale onto the document root as `--mo` (multiply-is-slower). */
export function MotionRoot({ children }: { children: React.ReactNode }) {
  const motionScale = useUiStore((s) => s.motionScale)
  const bodyFont = useUiStore((s) => s.bodyFont)
  const activateUser = useUiStore((s) => s.activateUser)
  const userEmail = useSessionStore((s) => s.user?.email)

  useLayoutEffect(() => activateUser(userEmail), [activateUser, userEmail])
  useLayoutEffect(() => {
    document.documentElement.style.setProperty('--mo', String(motionScale))
    document.documentElement.style.setProperty('--page-body-font', `var(--font-${bodyFont})`)
  }, [bodyFont, motionScale])
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <MotionRoot>
        <AppRoutes />
      </MotionRoot>
    </BrowserRouter>
  )
}
