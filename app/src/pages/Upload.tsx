import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import { num, normalizeUsername, pDate, pDt, det, col } from "@/lib/uploadHelpers";
import { parseRequiredNumber, parseOptionalNumber, type ImportValidationIssue } from "@/lib/importPipeline";

interface UploadRecord {
  id: string; filename: string; file_type: string | null; status: string;
  rows_processed: number; error_message: string | null; uploaded_at: string;
  file_hash: string | null; validation_status: string | null;
}

const ICONS: Record<string, typeof CheckCircle2> = { completed: CheckCircle2, processing: Loader2, pending: Loader2, error: XCircle };
const COLS: Record<string, string> = { completed: "text-emerald-400", processing: "text-amber-400", pending: "text-slate-400", error: "text-red-400" };
const LABS: Record<string, string> = { completed: "Completato", processing: "In elaborazione...", pending: "In attesa...", error: "Errore" };

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

function normalizedContentHash(fileType: string, rows: Record<string, unknown>[]): Promise<string> {
  let normalized: string[]
  if (fileType === 'daily_player' || fileType === 'daily_network' || fileType === 'daily_pvr') {
    normalized = rows.map((r) => {
      const uname = normalizeUsername(String(r['Username'] || r['username'] || r['User'] || ''))
      const date = pDate(r['Data'] || r['data'] || r['Date'] || r['date'])
      const stats = getStats(r)
      return `${uname}|${date}|${stats.buy_in}|${stats.bet}|${stats.won}|${stats.rake}|${stats.payout}`
    }).sort()
  } else if (fileType === 'tickets') {
    normalized = rows.map((r) => {
      const tc = String(r['Ticket'] || r['ticket'] || '')
      const amt = num(r['Importo'] || r['amount'])
      return `${tc}|${amt}`
    }).sort()
  } else {
    normalized = rows.map((r) => JSON.stringify(r, Object.keys(r).sort())).sort()
  }
  const content = normalized.join('\n')
  return sha256(new TextEncoder().encode(content).buffer as ArrayBuffer)
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
    .maybeSingle()
  if (byHash) {
    return { blocked: true, existingFilename: (byHash as any).filename, existingDate: (byHash as any).uploaded_at }
  }
  const { data: byContent } = await supabase
    .from('excel_uploads')
    .select('filename, uploaded_at')
    .eq('normalized_hash' as any, normalizedHash)
    .eq('status', 'completed')
    .neq('file_hash', fileHash)
    .maybeSingle()
  if (byContent) {
    return { blocked: true, existingFilename: (byContent as any).filename, existingDate: (byContent as any).uploaded_at }
  }
  return { blocked: false }
}


async function batchUpsert(table: string, rows: any[], onConflict: string, chunkSize = 500) {
  const builder = (supabase as any).from(table);
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    check(`upsert ${table}`, await builder.upsert(chunk, { onConflict }));
  }
}

async function loadPvrMap(): Promise<Map<string, string>> {
  // Only verified mappings may drive commercial associations (players ↔ PVR).
  const { data, error } = await supabase
    .from("pvr_reference_map")
    .select("pvr_ref_code, pvr_id")
    .eq("verified", true);
  if (error) throw new Error(`pvr_reference_map: ${error.message}`);
  const map = new Map<string, string>();
  for (const r of data || []) map.set(String(r.pvr_ref_code).trim().toLowerCase(), r.pvr_id);
  return map;
}

async function loadPlayerAliases(): Promise<Map<string, string>> {
  const { data, error } = await supabase.from("player_username_aliases").select("alias_normalized, player_id");
  if (error) throw new Error(`player_username_aliases: ${error.message}`);
  const map = new Map<string, string>();
  for (const r of data || []) map.set(r.alias_normalized, r.player_id);
  return map;
}

async function lookupPlayerIds(usernames: string[]): Promise<Map<string, { id: string; pvr_id: string | null }>> {
  const normalized = usernames.map(normalizeUsername);
  const unique = [...new Set(normalized)].filter(Boolean);
  const map = new Map<string, { id: string; pvr_id: string | null }>();
  if (unique.length === 0) return map;

  const { data, error } = await supabase
    .from("players")
    .select("id, username_normalized, pvr_id")
    .in("username_normalized", unique);
  if (error) throw new Error(`lookup players: ${error.message}`);
  for (const p of data || []) map.set(p.username_normalized!, { id: p.id, pvr_id: p.pvr_id || null });

  const aliases = await loadPlayerAliases();
  for (const u of unique) {
    if (map.has(u)) continue;
    const pid = aliases.get(u);
    if (pid) map.set(u, { id: pid, pvr_id: null });
  }

  return map;
}

async function resolvePlayerIds(usernames: string[]): Promise<Map<string, { id: string; pvr_id: string | null }>> {
  const map = await lookupPlayerIds(usernames);
  const remaining = new Set(usernames.map(normalizeUsername).filter((u) => !map.has(u) && u));
  if (remaining.size > 0) {
    const inserts = [...remaining].map((u) => ({ username: u, username_normalized: u }));
    const { data, error } = await supabase.from("players").insert(inserts).select("id, username_normalized, pvr_id");
    if (error) throw new Error(`insert players: ${error.message}`);
    for (const p of data || []) map.set(p.username_normalized!, { id: p.id, pvr_id: p.pvr_id || null });
  }
  return map;
}

function getStats(row: Record<string, unknown>) {
  // Use optional parsers: missing values → null, invalid values → 0 (legacy compat)
  // Required metrics (bet, won, rake) use parseRequiredNumber for strict validation
  const betVal = parseRequiredNumber(col(row, ["Bet", "bet"]), "Bet").value;
  const wonVal = parseRequiredNumber(col(row, ["Won", "won", "Win", "win"]), "Won").value;
  const rakeVal = parseRequiredNumber(col(row, ["Rake", "rake"]), "Rake").value;
  return {
    buy_in: parseOptionalNumber(col(row, ["Buy In", "buy_in", "BuyIn"]), "Buy In").value ?? 0,
    buy_in_bonus: parseOptionalNumber(col(row, ["Buy In Bonus", "buy_in_bonus", "BuyInBonus"]), "Buy In Bonus").value ?? 0,
    stack: parseOptionalNumber(col(row, ["Stack", "stack"]), "Stack").value ?? 0,
    bet: betVal,
    won: wonVal,
    rake: rakeVal,
    payout: parseOptionalNumber(col(row, ["Payout", "payout"]), "Payout").value ?? 0,
    bet_bonus: parseOptionalNumber(col(row, ["Bet Bonus", "bet_bonus", "BetBonus"]), "Bet Bonus").value ?? 0,
    jackpot: parseOptionalNumber(col(row, ["Jackpot", "jackpot"]), "Jackpot").value ?? 0,
    jackpot_won: parseOptionalNumber(col(row, ["Jackpot Won", "jackpot_won", "JackpotWon"]), "Jackpot Won").value ?? 0,
    overlay: parseOptionalNumber(col(row, ["Overlay", "overlay"]), "Overlay").value ?? 0,
    refund: parseOptionalNumber(col(row, ["Refund", "refund"]), "Refund").value ?? 0,
  };
}

export default function UploadPage() {
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchUploads = useCallback(async () => {
    const { data } = await supabase
      .from("excel_uploads")
      .select("*")
      .order("uploaded_at", { ascending: false })
      .limit(10);
    setUploads((data || []) as UploadRecord[]);
  }, []);
  useEffect(() => { fetchUploads(); const t = setInterval(fetchUploads, 5000); return () => clearInterval(t); }, [fetchUploads]);

  async function insertUploadRecord(file: File, fileHash: string, fileType: string, rows: number, status: string, validationStatus: string | null, report: any, errorMsg?: string) {
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
      })
    );
  }

  async function processFile(file: File) {
    setUploading(true); setMessage(null); setProgress("Lettura file...");
    let fileType = "unknown";
    let fileHash = "";
    let normalizedHash = "";
    let report: any = {};
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
          `Intestazioni richieste per tipo:
` +
          `- daily_player: Data, Username, Bet, Won, Rake
` +
          `- daily_network: Data, Bet, Won, Rake
` +
          `- daily_pvr: ID Liv 1, Liv 1, Data
` +
          `- daily_player_game: Data, Data.1, Gioco, Username
` +
          `- tickets: Ticket, Username, Codice Padre, Data Emissione, Stato
` +
          `- players_master: user, PVR rif., stato, saldo, saldo prel, creato
` +
          `- player_summary: Username, Bet, Won, Rake (senza Data)`
        );
      }

      const hdr = [...raw];
      const rows = aoa.slice(1).map((r) => {
        const o: Record<string, unknown> = {};
        hdr.forEach((h, i) => { o[h] = r[i]; });
        return o;
      });

      setProgress(`Elaborazione ${fileType}...`);
      report = { file_type: fileType, total_rows: rows.length, errors: [], dates: [], unmatched_pvrs: [], unmatched_players: [] };

      // Compute normalized content hash and check for duplicates
      const normalizedHash = await normalizedContentHash(fileType, rows);
      report.normalized_hash = normalizedHash;
      const dupCheck = await checkDuplicateByContent(fileType, fileHash, normalizedHash);
      if (dupCheck.blocked) {
        throw new Error(
          `File duplicato: contenuto già importato il ${dupCheck.existingDate ? new Date(dupCheck.existingDate).toLocaleDateString('it-IT') : '?'} come "${dupCheck.existingFilename || 'sconosciuto'}". Stessi dati, importazione bloccata.`
        );
      }

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
          // Preserve an existing PVR assignment when the new file cannot verify it.
          const pvr_id = r.pvr_id ?? resolved?.pvr_id ?? null;
          return { id: resolved?.id, ...r, pvr_id };
        }).filter((r) => r.id);

        if (upserts.length > 0) {
          await batchUpsert("players", upserts, "id", 500);
        }

        for (const r of masterRows) {
          if (r.pvr_ref_code && !r.pvr_id) report.unmatched_pvrs.push(r.pvr_ref_code);
        }

        await insertUploadRecord(file, fileHash, fileType, masterRows.length, "completed", "validated", report);
        setProgress("");
        setMessage({ type: "success", text: `"${file.name}" → ${masterRows.length} giocatori aggiornati (${fileType})` });
        return;
      }

      if (fileType === "player_summary") {
        // Validate only: never write to daily_player_stats.
        const summaryRows = rows.map((row) => {
          const uname = String(col(row, ["Username", "username", "User"]) || "").trim();
          const month = pDate(col(row, ["mese", "month", "periodo", "period"]));
          return {
            username: uname,
            username_normalized: normalizeUsername(uname),
            month,
            ...getStats(row),
          };
        }).filter((r) => r.username);

        // Determine target month: explicit column wins, otherwise latest month in daily stats
        let targetMonth = summaryRows.find((r) => r.month)?.month;
        if (!targetMonth) {
          const { data: maxDateRow, error: maxDateErr } = await supabase.from("daily_player_stats").select("date").order("date", { ascending: false }).limit(1);
          if (maxDateErr) throw new Error(`max date: ${maxDateErr.message}`);
          targetMonth = (maxDateRow?.[0] as any)?.date?.slice(0, 7) || null;
        }
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
          const db = dbTotals.find((x) => x.player_id === pid);
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
        await insertUploadRecord(file, fileHash, fileType, summaryRows.length, "completed", validationStatus, report);
        setProgress("");
        if (mismatches.length > 0) {
          setMessage({ type: "error", text: `"${file.name}" → ${summaryRows.length} righe; ${mismatches.length} mismatch con i dati giornalieri per ${targetMonth}.` });
        } else {
          setMessage({ type: "success", text: `"${file.name}" → ${summaryRows.length} righe validate per ${targetMonth} (${fileType}, non importato)` });
        }
        return;
      }

      // Collect dates and player/pvr references for daily/ticket files
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

      // Resolve players in one batch
      const playerMap = await resolvePlayerIds(usernames);

      // Resolve PVRs for daily_pvr and auto-populate unverified pvr_reference_map entries
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

        // Record unmapped PVR codes in report (no client-side insert on pvr_reference_map)
        const { data: existingMaps, error: mapErr } = await supabase.from("pvr_reference_map").select("pvr_ref_code").in("pvr_ref_code", uniqueEids);
        if (mapErr) throw new Error(`lookup pvr_reference_map: ${mapErr.message}`);
        const existingCodes = new Set((existingMaps || []).map((m) => m.pvr_ref_code));
        const unmappedEids = uniqueEids.filter((eid) => !existingCodes.has(eid));
        if (unmappedEids.length > 0) {
          report.unmatched_pvrs.push(...unmappedEids.map(eid => `Exalogic ${eid} (${pvrKeys.find(k => k.eid === eid)?.name || 'unknown'})`));
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
        // Update last_seen_date (only if new date is later) and first_seen_date (only if null)
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

      // Post-import reconciliation: verify row counts and totals against DB
      try {
        let tableName = "";
        let dbCount = 0;
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
            dbCount = count;
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
      await insertUploadRecord(file, fileHash, fileType, totalRows, "completed", validationStatus, report);
      setProgress("");
      const unmatchedMsg = report.unmatched_players.length > 0 ? ` (${report.unmatched_players.length} giocatori non riconosciuti)` : "";
      setMessage({ type: "success", text: `"${file.name}" → ${totalRows} righe (${fileType})${unmatchedMsg}` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      try {
        await insertUploadRecord(file, fileHash, fileType, 0, "error", null, report, msg);
      } catch {}
      setMessage({ type: "error", text: msg });
      setProgress("");
    } finally {
      setUploading(false);
      fetchUploads();
    }
  }

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => /\.(xlsx|xls|csv)$/i.test(f.name));
    for (const file of files) {
      await processFile(file);
    }
  }, []);
  const handleFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      await processFile(file);
    }
    e.target.value = "";
  }, []);

  return (
    <div className="p-6 space-y-6">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h1 className="text-2xl font-bold text-white">Importa Dati</h1>
        <p className="text-text-secondary mt-1">Elaborazione diretta nel browser — solo dati reali da Excel/CSV.</p>
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className={cn("relative border-2 border-dashed rounded-xl p-12 text-center transition-all duration-200 cursor-pointer",
          dragOver ? "border-accent-purple bg-accent-purple/5" : "border-border-subtle hover:border-text-secondary/40 bg-bg-surface-elevated/50")}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop}
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
            {uploads.map((u) => { const Icon = ICONS[u.status] || FileSpreadsheet; return (
              <div key={u.id} className="px-5 py-3 flex items-center gap-3 hover:bg-white/[0.02]">
                <Icon className={cn("w-5 h-5 flex-shrink-0", COLS[u.status] || "text-slate-400", (u.status === "processing" || u.status === "pending") ? "animate-spin" : "")} />
                <div className="flex-1 min-w-0"><p className="text-sm text-white truncate">{u.filename}</p><p className="text-xs text-text-secondary">{u.file_type} · {u.rows_processed} righe · {new Date(u.uploaded_at).toLocaleDateString("it-IT")}</p></div>
                <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", u.status === "completed" && "bg-emerald-500/10 text-emerald-400", u.status === "processing" && "bg-amber-500/10 text-amber-400", u.status === "error" && "bg-red-500/10 text-red-400")}>{LABS[u.status] || u.status}</span>
              </div>
            ); })}
          </div>
        )}
      </motion.div>
    </div>
  );
}
