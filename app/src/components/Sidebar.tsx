import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  LayoutDashboard,
  PieChart,
  Network,
  Users,
  BarChart3,
  Sparkles,
  Settings,
  ChevronLeft,
  ChevronRight,
  Upload,
  Link2,
  Shield,
} from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/', icon: PieChart, label: 'Executive Briefing' },
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/network', icon: Network, label: 'Rete' },
  { to: '/players', icon: Users, label: 'Giocatori' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/upload', icon: Upload, label: 'Importa Dati' },
  { to: '/pvr-mapping', icon: Link2, label: 'Associazioni PVR' },
  { to: '/data-provenance', icon: Shield, label: 'Diagnostica' },
  { to: '/copilot', icon: Sparkles, label: 'AI Copilot' },
  { to: '/settings', icon: Settings, label: 'Impostazioni' },
]

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)

  const width = collapsed ? 'w-[72px]' : 'w-[260px]'

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-screen bg-bg-base border-r border-border-subtle flex flex-col z-50 transition-all duration-250',
        width,
      )}
    >
      {/* Logo area */}
      <div className="h-16 flex items-center gap-2 px-4 border-b border-border-subtle flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-[#1e293b] flex items-center justify-center">
            <span className="text-white font-bold text-[11px] leading-none">D</span>
          </div>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-1.5 min-w-0"
            >
              <span className="text-white font-bold text-[15px] tracking-tight whitespace-nowrap">
                DAZN
              </span>
              <span className="text-accent-purple font-semibold text-[13px]">AI</span>
            </motion.div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 overflow-y-auto">
        <ul className="flex flex-col gap-1">
          {navItems.map((item, index) => {
            const Icon = item.icon
            const isCopilot = item.to === '/copilot'

            return (
              <motion.li
                key={item.to}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.03, duration: 0.25 }}
              >
                <NavLink
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 h-10 px-3 rounded-lg text-[14px] font-medium transition-all duration-150 relative',
                      isActive
                        ? 'bg-bg-surface-elevated text-text-primary'
                        : 'text-text-secondary hover:bg-bg-surface-elevated hover:text-text-primary',
                      isCopilot && !collapsed && 'text-accent-purple hover:text-accent-purple',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-accent-blue rounded-r-full" />
                      )}
                      <Icon size={20} className="flex-shrink-0" />
                      {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
                    </>
                  )}
                </NavLink>
              </motion.li>
            )
          })}
        </ul>
      </nav>

      {/* Bottom section */}
      <div className="p-3 border-t border-border-subtle flex-shrink-0">
        <div className="flex items-center gap-3 px-3 h-10">
          <div className="w-8 h-8 rounded-full bg-accent-blue/20 flex items-center justify-center flex-shrink-0">
            <span className="text-accent-blue font-semibold text-[12px]">AD</span>
          </div>
          {!collapsed && (
            <div className="min-w-0 overflow-hidden">
              <div className="text-[13px] font-medium text-text-primary truncate">Admin</div>
              <div className="text-[11px] text-text-muted truncate">Gestore Rete</div>
            </div>
          )}
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="mt-2 flex items-center justify-center w-full h-8 rounded-lg text-text-muted hover:bg-bg-surface-elevated hover:text-text-primary transition-colors"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          {!collapsed && <span className="text-[12px] ml-1">Comprimi</span>}
        </button>
      </div>
    </aside>
  )
}
