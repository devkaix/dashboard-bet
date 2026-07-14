import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bell,
  SlidersHorizontal,
  Palette,
  Database,
  User,
  ShieldAlert,
  Eye,
  LayoutDashboard,
  Mail,
  MessageSquare,
  Webhook,
  Save,
  RotateCcw,
  CheckCircle,
  Globe,
  Table,
  Grid3x3,
  Sparkles,
  Trash2,
  Lock,
  Check,
  RefreshCw,
  Download,
  XCircle,
  Moon,
  Sun,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { dataStore } from '@/lib/data'

/* ─── types ─── */
type TabId = 'soglie' | 'preferenze' | 'tema' | 'dati' | 'account'

interface TabConfig {
  id: TabId
  label: string
  icon: React.ElementType
}

const tabs: TabConfig[] = [
  { id: 'soglie', label: 'Soglie Alert', icon: Bell },
  { id: 'preferenze', label: 'Preferenze', icon: SlidersHorizontal },
  { id: 'tema', label: 'Tema', icon: Palette },
  { id: 'dati', label: 'Dati', icon: Database },
  { id: 'account', label: 'Account', icon: User },
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
      } catch {}
      return next
    })
  }, [key])
  return [value, setStoredValue]
}

/* ─── Toast ─── */
function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <motion.div
      initial={{ x: 300, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 300, opacity: 0 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }}
      className="fixed top-20 right-6 z-50 flex items-center gap-2.5 bg-bg-surface-elevated border-l-[3px] border-positive rounded-lg shadow-lg px-4 py-3"
    >
      <CheckCircle size={18} className="text-positive flex-shrink-0" />
      <span className="text-[13px] text-text-primary">{message}</span>
      <button onClick={onDismiss} className="ml-2 text-text-muted hover:text-text-primary">
        <XCircle size={14} />
      </button>
    </motion.div>
  )
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
            description="Numero di giorni senza attivit\u00E0 prima di segnalare"
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
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={14} className="text-accent-purple" />
            <span className="text-[13px] text-text-secondary">
              Con le soglie attuali, nel periodo analizzato (Giugno 2026) avresti ricevuto:
            </span>
          </div>
          <div className="space-y-1.5 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-negative" />
              <span className="text-[13px] text-negative font-medium">2 alert critici</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-warning" />
              <span className="text-[13px] text-warning font-medium">3 avvisi</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-info" />
              <span className="text-[13px] text-info font-medium">1 informazione</span>
            </div>
          </div>
          <p className="text-[12px] text-text-muted">6 alert totali &mdash; Media di 0.2 al giorno</p>
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

/* ─── Tab 2: Preferenze ─── */
function PreferenzeTab() {
  const [settings, setSettings] = useLocalStorage('dazn-preferences', {
    pushNotifications: true,
    alertSounds: true,
    autoRefresh: true,
    language: 'it',
    dateFormat: 'DD/MM/YYYY',
    currency: 'EUR',
    rowsPerPage: 25,
    defaultSort: 'rake',
  })

  const update = (key: string, value: unknown) => setSettings((p) => ({ ...p, [key]: value }))

  return (
    <div className="space-y-6">
      {/* Notifiche */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-bg-surface rounded-xl border border-border-subtle p-5"
      >
        <div className="flex items-center gap-2 mb-4">
          <Bell size={18} className="text-accent-blue" />
          <h3 className="text-[16px] font-semibold text-text-primary">Notifiche</h3>
        </div>
        <div className="space-y-4">
          <ToggleRow
            label="Notifiche push"
            description="Ricevi notifiche nel browser"
            checked={settings.pushNotifications}
            onChange={(v) => update('pushNotifications', v)}
          />
          <ToggleRow
            label="Suoni alert"
            description="Riproduci suono quando arriva un nuovo alert"
            checked={settings.alertSounds}
            onChange={(v) => update('alertSounds', v)}
          />
          <ToggleRow
            label="Auto-refresh dati"
            description="Aggiorna automaticamente i dati ogni 5 minuti"
            checked={settings.autoRefresh}
            onChange={(v) => update('autoRefresh', v)}
          />
        </div>
      </motion.div>

      {/* Lingua e Formato */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-bg-surface rounded-xl border border-border-subtle p-5"
      >
        <div className="flex items-center gap-2 mb-4">
          <Globe size={18} className="text-accent-cyan" />
          <h3 className="text-[16px] font-semibold text-text-primary">Lingua e Formato</h3>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[14px] text-text-primary">Lingua</p>
              <p className="text-[12px] text-text-muted">Lingua interfaccia</p>
            </div>
            <select
              value={settings.language}
              onChange={(e) => update('language', e.target.value)}
              className="bg-bg-surface-elevated text-text-primary text-[13px] rounded-lg px-3 py-2 border border-border-default focus:border-border-focus focus:outline-none"
            >
              <option value="it">Italiano</option>
              <option value="en">English</option>
            </select>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[14px] text-text-primary">Formato Data</p>
              <p className="text-[12px] text-text-muted">Formato visualizzazione date</p>
            </div>
            <select
              value={settings.dateFormat}
              onChange={(e) => update('dateFormat', e.target.value)}
              className="bg-bg-surface-elevated text-text-primary text-[13px] rounded-lg px-3 py-2 border border-border-default focus:border-border-focus focus:outline-none"
            >
              <option value="DD/MM/YYYY">DD/MM/YYYY</option>
              <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              <option value="YYYY-MM-DD">YYYY-MM-DD</option>
            </select>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[14px] text-text-primary">Valuta</p>
              <p className="text-[12px] text-text-muted">Simbolo valuta preferito</p>
            </div>
            <select
              value={settings.currency}
              onChange={(e) => update('currency', e.target.value)}
              className="bg-bg-surface-elevated text-text-primary text-[13px] rounded-lg px-3 py-2 border border-border-default focus:border-border-focus focus:outline-none"
            >
              <option value="EUR">&euro; (EUR)</option>
              <option value="USD">$ (USD)</option>
              <option value="GBP">&pound; (GBP)</option>
            </select>
          </div>
        </div>
      </motion.div>

      {/* Tabella Giocatori */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-bg-surface rounded-xl border border-border-subtle p-5"
      >
        <div className="flex items-center gap-2 mb-4">
          <Table size={18} className="text-accent-indigo" />
          <h3 className="text-[16px] font-semibold text-text-primary">Tabella Giocatori</h3>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[14px] text-text-primary">Righe per Pagina</p>
              <p className="text-[12px] text-text-muted">Numero di righe visualizzate</p>
            </div>
            <select
              value={settings.rowsPerPage}
              onChange={(e) => update('rowsPerPage', Number(e.target.value))}
              className="bg-bg-surface-elevated text-text-primary text-[13px] rounded-lg px-3 py-2 border border-border-default focus:border-border-focus focus:outline-none"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-[14px] text-text-primary font-medium">{label}</p>
        <p className="text-[12px] text-text-muted">{description}</p>
      </div>
      <ToggleSwitch checked={checked} onChange={onChange} />
    </div>
  )
}

/* ─── Tab 3: Tema ─── */
function TemaTab() {
  const [accentColor, setAccentColor] = useLocalStorage('dazn-theme-accent', 'blue')
  const [theme, setTheme] = useLocalStorage('dazn-theme-mode', 'dark')
  const [density, setDensity] = useLocalStorage('dazn-theme-density', 'standard')
  const [effects, setEffects] = useLocalStorage('dazn-theme-effects', {
    animations: true,
    glassmorphism: true,
    sparklines: true,
    aiHighlight: true,
  })

  const colors = [
    { key: 'blue', label: 'Blue', class: 'bg-accent-blue', hex: '#3b82f6' },
    { key: 'purple', label: 'Purple', class: 'bg-accent-purple', hex: '#8b5cf6' },
    { key: 'cyan', label: 'Cyan', class: 'bg-accent-cyan', hex: '#06b6d4' },
    { key: 'indigo', label: 'Indigo', class: 'bg-accent-indigo', hex: '#6366f1' },
  ]

  const themes = [
    { key: 'dark', label: 'Scuro', icon: Moon },
    { key: 'light', label: 'Chiaro', icon: Sun },
  ]

  return (
    <div className="space-y-6">
      {/* Accent Color */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-bg-surface rounded-xl border border-border-subtle p-5"
      >
        <div className="flex items-center gap-2 mb-4">
          <Palette size={18} className="text-accent-purple" />
          <h3 className="text-[16px] font-semibold text-text-primary">Colore Accento</h3>
        </div>
        <div className="flex gap-4">
          {colors.map((c) => (
            <button
              key={c.key}
              onClick={() => setAccentColor(c.key)}
              className={cn(
                'relative w-[160px] h-[100px] rounded-xl border-2 flex flex-col items-center justify-center gap-2 transition-all duration-150',
                accentColor === c.key
                  ? 'border-accent-blue'
                  : 'border-border-subtle hover:border-border-default',
              )}
            >
              <div className={cn('w-10 h-10 rounded-full', c.class)} />
              <span className="text-[13px] text-text-primary">{c.label}</span>
              {accentColor === c.key && (
                <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-accent-blue flex items-center justify-center">
                  <Check size={12} className="text-white" />
                </div>
              )}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Dark/Light Toggle */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="bg-bg-surface rounded-xl border border-border-subtle p-5"
      >
        <div className="flex items-center gap-2 mb-4">
          {theme === 'dark' ? <Moon size={18} className="text-accent-indigo" /> : <Sun size={18} className="text-warning" />}
          <h3 className="text-[16px] font-semibold text-text-primary">Modalit\u00E0 Tema</h3>
        </div>
        <div className="flex gap-4">
          {themes.map((t) => {
            const Icon = t.icon
            return (
              <button
                key={t.key}
                onClick={() => setTheme(t.key)}
                className={cn(
                  'relative w-[160px] h-[100px] rounded-xl border-2 flex flex-col items-center justify-center gap-2 transition-all duration-150',
                  theme === t.key
                    ? 'border-accent-blue'
                    : 'border-border-subtle hover:border-border-default',
                )}
              >
                <Icon size={24} className="text-text-secondary" />
                <span className="text-[13px] text-text-primary">{t.label}</span>
                {theme === t.key && (
                  <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-accent-blue flex items-center justify-center">
                    <Check size={12} className="text-white" />
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </motion.div>

      {/* Densit\u00E0 */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-bg-surface rounded-xl border border-border-subtle p-5"
      >
        <div className="flex items-center gap-2 mb-4">
          <Grid3x3 size={18} className="text-accent-cyan" />
          <h3 className="text-[16px] font-semibold text-text-primary">Densit\u00E0 Informazioni</h3>
        </div>
        <div className="flex gap-4">
          {[
            { key: 'compact', label: 'Compatta', desc: 'Pi\u00F9 dati visibili' },
            { key: 'standard', label: 'Standard', desc: 'Equilibrio ottimale' },
            { key: 'comfortable', label: 'Comoda', desc: 'Spazi maggiori' },
          ].map((d) => (
            <button
              key={d.key}
              onClick={() => setDensity(d.key)}
              className={cn(
                'relative w-[160px] h-[100px] rounded-xl border-2 flex flex-col items-center justify-center gap-1 transition-all duration-150',
                density === d.key
                  ? 'border-accent-blue'
                  : 'border-border-subtle hover:border-border-default',
              )}
            >
              <span className="text-[14px] font-medium text-text-primary">{d.label}</span>
              <span className="text-[11px] text-text-muted">{d.desc}</span>
              {density === d.key && (
                <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-accent-blue flex items-center justify-center">
                  <Check size={12} className="text-white" />
                </div>
              )}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Effetti Visivi */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="bg-bg-surface rounded-xl border border-border-subtle p-5"
      >
        <div className="flex items-center gap-2 mb-4">
          <Sparkles size={18} className="text-warning" />
          <h3 className="text-[16px] font-semibold text-text-primary">Effetti Visivi</h3>
        </div>
        <div className="space-y-4">
          <ToggleRow
            label="Animazioni"
            description="Abilita animazioni di transizione"
            checked={effects.animations}
            onChange={(v) => setEffects((p) => ({ ...p, animations: v }))}
          />
          <ToggleRow
            label="Sfuocatura Sfondo"
            description="Glassmorphism su pannelli AI"
            checked={effects.glassmorphism}
            onChange={(v) => setEffects((p) => ({ ...p, glassmorphism: v }))}
          />
          <ToggleRow
            label="Sparkline"
            description="Mini grafici nelle tabelle"
            checked={effects.sparklines}
            onChange={(v) => setEffects((p) => ({ ...p, sparklines: v }))}
          />
          <ToggleRow
            label="Highlight AI"
            description="Evidenzia bordi viola su componenti AI"
            checked={effects.aiHighlight}
            onChange={(v) => setEffects((p) => ({ ...p, aiHighlight: v }))}
          />
        </div>
      </motion.div>
    </div>
  )
}

/* ─── Tab 4: Dati ─── */
function DatiTab({ showToast }: { showToast: (msg: string) => void }) {
  const [lastRefresh] = useState('30 giugno 2026, 08:30')
  const [refreshMode, setRefreshMode] = useState('manual')
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleRefresh = () => {
    setIsRefreshing(true)
    setTimeout(() => {
      setIsRefreshing(false)
      showToast('Dati aggiornati con successo')
    }, 1500)
  }

  const handleExport = () => {
    showToast('Esportazione avviata')
  }

  const handleClearCache = () => {
    showToast('Cache svuotata')
  }

  return (
    <div className="space-y-6">
      {/* Sorgente Dati */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-bg-surface rounded-xl border border-border-subtle p-5"
      >
        <div className="flex items-center gap-2 mb-4">
          <Database size={18} className="text-accent-blue" />
          <h3 className="text-[16px] font-semibold text-text-primary">Sorgente Dati</h3>
        </div>
        <div className="mb-4">
          <p className="text-[13px] text-text-secondary">
            Ultimo aggiornamento: <span className="text-text-primary font-medium">{lastRefresh}</span>
          </p>
          <p className="text-[12px] text-text-muted mt-1">
            {dataStore.metadata?.total_records || 688} record &middot; {dataStore.metadata?.total_players || 133} giocatori &middot; {dataStore.metadata?.total_days || 30} giorni
          </p>
        </div>

        {/* Refresh buttons */}
        <div className="flex gap-3 mb-5">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 h-9 px-4 rounded-lg bg-accent-blue text-white text-[13px] font-medium hover:brightness-110 transition-all disabled:opacity-50"
          >
            <RefreshCw size={14} className={cn(isRefreshing && 'animate-spin')} />
            {isRefreshing ? 'Aggiornamento...' : 'Aggiorna Ora'}
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 h-9 px-4 rounded-lg bg-bg-surface-elevated text-text-primary text-[13px] font-medium border border-border-default hover:bg-bg-surface-highlight transition-colors"
          >
            <Download size={14} />
            Esporta Tutti i Dati
          </button>
        </div>

        {/* Refresh mode */}
        <div className="space-y-3">
          <p className="text-[14px] font-medium text-text-primary">Modalit\u00E0 Aggiornamento</p>
          {[
            { key: 'manual', label: 'Manuale', desc: 'Aggiorna quando clicchi il pulsante' },
            { key: 'auto', label: 'Automatico', desc: 'Ogni notte alle 03:00' },
          ].map((mode) => (
            <label
              key={mode.key}
              className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-bg-surface-elevated transition-colors"
            >
              <input
                type="radio"
                name="refreshMode"
                value={mode.key}
                checked={refreshMode === mode.key}
                onChange={(e) => setRefreshMode(e.target.value)}
                className="w-4 h-4 accent-accent-blue"
              />
              <div>
                <p className="text-[13px] text-text-primary font-medium">{mode.label}</p>
                <p className="text-[11px] text-text-muted">{mode.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </motion.div>

      {/* Pulizia */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-bg-surface rounded-xl border border-border-subtle p-5"
      >
        <div className="flex items-center gap-2 mb-4">
          <Trash2 size={18} className="text-negative" />
          <h3 className="text-[16px] font-semibold text-text-primary">Gestione Cache</h3>
        </div>
        <p className="text-[13px] text-text-secondary mb-4">
          Svuota la cache locale per forzare un nuovo caricamento dei dati dal server.
        </p>
        <button
          onClick={handleClearCache}
          className="flex items-center gap-2 h-9 px-4 rounded-lg bg-negative/10 text-negative text-[13px] font-medium border border-negative/20 hover:bg-negative/20 transition-colors"
        >
          <Trash2 size={14} />
          Svuota Cache
        </button>
      </motion.div>
    </div>
  )
}

/* ─── Tab 5: Account ─── */
function AccountTab() {
  const [profile, setProfile] = useState({
    name: 'Matteo Dossena',
    email: 'matteo@betservices.it',
    role: 'Amministratore',
  })
  const [twoFactor, setTwoFactor] = useState(false)
  const [notifications, setNotifications] = useState({
    emailAlerts: false,
    weeklyReport: true,
    criticalRealtime: true,
  })

  return (
    <div className="space-y-6">
      {/* Profilo */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-bg-surface rounded-xl border border-border-subtle p-5"
      >
        <div className="flex items-center gap-2 mb-4">
          <User size={18} className="text-accent-blue" />
          <h3 className="text-[16px] font-semibold text-text-primary">Profilo Utente</h3>
        </div>
        <div className="flex items-center gap-4 mb-5">
          <div className="w-16 h-16 rounded-full bg-accent-blue/20 flex items-center justify-center">
            <span className="text-accent-blue font-bold text-[18px]">
              {profile.name.split(' ').map((n) => n[0]).join('')}
            </span>
          </div>
          <div>
            <p className="text-[14px] font-medium text-text-primary">{profile.name}</p>
            <p className="text-[12px] text-text-muted">{profile.email}</p>
            <span className="inline-flex items-center px-2 py-0.5 mt-1 rounded-full text-[11px] font-medium bg-accent-purple/15 text-accent-purple">
              {profile.role}
            </span>
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-[12px] text-text-muted block mb-1">Nome</label>
            <input
              type="text"
              value={profile.name}
              onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
              className="w-full bg-bg-surface-elevated text-text-primary text-[13px] rounded-lg px-3 py-2 border border-border-default focus:border-border-focus focus:outline-none"
            />
          </div>
          <div>
            <label className="text-[12px] text-text-muted block mb-1">Email</label>
            <input
              type="email"
              value={profile.email}
              disabled
              className="w-full bg-bg-surface-elevated text-text-muted text-[13px] rounded-lg px-3 py-2 border border-border-default cursor-not-allowed"
            />
          </div>
        </div>
      </motion.div>

      {/* Sicurezza */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-bg-surface rounded-xl border border-border-subtle p-5"
      >
        <div className="flex items-center gap-2 mb-4">
          <Lock size={18} className="text-accent-cyan" />
          <h3 className="text-[16px] font-semibold text-text-primary">Sicurezza</h3>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[14px] text-text-primary font-medium">Password</p>
              <p className="text-[12px] text-text-muted">Cambia la tua password</p>
            </div>
            <button className="h-9 px-4 rounded-lg bg-bg-surface-elevated text-text-primary text-[13px] font-medium border border-border-default hover:bg-bg-surface-highlight transition-colors">
              Cambia Password
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[14px] text-text-primary font-medium">2FA</p>
              <p className="text-[12px] text-text-muted">Autenticazione a due fattori</p>
            </div>
            <ToggleSwitch checked={twoFactor} onChange={setTwoFactor} />
          </div>
          <p className="text-[12px] text-text-muted">
            1 sessione attiva su questo dispositivo
          </p>
        </div>
      </motion.div>

      {/* Notifiche Personali */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-bg-surface rounded-xl border border-border-subtle p-5"
      >
        <div className="flex items-center gap-2 mb-4">
          <Bell size={18} className="text-warning" />
          <h3 className="text-[16px] font-semibold text-text-primary">Notifiche Personali</h3>
        </div>
        <div className="space-y-4">
          <ToggleRow
            label="Alert via Email"
            description="Ricevi gli alert anche via email"
            checked={notifications.emailAlerts}
            onChange={(v) => setNotifications((p) => ({ ...p, emailAlerts: v }))}
          />
          <ToggleRow
            label="Report Settimanale"
            description="Ricevi un riepilogo settimanale"
            checked={notifications.weeklyReport}
            onChange={(v) => setNotifications((p) => ({ ...p, weeklyReport: v }))}
          />
          <ToggleRow
            label="Alert Critici in Tempo Reale"
            description="Notifica immediata per alert critici"
            checked={notifications.criticalRealtime}
            onChange={(v) => setNotifications((p) => ({ ...p, criticalRealtime: v }))}
          />
        </div>
      </motion.div>
    </div>
  )
}

/* ─── Bottom Action Bar ─── */
function BottomActionBar({ onSave, onReset }: { onSave: () => void; onReset: () => void }) {
  return (
    <div className="sticky bottom-0 left-0 right-0 h-16 bg-bg-surface border-t border-border-subtle flex items-center justify-between px-6 z-20 -mx-6">
      <button
        onClick={onReset}
        className="flex items-center gap-2 h-9 px-4 rounded-lg text-text-secondary text-[13px] font-medium hover:bg-bg-surface-elevated hover:text-text-primary transition-colors"
      >
        <RotateCcw size={14} />
        Annulla Modifiche
      </button>
      <button
        onClick={onSave}
        className="flex items-center gap-2 h-9 px-5 rounded-lg bg-accent-blue text-white text-[13px] font-medium hover:brightness-110 transition-all"
      >
        <Save size={14} />
        Salva Impostazioni
      </button>
    </div>
  )
}

/* ─── Main Page ─── */
export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('soglie')
  const [toast, setToast] = useState<string | null>(null)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }, [])

  const handleSave = () => {
    showToast('Impostazioni salvate con successo')
  }

  const handleReset = () => {
    showToast('Modifiche annullate')
  }

  const renderTab = () => {
    switch (activeTab) {
      case 'soglie':
        return <SoglieAlertTab />
      case 'preferenze':
        return <PreferenzeTab />
      case 'tema':
        return <TemaTab />
      case 'dati':
        return <DatiTab showToast={showToast} />
      case 'account':
        return <AccountTab />
      default:
        return null
    }
  }

  return (
    <div className="p-6 min-h-[calc(100dvh-64px)] flex flex-col">
      {/* Toast */}
      <AnimatePresence>
        {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
      </AnimatePresence>

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
          Configura alert, preferenze e dati
        </p>
        <p className="text-[13px] text-text-muted mt-1">
          <span className="hover:text-text-secondary cursor-pointer">Dashboard</span>
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

      {/* Bottom Action Bar */}
      <BottomActionBar onSave={handleSave} onReset={handleReset} />
    </div>
  )
}
