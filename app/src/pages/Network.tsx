import { useState, useMemo, useCallback, useEffect } from 'react'
import { Link } from 'react-router-dom'
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
import InfoTooltip from '@/components/InfoTooltip'
import type {
  Region,
  AreaManager,
  PVR,
  Agent,
  Player,
} from '@/lib/data'
import { normalizeAnalysisMonth, analysisMonthToRange } from '@/lib/analysisMonth'
import MonthSelector from '@/components/upload/MonthSelector'

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
  if (total <= 0) return null
  const pct = Math.min(Math.max((used / total) * 100, 0), 100)
  const color = pct >= 95 ? 'bg-negative' : pct >= 85 ? 'bg-warning' : 'bg-positive'
  return (
    <div className="flex items-center gap-2" title={`Fido: ${pct.toFixed(0)}% utilizzato (${formatCurrency(used)} su ${formatCurrency(total)})`}>
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
    return { id: pvr.id, type: 'pvr' as EntityType, data: pvr, children: playerNodes }
  }

  // Build agent lookup by name
  const agentByName = new Map<string, Agent>()
  for (const a of agents) { agentByName.set(a.name, a) }

  // Track which PVRs are already assigned to agents
  const assignedPvrIds = new Set<string>()
  const agentNodes: TreeNode[] = []

  for (const agent of agents) {
    // PVRs under this agent (matched by pvrIds from fetchNetworkHierarchy)
    const agentPvrs = agent.pvrIds
      .map((pid: string) => pvrs.find((p) => p.id === pid))
      .filter(Boolean) as PVR[]
    for (const p of agentPvrs) assignedPvrIds.add(p.id)
    agentNodes.push({
      id: agent.id,
      type: 'agent' as EntityType,
      data: agent,
      children: agentPvrs.map(buildPvrNode),
    })
  }

  // Direct PVRs (not under any agent)
  const directPvrs = pvrs.filter((p) => !assignedPvrIds.has(p.id))
  const directPvrNodes = directPvrs.map(buildPvrNode)

  // Giocatori senza PVR
  const unassignedPlayers = players.filter((pl) => !pl.pvr_id)
  if (unassignedPlayers.length > 0) {
    directPvrNodes.push({
      id: '__unassigned__', type: 'pvr',
      data: { id: '__unassigned__', code: '', name: 'Senza PVR (' + unassignedPlayers.length + ')', area_manager_id: 0, region_id: 0 } as PVR,
      children: unassignedPlayers.map((pl) => ({ id: pl.id, type: 'player' as EntityType, data: pl, children: [] })),
    })
  }

  // Root: company → agents + direct PVRs
  return [{
    id: 'company',
    type: 'area_manager' as EntityType,
    data: { id: 0, name: 'BET SERVICES SRL', region_id: 0, email: '', phone: '' } as AreaManager,
    children: [...agentNodes, ...directPvrNodes],
  }]
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
          {node.type === 'pvr' && (node.data as PVR).code ? (node.data as PVR).code : nodeName}
        </h2>
        {node.type === 'pvr' && (node.data as PVR).name && (
          <p className="text-[13px] text-text-secondary mt-0.5">{getNodeName(node)}</p>
        )}
        {breadcrumb.length > 0 && (
          <p className="text-[12px] text-text-muted mt-1.5">{breadcrumb.join(' > ')}</p>
        )}
      </div>

      {/* Content */}
      <div className="p-6 space-y-6">
        {/* KPI Grid */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-2 gap-3"
        >
          {node.type === 'pvr' && (
            <>
              <KpiCard label="Rake Totale" value={formatCurrency(getPvrTotalRake(node))} help="Rake del PVR nel mese. Fonte: daily_pvr_stats, con fallback alla somma dei giocatori se manca." />
              <KpiCard label="Giocatori" value={String(node.children.length)} help="Numero di giocatori assegnati a questo PVR (figli nell'albero)." />
              {(node.data as PVR).fido != null && (
                <KpiCard label="Fido" value={formatCurrency(num(node.data, 'fido'))} help="Fido (credito) assegnato al PVR. Fonte: anagrafica PVR." />
              )}
              {(node.data as PVR).saldo != null && (
                <KpiCard label="Saldo" value={formatCurrency(num(node.data, 'saldo'))} help="Saldo attuale del PVR. Fonte: anagrafica PVR." />
              )}
            </>
          )}
          {node.type === 'agent' && (
            <>
              <KpiCard label="PVR" value={String(node.children.length)} />
              <KpiCard label="Rake" value={formatCurrency(getAgentTotalRake(node))} />
            </>
          )}
          {node.type === 'player' && (
            <>
              <KpiCard label="Rake Totale" value={formatCurrency(num(node.data, 'total_rake'))} help="Rake del giocatore nel mese. Fonte: daily_player_stats." />
              <KpiCard label="Bet Totale" value={formatCurrency(num(node.data, 'total_bet'))} help="Totale giocato dal giocatore. Fonte: daily_player_stats." />
              <KpiCard label="Payout" value={`${num(node.data, 'avg_payout').toFixed(1)}%`} help="Won/Bet×100. Percentuale restituita al giocatore." />
              <KpiCard label="Giorni Attivi" value={`${num(node.data, 'active_days')}/30`} help="Giorni con almeno una giocata su 30. Fonte: daily_player_stats." />
            </>
          )}
          {node.type === 'region' && (
            <>
              <KpiCard label="Area Manager" value={String(node.children.length)} />
              <KpiCard label="PVR" value={String(node.children.reduce((s, am) => s + am.children.length, 0))} />
            </>
          )}
          {node.type === 'area_manager' && (
            <>
              <KpiCard label="PVR" value={String(node.children.length)} />
            </>
          )}
        </motion.div>

        {/* Player AI Insight — removed: health_score always null */}

        {/* Agent Player List — removed: agent children are PVRs, not players */}
      </div>
    </motion.div>
  )
}

function KpiCard({ label, value, help }: { label: string; value: string; help?: string }) {
  return (
    <div className="bg-bg-surface-elevated rounded-lg p-3">
      <p className="text-[11px] text-text-muted mb-1 flex items-center gap-1">{label} {help && <InfoTooltip content={help} />}</p>
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
  const matchesSearch = searchQuery === '' || nodeMatchesQuery(node, searchQuery.toLowerCase())
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
              {node.type === 'pvr' && (node.data as PVR).code ? (node.data as PVR).code : getNodeName(node)}
            </span>
          </div>
          {node.type === 'area_manager' && (
            <p className="text-[11px] text-text-muted truncate">
              {(node.data as AreaManager).email}
            </p>
          )}
          {node.type === 'pvr' && (
            <p className="text-[11px] text-text-muted truncate">
              {getNodeName(node)}{(node.data as PVR).city ? ` &middot; ${(node.data as PVR).city}` : ''}
            </p>
          )}
          {node.type === 'agent' && (
            <p className="text-[11px] text-text-muted">
              {(node.data as Agent).code}
            </p>
          )}
        </div>

        {/* Right stats */}
        <div className="flex items-center gap-4 flex-shrink-0">
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
                <span>{node.children.length} Giocatori</span>
                <span className="text-text-primary font-mono">
                  {formatCurrency(getPvrTotalRake(node))}
                </span>
                {(node.data as PVR).fido != null && num(node.data, 'fido') > 0 && (
                  <FidoBar
                    used={num(node.data, 'fido_used')}
                    total={num(node.data, 'fido')}
                  />
                )}
              </>
            )}
            {node.type === 'agent' && (
              <>
                <span>{node.children.length} PVR</span>
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

/** Cerca per nome, username E codice (MW...) */
function nodeMatchesQuery(node: TreeNode, q: string): boolean {
  const d = node.data as unknown as Record<string, unknown>
  if (String(d.name || '').toLowerCase().includes(q)) return true
  if (String(d.username || '').toLowerCase().includes(q)) return true
  if (String(d.code || '').toLowerCase().includes(q)) return true
  return false
}

/** Filtra l'albero tenendo solo i rami che contengono corrispondenze */
function filterTreeBySearch(nodes: TreeNode[], q: string): TreeNode[] {
  if (!q) return nodes
  return nodes
    .map((n) => {
      const children = filterTreeBySearch(n.children, q)
      if (nodeMatchesQuery(n, q) || children.length > 0) {
        return { ...n, children }
      }
      return null
    })
    .filter((n): n is TreeNode => n !== null)
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
  return node.children.reduce((s, pvr) => s + getPvrTotalRake(pvr), 0)
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
  const totalRake = tree.reduce((s, r) => s + getAmTotalRake(r), 0)
  const totalPlayers = dataStore.players.length

  return (
    <motion.div
      initial={{ y: 48, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4, delay: 0.5, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }}
      className="sticky bottom-0 left-0 right-0 h-12 bg-bg-surface-elevated border-t border-border-subtle flex items-center px-6 gap-8 z-20"
    >
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-text-muted">Rake Totale:</span>
        <span className="text-[12px] text-text-primary font-mono font-medium">
          {formatCurrency(totalRake)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-text-muted">Giocatori:</span>
        <span className="text-[12px] text-text-primary font-mono font-medium">{totalPlayers}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-text-muted">PVR:</span>
        <span className="text-[12px] text-text-primary font-mono font-medium">
          {dataStore.pvrs.length}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-text-muted">Attivi:</span>
        <span className="text-[12px] text-positive font-mono font-medium">
          {dataStore.pvrs.filter(p => p.status === 'ATTIVO' || p.status === 'active').length}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-text-muted">Chiusi/BLOCCATI:</span>
        <span className="text-[12px] text-negative font-mono font-medium">
          {dataStore.pvrs.filter(p => p.status === 'CHIUSO' || p.status === 'BLOCCATO').length}
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
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search)
    const urlMonth = params.get('month')
    if (urlMonth) {
      try { return normalizeAnalysisMonth(urlMonth) } catch { /* ignore */ }
    }
    const stored = localStorage.getItem('analysisMonth')
    if (stored) {
      try { return normalizeAnalysisMonth(stored) } catch { /* ignore */ }
    }
    return ''
  })

  const loadMonth = useCallback((month: string) => {
    loadData(analysisMonthToRange(month)).then(() => setReady(true))
  }, [])

  const handleMonthChange = useCallback((month: string) => {
    setSelectedMonth(month)
    localStorage.setItem('analysisMonth', month)
    const url = new URL(window.location.href)
    url.searchParams.set('month', month)
    window.history.replaceState({}, '', url.toString())
    loadMonth(month)
  }, [loadMonth])

  useEffect(() => {
    if (selectedMonth) {
      loadMonth(selectedMonth)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Auto-expand tutto durante la ricerca, così i risultati sono visibili
  useEffect(() => {
    if (searchQuery) {
      expandAll()
    }
  }, [searchQuery, expandAll])

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

  // Filter tree by region and search
  const filteredTree = useMemo(() => {
    let base = tree
    if (regionFilter !== 'all') {
      base = tree.filter((r) => getNodeName(r).toLowerCase() === regionFilter.toLowerCase())
    }
    if (searchQuery) {
      base = filterTreeBySearch(base, searchQuery.toLowerCase())
    }
    return base
  }, [tree, regionFilter, searchQuery])

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
              <Link to="/dashboard" className="hover:text-text-secondary cursor-pointer">Dashboard</Link>
              <span className="mx-1.5">/</span>
              <span className="text-text-secondary">Rete</span>
            </p>
          </div>
          <div className="flex items-center gap-4">
          <MonthSelector selectedMonth={selectedMonth} onMonthChange={handleMonthChange} />
          <div className="text-[13px] text-text-secondary">
            <span className="font-mono">{stats.regions}</span> Regioni &middot;{' '}
            <span className="font-mono">{stats.ams}</span> Area Manager &middot;{' '}
            <span className="font-mono">{stats.pvrs}</span> PVR &middot;{' '}
            <span className="font-mono">{stats.agents}</span> Agenti &middot;{' '}
            <span className="font-mono">{stats.players}</span> Giocatori
          </div>
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
        {/* Agente filter */}
        <div className="relative">
          <select
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
            className="appearance-none bg-bg-surface-elevated text-text-primary text-[13px] rounded-lg px-3 pr-8 py-2 border border-border-default focus:border-border-focus focus:outline-none cursor-pointer"
          >
            <option value="all">Tutti gli Agenti</option>
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
