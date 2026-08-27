import { Routes, Route } from 'react-router-dom'
import Layout from '@/components/Layout'
import Dashboard from '@/pages/Dashboard'
import ExecutiveBriefing from '@/pages/ExecutiveBriefing'
import NetworkPage from '@/pages/Network'
import PvrDetailPage from '@/pages/PvrDetail'
import PlayersPage from '@/pages/Players'
import AnalyticsPage from '@/pages/Analytics'
import CopilotPage from '@/pages/Copilot'
import MonthComparisonPage from '@/pages/MonthComparison'
import UploadPage from '@/pages/Upload'
import SettingsPage from '@/pages/Settings'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/executive-briefing" element={<ExecutiveBriefing />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/network" element={<NetworkPage />} />
        <Route path="/players" element={<PlayersPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/compare" element={<MonthComparisonPage />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/copilot" element={<CopilotPage />} />
        <Route path="/pvr/:pvrId" element={<PvrDetailPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}
