import { motion } from "framer-motion";
import { Upload, CheckCircle2, AlertTriangle, HelpCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MonthlyDatasetStatus } from "@/lib/monthlyDatasetStatus";
import { formatAnalysisMonth } from "@/lib/analysisMonth";

interface DatasetCardProps {
  status: MonthlyDatasetStatus;
  selectedMonth: string;
  onUpload: () => void;
  uploading?: boolean;
}

const STATE_ICONS: Record<string, typeof CheckCircle2> = {
  complete: CheckCircle2,
  partial: AlertTriangle,
  missing: Upload,
  mismatch: AlertTriangle,
  error: HelpCircle,
};

const STATE_COLORS: Record<string, string> = {
  complete: "text-emerald-400",
  partial: "text-amber-400",
  missing: "text-slate-400",
  mismatch: "text-amber-400",
  error: "text-red-400",
};

const STATE_BG: Record<string, string> = {
  complete: "bg-emerald-500/10",
  partial: "bg-amber-500/10",
  missing: "bg-slate-500/10",
  mismatch: "bg-amber-500/10",
  error: "bg-red-500/10",
};

const STATE_LABELS: Record<string, string> = {
  complete: "Completo",
  partial: "Parziale",
  missing: "Da caricare",
  mismatch: "Dati non coerenti",
  error: "Errore",
};

function formatPeriod(start: string | null, end: string | null): string {
  if (!start && !end) return "—";
  if (start && end && start === end) return start;
  const s = start ? new Date(start).toLocaleDateString("it-IT") : "—";
  const e = end ? new Date(end).toLocaleDateString("it-IT") : "—";
  return `${s} – ${e}`;
}

export default function DatasetCard({ status, selectedMonth, onUpload, uploading }: DatasetCardProps) {
  const Icon = STATE_ICONS[status.state] || Upload;
  const monthLabel = (() => {
    try {
      return formatAnalysisMonth(selectedMonth);
    } catch {
      return selectedMonth;
    }
  })();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.01 }}
      className={cn(
        "bg-bg-surface-elevated rounded-xl border border-border-subtle p-4",
        "hover:border-border-default transition-colors cursor-pointer",
        uploading && "opacity-60 pointer-events-none"
      )}
      onClick={onUpload}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-white">{status.label}</span>
        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", STATE_BG[status.state])}>
          <Icon size={16} className={STATE_COLORS[status.state]} />
        </div>
      </div>

      <div className="space-y-1.5 text-xs text-text-secondary">
        <div className="flex justify-between">
          <span>Stato</span>
          <span className={cn("font-medium", STATE_COLORS[status.state])}>
            {STATE_LABELS[status.state]}
          </span>
        </div>
        {status.rowCount > 0 && (
          <div className="flex justify-between">
            <span>Record</span>
            <span className="text-text-primary font-medium">{status.rowCount.toLocaleString("it-IT")}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span>Periodo</span>
          <span className="text-text-primary font-medium">{formatPeriod(status.periodStart, status.periodEnd)}</span>
        </div>
        {status.lastUploadAt && (
          <div className="flex justify-between">
            <span>Ultimo caricamento</span>
            <span className="text-text-primary font-medium">
              {new Date(status.lastUploadAt).toLocaleDateString("it-IT")}
            </span>
          </div>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-border-subtle flex items-center justify-between">
        <span className="text-[11px] text-text-muted">
          {monthLabel}
        </span>
        {uploading ? (
          <span className="flex items-center gap-1 text-xs text-amber-400">
            <Loader2 size={12} className="animate-spin" /> In corso
          </span>
        ) : (
          <span className={cn(
            "text-xs font-medium px-2 py-0.5 rounded-full",
            status.state === "missing"
              ? "bg-accent-purple/10 text-accent-purple"
              : "bg-emerald-500/10 text-emerald-400"
          )}>
            {status.state === "missing" ? "Carica" : "Aggiorna"}
          </span>
        )}
      </div>
    </motion.div>
  );
}
