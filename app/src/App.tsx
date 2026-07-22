import { Routes, Route } from 'react-router-dom'
import Layout from '@/components/Layout'
import Dashboard from '@/pages/Dashboard'
import ExecutiveBriefing from '@/pages/ExecutiveBriefing'
import NetworkPage from '@/pages/Network'
import PvrDetailPage from '@/pages/PvrDetail'
import PlayersPage from '@/pages/Players'
import AnalyticsPage from '@/pages/Analytics'
import CopilotPage from '@/pages/Copilot'
import SettingsPage from '@/pages/Settings'
import UploadPage from '@/pages/Upload'
import PvrMappingPage from '@/pages/PvrMapping'
import DataProvenancePage from '@/pages/DataProvenance'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<ExecutiveBriefing />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/network" element={<NetworkPage />} />
        <Route path="/players" element={<PlayersPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/pvr-mapping" element={<PvrMappingPage />} />
        <Route path="/pvr/:pvrId" element={<PvrDetailPage />} />
        <Route path="/data-provenance" element={<DataProvenancePage />} />
        <Route path="/copilot" element={<CopilotPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}
