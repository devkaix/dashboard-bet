import type { MonthlyDatasetStatus } from "@/lib/monthlyDatasetStatus";

interface MonthCompletenessProps {
  statuses: MonthlyDatasetStatus[];
}

interface Rule {
  label: string;
  check: (s: MonthlyDatasetStatus[]) => boolean;
}

const OPERATIONAL_RULES: Rule[] = [
  {
    label: "Rete giornaliera",
    check: (s) => s.some((x) => x.fileType === "daily_pvr" && x.rowCount > 0),
  },
  {
    label: "Analisi PVR",
    check: (s) => s.some((x) => x.fileType === "daily_pvr" && x.rowCount > 0),
  },
  {
    label: "Provider e giochi",
    check: (s) => s.some((x) => x.fileType === "daily_player_game" && x.rowCount > 0),
  },
  {
    label: "Analisi giocatori",
    check: (s) => s.some((x) => x.fileType === "daily_player_game" && x.rowCount > 0),
  },
  {
    label: "Evidenze ticket",
    check: (s) => s.some((x) => x.fileType === "tickets" && x.rowCount > 0),
  },
];

const CONTROL_RULES: Rule[] = [
  {
    label: "Quadratura rete (daily_network)",
    check: (s) => s.some((x) => x.fileType === "daily_network" && x.state === "complete"),
  },
  {
    label: "Quadratura giocatori (daily_player)",
    check: (s) => s.some((x) => x.fileType === "daily_player" && x.state === "complete"),
  },
  {
    label: "Riepilogo mensile",
    check: (s) => s.some((x) => x.fileType === "player_summary" && x.state === "complete"),
  },
];

function RuleList({ title, rules, statuses }: { title: string; rules: Rule[]; statuses: MonthlyDatasetStatus[] }) {
  const results = rules.map((rule) => ({
    label: rule.label,
    ready: rule.check(statuses),
  }));

  return (
    <div>
      <h4 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">{title}</h4>
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

export default function MonthCompleteness({ statuses }: MonthCompletenessProps) {
  return (
    <div className="bg-bg-surface rounded-xl p-4 border border-border-subtle">
      <h3 className="text-sm font-semibold text-text-primary mb-3">Stato analisi del mese</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <RuleList title="Dati operativi" rules={OPERATIONAL_RULES} statuses={statuses} />
        <RuleList title="Controlli di quadratura" rules={CONTROL_RULES} statuses={statuses} />
      </div>
    </div>
  );
}
