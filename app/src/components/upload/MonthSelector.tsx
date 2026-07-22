import { useEffect, useState } from "react";
import { Calendar, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  formatAnalysisMonth,
  normalizeAnalysisMonth,
  analysisMonthToRange,
} from "@/lib/analysisMonth";

interface MonthSelectorProps {
  selectedMonth: string;
  onMonthChange: (month: string) => void;
}

/**
 * Month selector that always allows any valid month via native <input type="month">.
 * Available months from the database are shown as quick-select chips.
 *
 * Priority: URL → localStorage → latest DB month → current month.
 */
export default function MonthSelector({ selectedMonth, onMonthChange }: MonthSelectorProps) {
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [dbLatestMonth, setDbLatestMonth] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Native <input type="month"> expects YYYY-MM
  const selectedMonthValue = selectedMonth || "";

  // Load available months and latest DB month for initialization
  useEffect(() => {
    async function load() {
      try {
        const { data, error } = await supabase
          .from("daily_network_stats")
          .select("date")
          .order("date", { ascending: false })
          .limit(500);

        if (error || !data) return;

        const months = new Set<string>();
        for (const row of data) {
          const d = (row as { date: string }).date;
          if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
            months.add(d.slice(0, 7));
          }
        }

        const sorted = Array.from(months).sort().reverse();
        setAvailableMonths(sorted);
        if (sorted.length > 0) {
          setDbLatestMonth(sorted[0]);
        }
      } catch {
        // Non-critical
      }
    }

    load();
  }, []);

  // Initialization: set month based on priority
  useEffect(() => {
    if (initialized) return;
    setInitialized(true);

    // Priority 1 & 2: URL and localStorage already handled in useState initializer
    // Priority 3: latest month from DB (only if no URL/localStorage override)
    const params = new URLSearchParams(window.location.search);
    const urlMonth = params.get("month");
    const stored = localStorage.getItem("analysisMonth");

    if (!urlMonth && !stored && dbLatestMonth) {
      try {
        const normalized = normalizeAnalysisMonth(dbLatestMonth);
        onMonthChange(normalized);
      } catch { /* ignore */ }
    }
  }, [dbLatestMonth, initialized, onMonthChange]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value; // YYYY-MM format
    if (!value) return;
    try {
      const normalized = normalizeAnalysisMonth(value);
      onMonthChange(normalized);
    } catch { /* ignore invalid */ }
  };

  const formattedMonth = (() => {
    try {
      return formatAnalysisMonth(selectedMonth);
    } catch {
      return selectedMonth;
    }
  })();

  // Filter available months to show only those different from selected
  const suggestionMonths = availableMonths.filter(
    (m) => m !== selectedMonth,
  ).slice(0, 8);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <Calendar size={18} className="text-accent-purple flex-shrink-0" />
        <span className="text-sm font-medium text-text-secondary">Mese di analisi</span>
        <input
          type="month"
          value={selectedMonthValue}
          onChange={handleInputChange}
          className="bg-bg-surface border border-border-subtle rounded-lg px-3 py-1.5
                     text-sm font-semibold text-white cursor-pointer hover:border-border-default
                     focus:outline-none focus:ring-1 focus:ring-accent-purple
                     [color-scheme:dark]"
        />
      </div>

      {/* Quick-select chips for available months */}
      {suggestionMonths.length > 0 && (
        <div className="flex items-center gap-1.5 pl-9 flex-wrap">
          <Sparkles size={11} className="text-text-muted flex-shrink-0" />
          {suggestionMonths.map((m) => (
            <button
              key={m}
              onClick={() => {
                try {
                  onMonthChange(normalizeAnalysisMonth(m));
                } catch { /* ignore */ }
              }}
              className="text-[11px] px-2 py-0.5 rounded-full bg-bg-surface border border-border-subtle
                         text-text-secondary hover:text-white hover:border-border-default
                         transition-colors"
            >
              {(() => { try { return formatAnalysisMonth(m); } catch { return m; } })()}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
