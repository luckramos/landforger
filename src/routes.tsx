import { Navigate, Route, Routes } from 'react-router-dom'
import { Auth } from './screens/Auth/Auth'
import { NotFound } from './screens/Placeholder'
import { PageScreen } from './screens/PageScreen'
import { DashboardShell } from './screens/Dashboard/DashboardShell'
import { DashboardHome, DashboardList } from './screens/Dashboard/DashboardViews'
import { Worlds } from './screens/Worlds/Worlds'
import { NewPageScreen } from './screens/NewPageScreen'
import { MapScreen } from './maps/MapScreen'
import { MapLibrary } from './maps/MapLibrary'

/** The PRD's full URL scheme; unfinished slices retain the shared placeholder. */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Auth />} />
      <Route path="/worlds" element={<Worlds />} />
      <Route path="/w/:world" element={<DashboardShell />}>
        <Route index element={<DashboardHome />} />
        <Route path="new" element={<NewPageScreen />} />
        <Route path="p/:slug" element={<PageScreen />} />
        <Route path="c/:category" element={<DashboardList />} />
        <Route path="t/:tag" element={<DashboardList />} />
      </Route>
      <Route path="/w/:world/map" element={<MapScreen />} />
      <Route path="/w/:world/map/:mapId" element={<MapScreen />} />
      <Route path="/w/:world/library" element={<MapLibrary />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
