import { Navigate, Route, Routes } from 'react-router-dom'
import { Auth } from './screens/Auth/Auth'
import { NotFound, Placeholder } from './screens/Placeholder'
import { Worlds } from './screens/Worlds/Worlds'

/** The PRD's full URL scheme, each route a placeholder until its slice lands. */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Auth />} />
      <Route path="/worlds" element={<Worlds />} />
      <Route path="/w/:world" element={<Placeholder name="Dashboard" />} />
      <Route path="/w/:world/p/:slug" element={<Placeholder name="Page" />} />
      <Route path="/w/:world/c/:category" element={<Placeholder name="Category" />} />
      <Route path="/w/:world/t/:tag" element={<Placeholder name="Tag" />} />
      <Route path="/w/:world/map" element={<Placeholder name="Root Map" />} />
      <Route path="/w/:world/map/:mapId" element={<Placeholder name="Map" />} />
      <Route path="/w/:world/library" element={<Placeholder name="Map Library" />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
