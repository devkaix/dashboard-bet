import type { MonthlyDatasetStatus } from "@/lib/monthlyDatasetStatus";

interface MonthCompletenessProps {
  statuses: MonthlyDatasetStatus[];
}

const ANALYSIS_RULES = [
  {
    label: "Analisi rete",
    check: (s: MonthlyDatasetStatus[]) =>
      s.some((x) => x.fileType === "daily_network" && x.rowCount > 0),
  },
  {
    label: "Analisi PVR",
    check: (s: MonthlyDatasetStatus[]) =>
      s.some((x) => x.fileType === "daily_network" && x.rowCount > 0) &&
      s.some((x) => x.fileType === "daily_pvr" && x.rowCount > 0),
  },
  {
    label: "Analisi provider",
    check: (s: MonthlyDatasetStatus[]) =>
      s.some((x) => x.fileType === "daily_player_game" && x.rowCount > 0),
  },
  {
    label: "Analisi giocatori",
    check: (s: MonthlyDatasetStatus[]) =>
      s.some((x) => x.fileType === "daily_player" && x.rowCount > 0),
  },
  {
    label: "Evidenze ticket",
    check: (s: MonthlyDatasetStatus[]) =>
      s.some((x) => x.fileType === "tickets" && x.rowCount > 0),
  },
];

export default function MonthCompleteness({ statuses }: MonthCompletenessProps) {
  const results = ANALYSIS_RULES.map((rule) => ({
    label: rule.label,
    ready: rule.check(statuses),
  }));

  return (
    <div className="bg-bg-surface rounded-xl p-4 border border-border-subtle">
      <h3 className="text-sm font-semibold text-text-primary mb-3">Stato analisi del mese</h3>
      <div className="space-y-2">
        {results.map((r) => (
          <div key={r.label} className="flex items-center justify-between text-xs">
            <span className="text-text-secondary">{r.label}</span>
            {r.ready ? (
              <span className="text-emerald-400 font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                Pronta
              </span>
            ) : (
              <span className="text-amber-400 font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                Incompleta
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
