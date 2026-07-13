import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

const pageMeta: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Dashboard', subtitle: 'Panoramica rete — Giugno 2026' },
  '/network': { title: 'Rete', subtitle: 'Gerarchia regioni → area manager → PVR → agenti' },
  '/players': { title: 'Giocatori', subtitle: 'Elenco completo giocatori attivi' },
  '/analytics': { title: 'Analytics', subtitle: 'Analisi trend e confronti periodo' },
  '/copilot': { title: 'AI Copilot', subtitle: 'Assistente intelligente per query dati' },
  '/settings': { title: 'Impostazioni', subtitle: 'Preferenze e soglie allerte' },
}

export default function Layout() {
  const location = useLocation()
  const meta = pageMeta[location.pathname] ?? { title: 'DAZN Bet AI', subtitle: '' }

  return (
    <div className="min-h-[100dvh] bg-bg-base">
      <Sidebar />
      <div className="ml-[260px]">
        <TopBar title={meta.title} subtitle={meta.subtitle} />
        <main className="pt-16 mt-0">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
