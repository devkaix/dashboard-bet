import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import NetworkPage from './pages/Network'
import PlayersPage from './pages/Players'
import AnalyticsPage from './pages/Analytics'
import CopilotPage from './pages/Copilot'
import SettingsPage from './pages/Settings'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/network" element={<NetworkPage />} />
        <Route path="/players" element={<PlayersPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/copilot" element={<CopilotPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}
