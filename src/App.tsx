import { useEffect } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { AppRoutes } from './routes'
import { useUiStore } from './state/uiStore'
import './styles/global.css'

/** Syncs the motion scale onto the document root as `--mo` (multiply-is-slower). */
export function MotionRoot({ children }: { children: React.ReactNode }) {
  const motionScale = useUiStore((s) => s.motionScale)
  useEffect(() => {
    document.documentElement.style.setProperty('--mo', String(motionScale))
  }, [motionScale])
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
