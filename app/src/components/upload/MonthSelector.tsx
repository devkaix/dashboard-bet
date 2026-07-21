import { useEffect, useState } from "react";
import { Calendar } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatAnalysisMonth, normalizeAnalysisMonth } from "@/lib/analysisMonth";

interface MonthSelectorProps {
  selectedMonth: string;
  onMonthChange: (month: string) => void;
}

export default function MonthSelector({ selectedMonth, onMonthChange }: MonthSelectorProps) {
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);

  useEffect(() => {
    async function load() {
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

      setAvailableMonths(Array.from(months).sort().reverse());
    }

    load();
  }, []);

  const formattedMonth = (() => {
    try {
      return formatAnalysisMonth(selectedMonth);
    } catch {
      return selectedMonth;
    }
  })();

  return (
    <div className="flex items-center gap-3">
      <Calendar size={18} className="text-accent-purple" />
      <span className="text-sm font-medium text-text-secondary">Mese di analisi</span>
      <div className="relative">
        <select
          value={selectedMonth}
          onChange={(e) => {
            try {
              const normalized = normalizeAnalysisMonth(e.target.value);
              onMonthChange(normalized);
            } catch {
              // ignore invalid
            }
          }}
          className="appearance-none bg-bg-surface border border-border-subtle rounded-lg px-3 py-1.5 pr-8
                     text-sm font-semibold text-white cursor-pointer hover:border-border-default
                     focus:outline-none focus:ring-1 focus:ring-accent-purple"
        >
          {availableMonths.length === 0 && (
            <option value={selectedMonth}>{formattedMonth}</option>
          )}
          {availableMonths.map((m) => (
            <option key={m} value={m}>
              {(() => { try { return formatAnalysisMonth(m); } catch { return m; } })()}
            </option>
          ))}
        </select>
        <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
          <svg className="w-3.5 h-3.5 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
    </div>
  );
}
