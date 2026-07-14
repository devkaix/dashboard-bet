import { useState, useMemo, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronRight,
  MapPin,
  UserCog,
  Store,
  User,
  Gamepad2,
  Search,
  X,
  TrendingUp,
  TrendingDown,
  Minus,
  Expand,
  ChevronDownIcon,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { dataStore, formatCurrency, loadData } from '@/lib/data'
import type {
  Region,
  AreaManager,
  PVR,
  Agent,
  Player,
} from '@/lib/data'

/* ─── types ─── */
type EntityType = 'region' | 'area_manager' | 'pvr' | 'agent' | 'player'

interface TreeNode {
  id: string | number
  type: EntityType
  data: Region | AreaManager | PVR | Agent | Player
  children: TreeNode[]
}

interface SelectedEntity {
  node: TreeNode
  breadcrumb: string[]
}

/* ─── helper: safely get numeric value from data ─── */
function num(data: unknown, key: string): number {
  const val = (data as Record<string, unknown>)?.[key]
  return typeof val === 'number' ? val : 0
}

function str(data: unknown, key: string): string {
  const val = (data as Record<string, unknown>)?.[key]
  return typeof val === 'string' ? val : ''
}

/* ─── health helpers ─── */
function getHealthColor(score: number | null): string {
  if (score == null) return '#64748b'
  if (score >= 80) return '#10b981'
  if (score >= 50) return '#f59e0b'
  return '#ef4444'
}

function getHealthLabel(score: number | null): string {
  if (score == null) return 'Non disponibile'
  if (score >= 80) return 'Buona'
  if (score >= 50) return 'Media'
  return 'Critica'
}

/* ─── Health Score Ring ─── */
function HealthRing({
  score,
  size = 48,
  strokeWidth = 4,
  showLabel = true,
}: {
  score: number | null
  size?: number
  strokeWidth?: number
  showLabel?: boolean
}) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const effectiveScore = score ?? 0
  const offset = circumference - (effectiveScore / 100) * circumference
  const color = getHealthColor(score)

  return (
    <svg width={size} height={size} className="flex-shrink-0">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#1e293b"
        strokeWidth={strokeWidth}
      />
      {score != null && (
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number], delay: 0.4 }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      )}
      {showLabel && (
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fill={color}
          fontSize={size <= 40 ? 10 : size <= 48 ? 11 : 14}
          fontWeight={600}
          fontFamily="JetBrains Mono, monospace"
        >
          {score != null ? Math.round(score) : '-'}
        </text>
      )}
    </svg>
  )
}

/* ─── Status Badge ─── */
function StatusBadge({ status }: { status: string | null }) {
  const colorMap: Record<string, string> = {
    active: 'bg-positive/15 text-positive',
    inactive: 'bg-negative/15 text-negative',
    warning: 'bg-warning/15 text-warning',
  }
  const labelMap: Record<string, string> = {
    active: 'Attivo',
    inactive: 'Inattivo',
    warning: 'Warning',
  }
  const s = status || 'unknown'
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium',
        colorMap[s] || 'bg-bg-surface-elevated text-text-muted',
      )}
    >
      {labelMap[s] || s}
    </span>
  )
}

/* ─── Fido Usage Bar ─── */
function FidoBar({ used, total }: { used: number; total: number }) {
  const pct = Math.min((used / total) * 100, 100)
  const color = pct >= 95 ? 'bg-negative' : pct >= 85 ? 'bg-warning' : 'bg-positive'
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-bg-surface-highlight rounded-full overflow-hidden">
        <motion.div
          className={cn('h-full rounded-full', color)}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] }}
        />
      </div>
      <span className="text-[11px] text-text-muted font-mono">{pct.toFixed(0)}%</span>
    </div>
  )
}

/* ─── PVR Status Badge ─── */
function PvrStatusBadge({ trend }: { trend: 'up' | 'down' | 'stable' | null }) {
  if (!trend) return null
  const config = {
    up: { icon: TrendingUp, label: 'In Crescita', class: 'bg-positive/15 text-positive' },
    down: { icon: TrendingDown, label: 'In Calo', class: 'bg-negative/15 text-negative' },
    stable: { icon: Minus, label: 'Stabile', class: 'bg-warning/15 text-warning' },
  }
  const c = config[trend]
  const Icon = c.icon
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium', c.class)}>
      <Icon size={10} />
      {c.label}
    </span>
  )
}

/* ─── Build tree from flat data ─── */
function buildTree(): TreeNode[] {
  const regions = dataStore.regions
  const areaManagers = dataStore.area_managers
  const pvrs = dataStore.pvrs
  const agents = dataStore.agents
  const players = dataStore.players

  const buildPvrNode = (pvr: PVR): TreeNode => {
    const playerNodes: TreeNode[] = players
      .filter((pl) => pl.pvr_id === pvr.id)
      .map((pl) => ({
        id: pl.id,
        type: 'player' as EntityType,
        data: pl,
        children: [],
      }))

    if (agents.length > 0) {
      const pvrAgents = agents.filter((a) => a.pvr_id === pvr.id)
      const agentNodes: TreeNode[] = pvrAgents.map((agent) => {
        const agentPlayers = players.filter((pl) => pl.agent_id === agent.id)
        const agentPlayerNodes: TreeNode[] = agentPlayers.map((pl) => ({
          id: pl.id,
          type: 'player' as EntityType,
          data: pl,
          children: [],
        }))
        return { id: agent.id, type: 'agent' as EntityType, data: agent, children: agentPlayerNodes }
      })
      return { id: pvr.id, type: 'pvr' as EntityType, data: pvr, children: agentNodes }
    }

    return { id: pvr.id, type: 'pvr' as EntityType, data: pvr, children: playerNodes }
  }

  // Fallback: if no regions/area managers are defined, show flat PVR → Players tree
  if (regions.length === 0 || areaManagers.length === 0) {
    const pvrNodes = pvrs.map(buildPvrNode)

    const unassignedPlayers = players.filter((pl) => !pl.pvr_id)
    if (unassignedPlayers.length > 0) {
      const unassignedNode: TreeNode = {
        id: '__unassigned__',
        type: 'pvr',
        data: { id: '__unassigned__', code: '', name: 'Non assegnati', area_manager_id: 0, region_id: 0 } as PVR,
        children: unassignedPlayers.map((pl) => ({
          id: pl.id,
          type: 'player' as EntityType,
          data: pl,
          children: [],
        })),
      }
      pvrNodes.push(unassignedNode)
    }

    return [{
      id: 'network',
      type: 'region',
      data: { id: 0, name: 'Rete', area_manager_id: 0 } as Region,
      children: pvrNodes,
    }]
  }

  // Group regions by name (unique region names)
  const uniqueNames = Array.from(new Set(regions.map((r) => r.name)))
  const regionNodes: TreeNode[] = uniqueNames.map((name, idx) => {
    const regionRecs = regions.filter((r) => r.name === name)
    const amIds = regionRecs.map((r) => r.area_manager_id)
    const ams = areaManagers.filter((am) => amIds.includes(am.id))

    const amNodes: TreeNode[] = ams.map((am) => {
      const amPvrs = pvrs.filter((p) => p.area_manager_id === am.id)
      const pvrNodes = amPvrs.map(buildPvrNode)
      return { id: am.id, type: 'area_manager' as EntityType, data: am, children: pvrNodes }
    })

    return {
      id: idx + 1,
      type: 'region',
      data: { name, id: idx + 1, area_manager_id: 0 } as Region,
      children: amNodes,
    }
  })

  return regionNodes
}

/* ─── Detail Panel ─── */
function DetailPanel({
  selected,
  onClose,
}: {
  selected: SelectedEntity
  onClose: () => void
}) {
  const { node, breadcrumb } = selected

  const nodeName = useMemo(() => {
    const d = node.data as unknown as Record<string, unknown>
    if ('name' in d) return String(d.name)
    if ('username' in d) return String(d.username)
    return String(d.id || '')
  }, [node])

  return (
    <motion.div
      initial={{ x: 420, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 420, opacity: 0 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }}
      className="fixed right-0 top-16 bottom-0 w-[420px] bg-bg-surface border-l border-border-default z-30 overflow-y-auto"
    >
      {/* Header */}
      <div className="p-6 border-b border-border-subtle">
        <div className="flex items-start justify-between mb-3">
          <span
            className={cn(
              'px-2.5 py-0.5 rounded-full text-[11px] font-medium uppercase tracking-wide',
              node.type === 'pvr' && 'bg-accent-blue/15 text-accent-blue',
              node.type === 'agent' && 'bg-accent-cyan/15 text-accent-cyan',
              node.type === 'player' && 'bg-accent-purple/15 text-accent-purple',
              node.type === 'region' && 'bg-positive/15 text-positive',
              node.type === 'area_manager' && 'bg-accent-indigo/15 text-accent-indigo',
            )}
          >
            {node.type === 'area_manager' ? 'Area Manager' : node.type}
          </span>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:bg-bg-surface-elevated hover:text-text-primary transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        <h2 className="text-[20px] font-semibold text-text-primary leading-tight">
          {nodeName}
        </h2>
        {breadcrumb.length > 0 && (
          <p className="text-[12px] text-text-muted mt-1.5">{breadcrumb.join(' > ')}</p>
        )}
      </div>

      {/* Content */}
      <div className="p-6 space-y-6">
        {/* Health Score */}
        {'health_score' in node.data && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="flex flex-col items-center py-4"
          >
            <HealthRing score={(node.data as { health_score?: number | null }).health_score ?? null} size={96} strokeWidth={6} />
            <p className="text-[14px] text-text-secondary mt-3">
              {getHealthLabel((node.data as { health_score?: number | null }).health_score ?? null)}
            </p>
          </motion.div>
        )}

        {/* KPI Grid */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-2 gap-3"
        >
          {node.type === 'pvr' && (
            <>
              <KpiCard label="Rake Totale" value={formatCurrency(getPvrTotalRake(node))} />
              <KpiCard label="Giocatori" value={String(sumPlayerRake(node) > 0 ? node.children.reduce((sum, c) => sum + (c.type === 'player' ? 1 : c.children.length), 0) : 0)} />
              <KpiCard label="Agenti" value={String(dataStore.agents.length)} />
              {(node.data as PVR).fido != null && (
                <KpiCard label="Fido" value={formatCurrency(num(node.data, 'fido'))} />
              )}
            </>
          )}
          {node.type === 'agent' && (
            <>
              <KpiCard label="Giocatori" value={String(node.children.length)} />
              <KpiCard label="Commissione" value={`${num(node.data, 'commission_rate')}%`} />
              <KpiCard label="Codice" value={str(node.data, 'code') || '-'} />
            </>
          )}
          {node.type === 'player' && (
            <>
              <KpiCard label="Rake Totale" value={formatCurrency(num(node.data, 'total_rake'))} />
              <KpiCard label="Bet Totale" value={formatCurrency(num(node.data, 'total_bet'))} />
              <KpiCard label="Payout" value={`${num(node.data, 'avg_payout').toFixed(1)}%`} />
              <KpiCard label="Giorni Attivi" value={`${num(node.data, 'active_days')}/30`} />
            </>
          )}
          {node.type === 'region' && (
            <>
              <KpiCard label="Area Manager" value={String(node.children.length)} />
              <KpiCard label="PVR" value={String(node.children.reduce((s, am) => s + am.children.length, 0))} />
              <KpiCard label="Agenti" value={String(node.children.reduce((s, am) => s + am.children.reduce((t, p) => t + p.children.length, 0), 0))} />
            </>
          )}
          {node.type === 'area_manager' && (
            <>
              <KpiCard label="PVR" value={String(node.children.length)} />
              <KpiCard label="Agenti" value={String(node.children.reduce((s, p) => s + p.children.length, 0))} />
            </>
          )}
        </motion.div>

        {/* Player AI Insight */}
        {node.type === 'player' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-accent-purple/5 border border-accent-purple/15 rounded-xl p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={14} className="text-accent-purple" />
              <span className="text-[13px] font-medium text-accent-purple">AI Insight</span>
            </div>
            <p className="text-[13px] text-text-secondary">
              {(node.data as Player).health_score == null
                ? 'Dati insufficienti per una valutazione automatica.'
                : num(node.data, 'health_score') >= 80
                ? 'Top performer \u2014 Considerare offerta VIP'
                : num(node.data, 'health_score') >= 50
                ? 'Giocatore stabile \u2014 Monitorare attivit\u00E0'
                : 'Giocatore a rischio \u2014 Richiede attenzione'}
            </p>
          </motion.div>
        )}

        {/* Agent Player List */}
        {node.type === 'agent' && node.children.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
            <h3 className="text-[14px] font-semibold text-text-primary mb-3">Giocatori</h3>
            <div className="space-y-2">
              {node.children.map((pl) => (
                <div
                  key={pl.id}
                  className="flex items-center justify-between py-2 px-3 bg-bg-surface-elevated rounded-lg"
                >
                  <span className="text-[13px] text-text-primary">
                    {str(pl.data, 'username')}
                  </span>
                  <span className="text-[12px] text-text-muted font-mono">
                    {formatCurrency(num(pl.data, 'total_rake'))}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-bg-surface-elevated rounded-lg p-3">
      <p className="text-[11px] text-text-muted mb-1">{label}</p>
      <p className="text-[15px] font-semibold text-text-primary font-mono">{value}</p>
    </div>
  )
}

/* ─── Tree Row Component ─── */
function TreeRow({
  node,
  depth,
  expanded,
  onToggle,
  onSelect,
  searchQuery,
  index,
}: {
  node: TreeNode
  depth: number
  expanded: Set<string>
  onToggle: (key: string) => void
  onSelect: (node: TreeNode, breadcrumb: string[]) => void
  searchQuery: string
  index: number
}) {
  const key = `${node.type}-${node.id}`
  const isExpanded = expanded.has(key)
  const hasChildren = node.children.length > 0
  const isLeaf = !hasChildren

  // Check if matches search
  const name = getNodeName(node).toLowerCase()
  const matchesSearch = searchQuery === '' || name.includes(searchQuery.toLowerCase())
  const isDimmed = searchQuery !== '' && !matchesSearch

  const handleRowClick = () => {
    if (!isLeaf) {
      onToggle(key)
    }
  }

  const handleSelect = (e: React.MouseEvent) => {
    e.stopPropagation()
    const path = getBreadcrumbPath(node)
    onSelect(node, path)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: isDimmed ? 0.3 : 1, y: 0 }}
      transition={{ duration: 0.15, delay: index * 0.02 }}
    >
      <div
        className={cn(
          'flex items-center gap-2 border-b border-border-subtle cursor-pointer transition-colors duration-150 select-none',
          depth === 0 && 'bg-bg-surface-elevated/50',
          depth === 1 && 'bg-bg-surface',
          depth === 2 && 'bg-bg-surface/80',
          depth >= 3 && 'bg-bg-surface/60',
          'hover:bg-bg-surface-highlight',
          isExpanded && depth === 0 && 'bg-bg-surface-elevated',
        )}
        style={{
          height: depth === 0 ? 56 : depth === 1 ? 48 : depth === 2 ? 44 : depth === 3 ? 40 : 36,
          paddingLeft: `${depth * 32 + 12}px`,
          paddingRight: 16,
        }}
        onClick={handleRowClick}
      >
        {/* Expand/collapse chevron */}
        <div className="w-5 flex items-center justify-center flex-shrink-0">
          {!isLeaf && (
            <motion.div animate={{ rotate: isExpanded ? 90 : 0 }} transition={{ duration: 0.15 }}>
              <ChevronRight size={14} className="text-text-secondary" />
            </motion.div>
          )}
        </div>

        {/* Icon */}
        {getNodeIcon(node, depth)}

        {/* Name */}
        <div className="flex-1 min-w-0" onClick={handleSelect}>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'truncate',
                depth === 0 && 'text-[16px] font-semibold text-text-primary',
                depth === 1 && 'text-[14px] font-medium text-text-primary',
                depth === 2 && 'text-[14px] text-text-primary',
                depth >= 3 && 'text-[13px] text-text-primary',
              )}
            >
              {getNodeName(node)}
            </span>
            {node.type === 'pvr' && (
              <PvrStatusBadge trend={getPvrTrend(node)} />
            )}
          </div>
          {node.type === 'area_manager' && (
            <p className="text-[11px] text-text-muted truncate">
              {(node.data as AreaManager).email}
            </p>
          )}
          {node.type === 'pvr' && (
            <p className="text-[11px] text-text-muted">
              {(node.data as PVR).code} &middot; {(node.data as PVR).city}
            </p>
          )}
          {node.type === 'agent' && (
            <p className="text-[11px] text-text-muted">
              {(node.data as Agent).code} &middot; Commissione {(node.data as Agent).commission_rate}%
            </p>
          )}
        </div>

        {/* Right stats */}
        <div className="flex items-center gap-4 flex-shrink-0">
          {/* Health */}
          {'health_score' in node.data &&
            (node.data as { health_score?: number | null }).health_score != null &&
            node.type !== 'agent' && (
              <div className="flex-shrink-0">
                {node.type === 'player' ? (
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: getHealthColor((node.data as { health_score?: number | null }).health_score ?? null) }}
                  />
                ) : (
                  <HealthRing
                    score={(node.data as { health_score?: number | null }).health_score ?? null}
                    size={depth === 0 ? 48 : depth === 1 ? 40 : 36}
                    strokeWidth={3}
                    showLabel={depth < 3}
                  />
                )}
              </div>
            )}

          {/* Metrics */}
          <div className="flex items-center gap-4 text-[12px] text-text-muted">
            {node.type === 'region' && (
              <>
                <span>{node.children.length} AM</span>
                <span>{node.children.reduce((s, am) => s + am.children.length, 0)} PVR</span>
                <span className="text-text-primary font-mono">
                  {formatCurrency(getRegionTotalRake(node))}
                </span>
              </>
            )}
            {node.type === 'area_manager' && (
              <>
                <span>{node.children.length} PVR</span>
                <span className="text-text-primary font-mono">
                  {formatCurrency(getAmTotalRake(node))}
                </span>
              </>
            )}
            {node.type === 'pvr' && (
              <>
                {dataStore.agents.length > 0 ? (
                  <>
                    <span>{node.children.length} Agenti</span>
                    <span>
                      {node.children.reduce((s, a) => s + a.children.length, 0)} Giocatori
                    </span>
                  </>
                ) : (
                  <span>{node.children.length} Giocatori</span>
                )}
                <span className="text-text-primary font-mono">
                  {formatCurrency(getPvrTotalRake(node))}
                </span>
                {(node.data as PVR).fido != null && (
                  <FidoBar
                    used={num(node.data, 'fido_used')}
                    total={Math.max(num(node.data, 'fido'), 1)}
                  />
                )}
              </>
            )}
            {node.type === 'agent' && (
              <>
                <span>{node.children.length} Giocatori</span>
                <span className="text-text-primary font-mono">
                  {formatCurrency(getAgentTotalRake(node))}
                </span>
              </>
            )}
            {node.type === 'player' && (
              <div className="flex items-center gap-3">
                <span className="text-text-primary font-mono">
                  {formatCurrency(num(node.data, 'total_rake'))}
                </span>
                <span>{(node.data as Player).active_days}gg</span>
                <StatusBadge status={(node.data as Player).status} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Children */}
      <AnimatePresence initial={false}>
        {isExpanded && hasChildren && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }}
            className="overflow-hidden"
          >
            {node.children.map((child, i) => (
              <TreeRow
                key={`${child.type}-${child.id}`}
                node={child}
                depth={depth + 1}
                expanded={expanded}
                onToggle={onToggle}
                onSelect={onSelect}
                searchQuery={searchQuery}
                index={i}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/* ─── helpers ─── */
function getNodeName(node: TreeNode): string {
  const d = node.data as unknown as Record<string, unknown>
  if ('name' in d) return String(d.name)
  if ('username' in d) return String(d.username)
  return String(d.id || '')
}

function getNodeIcon(node: TreeNode, depth: number) {
  const size = depth === 0 ? 18 : depth === 1 ? 16 : 14
  const className = 'flex-shrink-0 text-text-secondary'
  switch (node.type) {
    case 'region':
      return <MapPin size={size} className={className} />
    case 'area_manager':
      return <UserCog size={size} className={className} />
    case 'pvr':
      return <Store size={size} className={className} />
    case 'agent':
      return <User size={size} className={className} />
    case 'player':
      return <Gamepad2 size={size} className={className} />
    default:
      return null
  }
}

function getPvrTrend(node: TreeNode): 'up' | 'down' | 'stable' | null {
  const hs = (node.data as PVR).health_score
  if (hs == null) return null
  if (hs >= 75) return 'up'
  if (hs >= 50) return 'stable'
  return 'down'
}

function pvrTotal(pvrId: string): { rake: number; bet: number } {
  return dataStore.pvr_totals[pvrId] ?? { rake: 0, bet: 0 }
}

function sumPlayerRake(node: TreeNode): number {
  if (node.type === 'player') return num(node.data, 'total_rake')
  return node.children.reduce((s, c) => s + sumPlayerRake(c), 0)
}

function getRegionTotalRake(node: TreeNode): number {
  return node.children.reduce((s, am) => s + getAmTotalRake(am), 0)
}

function getAmTotalRake(node: TreeNode): number {
  return node.children.reduce((s, pvr) => s + getPvrTotalRake(pvr), 0)
}

function getPvrTotalRake(node: TreeNode): number {
  // The virtual "unassigned" bucket is for orphan players only and must not
  // be added to the network total (player totals are not authoritative for PVR totals).
  if (node.id === '__unassigned__') return 0
  if (node.type === 'pvr') {
    const totals = pvrTotal(node.id as string)
    if (totals.rake !== 0) return totals.rake
  }
  // Fallback to mapped players until daily_pvr_stats covers the period
  return sumPlayerRake(node)
}

function getAgentTotalRake(node: TreeNode): number {
  return sumPlayerRake(node)
}

function getBreadcrumbPath(node: TreeNode): string[] {
  const tree = buildTree()
  const buildPath = (nodes: TreeNode[], target: TreeNode, currentPath: string[]): string[] | null => {
    for (const n of nodes) {
      const newPath = [...currentPath, getNodeName(n)]
      if (n.type === target.type && n.id === target.id) return newPath
      const found = buildPath(n.children, target, newPath)
      if (found) return found
    }
    return null
  }
  return buildPath(tree, node, []) || [getNodeName(node)]
}

/* ─── Network Summary Bar ─── */
function NetworkSummary({ tree }: { tree: TreeNode[] }) {
  const totalRake = tree.reduce((s, r) => s + getRegionTotalRake(r), 0)
  const totalPlayers = dataStore.players.length
  const healthScores = dataStore.pvrs.map((p) => p.health_score).filter((h): h is number => h != null)
  const avgHealth = healthScores.length > 0 ? healthScores.reduce((s, h) => s + h, 0) / healthScores.length : null

  return (
    <motion.div
      initial={{ y: 48, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4, delay: 0.5, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }}
      className="sticky bottom-0 left-0 right-0 h-12 bg-bg-surface-elevated border-t border-border-subtle flex items-center px-6 gap-8 z-20"
    >
      {avgHealth != null ? (
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-text-muted">Health Media Rete:</span>
          <div className="flex items-center gap-2">
            <div className="w-[200px] h-1.5 bg-bg-surface-highlight rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: getHealthColor(avgHealth) }}
                initial={{ width: 0 }}
                animate={{ width: `${avgHealth}%` }}
                transition={{ duration: 0.8, delay: 0.6 }}
              />
            </div>
            <span className="text-[12px] text-text-primary font-mono font-medium">
              {Math.round(avgHealth)}/100
            </span>
          </div>
        </div>
      ) : (
        <span className="text-[12px] text-text-muted">Health Media Rete: N/D</span>
      )}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-text-muted">Rake Totale:</span>
        <span className="text-[12px] text-text-primary font-mono font-medium">
          {formatCurrency(totalRake)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-text-muted">Giocatori Totali:</span>
        <span className="text-[12px] text-text-primary font-mono font-medium">{totalPlayers}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-text-muted">PVR:</span>
        <span className="text-[12px] text-text-primary font-mono font-medium">
          {dataStore.pvrs.length}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-text-muted">Agenti:</span>
        <span className="text-[12px] text-text-primary font-mono font-medium">
          {dataStore.agents.length}
        </span>
      </div>
    </motion.div>
  )
}

/* ─── Main Page ─── */
export default function NetworkPage() {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [selected, setSelected] = useState<SelectedEntity | null>(null)
  const [regionFilter, setRegionFilter] = useState('all')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    loadData().then(() => setReady(true))
  }, [])

  const tree = useMemo(() => buildTree(), [ready])

  const toggleExpanded = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }, [])

  const expandAll = useCallback(() => {
    const allKeys = new Set<string>()
    const collect = (nodes: TreeNode[]) => {
      for (const n of nodes) {
        if (n.children.length > 0) {
          allKeys.add(`${n.type}-${n.id}`)
          collect(n.children)
        }
      }
    }
    collect(tree)
    setExpanded(allKeys)
  }, [tree])

  const collapseAll = useCallback(() => {
    setExpanded(new Set())
  }, [])

  const handleSelect = useCallback((node: TreeNode, breadcrumb: string[]) => {
    setSelected({ node, breadcrumb })
  }, [])

  // Stats
  const stats = useMemo(() => {
    const regions = tree.length
    const ams = tree.reduce((s, r) => s + r.children.length, 0)
    const pvrs = dataStore.pvrs.length
    const agents = dataStore.agents.length
    const players = dataStore.players.length
    return { regions, ams, pvrs, agents, players }
  }, [tree])

  // Filter tree by region
  const filteredTree = useMemo(() => {
    if (regionFilter === 'all') return tree
    return tree.filter((r) => getNodeName(r).toLowerCase() === regionFilter.toLowerCase())
  }, [tree, regionFilter])

  // Unique region names for filter
  const regionNames = useMemo(() => tree.map((r) => getNodeName(r)), [tree])

  return (
    <div className="p-6 pb-0 min-h-[calc(100dvh-64px)] flex flex-col relative">
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="mb-4"
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[28px] font-bold leading-tight tracking-[-0.01em] text-text-primary">
              Rete Commerciale
            </h1>
            <p className="text-[13px] text-text-muted mt-1">
              <span className="hover:text-text-secondary cursor-pointer">Dashboard</span>
              <span className="mx-1.5">/</span>
              <span className="text-text-secondary">Rete</span>
            </p>
          </div>
          <div className="text-[13px] text-text-secondary">
            <span className="font-mono">{stats.regions}</span> Regioni &middot;{' '}
            <span className="font-mono">{stats.ams}</span> Area Manager &middot;{' '}
            <span className="font-mono">{stats.pvrs}</span> PVR &middot;{' '}
            <span className="font-mono">{stats.agents}</span> Agenti &middot;{' '}
            <span className="font-mono">{stats.players}</span> Giocatori
          </div>
        </div>
      </motion.div>

      {/* Filter Bar */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.1 }}
        className="flex items-center gap-3 mb-4 bg-bg-surface rounded-xl border border-border-subtle p-3"
      >
        {/* Region filter */}
        <div className="relative">
          <select
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
            className="appearance-none bg-bg-surface-elevated text-text-primary text-[13px] rounded-lg px-3 pr-8 py-2 border border-border-default focus:border-border-focus focus:outline-none cursor-pointer"
          >
            <option value="all">Tutte le Regioni</option>
            {regionNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <ChevronDownIcon size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 bg-bg-surface-elevated rounded-lg px-3 py-2 border border-border-default focus-within:border-border-focus flex-1 max-w-[400px]">
          <Search size={16} className="text-text-muted flex-shrink-0" />
          <input
            type="text"
            placeholder="Cerca PVR, agente, giocatore..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent border-none outline-none text-[13px] text-text-primary placeholder:text-text-muted w-full"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-text-muted hover:text-text-primary">
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex-1" />

        {/* Expand/Collapse */}
        <button
          onClick={expandAll}
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-bg-surface-elevated text-[12px] text-text-secondary hover:bg-bg-surface-highlight hover:text-text-primary transition-colors border border-border-default"
        >
          <Expand size={14} />
          Espandi
        </button>
        <button
          onClick={collapseAll}
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-bg-surface-elevated text-[12px] text-text-secondary hover:bg-bg-surface-highlight hover:text-text-primary transition-colors border border-border-default"
        >
          <ChevronRight size={14} />
          Comprimi
        </button>
      </motion.div>

      {/* Tree View */}
      <div className="flex flex-1 gap-4" style={{ marginRight: selected ? 436 : 0 }}>
        <div className="flex-1 bg-bg-surface rounded-xl border border-border-subtle overflow-hidden">
          <div className="overflow-y-auto" style={{ maxHeight: 'calc(100dvh - 64px - 180px)' }}>
            {filteredTree.map((node, i) => (
              <TreeRow
                key={`${node.type}-${node.id}`}
                node={node}
                depth={0}
                expanded={expanded}
                onToggle={toggleExpanded}
                onSelect={handleSelect}
                searchQuery={searchQuery}
                index={i}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Detail Panel */}
      <AnimatePresence>
        {selected && (
          <DetailPanel selected={selected} onClose={() => setSelected(null)} />
        )}
      </AnimatePresence>

      {/* Summary Bar */}
      <NetworkSummary tree={tree} />
    </div>
  )
}
