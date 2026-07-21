import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import ExecutiveBriefingPage from './ExecutiveBriefing'
import type { ExecutiveBriefingResult } from '@/lib/executiveBriefing'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('@/lib/executiveBriefingData', () => ({
  loadExecutiveBriefingData: vi.fn(),
  inferLatestMonth: vi.fn(),
  resolveExecutiveMonth: vi.fn(() => '2026-06'),
}))

vi.mock('@/components/upload/MonthSelector', () => ({
  default: ({ selectedMonth }: { selectedMonth: string }) => (
    <div data-testid="month-selector">{selectedMonth}</div>
  ),
}))

import { loadExecutiveBriefingData, inferLatestMonth } from '@/lib/executiveBriefingData'

function baseResult(): ExecutiveBriefingResult {
  return {
    month: '2026-06',
    previousMonth: '2026-05',
    summary: ['Test summary.'],
    insights: [
      {
        id: 'i1',
        category: 'pvr_decline',
        severity: 'warning',
        priorityScore: 80,
        title: 'PVR Alpha in calo',
        summary: 'Alpha ha perso rake.',
        month: '2026-06',
        comparisonMonth: '2026-05',
        entity: 'pvr',
        entityId: 'pvr-alpha',
        entityName: 'PVR Alpha',
        currentValue: 500,
        previousValue: 1000,
        deltaAbs: -500,
        deltaPct: -0.5,
        economicImpact: 500,
        confidence: 'high',
        evidences: [{ label: 'Rake', value: 500, unit: 'eur' }],
        suggestedAction: 'contattare il PVR',
        drilldownUrl: '/pvr/pvr-alpha',
      },
    ],
    priorities: [
      {
        rank: 1,
        entity: 'pvr',
        entityId: 'pvr-alpha',
        entityName: 'PVR Alpha',
        reason: 'Calo significativo',
        impactEur: 500,
        confidence: 'high',
        sourceInsightIds: ['i1'],
        action: 'contattare il PVR',
        drilldownUrl: '/pvr/pvr-alpha',
      },
    ],
    availability: {
      currentMonth: '2026-06',
      previousMonth: '2026-05',
      currentCoveragePct: 1,
      previousCoveragePct: 1,
      currentDaysPresent: 30,
      previousDaysPresent: 30,
      currentExpectedDays: 30,
      previousExpectedDays: 30,
      comparisonAvailable: true,
      lastUploadDate: null,
      networkRake: 10000,
      pvrRakeSum: 10000,
      reconciliationDiffPct: 0,
      confidence: 'high',
      notes: [],
    },
    networkCurrent: {
      month: '2026-06',
      start: '2026-06-01',
      end: '2026-06-30',
      rake: 10000,
      bet: 100000,
      won: 90000,
      refund: 0,
      payout: 90,
      days: 30,
      negativeRakeDays: 0,
      worstDay: null,
      dailyRake: [],
    },
    networkPrevious: {
      month: '2026-05',
      start: '2026-05-01',
      end: '2026-05-31',
      rake: 12000,
      bet: 110000,
      won: 99000,
      refund: 0,
      payout: 90,
      days: 30,
      negativeRakeDays: 0,
      worstDay: null,
      dailyRake: [],
    },
    pvrsCurrent: [],
    pvrsPrevious: [],
    pvrContributions: [],
  }
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<ExecutiveBriefingPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ExecutiveBriefingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(inferLatestMonth).mockResolvedValue('2026-06')
  })

  it('shows loading state', () => {
    vi.mocked(loadExecutiveBriefingData).mockImplementation(() => new Promise(() => {}))
    renderPage()
    expect(screen.getByText(/Executive Briefing/i)).toBeInTheDocument()
    // The skeleton placeholders indicate loading
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument()
  })

  it('shows error state', async () => {
    vi.mocked(loadExecutiveBriefingData).mockRejectedValue(new Error('DB failure'))
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/DB failure/i)).toBeInTheDocument()
    })
  })

  it('renders summary, insights and priorities', async () => {
    vi.mocked(loadExecutiveBriefingData).mockResolvedValue(baseResult())
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/Test summary/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/PVR Alpha in calo/i)).toBeInTheDocument()
    expect(screen.getByText(/Priorità operative/i)).toBeInTheDocument()
  })

  it('navigates to PVR detail on insight click', async () => {
    vi.mocked(loadExecutiveBriefingData).mockResolvedValue(baseResult())
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/PVR Alpha in calo/i)).toBeInTheDocument()
    })
    await userEvent.click(screen.getByText(/PVR Alpha in calo/i))
    expect(mockNavigate).toHaveBeenCalledWith('/pvr/pvr-alpha?month=2026-06', { state: { insight: expect.any(Object) } })
  })

  it('shows empty state when no insights exist', async () => {
    const empty = { ...baseResult(), insights: [], priorities: [], summary: [] }
    vi.mocked(loadExecutiveBriefingData).mockResolvedValue(empty)
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/Nessun fenomeno significativo/i)).toBeInTheDocument()
    })
  })
})
