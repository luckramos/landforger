import { Navigate, Route, Routes } from 'react-router-dom'
import { Auth } from './screens/Auth/Auth'
import { NotFound, Placeholder } from './screens/Placeholder'
import { PageScreen } from './screens/PageScreen'
import { DashboardShell } from './screens/Dashboard/DashboardShell'
import { DashboardHome, DashboardList } from './screens/Dashboard/DashboardViews'
import { Worlds } from './screens/Worlds/Worlds'

/** The PRD's full URL scheme, each route a placeholder until its slice lands. */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Auth />} />
      <Route path="/worlds" element={<Worlds />} />
      <Route path="/w/:world" element={<DashboardShell />}>
        <Route index element={<DashboardHome />} />
        <Route path="p/:slug" element={<PageScreen />} />
        <Route path="c/:category" element={<DashboardList />} />
        <Route path="t/:tag" element={<DashboardList />} />
      </Route>
      <Route path="/w/:world/map" element={<Placeholder name="Root Map" />} />
      <Route path="/w/:world/map/:mapId" element={<Placeholder name="Map" />} />
      <Route path="/w/:world/library" element={<Placeholder name="Map Library" />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
