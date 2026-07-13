import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";

interface UploadRecord {
  id: string;
  filename: string;
  file_type: string | null;
  status: string;
  rows_processed: number;
  error_message: string | null;
  uploaded_at: string;
}

const STATUS_ICONS: Record<string, typeof CheckCircle2> = {
  completed: CheckCircle2, processing: Loader2, pending: Loader2, error: XCircle,
};
const STATUS_COLORS: Record<string, string> = {
  completed: "text-emerald-400", processing: "text-amber-400", pending: "text-slate-400", error: "text-red-400",
};
const STATUS_LABELS: Record<string, string> = {
  completed: "Completato", processing: "In elaborazione...", pending: "In attesa...", error: "Errore",
};

function parseNum(val: unknown): number {
  if (val === null || val === undefined) return 0;
  const s = String(val).trim();
  if (s === "" || s === "None") return 0;
  const cleaned = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return (isNaN(n) || !isFinite(n)) ? 0 : n;
}

function parseDate(val: unknown): string | null {
  if (!val) return null;
  const s = String(val).trim();
  if (/^\d{4}[\/-]\d{2}[\/-]\d{2}$/.test(s)) return s.replace(/\//g, "-");
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) { const [d, m, y] = s.split("/"); return `${y}-${m}-${d}`; }
  return null;
}

function parseDt(val: unknown): string | null {
  if (!val) return null;
  const s = String(val).trim().replace(/\/\/\s*/, "");
  if (!s) return null;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2}:\d{2})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}T${m[4]}` : null;
}

function detectType(headers: string[]): string {
  const h = headers.map(x => x.toLowerCase().trim());
  if (h.includes("ticket") && h.includes("stato")) return "tickets";
  if (h.includes("gioco")) return "daily_player_game";
  if (h.some(x => x.includes("liv 1"))) return "daily_pvr";
  if (h[0] === "username" && !h.includes("data")) return "player_summary";
  if (h[0] === "data" && !h.includes("username")) return "daily_network";
  return "daily_player";
}

async function upsertPlayer(username: string): Promise<string | null> {
  if (!username) return null;
  const { data: ex } = await supabase.from("players").select("id").eq("username", username).maybeSingle();
  if (ex) return (ex as any).id;
  const { data: cr } = await (supabase.from("players") as any).insert({ username }).select("id").single();
  return (cr as any)?.id || null;
}

async function upsertPvr(eid: string, name: string): Promise<string | null> {
  if (!eid) return null;
  const { data: ex } = await supabase.from("pvrs").select("id").eq("exalogic_id", eid).maybeSingle();
  if (ex) { await (supabase.from("pvrs") as any).update({ name }).eq("id", (ex as any).id); return (ex as any).id; }
  const { data: cr } = await (supabase.from("pvrs") as any).insert({ exalogic_id: eid, name }).select("id").single();
  return (cr as any)?.id || null;
}

export default function UploadPage() {
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number; filename: string } | null>(null);
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
      // Read file in browser
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];

      if (aoa.length < 2) throw new Error("File Excel vuoto");

      const rawHeaders = (aoa[0] || []).map((h: unknown) => String(h || "").trim());
      const ftype = detectType(rawHeaders);
      const headers = [...rawHeaders];
      if (ftype === "daily_player_game") { headers[1] = "Provider"; headers[2] = "GameName"; }

      const rows = aoa.slice(1).map(r => {
        const o: Record<string, unknown> = {};
        headers.forEach((h, i) => { o[h] = r[i]; });
        return o;
      });

      // Create upload record
      await (supabase.from("excel_uploads") as any).insert({ filename: file.name, status: "processing" });
      setProgress({ current: 0, total: rows.length, filename: file.name });

      let cnt = 0;
      for (let ri = 0; ri < rows.length; ri++) {
        const row = rows[ri];
        const fv = row[headers[0]];
        if (fv === undefined || fv === null || String(fv).trim() === "" || String(fv).trim() === "None") continue;

        const date = parseDate(row["Data"] || row["data"]);
        const username = String(row["Username"] || row["username"] || "").trim();
        const stats = {
          buy_in: parseNum(row["Buy In"]), buy_in_bonus: parseNum(row["Buy In Bonus"]),
          stack: parseNum(row["Stack"]), bet: parseNum(row["Bet"]),
          won: parseNum(row["Won"]), rake: parseNum(row["Rake"]),
          payout: parseNum(row["Payout"]), bet_bonus: parseNum(row["Bet Bonus"]),
          jackpot: parseNum(row["Jackpot"]), jackpot_won: parseNum(row["Jackpot Won"]),
          overlay: parseNum(row["Overlay"]), refund: parseNum(row["Refund"]),
        };

        if (ftype === "tickets") {
          const tc = String(row["Ticket"] || ""); if (!tc) continue;
          const pid = await upsertPlayer(username);
          await (supabase.from("tickets") as any).upsert({
            ticket_code: tc, player_id: pid,
            pvr_code: String(row["Codice Padre"] || ""),
            emission_date: parseDt(row["Data Emissione"]),
            status: String(row["Stato"] || "").trim(),
            competition_date: parseDate(row["Data Competenza"]),
            amount: parseNum(row["Importo"]), win_amount: parseNum(row["Importo vincita"]),
            events_count: parseInt(String(row["Eventi"] || "0")) || 0,
            payment_date: parseDt(row["Data Pagamento"]),
          }, { onConflict: "ticket_code" });
          cnt++; continue;
        }

        if (ftype === "daily_pvr") {
          const eid = String(row["ID Liv 1"] || ""), nm = String(row["Liv 1"] || "");
          if (!eid || !nm || !date) continue;
          const pid = await upsertPvr(eid, nm);
          if (pid) await (supabase.from("daily_pvr_stats") as any).upsert({ pvr_id: pid, date, ...stats }, { onConflict: "pvr_id,date" });
          cnt++; continue;
        }

        if (ftype === "daily_network") {
          if (!date) continue;
          await (supabase.from("daily_network_stats") as any).upsert({ date, ...stats }, { onConflict: "date" });
          cnt++; continue;
        }

        if (ftype === "player_summary") {
          const pid = await upsertPlayer(username);
          if (pid) await (supabase.from("daily_player_stats") as any).upsert({ player_id: pid, date: "2026-06-30", ...stats }, { onConflict: "player_id,date" });
          cnt++; continue;
        }

        if (!username || !date) continue;
        const pid = await upsertPlayer(username);
        if (!pid) continue;

        if (ftype === "daily_player_game") {
          const prov = String(row["Provider"] || "").trim(), gn = String(row["GameName"] || "").trim();
          if (prov && gn) {
            await (supabase.from("game_types") as any).upsert({ provider: prov, game_name: gn }, { onConflict: "provider,game_name" });
            await (supabase.from("daily_player_game_stats") as any).upsert({ player_id: pid, provider: prov, game_name: gn, date, ...stats }, { onConflict: "player_id,provider,game_name,date" });
          }
        } else {
          await (supabase.from("daily_player_stats") as any).upsert({ player_id: pid, date, ...stats }, { onConflict: "player_id,date" });
        }
        await (supabase.from("players") as any).update({ last_seen_date: date }).eq("id", pid);
        cnt++;
        if (cnt % 50 === 0) setProgress({ current: cnt, total: rows.length, filename: file.name });
      }

      await (supabase.from("excel_uploads") as any).insert({ filename: file.name, status: "completed", rows_processed: cnt, file_type: ftype });
      setProgress(null);
      setMessage({ type: "success", text: `"${file.name}" elaborato: ${cnt} righe (${ftype})` });

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessage({ type: "error", text: msg });
      setProgress(null);
    } finally {
      setUploading(false);
      fetchUploads();
    }
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    Array.from(e.dataTransfer.files).filter(f => f.name.match(/\.(xlsx|xls|csv)$/i)).forEach(processFile);
  }, []);
  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    Array.from(e.target.files || []).forEach(processFile);
    e.target.value = "";
  }, []);

  return (
    <div className="p-6 space-y-6">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h1 className="text-2xl font-bold text-white">Importa Dati</h1>
        <p className="text-text-secondary mt-1">Carica i file Excel esportati da Exalogic. Elaborazione direttamente nel browser.</p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className={cn("relative border-2 border-dashed rounded-xl p-12 text-center transition-all duration-200 cursor-pointer",
          dragOver ? "border-accent-purple bg-accent-purple/5" : "border-border-subtle hover:border-text-secondary/40 bg-bg-surface-elevated/50")}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => document.getElementById("file-input")?.click()}>
        <input id="file-input" type="file" accept=".xlsx,.xls,.csv" multiple className="hidden" onChange={handleFileInput} />
        {uploading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-10 h-10 text-accent-purple animate-spin" />
            <p className="text-text-secondary">Elaborazione in corso...</p>
            {progress && <p className="text-xs text-text-secondary">{progress.current}/{progress.total} righe</p>}
          </div>
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
