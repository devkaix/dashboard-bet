import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import { num, normalizeUsername, pDate, pDt, det, col } from "@/lib/uploadHelpers";
import { parseRequiredNumber, parseOptionalNumber, type ImportValidationIssue } from "@/lib/importPipeline";
import {
  normalizeAnalysisMonth,
  analysisMonthToRange,
  getMonthsFromDates,
  validateFileMonth,
  formatAnalysisMonth,
  type ImportFileType,
  type MonthValidationResult,
} from "@/lib/analysisMonth";
import { getMonthlyDatasetStatus, type MonthlyDatasetStatus } from "@/lib/monthlyDatasetStatus";
import MonthSelector from "@/components/upload/MonthSelector";
import DatasetCard from "@/components/upload/DatasetCard";
import ImportPreview from "@/components/upload/ImportPreview";
import MonthCompleteness from "@/components/upload/MonthCompleteness";

// ── Types ──────────────────────────────────────────────────────────────────

interface UploadRecord {
  id: string; filename: string; file_type: string | null; status: string;
  rows_processed: number; error_message: string | null; uploaded_at: string;
  file_hash: string | null; validation_status: string | null;
  analysis_month: string | null; expected_file_type: string | null;
  month_validation_status: string | null;
}

const ICONS: Record<string, typeof CheckCircle2> = {
  completed: CheckCircle2, processing: Loader2, pending: Loader2, error: XCircle,
};
const COLS: Record<string, string> = {
  completed: "text-emerald-400", processing: "text-amber-400", pending: "text-slate-400", error: "text-red-400",
};
const LABS: Record<string, string> = {
  completed: "Completato", processing: "In elaborazione...", pending: "In attesa...", error: "Errore",
};

// ── Helpers ────────────────────────────────────────────────────────────────

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

async function sha256(buf: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function getStats(row: Record<string, unknown>) {
  const betVal = num(col(row, ["Bet", "bet"]));
  const wonVal = num(col(row, ["Won", "won"]));
  const rakeVal = num(col(row, ["Rake", "rake"])); // Rake can be negative via num()
  return {
    buy_in: num(col(row, ["Buy In", "buy_in"])),
    buy_in_bonus: num(col(row, ["Buy In Bonus", "buy_in_bonus"])),
    stack: num(col(row, ["Stack", "stack"])),
    bet: betVal,
    won: wonVal,
    rake: rakeVal,
    payout: betVal !== 0 ? (wonVal / betVal) * 100 : 0,
    bet_bonus: num(col(row, ["Bet Bonus", "bet_bonus"])),
    jackpot: num(col(row, ["Jackpot", "jackpot"])),
    jackpot_won: num(col(row, ["Jackpot Won", "jackpot_won"])),
    overlay: num(col(row, ["Overlay", "overlay"])),
    refund: num(col(row, ["Refund", "refund"])),
  };
}

function normalizedContentHash(fileType: string, rows: Record<string, unknown>[]): Promise<string> {
  let normalized: string[];
  if (fileType === 'daily_player' || fileType === 'daily_network' || fileType === 'daily_pvr') {
    normalized = rows.map((r) => {
      const uname = normalizeUsername(String(r['Username'] || r['username'] || r['User'] || ''));
      const date = pDate(r['Data'] || r['data'] || r['Date'] || r['date']);
      const stats = getStats(r);
      return `${uname}|${date}|${stats.buy_in}|${stats.bet}|${stats.won}|${stats.rake}|${stats.payout}`;
    }).sort();
  } else if (fileType === 'tickets') {
    normalized = rows.map((r) => {
      const tc = String(r['Ticket'] || r['ticket'] || '');
      const amt = num(r['Importo'] || r['amount']);
      return `${tc}|${amt}`;
    }).sort();
  } else {
    normalized = rows.map((r) => JSON.stringify(r, Object.keys(r).sort())).sort();
  }
  const content = normalized.join('\n');
  return sha256(new TextEncoder().encode(content).buffer as ArrayBuffer);
}

async function checkDuplicateByContent(
  fileType: string,
  fileHash: string,
  normalizedHash: string,
): Promise<{ blocked: boolean; existingFilename?: string; existingDate?: string }> {
  const { data: byHash } = await supabase
    .from('excel_uploads')
    .select('filename, uploaded_at')
    .eq('file_hash', fileHash)
    .eq('status', 'completed')
    .eq('file_type', fileType)
    .maybeSingle();
  if (byHash) {
    return { blocked: true, existingFilename: (byHash as any).filename, existingDate: (byHash as any).uploaded_at };
  }
  const { data: byContent } = await supabase
    .from('excel_uploads')
    .select('filename, uploaded_at')
    .eq('normalized_hash' as any, normalizedHash)
    .eq('status', 'completed')
    .neq('file_hash', fileHash)
    .eq('file_type', fileType)
    .maybeSingle();
  if (byContent) {
    return { blocked: true, existingFilename: (byContent as any).filename, existingDate: (byContent as any).uploaded_at };
  }
  return { blocked: false };
}

async function batchUpsert(table: string, rows: any[], onConflict: string, chunkSize = 500) {
  const builder = (supabase as any).from(table);
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    check(`upsert ${table}`, await builder.upsert(chunk, { onConflict }));
  }
}

async function loadPvrMap() {
  const { data, error } = await supabase.from("pvr_reference_map").select("pvr_ref_code, pvr_id");
  if (error) throw new Error(`loadPvrMap: ${error.message}`);
  const map = new Map<string, string>();
  for (const r of data || []) {
    map.set((r as any).pvr_ref_code?.toLowerCase(), (r as any).pvr_id);
  }
  return map;
}

async function loadPlayerAliases() {
  const { data, error } = await supabase.from("player_username_aliases").select("alias_normalized, player_id");
  if (error) {
    console.error("loadPlayerAliases:", error);
    return new Map<string, string>();
  }
  const map = new Map<string, string>();
  for (const r of data || []) {
    map.set((r as any).alias_normalized, (r as any).player_id);
  }
  return map;
}

async function lookupPlayerIds(usernames: string[]): Promise<Map<string, { id: string; pvr_id: string | null }>> {
  const normalized = [...new Set(usernames.map(normalizeUsername))];
  const map = new Map<string, { id: string; pvr_id: string | null }>();

  const { data, error } = await supabase.from("players").select("id, username_normalized, pvr_id").in("username_normalized", normalized);
  if (error) throw new Error(`lookupPlayerIds: ${error.message}`);
  for (const row of data || []) {
    map.set((row as any).username_normalized, { id: (row as any).id, pvr_id: (row as any).pvr_id });
  }

  const aliases = await loadPlayerAliases();
  for (const uname of normalized) {
    if (!map.has(uname)) {
      const pid = aliases.get(uname);
      if (pid) map.set(uname, { id: pid, pvr_id: null });
    }
  }
  return map;
}

async function resolvePlayerIds(usernames: string[]): Promise<Map<string, { id: string; pvr_id: string | null }>> {
  const map = await lookupPlayerIds(usernames);
  const remaining = usernames.filter((u) => !map.has(normalizeUsername(u)));

  if (remaining.length > 0) {
    const inserts = remaining.map((u) => ({
      username: u,
      username_normalized: normalizeUsername(u),
    }));
    const { data, error } = await supabase.from("players").insert(inserts).select("id, username_normalized, pvr_id");
    if (error) throw new Error(`resolvePlayerIds insert: ${error.message}`);
    for (const row of data || []) {
      map.set((row as any).username_normalized, { id: (row as any).id, pvr_id: (row as any).pvr_id });
    }
  }
  return map;
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function UploadPage() {
  // ── State ──
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Month workspace
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    // URL param takes priority
    const params = new URLSearchParams(window.location.search);
    const urlMonth = params.get("month");
    if (urlMonth) {
      try { return normalizeAnalysisMonth(urlMonth); } catch { /* fall through */ }
    }
    // localStorage fallback
    const stored = localStorage.getItem("analysisMonth");
    if (stored) {
      try { return normalizeAnalysisMonth(stored); } catch { /* fall through */ }
    }
    // Default to current month
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const [monthlyStatuses, setMonthlyStatuses] = useState<MonthlyDatasetStatus[]>([]);
  const [statusLoading, setStatusLoading] = useState(false);

  // Import preview
  const [preview, setPreview] = useState<{
    file: File;
    fileType: string;
    expectedType: ImportFileType;
    rows: Record<string, unknown>[];
    monthResult: MonthValidationResult;
    issues: ImportValidationIssue[];
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingExpectedType, setPendingExpectedType] = useState<ImportFileType | null>(null);

  // ── Fetch uploads history ──
  const fetchUploads = useCallback(async () => {
    const { data } = await supabase
      .from("excel_uploads")
      .select("*")
      .order("uploaded_at", { ascending: false })
      .limit(20);
    setUploads((data || []) as unknown as UploadRecord[]);
  }, []);

  useEffect(() => {
    fetchUploads();
    const t = setInterval(fetchUploads, 5000);
    return () => clearInterval(t);
  }, [fetchUploads]);

  // ── Fetch monthly status ──
  const fetchMonthlyStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const statuses = await getMonthlyDatasetStatus(selectedMonth);
      setMonthlyStatuses(statuses);
    } catch (err) {
      console.error("getMonthlyDatasetStatus:", err);
    } finally {
      setStatusLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    fetchMonthlyStatus();
  }, [fetchMonthlyStatus]);

  // ── Save month to localStorage and URL ──
  const handleMonthChange = useCallback((month: string) => {
    setSelectedMonth(month);
    localStorage.setItem("analysisMonth", month);
    const url = new URL(window.location.href);
    url.searchParams.set("month", month);
    window.history.replaceState({}, "", url.toString());
  }, []);

  // ── Insert upload record ──
  async function insertUploadRecord(
    file: File,
    fileHash: string,
    fileType: string,
    rows: number,
    status: string,
    validationStatus: string | null,
    report: any,
    errorMsg?: string,
    analysisMonth?: string | null,
    expectedFileType?: string | null,
    monthValidationStatus?: string | null,
    detectedMonths?: string[] | null,
  ) {
    const dates = (report?.dates || []).filter(Boolean).sort();
    const periodStart = dates[0] || null;
    const periodEnd = dates[dates.length - 1] || null;
    check(
      "insert excel_uploads",
      await (supabase.from("excel_uploads") as any).insert({
        filename: file.name,
        file_hash: fileHash,
        normalized_hash: report?.normalized_hash || null,
        status,
        file_type: fileType,
        rows_processed: rows,
        error_message: errorMsg || null,
        period_start: periodStart,
        period_end: periodEnd,
        validation_status: validationStatus,
        validation_report: report,
        analysis_month: analysisMonth || null,
        expected_file_type: expectedFileType || null,
        month_validation_status: monthValidationStatus || null,
        detected_months: detectedMonths || null,
      })
    );
  }

  // ── Process file (existing logic, now with month context) ──
  async function processFile(file: File, expectedType?: ImportFileType, month?: string) {
    setUploading(true);
    setMessage(null);
    setProgress("Lettura file...");
    let fileType = "unknown";
    let fileHash = "";
    const report: any = {};

    try {
      const buf = await file.arrayBuffer();
      fileHash = await sha256(buf);

      const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
      const sn = wb.SheetNames[0];
      if (!sn) throw new Error("Nessun foglio Excel trovato");
      const ws = wb.Sheets[sn];
      fixSheetRange(ws);
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as unknown[][];
      if (aoa.length < 2) throw new Error("File vuoto: nessun dato");
      setProgress(`Trovate ${aoa.length - 1} righe...`);

      const raw = (aoa[0] || []).map((h: unknown) => String(h || "").trim());
      fileType = det(raw);

      // Block unknown file types immediately
      if (fileType === "unknown") {
        const found = raw.filter(h => h).join(", ");
        throw new Error(
          `Tipo file non riconosciuto. Intestazioni trovate: ${found || "(nessuna)"}. ` +
          `Intestazioni richieste per tipo:\n` +
          `- daily_player: Data, Username, Bet, Won, Rake\n` +
          `- daily_network: Data, Bet, Won, Rake\n` +
          `- daily_pvr: ID Liv 1, Liv 1, Data\n` +
          `- daily_player_game: Data, Data.1, Gioco, Username\n` +
          `- tickets: Ticket, Username, Codice Padre, Data Emissione, Stato\n` +
          `- players_master: user, PVR rif., stato, saldo, saldo prel, creato\n` +
          `- player_summary: Username, Bet, Won, Rake (senza Data)`
        );
      }

      // Type mismatch check (user clicked a specific card)
      if (expectedType && fileType !== expectedType) {
        throw new Error(
          `Hai selezionato "${getTypeLabel(expectedType)}", ma il file è stato riconosciuto come "${getTypeLabel(fileType)}". Nessun dato è stato importato.`
        );
      }

      const hdr = [...raw];
      const rows = aoa.slice(1).map((r) => {
        const o: Record<string, unknown> = {};
        hdr.forEach((h, i) => { o[h] = r[i]; });
        return o;
      });

      setProgress(`Elaborazione ${fileType}...`);
      report.file_type = fileType;
      report.total_rows = rows.length;
      report.errors = [];
      report.dates = [];
      report.unmatched_pvrs = [];
      report.unmatched_players = [];

      // Compute normalized content hash and check for duplicates
      const normHash = await normalizedContentHash(fileType, rows);
      report.normalized_hash = normHash;
      const dupCheck = await checkDuplicateByContent(fileType, fileHash, normHash);
      if (dupCheck.blocked) {
        throw new Error(
          `File duplicato: contenuto già importato il ${dupCheck.existingDate ? new Date(dupCheck.existingDate).toLocaleDateString('it-IT') : '?'} come "${dupCheck.existingFilename || 'sconosciuto'}". Stessi dati, importazione bloccata.`
        );
      }

      // ─── players_master ───
      if (fileType === "players_master") {
        const pvrMap = await loadPvrMap();
        const masterRows = rows.map((row) => {
          const uname = String(col(row, ["user", "Username", "username", "User"]) || "").trim();
          const refCode = String(col(row, ["PVR rif.", "PVR", "pvr_ref_code", "Pvr Ref Code", "Codice PVR", "Codice Padre"]) || "").trim();
          return {
            username: uname,
            username_normalized: normalizeUsername(uname),
            email: String(col(row, ["Email", "email", "E-mail"]) || "").trim() || null,
            pvr_ref_code: refCode || null,
            pvr_id: refCode ? pvrMap.get(refCode.toLowerCase()) || null : null,
            kyc_status: String(col(row, ["stato", "Kyc Status", "kyc_status", "KYC", "Stato KYC"]) || "").trim() || null,
            balance: num(col(row, ["saldo", "Balance", "balance"])),
            withdrawable_balance: num(col(row, ["saldo prel", "Withdrawable Balance", "withdrawable_balance"])),
            registration_date: pDt(col(row, ["creato", "Registration Date", "registration_date", "Data Registrazione"])) || pDate(col(row, ["creato", "Registration Date", "registration_date", "Data Registrazione"])),
          };
        }).filter((r) => r.username);

        const playerMap = await resolvePlayerIds(masterRows.map((r) => r.username));
        const upserts = masterRows.map((r) => {
          const resolved = playerMap.get(r.username_normalized);
          if (!resolved) report.unmatched_players.push(r.username);
          const pvrId = r.pvr_id ?? resolved?.pvr_id ?? null;
          return { id: resolved?.id, ...r, pvr_id: pvrId };
        }).filter((r) => r.id);

        if (upserts.length > 0) {
          await batchUpsert("players", upserts, "id", 500);
        }

        for (const r of masterRows) {
          if (r.pvr_ref_code && !r.pvr_id) report.unmatched_pvrs.push(r.pvr_ref_code);
        }

        await insertUploadRecord(
          file, fileHash, fileType, masterRows.length, "completed", "validated", report,
          undefined, month || null, expectedType || null,
          "not_applicable", null
        );

        setProgress("");
        setMessage({ type: "success", text: `"${file.name}" → ${masterRows.length} giocatori aggiornati (${fileType})` });
        return;
      }

      // ─── player_summary ───
      if (fileType === "player_summary") {
        const summaryRows = rows.map((row) => {
          const uname = String(col(row, ["Username", "username", "User"]) || "").trim();
          return {
            username: uname,
            username_normalized: normalizeUsername(uname),
            ...getStats(row),
          };
        }).filter((r) => r.username);

        const targetMonth = month || null;
        report.target_month = targetMonth;

        const playerMap = await lookupPlayerIds(summaryRows.map((r) => r.username));
        const playerIds = [...new Set([...playerMap.values()].map((p) => p.id))].filter(Boolean);

        let dbTotals: any[] = [];
        if (playerIds.length > 0 && targetMonth) {
          const { data, error } = await supabase
            .from("monthly_player_stats_v")
            .select("*")
            .in("player_id", playerIds)
            .eq("month", targetMonth);
          if (error) throw new Error(`monthly_player_stats_v: ${error.message}`);
          dbTotals = data || [];
        }

        const mismatches: string[] = [];
        for (const r of summaryRows) {
          const pid = playerMap.get(r.username_normalized)?.id;
          if (!pid) {
            report.unmatched_players.push(r.username);
            continue;
          }
          const db = dbTotals.find((x: any) => x.player_id === pid);
          const eps = 0.01;
          if (db) {
            if (Math.abs(num(db.rake) - r.rake) > eps || Math.abs(num(db.bet) - r.bet) > eps || Math.abs(num(db.won) - r.won) > eps) {
              mismatches.push(r.username);
            }
          } else {
            mismatches.push(r.username);
          }
        }

        report.mismatches = mismatches;
        report.validated_rows = summaryRows.length - mismatches.length - report.unmatched_players.length;
        const validationStatus = mismatches.length === 0 ? "validated" : "mismatch";

        // Month validation: player_summary uses selected month
        const monthResult = validateFileMonth("player_summary", rows, targetMonth);

        await insertUploadRecord(
          file, fileHash, fileType, summaryRows.length, "completed", validationStatus, report,
          undefined, targetMonth, expectedType || null,
          monthResult.status, monthResult.detectedMonths
        );

        setProgress("");
        if (mismatches.length > 0) {
          setMessage({ type: "error", text: `"${file.name}" → ${summaryRows.length} righe; ${mismatches.length} mismatch con i dati giornalieri per ${targetMonth}.` });
        } else {
          setMessage({ type: "success", text: `"${file.name}" → ${summaryRows.length} righe validate per ${targetMonth} (${fileType}, non importato)` });
        }
        return;
      }

      // ─── Month validation for monthly file types ───
      const analysisMonth = month || null;
      const monthResult = validateFileMonth(fileType as ImportFileType, rows, analysisMonth);

      if (fileType !== "players_master" && fileType !== "player_summary") {
        if (!monthResult.valid) {
          const monthLabel = analysisMonth ? (() => { try { return formatAnalysisMonth(analysisMonth); } catch { return analysisMonth; } })() : "selezionato";
          let errMsg = "";
          if (monthResult.status === "multiple_months") {
            errMsg = `Il file contiene più mesi (${monthResult.detectedMonths.join(", ")}). Dividere il file prima del caricamento.`;
          } else if (monthResult.status === "month_mismatch") {
            errMsg = `Il file contiene dati del mese ${monthResult.detectedMonths[0]}, ma hai selezionato ${monthLabel}.`;
          } else if (monthResult.status === "missing_date") {
            errMsg = "Nessuna data valida trovata nel file.";
          }
          throw new Error(`Importazione bloccata. ${errMsg}`);
        }
      }

      // ─── Daily/ticket processing ───
      const usernames: string[] = [];
      const pvrKeys: { eid: string; name: string }[] = [];
      const dailyPlayerRows: any[] = [];
      const dailyPvrRows: any[] = [];
      const dailyNetworkRows: any[] = [];
      const dailyGameRows: any[] = [];
      const ticketRows: any[] = [];

      for (const row of rows) {
        const fv = row[hdr[0]];
        if (fv === undefined || fv === null || ["", "None"].includes(String(fv).trim())) continue;

        const date = pDate(col(row, ["Data", "data", "Date", "date"]));
        const uname = String(col(row, ["Username", "username", "User"]) || "").trim();
        const stats = getStats(row);

        if (date) report.dates.push(date);

        if (fileType === "tickets") {
          const tc = String(col(row, ["Ticket", "ticket", "Codice Ticket"]) || "");
          if (!tc) continue;
          usernames.push(uname);
          ticketRows.push({
            ticket_code: tc,
            pvr_code: String(col(row, ["Codice Padre", "pvr_code", "PVR", "pvr"]) || ""),
            emission_date: pDt(col(row, ["Data Emissione", "emission_date"])),
            status: String(col(row, ["Stato", "status", "stato"]) || "").trim() || null,
            competition_date: pDate(col(row, ["Data Competenza", "competition_date"])),
            amount: num(col(row, ["Importo", "amount"])),
            win_amount: num(col(row, ["Importo vincita", "win_amount", "Vincita"])),
            events_count: parseInt(String(col(row, ["Eventi", "events_count", "events"]) || "0")) || 0,
            payment_date: pDt(col(row, ["Data Pagamento", "payment_date"])),
            username_normalized: normalizeUsername(uname),
          });
          continue;
        }

        if (fileType === "daily_pvr") {
          const eid = String(col(row, ["ID Liv 1", "id_liv_1", "Pvr Id"]) || "");
          const nm = String(col(row, ["Liv 1", "liv_1", "Pvr Name"]) || "");
          if (!eid || !nm || !date) continue;
          pvrKeys.push({ eid, name: nm });
          dailyPvrRows.push({ eid, name: nm, date, ...stats });
          continue;
        }

        if (fileType === "daily_network") {
          if (!date) continue;
          dailyNetworkRows.push({ date, ...stats });
          continue;
        }

        if (!uname || !date) continue;
        usernames.push(uname);

        if (fileType === "daily_player_game") {
          const prov = String(col(row, ["Data.1", "provider", "Provider"]) || "").trim();
          const gn = String(col(row, ["Gioco", "game_name", "GameName", "gioco"]) || "").trim();
          if (prov && gn) {
            dailyGameRows.push({
              username_normalized: normalizeUsername(uname),
              provider: prov,
              game_name: gn,
              date,
              ...stats,
            });
          }
        } else {
          dailyPlayerRows.push({ username_normalized: normalizeUsername(uname), date, ...stats });
        }
      }

      // Resolve players
      const playerMap = await resolvePlayerIds(usernames);

      // Resolve PVRs
      const pvrMap = new Map<string, string>();
      if (pvrKeys.length > 0) {
        const uniqueEids = [...new Set(pvrKeys.map((k) => k.eid))];
        const { data: existingPvrs, error: pvrErr } = await supabase.from("pvrs").select("id, exalogic_id").in("exalogic_id", uniqueEids);
        if (pvrErr) throw new Error(`lookup pvrs: ${pvrErr.message}`);
        for (const p of existingPvrs || []) pvrMap.set(p.exalogic_id, p.id);

        const missingEids = uniqueEids.filter((eid) => !pvrMap.has(eid));
        if (missingEids.length > 0) {
          const inserts = missingEids.map((eid) => {
            const k = pvrKeys.find((x) => x.eid === eid);
            return { exalogic_id: eid, name: k?.name || eid };
          });
          const { data: created, error: createErr } = await supabase.from("pvrs").insert(inserts).select("id, exalogic_id");
          if (createErr) throw new Error(`insert pvrs: ${createErr.message}`);
          for (const p of created || []) pvrMap.set(p.exalogic_id, p.id);
        }

        // Record unmapped PVR codes
        const { data: existingMaps, error: mapErr } = await supabase.from("pvr_reference_map").select("pvr_ref_code").in("pvr_ref_code", uniqueEids);
        if (mapErr) throw new Error(`lookup pvr_reference_map: ${mapErr.message}`);
        const existingCodes = new Set((existingMaps || []).map((m: any) => m.pvr_ref_code));
        const unmappedEids = uniqueEids.filter((eid) => !existingCodes.has(eid));
        if (unmappedEids.length > 0) {
          report.unmatched_pvrs.push(...unmappedEids.map((eid: string) => `Exalogic ${eid} (${pvrKeys.find(k => k.eid === eid)?.name || 'unknown'})`));
        }
      }

      // Upsert tickets
      if (ticketRows.length > 0) {
        const upserts = ticketRows.map((r) => {
          const player_id = playerMap.get(r.username_normalized)?.id;
          if (!player_id) report.unmatched_players.push(r.username_normalized);
          return { ...r, player_id: player_id || null };
        });
        await batchUpsert("tickets", upserts, "ticket_code", 500);
      }

      // Upsert daily_pvr_stats
      if (dailyPvrRows.length > 0) {
        const upserts = dailyPvrRows.map((r) => {
          const pvr_id = pvrMap.get(r.eid);
          if (!pvr_id) report.errors.push(`PVR non risolto: ${r.eid}`);
          return { pvr_id: pvr_id || "", date: r.date, ...getStats(r) };
        }).filter((r) => r.pvr_id);
        await batchUpsert("daily_pvr_stats", upserts, "pvr_id,date", 500);
      }

      // Upsert daily_network_stats
      if (dailyNetworkRows.length > 0) {
        await batchUpsert("daily_network_stats", dailyNetworkRows, "date", 500);
      }

      // Upsert game types and daily_player_game_stats
      if (dailyGameRows.length > 0) {
        const gameTypes = [...new Map(dailyGameRows.map((r) => [`${r.provider}|${r.game_name}`, { provider: r.provider, game_name: r.game_name }])).values()];
        await batchUpsert("game_types", gameTypes, "provider,game_name", 500);
        const upserts = dailyGameRows.map((r) => {
          const player_id = playerMap.get(r.username_normalized)?.id;
          if (!player_id) report.unmatched_players.push(r.username_normalized);
          return { player_id: player_id || "", provider: r.provider, game_name: r.game_name, date: r.date, ...getStats(r) };
        }).filter((r) => r.player_id);
        await batchUpsert("daily_player_game_stats", upserts, "player_id,provider,game_name,date", 500);
      }

      // Upsert daily_player_stats and update last_seen_date
      if (dailyPlayerRows.length > 0) {
        const upserts = dailyPlayerRows.map((r) => {
          const player_id = playerMap.get(r.username_normalized)?.id;
          if (!player_id) report.unmatched_players.push(r.username_normalized);
          return { player_id: player_id || "", date: r.date, ...getStats(r) };
        }).filter((r) => r.player_id);
        await batchUpsert("daily_player_stats", upserts, "player_id,date", 500);

        // Track min and max date per player for correct first_seen/last_seen
        const playerDateRange = new Map<string, { minDate: string; maxDate: string }>();
        for (const r of dailyPlayerRows) {
          const pid = playerMap.get(r.username_normalized)?.id;
          if (!pid) continue;
          const existing = playerDateRange.get(pid);
          if (!existing) {
            playerDateRange.set(pid, { minDate: r.date, maxDate: r.date });
          } else {
            if (r.date < existing.minDate) existing.minDate = r.date;
            if (r.date > existing.maxDate) existing.maxDate = r.date;
          }
        }
        for (const [id, range] of playerDateRange) {
          await (supabase as any).from("players")
            .update({ last_seen_date: range.maxDate })
            .eq("id", id)
            .or(`last_seen_date.is.null,last_seen_date.lt.${range.maxDate}`);
          await (supabase as any).from("players")
            .update({ first_seen_date: range.minDate })
            .eq("id", id)
            .is("first_seen_date", null);
        }
      }

      const totalRows = ticketRows.length + dailyPvrRows.length + dailyNetworkRows.length + dailyGameRows.length + dailyPlayerRows.length;

      // Post-import reconciliation
      try {
        let tableName = "";
        if (fileType === "daily_player") tableName = "daily_player_stats";
        else if (fileType === "daily_network") tableName = "daily_network_stats";
        else if (fileType === "daily_pvr") tableName = "daily_pvr_stats";
        else if (fileType === "daily_player_game") tableName = "daily_player_game_stats";
        else if (fileType === "tickets") tableName = "tickets";

        if (tableName) {
          const dates = (report?.dates || []).filter(Boolean).sort();
          const pStart = dates[0] || null;
          const pEnd = dates[dates.length - 1] || null;
          let q = (supabase as any).from(tableName).select("*", { count: "exact", head: true });
          if (pStart) q = q.gte(fileType === "tickets" ? "emission_date" : "date", pStart);
          if (pEnd) q = q.lte(fileType === "tickets" ? "emission_date" : "date", pEnd);
          const { count, error: countErr } = await q;
          if (!countErr && count !== null) {
            const dbCount = count;
            if (Math.abs(dbCount - totalRows) > totalRows * 0.01) {
              report.reconciliation = { db_rows: dbCount, imported_rows: totalRows, status: "mismatch" };
            } else {
              report.reconciliation = { db_rows: dbCount, imported_rows: totalRows, status: "ok" };
            }
          }
        }
      } catch {
        report.reconciliation = { status: "unchecked" };
      }

      const validationStatus = report.reconciliation?.status === "mismatch" ? "mismatch" : "validated";

      await insertUploadRecord(
        file, fileHash, fileType, totalRows, "completed", validationStatus, report,
        undefined, analysisMonth, expectedType || null,
        monthResult.status, monthResult.detectedMonths
      );

      setProgress("");
      const unmatchedMsg = report.unmatched_players.length > 0 ? ` (${report.unmatched_players.length} giocatori non riconosciuti)` : "";
      setMessage({ type: "success", text: `"${file.name}" → ${totalRows} righe (${fileType})${unmatchedMsg}` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      try {
        const analysisMonth = month || null;
        const monthResult = fileType !== "unknown"
          ? validateFileMonth(fileType as ImportFileType, [], analysisMonth)
          : { status: "missing_date", detectedMonths: [] as string[] };
        await insertUploadRecord(
          file, fileHash, fileType, 0, "error", null, report, msg,
          analysisMonth, expectedType || null,
          monthResult.status, monthResult.detectedMonths
        );
      } catch { /* best effort */ }
      setMessage({ type: "error", text: msg });
      setProgress("");
    } finally {
      setUploading(false);
      fetchUploads();
      fetchMonthlyStatus();
    }
  }

  // ── Card click handler: open file picker ──
  function handleCardClick(expectedType: ImportFileType) {
    setPendingExpectedType(expectedType);
    fileInputRef.current?.click();
  }

  // ── File selected: parse headers, validate month, show preview ──
  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";

    const expectedType = pendingExpectedType;
    setPendingExpectedType(null);

    if (files.length === 0) return;
    const file = files[0];

    try {
      setProgress("Analisi file...");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
      const sn = wb.SheetNames[0];
      if (!sn) throw new Error("Nessun foglio Excel trovato");
      const ws = wb.Sheets[sn];
      fixSheetRange(ws);
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as unknown[][];
      if (aoa.length < 2) throw new Error("File vuoto: nessun dato");

      const raw = (aoa[0] || []).map((h: unknown) => String(h || "").trim());
      const detectedType = det(raw);

      if (detectedType === "unknown") {
        const found = raw.filter(h => h).join(", ");
        setMessage({ type: "error", text: `Tipo file non riconosciuto. Intestazioni trovate: ${found || "(nessuna)"}.` });
        setProgress("");
        return;
      }

      // Type mismatch check
      if (expectedType && detectedType !== expectedType) {
        setMessage({
          type: "error",
          text: `Hai selezionato "${getTypeLabel(expectedType)}", ma il file è stato riconosciuto come "${getTypeLabel(detectedType)}". Nessun dato è stato importato.`
        });
        setProgress("");
        return;
      }

      const hdr = [...raw];
      const rows = aoa.slice(1).map((r) => {
        const o: Record<string, unknown> = {};
        hdr.forEach((h, i) => { o[h] = r[i]; });
        return o;
      });

      // Month validation
      const analysisMonth = (detectedType === "players_master") ? null : selectedMonth;
      const monthResult = validateFileMonth(detectedType as ImportFileType, rows, analysisMonth);

      // Gather validation issues
      const issues: ImportValidationIssue[] = [];
      if (monthResult.status === "multiple_months") {
        issues.push({
          row: 0, field: "date", rawValue: monthResult.detectedMonths.join(", "), reason: `File contiene più mesi: ${monthResult.detectedMonths.join(", ")}`, level: "error",
        });
      } else if (monthResult.status === "month_mismatch") {
        issues.push({
          row: 0, field: "date",
          rawValue: monthResult.detectedMonths[0],
          reason: `Mese rilevato ${monthResult.detectedMonths[0]} ≠ mese selezionato ${analysisMonth}`,
          level: "error",
        });
      } else if (monthResult.status === "missing_date") {
        issues.push({
          row: 0, field: "date", rawValue: null, reason: "Nessuna data valida trovata nel file", level: "error",
        });
      }

      // Check existing rows count
      let existingRows = 0;
      if (monthResult.valid && monthResult.periodStart && monthResult.periodEnd) {
        try {
          const tableName = detectedType === "daily_player" ? "daily_player_stats"
            : detectedType === "daily_network" ? "daily_network_stats"
            : detectedType === "daily_pvr" ? "daily_pvr_stats"
            : detectedType === "daily_player_game" ? "daily_player_game_stats"
            : detectedType === "tickets" ? "tickets"
            : null;

          if (tableName) {
            const dateCol = detectedType === "tickets" ? "emission_date" : "date";
            const { count } = await supabase
              .from(tableName)
              .select("*", { count: "exact", head: true })
              .gte(dateCol, monthResult.periodStart)
              .lte(dateCol, monthResult.periodEnd);
            existingRows = count ?? 0;
          }
        } catch { /* non-critical */ }
      }

      setPreview({
        file,
        fileType: detectedType,
        expectedType: expectedType || detectedType as ImportFileType,
        rows,
        monthResult,
        issues,
      });

      setProgress("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessage({ type: "error", text: msg });
      setProgress("");
    }
  }

  // ── Confirm import from preview ──
  function handleConfirmImport() {
    if (!preview) return;
    const { file, expectedType } = preview;
    setPreview(null);
    processFile(file, expectedType, selectedMonth);
  }

  // ── Get type label ──
  function getTypeLabel(t: string): string {
    const labels: Record<string, string> = {
      daily_network: "Rete",
      daily_pvr: "PVR",
      daily_player: "Giocatori giornalieri",
      daily_player_game: "Provider e giochi",
      tickets: "Ticket",
      player_summary: "Riepilogo mensile",
      players_master: "Anagrafica giocatori",
    };
    return labels[t] || t;
  }

  // ── Players master status ──
  const playersMasterStatus = monthlyStatuses.find(s => s.fileType === "players_master");

  // ── Monthly dataset statuses (exclude players_master) ──
  const monthlyDatasetStatuses = monthlyStatuses.filter(s => s.fileType !== "players_master");

  // ── Render ──
  return (
    <div className="p-6 space-y-6">
      {/* Hidden file input for dataset cards */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* Header */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h1 className="text-2xl font-bold text-white">Importa Dati</h1>
        <p className="text-text-secondary mt-1">
          Elaborazione diretta nel browser — solo dati reali da Excel/CSV.
        </p>
      </motion.div>

      {/* Message */}
      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={cn(
              "p-4 rounded-lg flex items-center gap-3",
              message.type === "success"
                ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                : "bg-red-500/10 border border-red-500/20 text-red-400"
            )}
          >
            {message.type === "success" ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" /> : <XCircle className="w-5 h-5 flex-shrink-0" />}
            <span className="text-sm">{message.text}</span>
            <button onClick={() => setMessage(null)} className="ml-auto text-current opacity-60 hover:opacity-100">
              <XCircle className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress bar */}
      {uploading && progress && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-3 text-amber-400 bg-amber-500/10 rounded-lg p-3 border border-amber-500/20"
        >
          <Loader2 size={18} className="animate-spin flex-shrink-0" />
          <span className="text-sm">{progress}</span>
        </motion.div>
      )}

      {/* ── Section A: Dati anagrafici ── */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-3">
          Dati anagrafici e configurazione
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {playersMasterStatus && (
            <DatasetCard
              status={playersMasterStatus}
              selectedMonth={selectedMonth}
              onUpload={() => handleCardClick("players_master")}
              uploading={uploading}
            />
          )}
        </div>
      </motion.div>

      {/* ── Section B: Dati operativi mensili ── */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-4">
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider">
            Dati operativi mensili
          </h2>
          <MonthSelector
            selectedMonth={selectedMonth}
            onMonthChange={handleMonthChange}
          />
        </div>

        {/* Month completeness */}
        {monthlyStatuses.length > 0 && (
          <div className="mb-4">
            <MonthCompleteness statuses={monthlyStatuses} />
          </div>
        )}

        {/* Dataset cards grid */}
        {statusLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-bg-surface-elevated rounded-xl border border-border-subtle p-4 animate-pulse">
                <div className="h-4 w-24 bg-bg-surface rounded mb-3" />
                <div className="space-y-2">
                  <div className="h-3 w-full bg-bg-surface rounded" />
                  <div className="h-3 w-2/3 bg-bg-surface rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {monthlyDatasetStatuses.map((ds) => (
              <DatasetCard
                key={ds.fileType}
                status={ds}
                selectedMonth={selectedMonth}
                onUpload={() => handleCardClick(ds.fileType)}
                uploading={uploading}
              />
            ))}
          </div>
        )}

        {/* Open analysis button */}
        <div className="mt-4 flex justify-end">
          <button
            onClick={() => {
              const range = analysisMonthToRange(selectedMonth);
              const url = new URL(window.location.origin);
              url.pathname = "/";
              url.searchParams.set("month", selectedMonth);
              url.searchParams.set("start", range.start);
              url.searchParams.set("end", range.end);
              window.open(url.toString(), "_self");
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent-purple/10
                       text-accent-purple text-sm font-semibold hover:bg-accent-purple/20
                       transition-colors border border-accent-purple/20"
          >
            <TrendingUp size={16} />
            Apri analisi di {(() => { try { return formatAnalysisMonth(selectedMonth); } catch { return selectedMonth; } })()}
          </button>
        </div>
      </motion.div>

      {/* Import preview modal */}
      <ImportPreview
        open={preview !== null}
        onClose={() => setPreview(null)}
        onConfirm={handleConfirmImport}
        fileName={preview?.file.name || ""}
        expectedType={preview?.expectedType || "daily_network"}
        detectedType={preview?.fileType || ""}
        selectedMonth={selectedMonth}
        periodStart={preview?.monthResult.periodStart || null}
        periodEnd={preview?.monthResult.periodEnd || null}
        totalRows={preview?.rows.length || 0}
        validRows={preview?.monthResult.validDateRows || 0}
        existingRows={0}
        issues={preview?.issues || []}
        monthValid={preview?.monthResult.valid ?? false}
        monthStatus={preview?.monthResult.status || "missing_date"}
        monthMessage={
          preview?.monthResult.status === "valid"
            ? "Tutte le date appartengono al mese selezionato."
            : preview?.monthResult.status === "month_mismatch"
            ? `Il file contiene dati del mese ${preview.monthResult.detectedMonths[0]}. Cambiare il mese selezionato o caricare il file corretto.`
            : preview?.monthResult.status === "multiple_months"
            ? `Il file contiene più mesi: ${preview.monthResult.detectedMonths.join(", ")}. Dividere il file prima del caricamento.`
            : preview?.monthResult.status === "missing_date"
            ? "Nessuna data valida trovata nel file."
            : "Non applicabile."
        }
        loading={uploading}
      />

      {/* ── Upload history ── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-bg-surface-elevated rounded-xl border border-border-subtle overflow-hidden"
      >
        <div className="px-5 py-3 border-b border-border-subtle flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Storico Upload</h2>
          <button
            onClick={fetchUploads}
            className="p-1.5 rounded-lg hover:bg-white/5 text-text-secondary hover:text-white"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        {uploads.length === 0 ? (
          <div className="p-8 text-center text-text-secondary text-sm">
            <FileSpreadsheet className="w-8 h-8 mx-auto mb-2 opacity-40" />
            Nessun upload
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {uploads.map((u) => {
              const Icon = ICONS[u.status] || FileSpreadsheet;
              return (
                <div key={u.id} className="px-5 py-3 flex items-center gap-3 hover:bg-white/[0.02]">
                  <Icon className={cn(
                    "w-5 h-5 flex-shrink-0",
                    COLS[u.status] || "text-slate-400",
                    (u.status === "processing" || u.status === "pending") ? "animate-spin" : ""
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{u.filename}</p>
                    <p className="text-xs text-text-secondary">
                      {u.file_type} · {u.rows_processed} righe · {new Date(u.uploaded_at).toLocaleDateString("it-IT")}
                      {u.analysis_month && ` · ${(() => { try { return formatAnalysisMonth(u.analysis_month); } catch { return u.analysis_month; } })()}`}
                    </p>
                  </div>
                  <span className={cn(
                    "text-xs px-2 py-0.5 rounded-full font-medium",
                    u.status === "completed" && "bg-emerald-500/10 text-emerald-400",
                    u.status === "processing" && "bg-amber-500/10 text-amber-400",
                    u.status === "error" && "bg-red-500/10 text-red-400"
                  )}>
                    {LABS[u.status] || u.status}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>
    </div>
  );
}
