import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bell,
  Database,
  ShieldAlert,
  Eye,
  LayoutDashboard,
  Mail,
  MessageSquare,
  Webhook,
  RotateCcw,
  Calendar,
  Hash,
  Users,
  Building2,
  Activity,
  Globe,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { dataStore } from '@/lib/data'

/* ─── types ─── */
type TabId = 'soglie' | 'dati'

interface TabConfig {
  id: TabId
  label: string
  icon: React.ElementType
}

const tabs: TabConfig[] = [
  { id: 'soglie', label: 'Soglie Alert', icon: Bell },
  { id: 'dati', label: 'Dati', icon: Database },
]

function useLocalStorage<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key)
      return item ? (JSON.parse(item) as T) : initial
    } catch {
      return initial
    }
  })
  const setStoredValue = useCallback((val: T | ((prev: T) => T)) => {
    setValue((prev) => {
      const next = typeof val === 'function' ? (val as (prev: T) => T)(prev) : val
      try {
        localStorage.setItem(key, JSON.stringify(next))
      } catch { /* localStorage may be unavailable */ }
      return next
    })
  }, [key])
  return [value, setStoredValue]
}

/* ─── Toggle Switch ─── */
function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        'relative w-10 h-5.5 rounded-full transition-colors duration-150 flex-shrink-0',
        checked ? 'bg-accent-blue' : 'bg-bg-surface-highlight',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
      style={{ height: 22 }}
    >
      <motion.div
        className="absolute top-[2px] w-[18px] h-[18px] rounded-full bg-white shadow-sm"
        animate={{ left: checked ? 20 : 2 }}
        transition={{ duration: 0.15 }}
      />
    </button>
  )
}

/* ─── Slider Input ─── */
function SliderInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit = '',
  onReset,
}: {
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step?: number
  unit?: string
  defaultValue: number
  onReset: () => void
}) {
  return (
    <div className="flex items-center gap-4">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 h-1.5 bg-bg-surface-highlight rounded-full appearance-none cursor-pointer accent-accent-blue"
        style={{
          background: `linear-gradient(to right, #3b82f6 ${((value - min) / (max - min)) * 100}%, #1e2a3b ${((value - min) / (max - min)) * 100}%)`,
        }}
      />
      <div className="flex items-center gap-2">
        <div className="bg-bg-surface rounded-lg px-3 py-1.5 border border-border-default min-w-[70px] text-center">
          <span className="text-[14px] text-text-primary font-mono">
            {value}
            {unit}
          </span>
        </div>
        <button
          onClick={onReset}
          className="text-[11px] text-text-muted hover:text-text-secondary transition-colors"
          title="Ripristina default"
        >
          <RotateCcw size={12} />
        </button>
      </div>
    </div>
  )
}

/* ─── Severity Pill ─── */
function SeverityPill({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const options = [
    { key: 'critical', label: 'Critico', class: 'bg-negative/15 text-negative border-negative/30' },
    { key: 'warning', label: 'Avviso', class: 'bg-warning/15 text-warning border-warning/30' },
    { key: 'info', label: 'Info', class: 'bg-info/15 text-info border-info/30' },
  ]
  return (
    <div className="flex items-center gap-1">
      {options.map((opt) => (
        <button
          key={opt.key}
          onClick={() => onChange(opt.key)}
          className={cn(
            'px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all duration-150',
            value === opt.key ? opt.class : 'bg-transparent text-text-muted border-border-default hover:border-border-default',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

/* ─── Tab 1: Soglie Alert ─── */
function SoglieAlertTab() {
  const [thresholds, setThresholds] = useLocalStorage('dazn-thresholds', {
    fidoWarning: 85,
    fidoCritical: 95,
    rakeDrop: -20,
    playerChurn: 7,
    payoutAnomaly: 200,
  })

  const defaults = {
    fidoWarning: 85,
    fidoCritical: 95,
    rakeDrop: -20,
    playerChurn: 7,
    payoutAnomaly: 200,
  }

  const update = useCallback((key: string, value: number) => {
    setThresholds((prev) => ({ ...prev, [key]: value }))
  }, [])

  const reset = useCallback((key: string) => {
    setThresholds((prev) => ({ ...prev, [key]: defaults[key as keyof typeof defaults] }))
  }, [])

  const [severity, setSeverity] = useState<Record<string, string>>({
    fidoWarning: 'warning',
    fidoCritical: 'critical',
    rakeDrop: 'warning',
    playerChurn: 'warning',
    payoutAnomaly: 'critical',
  })

  const [channels, setChannels] = useState({
    dashboard: true,
    email: false,
    sms: false,
    webhook: false,
  })

  return (
    <div className="space-y-6">
      {/* Soglie Predefinite */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-bg-surface rounded-xl border border-border-subtle p-5"
      >
        <div className="flex items-center gap-2 mb-1">
          <ShieldAlert size={18} className="text-accent-cyan" />
          <h3 className="text-[16px] font-semibold text-text-primary">Soglie Alert Predefinite</h3>
        </div>
        <p className="text-[12px] text-text-muted mb-4">
          Configura i valori che attivano gli alert automatici
        </p>

        <div className="space-y-3">
          {/* Fido Warning */}
          <ThresholdRow
            dotColor="#f59e0b"
            label="Utilizzo Fido — Soglia Warning"
            description="Alert quando l'utilizzo fido supera questa percentuale"
          >
            <SliderInput
              value={thresholds.fidoWarning}
              onChange={(v) => update('fidoWarning', v)}
              min={50}
              max={100}
              unit="%"
              defaultValue={defaults.fidoWarning}
              onReset={() => reset('fidoWarning')}
            />
            <SeverityPill value={severity.fidoWarning} onChange={(v) => setSeverity((p) => ({ ...p, fidoWarning: v }))} />
          </ThresholdRow>

          {/* Fido Critical */}
          <ThresholdRow
            dotColor="#ef4444"
            label="Utilizzo Fido — Soglia Critica"
            description="Alert critico quando l'utilizzo fido supera questa percentuale"
          >
            <SliderInput
              value={thresholds.fidoCritical}
              onChange={(v) => update('fidoCritical', v)}
              min={70}
              max={100}
              unit="%"
              defaultValue={defaults.fidoCritical}
              onReset={() => reset('fidoCritical')}
            />
            <SeverityPill value={severity.fidoCritical} onChange={(v) => setSeverity((p) => ({ ...p, fidoCritical: v }))} />
          </ThresholdRow>

          {/* Rake Drop */}
          <ThresholdRow
            dotColor="#f59e0b"
            label="Calo Rake Giornaliero"
            description="Alert quando il rake cala di questa percentuale rispetto alla media"
          >
            <SliderInput
              value={thresholds.rakeDrop}
              onChange={(v) => update('rakeDrop', v)}
              min={-50}
              max={0}
              step={1}
              unit="%"
              defaultValue={defaults.rakeDrop}
              onReset={() => reset('rakeDrop')}
            />
            <SeverityPill value={severity.rakeDrop} onChange={(v) => setSeverity((p) => ({ ...p, rakeDrop: v }))} />
          </ThresholdRow>

          {/* Player Churn */}
          <ThresholdRow
            dotColor="#f59e0b"
            label="Giocatori Inattivi"
            description="Numero di giorni senza attività prima di segnalare"
          >
            <SliderInput
              value={thresholds.playerChurn}
              onChange={(v) => update('playerChurn', v)}
              min={1}
              max={30}
              unit=" gg"
              defaultValue={defaults.playerChurn}
              onReset={() => reset('playerChurn')}
            />
            <SeverityPill value={severity.playerChurn} onChange={(v) => setSeverity((p) => ({ ...p, playerChurn: v }))} />
          </ThresholdRow>

          {/* Payout Anomaly */}
          <ThresholdRow
            dotColor="#ef4444"
            label="Anomalia Payout"
            description="Alert quando il payout medio supera questa percentuale"
          >
            <SliderInput
              value={thresholds.payoutAnomaly}
              onChange={(v) => update('payoutAnomaly', v)}
              min={100}
              max={300}
              unit="%"
              defaultValue={defaults.payoutAnomaly}
              onReset={() => reset('payoutAnomaly')}
            />
            <SeverityPill value={severity.payoutAnomaly} onChange={(v) => setSeverity((p) => ({ ...p, payoutAnomaly: v }))} />
          </ThresholdRow>
        </div>
      </motion.div>

      {/* Canali di Notifica */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-bg-surface rounded-xl border border-border-subtle p-5"
      >
        <div className="flex items-center gap-2 mb-4">
          <Bell size={18} className="text-accent-blue" />
          <h3 className="text-[16px] font-semibold text-text-primary">Canali di Notifica</h3>
        </div>
        <div className="flex gap-3">
          {[
            { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, color: 'text-accent-blue' },
            { key: 'email', label: 'Email', icon: Mail, color: 'text-text-secondary' },
            { key: 'sms', label: 'SMS', icon: MessageSquare, color: 'text-text-secondary' },
            { key: 'webhook', label: 'Webhook', icon: Webhook, color: 'text-text-secondary' },
          ].map((ch) => {
            const Icon = ch.icon
            return (
              <motion.div
                key={ch.key}
                whileHover={{ y: -2 }}
                className="bg-bg-surface-elevated rounded-xl p-4 flex flex-col items-center gap-2 border border-border-subtle w-[120px]"
              >
                <Icon size={24} className={ch.color} />
                <span className="text-[12px] text-text-secondary">{ch.label}</span>
                <ToggleSwitch
                  checked={channels[ch.key as keyof typeof channels]}
                  onChange={(v) => setChannels((p) => ({ ...p, [ch.key]: v }))}
                />
              </motion.div>
            )
          })}
        </div>
      </motion.div>

      {/* Anteprima Alert */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-bg-surface rounded-xl border border-border-subtle p-5"
      >
        <div className="flex items-center gap-2 mb-4">
          <Eye size={18} className="text-accent-purple" />
          <h3 className="text-[16px] font-semibold text-text-primary">Anteprima</h3>
        </div>
        <div className="bg-accent-purple/5 border border-accent-purple/15 rounded-xl p-4">
          <p className="text-[13px] text-text-secondary mb-3">
            Con le soglie attuali, gli alert vengono calcolati sui dati importati.
          </p>
          <p className="text-[12px] text-text-muted">
            Le soglie configurate determinano la severit&agrave; degli alert visualizzati in Dashboard.
          </p>
        </div>
      </motion.div>
    </div>
  )
}

function ThresholdRow({
  dotColor,
  label,
  description,
  children,
}: {
  dotColor: string
  label: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-bg-surface-elevated rounded-lg p-4">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: dotColor }} />
          <span className="text-[14px] font-medium text-text-primary">{label}</span>
        </div>
      </div>
      <p className="text-[12px] text-text-muted mb-3 ml-5">{description}</p>
      <div className="ml-5 space-y-2">
        {children}
      </div>
    </div>
  )
}

/* ─── Tab 2: Dati ─── */
function DatiTab() {
  const meta = dataStore.metadata

  const hasData = meta && (meta.total_records > 0 || meta.total_players > 0)

  const formatDate = (iso: string) => {
    if (!iso) return '—'
    try {
      const d = new Date(iso)
      return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })
    } catch {
      return iso
    }
  }

  return (
    <div className="space-y-6">
      {/* Panoramica Dataset */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-bg-surface rounded-xl border border-border-subtle p-5"
      >
        <div className="flex items-center gap-2 mb-4">
          <Database size={18} className="text-accent-blue" />
          <h3 className="text-[16px] font-semibold text-text-primary">Dataset Importato</h3>
        </div>

        {!hasData ? (
          <div className="bg-bg-surface-elevated rounded-lg p-5 text-center">
            <Database size={32} className="text-text-muted mx-auto mb-2" />
            <p className="text-[14px] text-text-secondary font-medium">Nessun dato importato</p>
            <p className="text-[12px] text-text-muted mt-1">
              Carica un file CSV o connetti una fonte dati dalla pagina Upload.
            </p>
          </div>
        ) : (
          <>
            {/* Stat cards grid */}
            <div className="grid grid-cols-3 gap-4 mb-5">
              <div className="bg-bg-surface-elevated rounded-lg p-4 border border-border-subtle">
                <div className="flex items-center gap-2 mb-1">
                  <Users size={14} className="text-accent-cyan" />
                  <span className="text-[11px] text-text-muted uppercase tracking-wide">Giocatori</span>
                </div>
                <p className="text-[20px] font-bold text-text-primary">{meta.total_players.toLocaleString()}</p>
              </div>
              <div className="bg-bg-surface-elevated rounded-lg p-4 border border-border-subtle">
                <div className="flex items-center gap-2 mb-1">
                  <Hash size={14} className="text-accent-indigo" />
                  <span className="text-[11px] text-text-muted uppercase tracking-wide">Record</span>
                </div>
                <p className="text-[20px] font-bold text-text-primary">{meta.total_records.toLocaleString()}</p>
              </div>
              <div className="bg-bg-surface-elevated rounded-lg p-4 border border-border-subtle">
                <div className="flex items-center gap-2 mb-1">
                  <Calendar size={14} className="text-accent-purple" />
                  <span className="text-[11px] text-text-muted uppercase tracking-wide">Giorni</span>
                </div>
                <p className="text-[20px] font-bold text-text-primary">{meta.total_days.toLocaleString()}</p>
              </div>
            </div>

            {/* Detail rows */}
            <div className="space-y-2">
              <div className="flex items-center justify-between bg-bg-surface-elevated rounded-lg px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <Calendar size={14} className="text-text-muted" />
                  <span className="text-[13px] text-text-secondary">Periodo analizzato</span>
                </div>
                <span className="text-[13px] text-text-primary font-medium">
                  {formatDate(meta.period_start)} &mdash; {formatDate(meta.period_end)}
                </span>
              </div>
              <div className="flex items-center justify-between bg-bg-surface-elevated rounded-lg px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <Globe size={14} className="text-text-muted" />
                  <span className="text-[13px] text-text-secondary">Esportazione</span>
                </div>
                <span className="text-[13px] text-text-primary font-medium">
                  {formatDate(meta.export_date)}
                </span>
              </div>
              <div className="flex items-center justify-between bg-bg-surface-elevated rounded-lg px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <Building2 size={14} className="text-text-muted" />
                  <span className="text-[13px] text-text-secondary">PVR</span>
                </div>
                <span className="text-[13px] text-text-primary font-medium">{meta.total_pvrs?.toLocaleString() ?? '—'}</span>
              </div>
              <div className="flex items-center justify-between bg-bg-surface-elevated rounded-lg px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <Activity size={14} className="text-text-muted" />
                  <span className="text-[13px] text-text-secondary">Area Manager / Agenti</span>
                </div>
                <span className="text-[13px] text-text-primary font-medium">
                  {(meta.total_area_managers ?? 0).toLocaleString()} / {(meta.total_agents ?? 0).toLocaleString()}
                </span>
              </div>
            </div>
          </>
        )}
      </motion.div>
    </div>
  )
}

/* ─── Main Page ─── */
export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('soglie')
  const navigate = useNavigate()

  const renderTab = () => {
    switch (activeTab) {
      case 'soglie':
        return <SoglieAlertTab />
      case 'dati':
        return <DatiTab />
      default:
        return null
    }
  }

  return (
    <div className="p-6 min-h-[calc(100dvh-64px)] flex flex-col">
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="mb-6"
      >
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.01em] text-text-primary">
          Impostazioni
        </h1>
        <p className="text-[15px] text-text-secondary mt-1">
          Configura alert e visualizza i dati importati
        </p>
        <p className="text-[13px] text-text-muted mt-1">
          <button
            onClick={() => navigate('/dashboard')}
            className="hover:text-text-secondary cursor-pointer bg-transparent border-none p-0 text-inherit text-[13px]"
          >
            Dashboard
          </button>
          <span className="mx-1.5">/</span>
          <span className="text-text-secondary">Impostazioni</span>
        </p>
      </motion.div>

      {/* Tab Layout */}
      <div className="flex gap-6 flex-1">
        {/* Tab Navigation */}
        <motion.nav
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="w-[200px] flex-shrink-0"
        >
          <div className="flex flex-col gap-1">
            {tabs.map((tab, index) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <motion.button
                  key={tab.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: index * 0.03 + 0.2 }}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'relative flex items-center gap-3 h-11 px-4 rounded-lg text-[14px] font-medium transition-all duration-150 text-left',
                    isActive
                      ? 'bg-bg-surface-elevated text-text-primary'
                      : 'text-text-secondary hover:bg-bg-surface hover:text-text-primary',
                  )}
                >
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-accent-blue rounded-r-full" />
                  )}
                  <Icon size={18} className="flex-shrink-0" />
                  <span>{tab.label}</span>
                </motion.button>
              )
            })}
          </div>
        </motion.nav>

        {/* Tab Content */}
        <div className="flex-1 min-w-0 pb-20">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {renderTab()}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
