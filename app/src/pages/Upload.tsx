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
import { num, normalizeUsername, pDate, pDt, det, col, detectFileTypeFromFilename, deduplicateHeaders } from "@/lib/uploadHelpers";
import { type ImportValidationIssue } from "@/lib/importPipeline";
import {
  normalizeAnalysisMonth,
  analysisMonthToRange,
  analysisMonthToDatabaseDate,
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

const AGGREGABLE_METRICS = [
  "buy_in", "buy_in_bonus", "stack", "bet", "won", "rake",
  "bet_bonus", "jackpot", "jackpot_won", "overlay", "refund",
];

function zeroStats() {
  return {
    buy_in: 0, buy_in_bonus: 0, stack: 0, bet: 0, won: 0, rake: 0,
    payout: 0, bet_bonus: 0, jackpot: 0, jackpot_won: 0, overlay: 0, refund: 0,
  };
}

function aggregatePlayerStats(
  gameRows: any[],
  playerMap: Map<string, { id: string }>,
) {
  const grouped = new Map<string, any>();
  for (const r of gameRows) {
    const player = playerMap.get(r.username_normalized);
    if (!player?.id) continue;
    const key = `${player.id}|${r.date}`;
    if (!grouped.has(key)) {
      grouped.set(key, { player_id: player.id, date: r.date, ...zeroStats() });
    }
    const g = grouped.get(key);
    for (const f of AGGREGABLE_METRICS) g[f] += (r[f] || 0);
  }
  const result: any[] = [];
  for (const g of grouped.values()) {
    g.payout = g.bet !== 0 ? (g.won / g.bet) * 100 : 0;
    result.push(g);
  }
  return result;
}

function aggregateNetworkStats(pvrRows: any[]) {
  const grouped = new Map<string, any>();
  for (const r of pvrRows) {
    if (!grouped.has(r.date)) {
      grouped.set(r.date, { date: r.date, ...zeroStats() });
    }
    const g = grouped.get(r.date);
    for (const f of AGGREGABLE_METRICS) g[f] += (r[f] || 0);
  }
  const result: any[] = [];
  for (const g of grouped.values()) {
    g.payout = g.bet !== 0 ? (g.won / g.bet) * 100 : 0;
    result.push(g);
  }
  return result;
}

type ValidationRowStatus = "PASS" | "WARNING" | "BLOCKED" | "NOT_AVAILABLE";

function metricValidationStatus(
  op: number | null | undefined,
  ctrl: number,
  absThreshold = 0.01,
  warnPct = 0.1,
  blockPct = 5,
): ValidationRowStatus {
  if (op === null || op === undefined) return "NOT_AVAILABLE";
  const absDiff = Math.abs(op - ctrl);
  if (absDiff <= absThreshold) return "PASS";
  const pct = op !== 0 ? (absDiff / Math.abs(op)) * 100 : ctrl !== 0 ? 100 : 0;
  if (pct > blockPct) return "BLOCKED";
  if (pct > warnPct) return "WARNING";
  return "PASS";
}

function buildValidationRecord(
  uploadId: string,
  sourceFileType: string,
  targetFileType: string | null,
  analysisMonth: string | null,
  periodStart: string | null,
  periodEnd: string | null,
  metric: string,
  opVal: number | null,
  ctrlVal: number,
  details?: any,
) {
  const status = metricValidationStatus(opVal, ctrlVal);
  const absDiff = opVal !== null && opVal !== undefined ? Math.abs(opVal - ctrlVal) : null;
  const pctDiff =
    absDiff === null || opVal === null || opVal === undefined
      ? null
      : opVal !== 0
        ? (absDiff / Math.abs(opVal)) * 100
        : ctrlVal !== 0
          ? 100
          : 0;
  const dbMonth = analysisMonth ? analysisMonthToDatabaseDate(analysisMonth) : null;
  return {
    upload_id: uploadId,
    source_file_type: sourceFileType,
    target_file_type: targetFileType,
    analysis_month: dbMonth,
    metric,
    period_start: periodStart,
    period_end: periodEnd,
    operational_value: opVal,
    control_value: ctrlVal,
    absolute_diff: absDiff,
    percent_diff: pctDiff,
    status,
    details: details || null,
  };
}

async function writeImportValidations(validations: any[]) {
  if (validations.length === 0) return;
  const { error } = await (supabase.from("import_validations") as any).insert(validations);
  if (error) throw new Error(`insert import_validations: ${error.message}`);
}

async function validateNetworkControl(
  uploadId: string,
  controlRows: any[],
  analysisMonth: string | null,
): Promise<{ status: ValidationRowStatus; validations: any[] }> {
  if (controlRows.length === 0) return { status: "NOT_AVAILABLE", validations: [] };
  const dbMonth = analysisMonth ? analysisMonthToDatabaseDate(analysisMonth) : null;
  const byDate = aggregateNetworkStats(controlRows);
  const dates = byDate.map((r) => r.date);
  const { data: ops } = await supabase.from("daily_network_stats").select("*").in("date", dates);
  const opMap = new Map((ops || []).map((r: any) => [r.date, r]));

  const validations: any[] = [];
  let overall: ValidationRowStatus = "PASS";

  for (const ctrl of byDate) {
    const op = opMap.get(ctrl.date);
    if (!op) {
      validations.push({
        upload_id: uploadId,
        source_file_type: "daily_network",
        target_file_type: "daily_pvr",
        analysis_month: dbMonth,
        metric: "ALL",
        period_start: ctrl.date,
        period_end: ctrl.date,
        operational_value: null,
        control_value: null,
        absolute_diff: null,
        percent_diff: null,
        status: "NOT_AVAILABLE",
        details: { note: "No operational daily_network_stats row for this date" },
      });
      if (overall === "PASS") overall = "NOT_AVAILABLE";
      continue;
    }
    for (const metric of [...AGGREGABLE_METRICS, "payout"]) {
      const rec = buildValidationRecord(
        uploadId,
        "daily_network",
        "daily_pvr",
        analysisMonth,
        ctrl.date,
        ctrl.date,
        metric,
        op[metric],
        ctrl[metric],
        { date: ctrl.date },
      );
      validations.push(rec);
      if (rec.status === "BLOCKED") overall = "BLOCKED";
      else if (rec.status === "WARNING" && overall === "PASS") overall = "WARNING";
      else if (rec.status === "NOT_AVAILABLE" && overall === "PASS") overall = "NOT_AVAILABLE";
    }
  }

  return { status: overall, validations };
}

async function validateDailyPlayerControl(
  uploadId: string,
  controlRows: any[],
  playerMap: Map<string, { id: string }>,
  analysisMonth: string | null,
): Promise<{ status: ValidationRowStatus; validations: any[] }> {
  if (controlRows.length === 0) return { status: "NOT_AVAILABLE", validations: [] };
  const dbMonth = analysisMonth ? analysisMonthToDatabaseDate(analysisMonth) : null;
  const byKey = aggregatePlayerStats(controlRows, playerMap);
  const dates = [...new Set(byKey.map((r) => r.date))];
  const playerIds = [...new Set(byKey.map((r) => r.player_id))].filter(Boolean);

  const { data: ops } = await supabase
    .from("daily_player_stats")
    .select("*")
    .in("date", dates)
    .in("player_id", playerIds);
  const opMap = new Map((ops || []).map((r: any) => [`${r.player_id}|${r.date}`, r]));

  const validations: any[] = [];
  let overall: ValidationRowStatus = "PASS";

  for (const ctrl of byKey) {
    const op = opMap.get(`${ctrl.player_id}|${ctrl.date}`);
    if (!op) {
      validations.push({
        upload_id: uploadId,
        source_file_type: "daily_player",
        target_file_type: "daily_player_game",
        analysis_month: dbMonth,
        metric: "ALL",
        period_start: ctrl.date,
        period_end: ctrl.date,
        operational_value: null,
        control_value: null,
        absolute_diff: null,
        percent_diff: null,
        status: "NOT_AVAILABLE",
        details: { note: "No operational daily_player_stats row for this player/date", player_id: ctrl.player_id },
      });
      if (overall === "PASS") overall = "NOT_AVAILABLE";
      continue;
    }
    for (const metric of [...AGGREGABLE_METRICS, "payout"]) {
      const rec = buildValidationRecord(
        uploadId,
        "daily_player",
        "daily_player_game",
        analysisMonth,
        ctrl.date,
        ctrl.date,
        metric,
        op[metric],
        ctrl[metric],
        { player_id: ctrl.player_id, date: ctrl.date },
      );
      validations.push(rec);
      if (rec.status === "BLOCKED") overall = "BLOCKED";
      else if (rec.status === "WARNING" && overall === "PASS") overall = "WARNING";
      else if (rec.status === "NOT_AVAILABLE" && overall === "PASS") overall = "NOT_AVAILABLE";
    }
  }

  return { status: overall, validations };
}

async function validatePlayerSummaryControl(
  uploadId: string,
  summaryRows: any[],
  analysisMonth: string | null,
): Promise<{ status: ValidationRowStatus; validations: any[] }> {
  if (summaryRows.length === 0 || !analysisMonth) return { status: "NOT_AVAILABLE", validations: [] };
  const playerMap = await lookupPlayerIds(summaryRows.map((r) => r.username));
  const playerIds = [...new Set([...playerMap.values()].map((p) => p.id))].filter(Boolean);
  if (playerIds.length === 0) return { status: "NOT_AVAILABLE", validations: [] };
  const dbMonth = analysisMonthToDatabaseDate(analysisMonth);

  const { start, end } = analysisMonthToRange(analysisMonth);
  const { data: ops } = await supabase
    .from("daily_player_stats")
    .select("*")
    .gte("date", start)
    .lte("date", end)
    .in("player_id", playerIds);

  const byPlayer = new Map<string, any>();
  for (const r of ops || []) {
    if (!byPlayer.has(r.player_id)) byPlayer.set(r.player_id, { player_id: r.player_id, ...zeroStats() });
    const g = byPlayer.get(r.player_id);
    for (const f of AGGREGABLE_METRICS) g[f] += (r[f] || 0);
  }
  for (const g of byPlayer.values()) {
    g.payout = g.bet !== 0 ? (g.won / g.bet) * 100 : 0;
  }

  const validations: any[] = [];
  let overall: ValidationRowStatus = "PASS";

  for (const ctrl of summaryRows) {
    const pid = playerMap.get(ctrl.username_normalized)?.id;
    if (!pid) {
      validations.push({
        upload_id: uploadId,
        source_file_type: "player_summary",
        target_file_type: "daily_player_game",
        analysis_month: dbMonth,
        metric: "ALL",
        period_start: start,
        period_end: end,
        operational_value: null,
        control_value: null,
        absolute_diff: null,
        percent_diff: null,
        status: "NOT_AVAILABLE",
        details: { note: "Player not found in operational data", username: ctrl.username },
      });
      if (overall === "PASS") overall = "NOT_AVAILABLE";
      continue;
    }
    const op = byPlayer.get(pid);
    if (!op) {
      validations.push({
        upload_id: uploadId,
        source_file_type: "player_summary",
        target_file_type: "daily_player_game",
        analysis_month: dbMonth,
        metric: "ALL",
        period_start: start,
        period_end: end,
        operational_value: null,
        control_value: null,
        absolute_diff: null,
        percent_diff: null,
        status: "NOT_AVAILABLE",
        details: { note: "No operational aggregate for this player/month", player_id: pid },
      });
      if (overall === "PASS") overall = "NOT_AVAILABLE";
      continue;
    }
    for (const metric of [...AGGREGABLE_METRICS, "payout"]) {
      const rec = buildValidationRecord(
        uploadId,
        "player_summary",
        "daily_player_game",
        analysisMonth,
        start,
        end,
        metric,
        op[metric],
        ctrl[metric],
        { player_id: pid, username: ctrl.username },
      );
      validations.push(rec);
      if (rec.status === "BLOCKED") overall = "BLOCKED";
      else if (rec.status === "WARNING" && overall === "PASS") overall = "WARNING";
      else if (rec.status === "NOT_AVAILABLE" && overall === "PASS") overall = "NOT_AVAILABLE";
    }
  }

  return { status: overall, validations };
}

async function validatePvrSummaryControl(
  uploadId: string,
  summaryRows: any[],
  analysisMonth: string | null,
): Promise<{ status: ValidationRowStatus; validations: any[] }> {
  if (summaryRows.length === 0 || !analysisMonth) return { status: "NOT_AVAILABLE", validations: [] };
  const dbMonth = analysisMonthToDatabaseDate(analysisMonth);

  const eids = [...new Set(summaryRows.map((r) => r.eid))].filter(Boolean);
  if (eids.length === 0) return { status: "NOT_AVAILABLE", validations: [] };

  const { data: pvrRows } = await supabase
    .from("pvrs")
    .select("id, exalogic_id")
    .in("exalogic_id", eids);
  const pvrMap = new Map((pvrRows || []).map((p: any) => [p.exalogic_id, p.id]));
  const pvrIds = [...new Set([...pvrMap.values()])].filter(Boolean);

  const { start, end } = analysisMonthToRange(analysisMonth);
  let ops: any[] = [];
  if (pvrIds.length > 0) {
    const { data } = await supabase
      .from("daily_pvr_stats")
      .select("*")
      .gte("date", start)
      .lte("date", end)
      .in("pvr_id", pvrIds);
    ops = data || [];
  }

  const byPvr = new Map<string, any>();
  for (const r of ops) {
    if (!byPvr.has(r.pvr_id)) byPvr.set(r.pvr_id, { pvr_id: r.pvr_id, ...zeroStats() });
    const g = byPvr.get(r.pvr_id);
    for (const f of AGGREGABLE_METRICS) g[f] += (r[f] || 0);
  }
  for (const g of byPvr.values()) {
    g.payout = g.bet !== 0 ? (g.won / g.bet) * 100 : 0;
  }

  const validations: any[] = [];
  let overall: ValidationRowStatus = "PASS";

  for (const ctrl of summaryRows) {
    const pvrId = pvrMap.get(ctrl.eid);
    if (!pvrId) {
      validations.push({
        upload_id: uploadId,
        source_file_type: "pvr_summary",
        target_file_type: "daily_pvr",
        analysis_month: dbMonth,
        metric: "ALL",
        period_start: start,
        period_end: end,
        operational_value: null,
        control_value: null,
        absolute_diff: null,
        percent_diff: null,
        status: "NOT_AVAILABLE",
        details: { note: "PVR not found in hierarchy", eid: ctrl.eid, name: ctrl.name },
      });
      if (overall === "PASS") overall = "NOT_AVAILABLE";
      continue;
    }
    const op = byPvr.get(pvrId);
    if (!op) {
      validations.push({
        upload_id: uploadId,
        source_file_type: "pvr_summary",
        target_file_type: "daily_pvr",
        analysis_month: dbMonth,
        metric: "ALL",
        period_start: start,
        period_end: end,
        operational_value: null,
        control_value: null,
        absolute_diff: null,
        percent_diff: null,
        status: "NOT_AVAILABLE",
        details: { note: "No operational aggregate for this PVR/month", pvr_id: pvrId },
      });
      if (overall === "PASS") overall = "NOT_AVAILABLE";
      continue;
    }
    for (const metric of [...AGGREGABLE_METRICS, "payout"]) {
      const rec = buildValidationRecord(
        uploadId,
        "pvr_summary",
        "daily_pvr",
        analysisMonth,
        start,
        end,
        metric,
        op[metric],
        ctrl[metric],
        { pvr_id: pvrId, eid: ctrl.eid, name: ctrl.name },
      );
      validations.push(rec);
      if (rec.status === "BLOCKED") overall = "BLOCKED";
      else if (rec.status === "WARNING" && overall === "PASS") overall = "WARNING";
      else if (rec.status === "NOT_AVAILABLE" && overall === "PASS") overall = "NOT_AVAILABLE";
    }
  }

  return { status: overall, validations };
}

function summarizeValidationStatus(validationStatus: ValidationRowStatus): string {
  switch (validationStatus) {
    case "PASS": return "validated";
    case "WARNING": return "warning";
    case "BLOCKED": return "mismatch";
    case "NOT_AVAILABLE": return "not_available";
    default: return "unchecked";
  }
}

function updatePlayerDateRange(
  rows: { username_normalized: string; date: string }[],
  playerMap: Map<string, { id: string }>,
) {
  const playerDateRange = new Map<string, { minDate: string; maxDate: string }>();
  for (const r of rows) {
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
  return playerDateRange;
}

async function applyPlayerDateRanges(playerDateRange: Map<string, { minDate: string; maxDate: string }>) {
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
  const normalized = [...new Set(usernames.map(normalizeUsername))];
  const map = await lookupPlayerIds(normalized);
  const remaining = normalized.filter((u) => !map.has(u));

  if (remaining.length > 0) {
    const inserts = remaining.map((u) => ({ username: u, username_normalized: u }));
    // Use upsert with ignoreDuplicates so existing usernames never cause a conflict.
    await supabase
      .from("players")
      .upsert(inserts, { onConflict: "username", ignoreDuplicates: true });

    // Re-query to get IDs for all newly created (and pre-existing) players.
    const { data: existing } = await supabase
      .from("players")
      .select("id, username_normalized, pvr_id")
      .in("username_normalized", remaining);
    for (const row of existing || []) {
      map.set((row as any).username_normalized, { id: (row as any).id, pvr_id: (row as any).pvr_id });
    }

    const stillMissing = normalized.filter((u) => !map.has(u));
    if (stillMissing.length > 0) {
      throw new Error(`resolvePlayerIds: could not resolve ${stillMissing.length} players`);
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
    existingRows: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingExpectedType, setPendingExpectedType] = useState<ImportFileType | null>(null);

  // Batch upload (single button for all month files)
  const batchFileInputRef = useRef<HTMLInputElement>(null);
  const [batchProgress, setBatchProgress] = useState<{
    total: number;
    current: number;
    currentFile: string;
    results: { file: string; type: string; status: "success" | "error"; message: string }[];
  } | null>(null);

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
  ): Promise<string | null> {
    const dates = (report?.dates || []).filter(Boolean).sort();
    const periodStart = dates[0] || null;
    const periodEnd = dates[dates.length - 1] || null;
    const { data, error } = await (supabase.from("excel_uploads") as any).insert({
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
      analysis_month: analysisMonth ? analysisMonthToDatabaseDate(analysisMonth) : null,
      expected_file_type: expectedFileType || null,
      month_validation_status: monthValidationStatus || null,
      detected_months: detectedMonths || null,
    }).select("id");
    if (error) throw new Error(`insert excel_uploads: ${error.message}`);
    return (data as any)?.[0]?.id || null;
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
      const hdr = deduplicateHeaders(raw);
      fileType = det(hdr);

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
          `- player_summary: Username, Bet, Won, Rake (senza Data)\n` +
          `- pvr_summary: ID Liv 1, Liv 1, Bet, Won, Rake (senza Data)\n` +
          `- category_summary: Categoria, Bet, Won, Rake (senza Data)\n` +
          `- pvr_hierarchy: Cod. punto, ID, Ragione sociale, Tipo punto`
        );
      }

      // Type mismatch check (user clicked a specific card)
      if (expectedType && fileType !== expectedType) {
        throw new Error(
          `Hai selezionato "${getTypeLabel(expectedType)}", ma il file è stato riconosciuto come "${getTypeLabel(fileType)}". Nessun dato è stato importato.`
        );
      }

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
          undefined, null, expectedType || null,
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

        // Auto-detect month: player_summary has no date column, use null
        const targetMonth = null;
        report.target_month = targetMonth;

        const monthResult = validateFileMonth("player_summary", rows, targetMonth);

        const uploadId = await insertUploadRecord(
          file, fileHash, fileType, summaryRows.length, "completed", "unchecked", report,
          undefined, targetMonth, expectedType || null,
          monthResult.status, monthResult.detectedMonths
        );
        if (!uploadId) throw new Error("Failed to create upload record");

        const { status: vStatus, validations } = await validatePlayerSummaryControl(uploadId, summaryRows, targetMonth);
        await writeImportValidations(validations);
        report.validation_status = vStatus;
        report.validations_count = validations.length;

        const finalValidationStatus = summarizeValidationStatus(vStatus);
        await (supabase.from("excel_uploads") as any)
          .update({ validation_status: finalValidationStatus, validation_report: report })
          .eq("id", uploadId);

        setProgress("");
        const unmatchedCount = summaryRows.filter((r) => !r.username_normalized).length;
        if (vStatus === "BLOCKED") {
          setMessage({ type: "error", text: `"${file.name}" → ${summaryRows.length} righe; rilevate discrepanze con i dati operativi per ${targetMonth}.` });
        } else if (vStatus === "WARNING") {
          setMessage({ type: "success", text: `"${file.name}" → ${summaryRows.length} righe validate con avvisi per ${targetMonth} (${fileType})` });
        } else if (vStatus === "NOT_AVAILABLE") {
          setMessage({ type: "success", text: `"${file.name}" → ${summaryRows.length} righe caricate; dati operativi non disponibili per la quadratura (${fileType})` });
        } else {
          setMessage({ type: "success", text: `"${file.name}" → ${summaryRows.length} righe validate per ${targetMonth} (${fileType})` });
        }
        return;
      }

      // ─── pvr_summary ───
      if (fileType === "pvr_summary") {
        const summaryRows = rows.map((row) => {
          const eid = String(col(row, ["ID Liv 1", "id_liv_1"]) || "").trim();
          const name = String(col(row, ["Liv 1", "liv_1"]) || "").trim();
          return {
            eid,
            name,
            ...getStats(row),
          };
        }).filter((r) => r.eid);

        const targetMonth = null;
        report.target_month = targetMonth;

        const monthResult = validateFileMonth("pvr_summary", rows, targetMonth);

        const uploadId = await insertUploadRecord(
          file, fileHash, fileType, summaryRows.length, "completed", "unchecked", report,
          undefined, targetMonth, expectedType || null,
          monthResult.status, monthResult.detectedMonths
        );
        if (!uploadId) throw new Error("Failed to create upload record");

        const { status: vStatus, validations } = await validatePvrSummaryControl(uploadId, summaryRows, targetMonth);
        await writeImportValidations(validations);
        report.validation_status = vStatus;
        report.validations_count = validations.length;

        const finalValidationStatus = summarizeValidationStatus(vStatus);
        await (supabase.from("excel_uploads") as any)
          .update({ validation_status: finalValidationStatus, validation_report: report })
          .eq("id", uploadId);

        setProgress("");
        if (vStatus === "BLOCKED") {
          setMessage({ type: "error", text: `"${file.name}" → ${summaryRows.length} righe; rilevate discrepanze con i dati operativi per ${targetMonth}.` });
        } else if (vStatus === "WARNING") {
          setMessage({ type: "success", text: `"${file.name}" → ${summaryRows.length} righe validate con avvisi per ${targetMonth} (${fileType})` });
        } else if (vStatus === "NOT_AVAILABLE") {
          setMessage({ type: "success", text: `"${file.name}" → ${summaryRows.length} righe caricate; dati operativi non disponibili per la quadratura (${fileType})` });
        } else {
          setMessage({ type: "success", text: `"${file.name}" → ${summaryRows.length} righe validate per ${targetMonth} (${fileType})` });
        }
        return;
      }

      // ─── category_summary ───
      if (fileType === "category_summary") {
        const summaryRows = rows.map((row) => {
          const category = String(col(row, ["Categoria", "categoria", "Category"]) || "").trim();
          return {
            category,
            ...getStats(row),
          };
        }).filter((r) => r.category);

        const targetMonth = null;
        report.target_month = targetMonth;
        report.dates = [];

        const monthResult = validateFileMonth("category_summary", rows, targetMonth);

        const uploadId = await insertUploadRecord(
          file, fileHash, fileType, summaryRows.length, "completed", "unchecked", report,
          undefined, targetMonth, expectedType || null,
          monthResult.status, monthResult.detectedMonths
        );
        if (!uploadId) throw new Error("Failed to create upload record");

        await writeImportValidations([{
          upload_id: uploadId,
          source_file_type: "category_summary",
          target_file_type: null,
          analysis_month: targetMonth ? analysisMonthToDatabaseDate(targetMonth) : null,
          metric: "ALL",
          period_start: null,
          period_end: null,
          operational_value: null,
          control_value: null,
          absolute_diff: null,
          percent_diff: null,
          status: "NOT_AVAILABLE",
          details: { note: "Category dimension not available in operational tables", row_count: summaryRows.length },
        }]);

        await (supabase.from("excel_uploads") as any)
          .update({ validation_status: "not_available", validation_report: report })
          .eq("id", uploadId);

        setProgress("");
        setMessage({ type: "success", text: `"${file.name}" → ${summaryRows.length} righe caricate come controllo categoria (${fileType})` });
        return;
      }

      // ─── pvr_hierarchy ───
      if (fileType === "pvr_hierarchy") {
        let currentRegion: string | null = null;
        let currentAreaManager: string | null = null;
        let currentAgent: string | null = null;
        const pvrUpserts = new Map<string, any>();
        const mappingUpserts = new Map<string, { pvr_ref_code: string; exalogic_id: string }>();

        for (const row of rows) {
          const codRaw = String(col(row, ["Cod. punto"]) || "").trim();
          const cod = codRaw.replace(/^(?:\s*--\s*)+/, "").trim();
          const tipo = String(col(row, ["Tipo punto"]) || "").trim().toUpperCase();
          const eid = String(col(row, ["ID"]) || "").trim();
          const ragione = String(col(row, ["Ragione sociale"]) || "").trim();
          const stato = String(col(row, ["Stato conto"]) || "").trim() || null;
          const fidoRaw = col(row, ["Prepagato/Fido"]);
          const saldoRaw = col(row, ["Importo utilizzato/Saldo"]);
          const dispRaw = col(row, ["Residuo plafond / Disponibile"]);
          const fido = fidoRaw === undefined || fidoRaw === null || String(fidoRaw).trim() === "" ? null : num(fidoRaw);
          const saldo = saldoRaw === undefined || saldoRaw === null || String(saldoRaw).trim() === "" ? null : num(saldoRaw);
          const disponibile = dispRaw === undefined || dispRaw === null || String(dispRaw).trim() === "" ? null : num(dispRaw);
          const createdOn = pDate(col(row, ["Data Creazione"]));

          if (tipo === "REGIONAL") {
            currentRegion = ragione || null;
            currentAreaManager = null;
            currentAgent = null;
          } else if (tipo === "AREA MANAGER") {
            currentAreaManager = ragione || null;
            currentAgent = null;
          } else if (tipo === "AGENTE") {
            // Agent sits between Area Manager and PVR; track for subsequent PVR
            // rows and also save as a pvrs entry (agents have exalogic_id + financials).
            currentAgent = ragione || null;
            if (eid) {
              pvrUpserts.set(eid, {
                id: crypto.randomUUID(),
                exalogic_id: eid,
                name: ragione,
                status: stato,
                fido,
                saldo,
                disponibile,
                created_on: createdOn,
                region: currentRegion,
                area_manager: currentAreaManager,
              });
              if (cod) {
                mappingUpserts.set(eid, { pvr_ref_code: cod.toUpperCase(), exalogic_id: eid });
              }
            }
          } else if (tipo === "PVR" && eid) {
            // PVR sotto un agente: concatena agente all'area_manager
            // per preservare la gerarchia completa (4 livelli).
            const effectiveAreaManager = currentAgent
              ? [currentAreaManager, currentAgent].filter(Boolean).join(" | ")
              : currentAreaManager;
            pvrUpserts.set(eid, {
              id: crypto.randomUUID(),
              exalogic_id: eid,
              name: ragione,
              status: stato,
              fido,
              saldo,
              disponibile,
              created_on: createdOn,
              region: currentRegion,
              area_manager: effectiveAreaManager,
            });
            if (cod) {
              mappingUpserts.set(eid, { pvr_ref_code: cod.toUpperCase(), exalogic_id: eid });
            }
          }
        }

        const eids = [...new Set([...pvrUpserts.keys()])];
        const { data: existingPvrs, error: existingPvrsErr } = await supabase
          .from("pvrs")
          .select("id, exalogic_id")
          .in("exalogic_id", eids);
        if (existingPvrsErr) throw new Error(`lookup existing pvrs: ${existingPvrsErr.message}`);
        const existingIdByEid = new Map<string, string>();
        for (const p of existingPvrs || []) existingIdByEid.set(p.exalogic_id, p.id);

        const pvrUpsertList = Array.from(pvrUpserts.values()).map((u) => ({
          ...u,
          id: existingIdByEid.get(u.exalogic_id) || u.id,
        }));
        if (pvrUpsertList.length > 0) {
          await batchUpsert("pvrs", pvrUpsertList, "exalogic_id", 500);
        }
        const { data: pvrData, error: pvrLookupErr } = await supabase
          .from("pvrs")
          .select("id, exalogic_id")
          .in("exalogic_id", eids);
        if (pvrLookupErr) throw new Error(`lookup pvrs: ${pvrLookupErr.message}`);
        const pvrIdByEid = new Map<string, string>();
        for (const p of pvrData || []) pvrIdByEid.set(p.exalogic_id, p.id);

        const mapRows = [...mappingUpserts.values()]
          .map((m) => ({
            pvr_ref_code: m.pvr_ref_code,
            pvr_id: pvrIdByEid.get(m.exalogic_id),
            mapping_source: "pvr_hierarchy",
            confidence: 1,
            verified: false,
            notes: "Importato da gerarchia PVR",
          }))
          .filter((m) => m.pvr_id);

        if (mapRows.length > 0) {
          await batchUpsert("pvr_reference_map", mapRows, "pvr_ref_code", 500);
        }

        const { error: syncErr } = await (supabase as any).rpc("sync_pvr_assignments");
        if (syncErr) throw new Error(`sync_pvr_assignments: ${syncErr.message}`);

        await insertUploadRecord(
          file, fileHash, fileType, pvrUpserts.size, "completed", "validated", report,
          undefined, null, expectedType || null,
          "not_applicable", null
        );

        setProgress("");
        setMessage({ type: "success", text: `"${file.name}" → ${pvrUpserts.size} PVR importati e associati (${mapRows.length} codici commerciali)` });
        return;
      }

      // ─── Auto-detect month from file contents ───
      const analysisMonth = month || null;
      const monthResult = validateFileMonth(fileType as ImportFileType, rows, analysisMonth);
      // Auto-detected month: use what the file contains, ignore selected month.
      const detectedMonth = monthResult.detectedMonths?.[0] || monthResult.selectedMonth || null;

      // Block only if file has NO valid dates (for types that require dates)
      if (fileType !== "players_master" && fileType !== "player_summary" && fileType !== "pvr_hierarchy") {
        if (monthResult.status === "missing_date") {
          throw new Error("Importazione bloccata. Nessuna data valida trovata nel file.");
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
          const tc = String(col(row, ["Ticket", "ticket", "Codice Ticket"]) || "").trim();
          if (!tc || tc.toLowerCase().startsWith("tot:")) continue;
          usernames.push(uname);
          const emissionDt = pDt(col(row, ["Data Emissione", "emission_date"]));
          if (emissionDt) {
            const ed = emissionDt.slice(0, 10);
            if (/^\d{4}-\d{2}-\d{2}$/.test(ed)) report.dates.push(ed);
          }
          ticketRows.push({
            ticket_code: tc,
            pvr_code: String(col(row, ["Codice Padre", "pvr_code", "PVR", "pvr"]) || ""),
            emission_date: emissionDt,
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
        const commercialPvrMap = await loadPvrMap();
        const upserts = ticketRows.map((r) => {
          const { username_normalized, ...rest } = r;
          const player_id = playerMap.get(username_normalized)?.id;
          if (!player_id) report.unmatched_players.push(username_normalized);
          const pvr_id = r.pvr_code ? commercialPvrMap.get(String(r.pvr_code).toLowerCase()) || null : null;
          return { ...rest, player_id: player_id || null, pvr_id };
        });
        await batchUpsert("tickets", upserts, "ticket_code", 500);
      }

      // Upsert daily_pvr_stats and derive daily_network_stats
      if (dailyPvrRows.length > 0) {
        const upserts = dailyPvrRows.map((r) => {
          const pvr_id = pvrMap.get(r.eid);
          if (!pvr_id) report.errors.push(`PVR non risolto: ${r.eid}`);
          return { pvr_id: pvr_id || "", date: r.date, ...getStats(r) };
        }).filter((r) => r.pvr_id);
        await batchUpsert("daily_pvr_stats", upserts, "pvr_id,date", 500);

        const networkUpserts = aggregateNetworkStats(dailyPvrRows);
        if (networkUpserts.length > 0) {
          await batchUpsert("daily_network_stats", networkUpserts, "date", 500);
        }
      }

      // Upsert game types and daily_player_game_stats, then derive daily_player_stats
      if (dailyGameRows.length > 0) {
        const gameTypes = [...new Map(dailyGameRows.map((r) => [`${r.provider}|${r.game_name}`, { provider: r.provider, game_name: r.game_name }])).values()];
        await batchUpsert("game_types", gameTypes, "provider,game_name", 500);
        const upserts = dailyGameRows.map((r) => {
          const player_id = playerMap.get(r.username_normalized)?.id;
          if (!player_id) report.unmatched_players.push(r.username_normalized);
          return { player_id: player_id || "", provider: r.provider, game_name: r.game_name, date: r.date, ...getStats(r) };
        }).filter((r) => r.player_id);
        await batchUpsert("daily_player_game_stats", upserts, "player_id,provider,game_name,date", 500);

        const playerStatsUpserts = aggregatePlayerStats(dailyGameRows, playerMap);
        if (playerStatsUpserts.length > 0) {
          await batchUpsert("daily_player_stats", playerStatsUpserts, "player_id,date", 500);
        }

        const playerDateRange = updatePlayerDateRange(dailyGameRows, playerMap);
        await applyPlayerDateRanges(playerDateRange);
      }

      // Control files: daily_player (17) and daily_network (22) do not write operational tables.
      // Their data is kept in report for future validation against derived tables.
      if (fileType === "daily_player" && dailyPlayerRows.length > 0) {
        report.control_rows = dailyPlayerRows.length;
      }
      if (fileType === "daily_network" && dailyNetworkRows.length > 0) {
        report.control_rows = dailyNetworkRows.length;
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

      const uploadId = await insertUploadRecord(
        file, fileHash, fileType, totalRows, "completed", validationStatus, report,
        undefined, detectedMonth, expectedType || null,
        monthResult.status, monthResult.detectedMonths
      );
      if (!uploadId) throw new Error("Failed to create upload record");

      // Validate control files against derived operational tables
      if (fileType === "daily_network") {
        const { status: vStatus, validations } = await validateNetworkControl(uploadId, dailyNetworkRows, detectedMonth);
        await writeImportValidations(validations);
        report.validation_status = vStatus;
        report.validations_count = validations.length;
        const finalValidationStatus = summarizeValidationStatus(vStatus);
        await (supabase.from("excel_uploads") as any)
          .update({ validation_status: finalValidationStatus, validation_report: report })
          .eq("id", uploadId);
      } else if (fileType === "daily_player") {
        const { status: vStatus, validations } = await validateDailyPlayerControl(uploadId, dailyPlayerRows, playerMap, detectedMonth);
        await writeImportValidations(validations);
        report.validation_status = vStatus;
        report.validations_count = validations.length;
        const finalValidationStatus = summarizeValidationStatus(vStatus);
        await (supabase.from("excel_uploads") as any)
          .update({ validation_status: finalValidationStatus, validation_report: report })
          .eq("id", uploadId);
      }

      setProgress("");
      const unmatchedMsg = report.unmatched_players.length > 0 ? ` (${report.unmatched_players.length} giocatori non riconosciuti)` : "";
      const monthInfo = detectedMonth ? ` · ${(() => { try { return formatAnalysisMonth(detectedMonth); } catch { return detectedMonth; } })()}` : "";
      const controlInfo = (fileType === "daily_player" || fileType === "daily_network") ? " · controllo" : "";
      setMessage({ type: "success", text: `"${file.name}" → ${totalRows} righe${monthInfo}${controlInfo}${unmatchedMsg}` });
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
      const hdr = deduplicateHeaders(raw);
      const detectedType = det(hdr);

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

      const rows = aoa.slice(1).map((r) => {
        const o: Record<string, unknown> = {};
        hdr.forEach((h, i) => { o[h] = r[i]; });
        return o;
      });

      // Month validation
      const analysisMonth = (detectedType === "players_master" || detectedType === "pvr_hierarchy") ? null : selectedMonth;
      const monthResult: MonthValidationResult = (detectedType === "pvr_hierarchy")
        ? { status: "not_applicable", valid: true, selectedMonth: null, detectedMonths: [], periodStart: null, periodEnd: null, validDateRows: 0, invalidDateRows: 0 }
        : validateFileMonth(detectedType as ImportFileType, rows, analysisMonth);

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
        existingRows,
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

  // ── Batch upload: one button for all month files ──
  function getBatchTypePriority(type: string): number {
    const order: Record<string, number> = {
      pvr_hierarchy: 1,
      daily_pvr: 2,
      daily_player_game: 3,
      tickets: 4,
      daily_network: 5,
      daily_player: 6,
      player_summary: 7,
      pvr_summary: 8,
      category_summary: 9,
      players_master: 10,
      unknown: 99,
    };
    return order[type] ?? 99;
  }

  async function detectTypeForBatch(file: File): Promise<string> {
    // First try by filename (Exalogic exports have long, numbered names).
    const fromName = detectFileTypeFromFilename(file.name);
    if (fromName) return fromName;

    // Fallback to header detection.
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
    const sn = wb.SheetNames[0];
    if (!sn) return "unknown";
    const ws = wb.Sheets[sn];
    fixSheetRange(ws);
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as unknown[][];
    if (aoa.length < 2) return "unknown";
    const raw = (aoa[0] || []).map((h: unknown) => String(h || "").trim());
    const hdr = deduplicateHeaders(raw);
    return det(hdr);
  }

  function handleBatchUploadClick() {
    batchFileInputRef.current?.click();
  }

  async function handleBatchFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;

    setBatchProgress({
      total: files.length,
      current: 0,
      currentFile: "",
      results: [],
    });
    setMessage(null);

    // Detect types first so we can warn early and order files correctly.
    const typedFiles: { file: File; type: string }[] = [];
    for (const file of files) {
      const type = await detectTypeForBatch(file);
      typedFiles.push({ file, type });
    }

    // Order by dependency: hierarchy first, operational data, then controls.
    typedFiles.sort((a, b) => getBatchTypePriority(a.type) - getBatchTypePriority(b.type));

    const results: { file: string; type: string; status: "success" | "error"; message: string }[] = [];

    for (let i = 0; i < typedFiles.length; i++) {
      const { file, type } = typedFiles[i];
      setBatchProgress((prev) => prev ? { ...prev, current: i + 1, currentFile: file.name } : null);

      if (type === "unknown") {
        results.push({ file: file.name, type, status: "error", message: "Tipo file non riconosciuto dal nome né dalle intestazioni." });
        continue;
      }

      try {
        await processFile(file, type as ImportFileType);
        results.push({ file: file.name, type, status: "success", message: `Importato` });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ file: file.name, type, status: "error", message: msg });
      }
    }

    setBatchProgress((prev) => prev ? { ...prev, results } : null);

    // Build summary message
    const successful = results.filter((r) => r.status === "success");
    const failed = results.filter((r) => r.status === "error");
    const failedNames = failed.map((r) => r.file).join(", ");

    if (failed.length === 0) {
      setMessage({ type: "success", text: `Caricati ${successful.length} file su ${files.length}.` });
    } else {
      setMessage({ type: "error", text: `Caricati ${successful.length} file su ${files.length}. Errori in: ${failedNames}` });
    }

    fetchUploads();
    fetchMonthlyStatus();
  }

  // ── Get type label ──
  function getTypeLabel(t: string): string {
    const labels: Record<string, string> = {
      daily_network: "Giocato totale rete x giorno",
      daily_pvr: "Giocato per singolo PVR giornaliero",
      daily_player: "Giocato per conto e data",
      daily_player_game: "Giocato per giocatore/tipologia/giorno",
      tickets: "Ticket scommesse",
      player_summary: "Gioca player di tutta la rete",
      pvr_summary: "Giocato totale per singolo PVR",
      category_summary: "Giocato totale suddiviso per tipologia",
      players_master: "Anagrafica giocatori",
      pvr_hierarchy: "Gerarchia PVR",
    };
    return labels[t] || t;
  }

  // ── Grouped statuses ──
  const configStatuses = monthlyStatuses.filter(
    s => s.fileType === "pvr_hierarchy" || s.fileType === "players_master"
  );
  const operationalMonthlyStatuses = monthlyStatuses.filter(
    s => s.category === "operational" && s.fileType !== "pvr_hierarchy" && s.fileType !== "players_master"
  );
  const controlStatuses = monthlyStatuses.filter(s => s.category === "control");

  // ── Render ──
  return (
    <div className="p-6 space-y-6">
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleFileSelected}
      />
      <input
        ref={batchFileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        multiple
        className="hidden"
        onChange={handleBatchFilesSelected}
      />

      {/* Header */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h1 className="text-2xl font-bold text-white">Importa Dati</h1>
        <p className="text-text-secondary mt-1">
          Elaborazione diretta nel browser — solo dati reali da Excel/CSV.
        </p>
      </motion.div>

      {/* Main upload area */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-bg-surface-elevated rounded-xl border-2 border-dashed border-accent-purple/30 p-8 text-center hover:border-accent-purple/60 transition-colors"
      >
        <Upload size={40} className="mx-auto mb-4 text-accent-purple" />
        <h2 className="text-xl font-semibold text-white mb-2">Carica i file Excel</h2>
        <p className="text-sm text-text-secondary mb-6 max-w-lg mx-auto">
          Seleziona tutti i file che hai scaricato da Exalogic. Il sistema riconosce automaticamente il contenuto e il mese di ogni file.
        </p>
        <button
          onClick={handleBatchUploadClick}
          disabled={uploading || batchProgress !== null}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-accent-purple text-white
                     text-base font-semibold hover:bg-accent-purple/90 transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Upload size={20} />
          Scegli i file
        </button>

        {batchProgress && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <Loader2 size={18} className="animate-spin text-accent-purple" />
              <span className="text-text-secondary">
                {batchProgress.current < batchProgress.total
                  ? `Elaborazione ${batchProgress.current} di ${batchProgress.total}: ${batchProgress.currentFile}`
                  : `Elaborazione completata: ${batchProgress.total} file analizzati`}
              </span>
            </div>
            <div className="w-full h-2 bg-bg-surface rounded-full overflow-hidden">
              <div
                className="h-full bg-accent-purple transition-all duration-300"
                style={{ width: `${batchProgress.total > 0 ? (batchProgress.current / batchProgress.total) * 100 : 0}%` }}
              />
            </div>
            {batchProgress.results.length > 0 && (
              <div className="max-h-48 overflow-y-auto divide-y divide-border-subtle border border-border-subtle rounded-lg">
                {batchProgress.results.map((r, idx) => (
                  <div key={idx} className="flex items-center gap-3 px-3 py-2 text-sm">
                    {r.status === "success" ? (
                      <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0" />
                    ) : (
                      <XCircle size={16} className="text-red-400 flex-shrink-0" />
                    )}
                    <span className="text-text-secondary truncate flex-1" title={r.file}>{r.file}</span>
                    <span className={cn("text-xs px-2 py-0.5 rounded-full", r.status === "success" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400")}>
                      {getTypeLabel(r.type)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
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

      {/* ── Section A: Dati anagrafici e configurazione ── */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-3">
          Dati anagrafici e configurazione
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {configStatuses.map((ds) => (
            <DatasetCard
              key={ds.fileType}
              status={ds}
              selectedMonth={selectedMonth}
              onUpload={() => handleCardClick(ds.fileType)}
              uploading={uploading}
            />
          ))}
        </div>
      </motion.div>

      {/* ── Section B: Sorgenti operative mensili ── */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-4">
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider">
            Sorgenti operative mensili
          </h2>
        </div>

        {/* Month completeness */}
        {monthlyStatuses.length > 0 && (
          <div className="mb-4">
            <MonthCompleteness statuses={monthlyStatuses} />
          </div>
        )}

        {/* Operational dataset cards grid */}
        {statusLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
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
            {operationalMonthlyStatuses.map((ds) => (
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

        {/* Open dashboard button */}
        <div className="mt-4 flex justify-end">
          <button
            onClick={() => {
              window.open("/", "_self");
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent-purple/10
                       text-accent-purple text-sm font-semibold hover:bg-accent-purple/20
                       transition-colors border border-accent-purple/20"
          >
            <TrendingUp size={16} />
            Vai alla Dashboard
          </button>
        </div>
      </motion.div>

      {/* ── Section C: Controlli di quadratura ── */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-3">
          Controlli di quadratura
        </h2>
        {statusLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
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
            {controlStatuses.map((ds) => (
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
        existingRows={preview?.existingRows ?? 0}
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
