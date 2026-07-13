import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

interface UploadRecord {
  id: string; filename: string; file_type: string | null; status: string;
  rows_processed: number; error_message: string | null; uploaded_at: string;
}

const STATUS_ICONS: Record<string, typeof CheckCircle2> = { completed: CheckCircle2, processing: Loader2, pending: Loader2, error: XCircle };
const STATUS_COLORS: Record<string, string> = { completed: "text-emerald-400", processing: "text-amber-400", pending: "text-slate-400", error: "text-red-400" };
const STATUS_LABELS: Record<string, string> = { completed: "Completato", processing: "In elaborazione...", pending: "In attesa...", error: "Errore" };

const FN_URL = "https://sktclykuktqaufaaoqui.supabase.co/functions/v1/process-excel-upload";

export default function UploadPage() {
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchUploads = useCallback(async () => {
    const { data } = await supabase.from("excel_uploads").select("*").order("uploaded_at", { ascending: false }).limit(10);
    setUploads((data || []) as UploadRecord[]);
  }, []);

  useEffect(() => {
    fetchUploads();
    const t = setInterval(fetchUploads, 5000);
    return () => clearInterval(t);
  }, [fetchUploads]);

  async function processFile(file: File) {
    setUploading(true);
    setMessage(null);
    try {
      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch(FN_URL, { method: "POST", body: fd });
      const result = await res.json();

      if (!res.ok) throw new Error(result.error || `Errore server (${res.status})`);

      setMessage({ type: "success", text: `"${file.name}" elaborato: ${result.rowsProcessed} righe (${result.fileType})` });
    } catch (err: unknown) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setUploading(false);
      fetchUploads();
    }
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    Array.from(e.dataTransfer.files).filter(f => /\.(xlsx|xls|csv)$/i.test(f.name)).forEach(processFile);
  }, []);
  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    Array.from(e.target.files || []).forEach(processFile);
    e.target.value = "";
  }, []);

  return (
    <div className="p-6 space-y-6">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h1 className="text-2xl font-bold text-white">Importa Dati</h1>
        <p className="text-text-secondary mt-1">Trascina qui i file .xlsx/.xls/.csv — elaborazione automatica.</p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className={cn("relative border-2 border-dashed rounded-xl p-12 text-center transition-all duration-200 cursor-pointer",
          dragOver ? "border-accent-purple bg-accent-purple/5" : "border-border-subtle hover:border-text-secondary/40 bg-bg-surface-elevated/50")}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop}
        onClick={() => document.getElementById("file-input")?.click()}>
        <input id="file-input" type="file" accept=".xlsx,.xls,.csv" multiple className="hidden" onChange={handleFileInput} />
        {uploading ? (
          <div className="flex flex-col items-center gap-3"><Loader2 className="w-10 h-10 text-accent-purple animate-spin" /><p className="text-text-secondary">Elaborazione in corso...</p></div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-accent-purple/10 flex items-center justify-center"><Upload className="w-7 h-7 text-accent-purple" /></div>
            <p className="text-white font-medium">Trascina i file Excel qui</p>
            <p className="text-text-secondary text-sm mt-1">.xlsx, .xls, .csv</p>
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {message && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className={cn("p-4 rounded-lg flex items-center gap-3", message.type === "success" ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400" : "bg-red-500/10 border border-red-500/20 text-red-400")}>
            {message.type === "success" ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" /> : <XCircle className="w-5 h-5 flex-shrink-0" />}
            <span className="text-sm">{message.text}</span>
            <button onClick={() => setMessage(null)} className="ml-auto text-current opacity-60 hover:opacity-100"><XCircle className="w-4 h-4" /></button>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="bg-bg-surface-elevated rounded-xl border border-border-subtle overflow-hidden">
        <div className="px-5 py-3 border-b border-border-subtle flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Storico Upload</h2>
          <button onClick={fetchUploads} className="p-1.5 rounded-lg hover:bg-white/5 text-text-secondary hover:text-white"><RefreshCw className="w-4 h-4" /></button>
        </div>
        {uploads.length === 0 ? (
          <div className="p-8 text-center text-text-secondary text-sm"><FileSpreadsheet className="w-8 h-8 mx-auto mb-2 opacity-40" />Nessun upload</div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {uploads.map(u => {
              const Icon = STATUS_ICONS[u.status] || FileSpreadsheet;
              return (
                <div key={u.id} className="px-5 py-3 flex items-center gap-3 hover:bg-white/[0.02]">
                  <Icon className={cn("w-5 h-5 flex-shrink-0", STATUS_COLORS[u.status] || "text-slate-400", (u.status === "processing" || u.status === "pending") ? "animate-spin" : "")} />
                  <div className="flex-1 min-w-0"><p className="text-sm text-white truncate">{u.filename}</p><p className="text-xs text-text-secondary">{u.file_type} · {u.rows_processed} righe · {new Date(u.uploaded_at).toLocaleDateString("it-IT")}</p></div>
                  <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", u.status === "completed" && "bg-emerald-500/10 text-emerald-400", u.status === "processing" && "bg-amber-500/10 text-amber-400", u.status === "error" && "bg-red-500/10 text-red-400")}>{STATUS_LABELS[u.status] || u.status}</span>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>
    </div>
  );
}
