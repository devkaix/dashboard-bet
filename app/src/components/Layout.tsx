import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

const pageMeta: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Dashboard', subtitle: 'Panoramica rete' },
  '/dashboard': { title: 'Dashboard', subtitle: 'Panoramica rete' },
  '/executive-briefing': { title: 'Executive Briefing', subtitle: 'Le cose più importanti da sapere oggi' },
  '/network': { title: 'Rete', subtitle: 'Gerarchia agenti → PVR → giocatori' },
  '/players': { title: 'Giocatori', subtitle: 'Elenco completo giocatori attivi' },
  '/analytics': { title: 'Analytics', subtitle: 'Analisi trend e confronti periodo' },
  '/compare': { title: 'Confronto Mensile', subtitle: 'Analisi comparativa tra due periodi' },
  '/upload': { title: 'Importa Dati', subtitle: 'Caricamento Excel e validazioni' },
  '/copilot': { title: 'Analisi Veloce e Consigli Strategici', subtitle: 'Analisi rapida dei dati della rete' },
  '/commercial-advice': { title: 'Suggerimenti Commerciali', subtitle: 'Consigli operativi per la rete' },
  '/settings': { title: 'Impostazioni', subtitle: 'Soglie alert e riepilogo dati' },
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
