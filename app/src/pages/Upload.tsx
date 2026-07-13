import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";

interface UploadRecord {
  id: string; filename: string; file_type: string | null; status: string;
  rows_processed: number; error_message: string | null; uploaded_at: string;
}

const ICONS: Record<string, typeof CheckCircle2> = { completed: CheckCircle2, processing: Loader2, pending: Loader2, error: XCircle };
const COLS: Record<string, string> = { completed: "text-emerald-400", processing: "text-amber-400", pending: "text-slate-400", error: "text-red-400" };
const LABS: Record<string, string> = { completed: "Completato", processing: "In elaborazione...", pending: "In attesa...", error: "Errore" };

function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  const s = String(v).trim();
  if (s === "" || s === "None") return 0;
  const commaCount = (s.match(/,/g) || []).length;
  const dotCount = (s.match(/\./g) || []).length;
  let clean = s;
  if (commaCount > 0 && dotCount > 0) {
    clean = s.replace(/\./g, "").replace(",", ".");
  } else if (commaCount > 1) {
    clean = s.replace(/,/g, "");
  } else if (commaCount === 1) {
    clean = s.replace(",", ".");
  } else if (dotCount > 1) {
    clean = s.replace(/\./g, "").replace(",", ".");
  }
  const n = parseFloat(clean);
  return (isNaN(n) || !isFinite(n)) ? 0 : n;
}

function fixSheetRange(ws: any) {
  const keys = Object.keys(ws).filter((k) => !k.startsWith("!"));
  if (!keys.length) return;
  let minRow = Infinity, maxRow = -Infinity, minCol = Infinity, maxCol = -Infinity;
  keys.forEach((addr) => {
    const cell = XLSX.utils.decode_cell(addr);
    minRow = Math.min(minRow, cell.r);
    maxRow = Math.max(maxRow, cell.r);
    minCol = Math.min(minCol, cell.c);
    maxCol = Math.max(maxCol, cell.c);
  });
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: minRow, c: minCol }, e: { r: maxRow, c: maxCol } });
}

function check(label: string, res: { data?: any; error?: any }) {
  if (res.error) throw new Error(`${label}: ${res.error.message || JSON.stringify(res.error)}`);
}
function pDate(v: unknown): string | null {
  if (!v) return null;
  const s = String(v).trim();
  if (/^\d{4}[\/-]\d{2}[\/-]\d{2}$/.test(s)) return s.replace(/\//g, "-");
  const p = s.split("/");
  if (p.length === 3) return p[0].length === 4 ? `${p[0]}-${p[1].padStart(2,"0")}-${p[2].padStart(2,"0")}` : `${p[2]}-${p[1].padStart(2,"0")}-${p[0].padStart(2,"0")}`;
  return null;
}
function pDt(v: unknown): string | null {
  if (!v) return null;
  const s = String(v).trim().replace(/\/\/\s*/, "");
  if (!s) return null;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2}:\d{2})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}T${m[4]}` : null;
}
function det(hdr: string[]): string {
  const h = hdr.map(x => x.toLowerCase().trim());
  if (h.includes("ticket") && h.includes("stato")) return "tickets";
  if (h.includes("gioco")) return "daily_player_game";
  if (h.some(x => x.includes("liv 1"))) return "daily_pvr";
  if (h[0] === "username" && !h.includes("data")) return "player_summary";
  if (h[0] === "data" && !h.includes("username")) return "daily_network";
  return "daily_player";
}

async function upPlayer(u: string): Promise<string|null> {
  if (!u) return null;
  const { data: ex, error: e1 } = await supabase.from("players").select("id").eq("username", u).maybeSingle();
  if (e1) throw new Error(`lookup player: ${e1.message}`);
  if (ex) return (ex as any).id;
  const { data: cr, error: e2 } = await (supabase.from("players") as any).insert({ username: u }).select("id").single();
  if (e2) throw new Error(`insert player: ${e2.message}`);
  return (cr as any)?.id || null;
}
async function upPvr(eid: string, nm: string): Promise<string|null> {
  const { data: ex, error: e1 } = await supabase.from("pvrs").select("id").eq("exalogic_id", eid).maybeSingle();
  if (e1) throw new Error(`lookup pvr: ${e1.message}`);
  if (ex) {
    check("update pvr", await (supabase.from("pvrs") as any).update({ name: nm }).eq("id", (ex as any).id));
    return (ex as any).id;
  }
  const { data: cr, error: e2 } = await (supabase.from("pvrs") as any).insert({ exalogic_id: eid, name: nm }).select("id").single();
  if (e2) throw new Error(`insert pvr: ${e2.message}`);
  return (cr as any)?.id || null;
}

export default function UploadPage() {
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchUploads = useCallback(async () => {
    const { data } = await supabase.from("excel_uploads").select("*").order("uploaded_at", { ascending: false }).limit(10);
    setUploads((data || []) as UploadRecord[]);
  }, []);
  useEffect(() => { fetchUploads(); const t = setInterval(fetchUploads, 5000); return () => clearInterval(t); }, [fetchUploads]);

  async function processFile(file: File) {
    setUploading(true); setMessage(null); setProgress("Lettura file...");
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
      const sn = wb.SheetNames[0];
      if (!sn) throw new Error("Nessun foglio Excel trovato");
      const ws = wb.Sheets[sn];
      fixSheetRange(ws);
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as unknown[][];
      if (aoa.length < 2) throw new Error("File vuoto: nessun dato");
      setProgress(`Trovate ${aoa.length - 1} righe...`);

      const raw = (aoa[0] || []).map((h: unknown) => String(h || "").trim());
      const ft = det(raw);
      const hdr = [...raw];
      if (ft === "daily_player_game") { hdr[1] = "Provider"; hdr[2] = "GameName"; }
      const rows = aoa.slice(1).map(r => { const o: Record<string,unknown>={}; hdr.forEach((h,i)=>{o[h]=r[i]}); return o; });

      setProgress(`Elaborazione ${ft}...`);
      let cnt = 0;

      for (const row of rows) {
        const fv = row[hdr[0]];
        if (fv === undefined || fv === null || ["", "None"].includes(String(fv).trim())) continue;
        const date = pDate(row["Data"] || row["data"]);
        const uname = String(row["Username"] || row["username"] || "").trim();
        const stats = {
          buy_in: num(row["Buy In"]), buy_in_bonus: num(row["Buy In Bonus"]), stack: num(row["Stack"]),
          bet: num(row["Bet"]), won: num(row["Won"]), rake: num(row["Rake"]), payout: num(row["Payout"]),
          bet_bonus: num(row["Bet Bonus"]), jackpot: num(row["Jackpot"]), jackpot_won: num(row["Jackpot Won"]),
          overlay: num(row["Overlay"]), refund: num(row["Refund"]),
        };

        if (ft === "tickets") {
          const tc = String(row["Ticket"] || ""); if (!tc) continue;
          const pid = await upPlayer(uname);
          check("upsert tickets", await (supabase.from("tickets") as any).upsert({
            ticket_code: tc, player_id: pid, pvr_code: String(row["Codice Padre"] || ""),
            emission_date: pDt(row["Data Emissione"]), status: String(row["Stato"] || "").trim(),
            competition_date: pDate(row["Data Competenza"]), amount: num(row["Importo"]),
            win_amount: num(row["Importo vincita"]), events_count: parseInt(String(row["Eventi"] || "0")) || 0,
            payment_date: pDt(row["Data Pagamento"]),
          }, { onConflict: "ticket_code" }));
          cnt++; continue;
        }
        if (ft === "daily_pvr") {
          const eid = String(row["ID Liv 1"] || ""), nm = String(row["Liv 1"] || "");
          if (!eid || !nm || !date) continue;
          const pid = await upPvr(eid, nm);
          if (pid) check("upsert daily_pvr_stats", await (supabase.from("daily_pvr_stats") as any).upsert({ pvr_id: pid, date, ...stats }, { onConflict: "pvr_id,date" }));
          cnt++; continue;
        }
        if (ft === "daily_network") {
          if (!date) continue;
          check("upsert daily_network_stats", await (supabase.from("daily_network_stats") as any).upsert({ date, ...stats }, { onConflict: "date" }));
          cnt++; continue;
        }
        if (ft === "player_summary") {
          const pid = await upPlayer(uname);
          if (pid) check("upsert player_summary", await (supabase.from("daily_player_stats") as any).upsert({ player_id: pid, date: "2026-06-30", ...stats }, { onConflict: "player_id,date" }));
          cnt++; continue;
        }
        if (!uname || !date) continue;
        const pid = await upPlayer(uname); if (!pid) continue;
        if (ft === "daily_player_game") {
          const prov = String(row["Provider"] || "").trim(), gn = String(row["GameName"] || "").trim();
          if (prov && gn) {
            check("upsert game_types", await (supabase.from("game_types") as any).upsert({ provider: prov, game_name: gn }, { onConflict: "provider,game_name" }));
            check("upsert daily_player_game_stats", await (supabase.from("daily_player_game_stats") as any).upsert({ player_id: pid, provider: prov, game_name: gn, date, ...stats }, { onConflict: "player_id,provider,game_name,date" }));
          }
        } else {
          check("upsert daily_player_stats", await (supabase.from("daily_player_stats") as any).upsert({ player_id: pid, date, ...stats }, { onConflict: "player_id,date" }));
        }
        check("update player last_seen", await (supabase.from("players") as any).update({ last_seen_date: date }).eq("id", pid));
        cnt++;
        if (cnt % 100 === 0) setProgress(`${cnt} righe...`);
      }

      check("insert excel_uploads", await (supabase.from("excel_uploads") as any).insert({ filename: file.name, status: "completed", rows_processed: cnt, file_type: ft }));
      setProgress("");
      setMessage({ type: "success", text: `"${file.name}" → ${cnt} righe (${ft})` });
    } catch (err: unknown) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : String(err) });
      setProgress("");
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
    Array.from(e.target.files || []).forEach(processFile); e.target.value = "";
  }, []);

  return (
    <div className="p-6 space-y-6">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h1 className="text-2xl font-bold text-white">Importa Dati</h1>
        <p className="text-text-secondary mt-1">Elaborazione diretta nel browser — nessun passaggio intermedio.</p>
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className={cn("relative border-2 border-dashed rounded-xl p-12 text-center transition-all duration-200 cursor-pointer",
          dragOver ? "border-accent-purple bg-accent-purple/5" : "border-border-subtle hover:border-text-secondary/40 bg-bg-surface-elevated/50")}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop}
        onClick={() => document.getElementById("fx")?.click()}>
        <input id="fx" type="file" accept=".xlsx,.xls,.csv" multiple className="hidden" onChange={handleFileInput} />
        {uploading ? (
          <div className="flex flex-col items-center gap-3"><Loader2 className="w-10 h-10 text-accent-purple animate-spin" /><p className="text-text-secondary">{progress || "Elaborazione..."}</p></div>
        ) : (
          <div className="flex flex-col items-center gap-3"><div className="w-14 h-14 rounded-2xl bg-accent-purple/10 flex items-center justify-center"><Upload className="w-7 h-7 text-accent-purple" /></div><p className="text-white font-medium">Trascina i file Excel qui</p><p className="text-text-secondary text-sm">.xlsx .xls .csv</p></div>
        )}
      </motion.div>
      <AnimatePresence>{message && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          className={cn("p-4 rounded-lg flex items-center gap-3", message.type === "success" ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400" : "bg-red-500/10 border border-red-500/20 text-red-400")}>
          {message.type === "success" ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" /> : <XCircle className="w-5 h-5 flex-shrink-0" />}
          <span className="text-sm">{message.text}</span>
          <button onClick={() => setMessage(null)} className="ml-auto text-current opacity-60 hover:opacity-100"><XCircle className="w-4 h-4" /></button>
        </motion.div>
      )}</AnimatePresence>
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
            {uploads.map(u => { const Icon = ICONS[u.status] || FileSpreadsheet; return (
              <div key={u.id} className="px-5 py-3 flex items-center gap-3 hover:bg-white/[0.02]">
                <Icon className={cn("w-5 h-5 flex-shrink-0", COLS[u.status] || "text-slate-400", (u.status === "processing"||u.status==="pending")?"animate-spin":"")} />
                <div className="flex-1 min-w-0"><p className="text-sm text-white truncate">{u.filename}</p><p className="text-xs text-text-secondary">{u.file_type} · {u.rows_processed} righe · {new Date(u.uploaded_at).toLocaleDateString("it-IT")}</p></div>
                <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", u.status==="completed"&&"bg-emerald-500/10 text-emerald-400", u.status==="processing"&&"bg-amber-500/10 text-amber-400", u.status==="error"&&"bg-red-500/10 text-red-400")}>{LABS[u.status]||u.status}</span>
              </div>
            )})}
          </div>
        )}
      </motion.div>
    </div>
  );
}
