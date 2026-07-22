import { motion, AnimatePresence } from "framer-motion";
import { X, FileSpreadsheet, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatAnalysisMonth } from "@/lib/analysisMonth";
import type { ImportFileType } from "@/lib/importPipeline";
import type { ImportValidationIssue } from "@/lib/importPipeline";

interface ImportPreviewProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  fileName: string;
  expectedType: ImportFileType;
  detectedType: string;
  selectedMonth: string;
  periodStart: string | null;
  periodEnd: string | null;
  totalRows: number;
  validRows: number;
  existingRows: number;
  issues: ImportValidationIssue[];
  monthValid: boolean;
  monthStatus: string;
  monthMessage: string;
  loading?: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  pvr_hierarchy: "Gerarchia PVR",
  daily_network: "Giocato totale rete x giorno",
  daily_pvr: "Giocato per singolo PVR giornaliero",
  daily_player: "Giocato per conto e data",
  daily_player_game: "Giocato per giocatore/tipologia/giorno",
  tickets: "Ticket scommesse",
  player_summary: "Gioca player di tutta la rete",
  pvr_summary: "Giocato totale per singolo PVR",
  category_summary: "Giocato totale suddiviso per tipologia",
  players_master: "Anagrafica giocatori",
};

export default function ImportPreview({
  open,
  onClose,
  onConfirm,
  fileName,
  expectedType,
  detectedType,
  selectedMonth,
  periodStart,
  periodEnd,
  totalRows,
  validRows,
  existingRows,
  issues,
  monthValid,
  monthStatus,
  monthMessage,
  loading,
}: ImportPreviewProps) {
  const monthLabel = (() => {
    try {
      return formatAnalysisMonth(selectedMonth);
    } catch {
      return selectedMonth;
    }
  })();

  const typeLabel = TYPE_LABELS[detectedType] || detectedType;

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("it-IT");
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-bg-surface-elevated rounded-2xl border border-border-subtle shadow-2xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <FileSpreadsheet size={20} className="text-accent-purple" />
                <h3 className="text-lg font-semibold text-white">Conferma importazione</h3>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-white/5 text-text-muted hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* File info */}
            <div className="bg-bg-surface rounded-xl p-4 mb-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-text-secondary">File</span>
                <span className="text-white font-medium truncate ml-2 max-w-[180px]">{fileName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Dataset</span>
                <span className="text-white font-medium">{typeLabel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Mese selezionato</span>
                <span className="text-white font-medium">{monthLabel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Periodo rilevato</span>
                <span className="text-white font-medium">
                  {formatDate(periodStart)} – {formatDate(periodEnd)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Righe lette</span>
                <span className="text-white font-medium">{totalRows}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Righe con data valida</span>
                <span className="text-white font-medium">{validRows}</span>
              </div>
              {issues.filter((i) => i.level === "error").length > 0 && (
                <div className="flex justify-between">
                  <span className="text-text-secondary">Righe con errori</span>
                  <span className="text-red-400 font-medium">
                    {issues.filter((i) => i.level === "error").length}
                  </span>
                </div>
              )}
              {existingRows > 0 && (
                <div className="flex justify-between">
                  <span className="text-text-secondary">Record già presenti</span>
                  <span className="text-amber-400 font-medium">{existingRows.toLocaleString("it-IT")}</span>
                </div>
              )}
            </div>

            {/* Month validation */}
            <div className={cn(
              "rounded-xl p-4 mb-4 flex items-start gap-3",
              monthValid
                ? "bg-emerald-500/10 border border-emerald-500/20"
                : "bg-red-500/10 border border-red-500/20"
            )}>
              {monthValid ? (
                <CheckCircle2 size={18} className="text-emerald-400 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
              )}
              <div>
                <p className={cn("text-sm font-semibold", monthValid ? "text-emerald-400" : "text-red-400")}>
                  Coerenza mese: {monthStatus === "not_applicable" ? "non applicabile" : monthStatus === "valid" ? "valida" : monthStatus}
                </p>
                <p className="text-xs text-text-secondary mt-1">{monthMessage}</p>
              </div>
            </div>

            {/* Type mismatch warning */}
            {detectedType !== expectedType && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-4 flex items-start gap-3">
                <AlertTriangle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-400">Tipo file non corrispondente</p>
                  <p className="text-xs text-text-secondary mt-1">
                    Hai selezionato &quot;{TYPE_LABELS[expectedType] || expectedType}&quot;, ma il file è stato riconosciuto come &quot;{typeLabel}&quot;.
                    {monthValid ? "" : " Nessun dato sarà importato."}
                  </p>
                </div>
              </div>
            )}

            {/* Issues list (errors only) */}
            {issues.filter((i) => i.level === "error").length > 0 && (
              <div className="mb-4 max-h-32 overflow-y-auto space-y-1">
                {issues.filter((i) => i.level === "error").map((issue, idx) => (
                  <div key={idx} className="text-xs text-red-400 bg-red-500/5 rounded-lg px-3 py-1.5">
                    Riga {issue.row}: {issue.field} — {issue.reason}
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2.5 rounded-xl border border-border-subtle text-sm font-medium text-text-secondary
                           hover:bg-white/5 transition-colors"
              >
                Annulla
              </button>
              <button
                onClick={onConfirm}
                disabled={loading || !monthValid || detectedType !== expectedType}
                className={cn(
                  "flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all",
                  loading || !monthValid || detectedType !== expectedType
                    ? "bg-accent-purple/30 cursor-not-allowed"
                    : "bg-accent-purple hover:bg-accent-purple/90"
                )}
              >
                {loading ? "Importazione..." : "Conferma importazione"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
