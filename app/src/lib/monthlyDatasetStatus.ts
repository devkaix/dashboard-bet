// ── Monthly dataset status queries (real Supabase data) ──

import { supabase } from "./supabase";
import {
  analysisMonthToRange,
  analysisMonthToDatabaseDate,
  databaseDateToAnalysisMonth,
} from "./analysisMonth";

// ── Types ──────────────────────────────────────────────────────────────────

export type ImportFileType =
  | "pvr_hierarchy"
  | "players_master"
  | "daily_player"
  | "daily_network"
  | "daily_pvr"
  | "daily_player_game"
  | "tickets"
  | "player_summary"
  | "pvr_summary"
  | "category_summary";

export interface MonthlyDatasetStatus {
  fileType: ImportFileType;
  label: string;
  category: "operational" | "control";
  rowCount: number;
  periodStart: string | null;
  periodEnd: string | null;
  lastUploadAt: string | null;
  validationStatus: string | null;
  state: "missing" | "partial" | "complete" | "mismatch" | "error";
}

// ── Constants ──────────────────────────────────────────────────────────────

const LABELS: Record<ImportFileType, string> = {
  pvr_hierarchy: "Gerarchia PVR (gestione_punto_gerarchia)",
  daily_network: "Giocato totale rete x giorno – controllo",
  daily_pvr: "Giocato per singolo PVR giornaliero",
  daily_player: "Giocato per conto e data – controllo",
  daily_player_game: "Giocato per giocatore/tipologia/giorno",
  tickets: "Ticket scommesse",
  player_summary: "Gioca player di tutta la rete – controllo",
  pvr_summary: "Giocato totale per singolo PVR – controllo",
  category_summary: "Giocato totale suddiviso per tipologia – controllo",
  players_master: "Anagrafica giocatori",
};

const OPERATIONAL_FILE_TYPES: ImportFileType[] = [
  "pvr_hierarchy",
  "players_master",
  "tickets",
  "daily_pvr",
  "daily_player_game",
];

const CONTROL_FILE_TYPES: ImportFileType[] = [
  "daily_network",
  "daily_player",
  "player_summary",
  "pvr_summary",
  "category_summary",
];

const ALL_FILE_TYPES: ImportFileType[] = [
  ...OPERATIONAL_FILE_TYPES,
  ...CONTROL_FILE_TYPES,
];

// ── Helpers ────────────────────────────────────────────────────────────────

function nextDay(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const ny = next.getUTCFullYear();
  const nm = String(next.getUTCMonth() + 1).padStart(2, "0");
  const nd = String(next.getUTCDate()).padStart(2, "0");
  return `${ny}-${nm}-${nd}`;
}

async function countRows(
  table: string,
  column: string,
  start: string,
  end: string,
): Promise<{ count: number; error: string | null }> {
  const { count, error } = await supabase
    .from(table as any)
    .select("*", { count: "exact", head: true })
    .gte(column, start)
    .lt(column, nextDay(end));

  if (error) {
    return { count: 0, error: error.message };
  }
  return { count: count ?? 0, error: null };
}

async function getUploadInfo(
  fileType: string,
  month: string,
): Promise<{
  periodStart: string | null;
  periodEnd: string | null;
  lastUploadAt: string | null;
  validationStatus: string | null;
  status: string | null;
  errorMessage: string | null;
}> {
  const dbMonth = analysisMonthToDatabaseDate(month);

  const { data, error } = await supabase
    .from("excel_uploads")
    .select(
      "period_start, period_end, uploaded_at, validation_status, error_message, status",
    )
    .eq("file_type", fileType)
    .eq("analysis_month", dbMonth)
    .order("uploaded_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return {
      periodStart: null,
      periodEnd: null,
      lastUploadAt: null,
      validationStatus: null,
      status: null,
      errorMessage: error?.message || null,
    };
  }

  return {
    periodStart: data.period_start ?? null,
    periodEnd: data.period_end ?? null,
    lastUploadAt: data.uploaded_at ?? null,
    validationStatus: data.validation_status ?? null,
    status: data.status ?? null,
    errorMessage: data.error_message ?? null,
  };
}

function determineState(
  rowCount: number,
  periodStart: string | null,
  periodEnd: string | null,
  uploadStatus: string | null,
  validationStatus: string | null,
  hasUploadError: boolean,
  monthStart: string,
  monthEnd: string,
): MonthlyDatasetStatus["state"] {
  if (hasUploadError && uploadStatus === "error") return "error";
  if (validationStatus === "mismatch") return "mismatch";
  if (rowCount === 0) return "missing";

  // Datasets without a date range (e.g. masters / hierarchies) are complete if rows exist.
  if (!periodStart || !periodEnd) return "complete";

  // Check if period covers the month
  const coversStart = periodStart <= monthStart || periodStart <= monthEnd;
  const coversEnd = periodEnd >= monthEnd;
  if (coversStart && coversEnd) return "complete";

  return "partial";
}

function determineControlState(
  uploadStatus: string | null,
  validationStatus: string | null,
  hasUploadError: boolean,
  lastUploadAt: string | null,
): MonthlyDatasetStatus["state"] {
  if (hasUploadError && uploadStatus === "error") return "error";
  if (validationStatus === "mismatch") return "mismatch";
  if (lastUploadAt !== null) return "complete";
  return "missing";
}

// ── Main query ─────────────────────────────────────────────────────────────

export async function getMonthlyDatasetStatus(
  month: string,
): Promise<MonthlyDatasetStatus[]> {
  const { start, end } = analysisMonthToRange(month);

  const [
    hierarchyCount,
    playersCount,
    ticketCount,
    pvrCount,
    gameCount,
    hierarchyUpload,
    masterUpload,
    ticketUpload,
    pvrUpload,
    gameUpload,
    networkUpload,
    playerUpload,
    summaryUpload,
    pvrSummaryUpload,
    categorySummaryUpload,
  ] = await Promise.all([
    supabase
      .from("pvrs")
      .select("*", { count: "exact", head: true })
      .then(({ count, error }) => ({
        count: count ?? 0,
        error: error?.message || null,
      })),
    supabase
      .from("players")
      .select("*", { count: "exact", head: true })
      .then(({ count, error }) => ({
        count: count ?? 0,
        error: error?.message || null,
      })),
    countRows("tickets", "emission_date", start, end),
    countRows("daily_pvr_stats", "date", start, end),
    countRows("daily_player_game_stats", "date", start, end),
    getUploadInfo("pvr_hierarchy", month),
    getUploadInfo("players_master", month),
    getUploadInfo("tickets", month),
    getUploadInfo("daily_pvr", month),
    getUploadInfo("daily_player_game", month),
    getUploadInfo("daily_network", month),
    getUploadInfo("daily_player", month),
    getUploadInfo("player_summary", month),
    getUploadInfo("pvr_summary", month),
    getUploadInfo("category_summary", month),
  ]);

  return [
    // Operational: hierarchy
    {
      fileType: "pvr_hierarchy",
      label: LABELS.pvr_hierarchy,
      category: "operational",
      rowCount: hierarchyCount.error ? 0 : hierarchyCount.count,
      periodStart: hierarchyUpload.periodStart,
      periodEnd: hierarchyUpload.periodEnd,
      lastUploadAt: hierarchyUpload.lastUploadAt,
      validationStatus: hierarchyUpload.validationStatus,
      state: hierarchyCount.error
        ? "error"
        : determineState(
            hierarchyCount.count,
            hierarchyUpload.periodStart,
            hierarchyUpload.periodEnd,
            hierarchyUpload.status,
            hierarchyUpload.validationStatus,
            hierarchyUpload.errorMessage !== null,
            start,
            end,
          ),
    },
    // Operational: players master
    {
      fileType: "players_master",
      label: LABELS.players_master,
      category: "operational",
      rowCount: playersCount.error ? 0 : playersCount.count,
      periodStart: masterUpload.periodStart,
      periodEnd: masterUpload.periodEnd,
      lastUploadAt: masterUpload.lastUploadAt,
      validationStatus: masterUpload.validationStatus,
      state: playersCount.error
        ? "error"
        : determineState(
            playersCount.count,
            masterUpload.periodStart,
            masterUpload.periodEnd,
            masterUpload.status,
            masterUpload.validationStatus,
            masterUpload.errorMessage !== null,
            start,
            end,
          ),
    },
    // Operational: tickets
    {
      fileType: "tickets",
      label: LABELS.tickets,
      category: "operational",
      rowCount: ticketCount.error ? 0 : ticketCount.count,
      periodStart: ticketUpload.periodStart,
      periodEnd: ticketUpload.periodEnd,
      lastUploadAt: ticketUpload.lastUploadAt,
      validationStatus: ticketUpload.validationStatus,
      state: ticketCount.error
        ? "error"
        : determineState(
            ticketCount.count,
            ticketUpload.periodStart,
            ticketUpload.periodEnd,
            ticketUpload.status,
            ticketUpload.validationStatus,
            ticketUpload.errorMessage !== null,
            start,
            end,
          ),
    },
    // Operational: daily_pvr
    {
      fileType: "daily_pvr",
      label: LABELS.daily_pvr,
      category: "operational",
      rowCount: pvrCount.error ? 0 : pvrCount.count,
      periodStart: pvrUpload.periodStart,
      periodEnd: pvrUpload.periodEnd,
      lastUploadAt: pvrUpload.lastUploadAt,
      validationStatus: pvrUpload.validationStatus,
      state: pvrCount.error
        ? "error"
        : determineState(
            pvrCount.count,
            pvrUpload.periodStart,
            pvrUpload.periodEnd,
            pvrUpload.status,
            pvrUpload.validationStatus,
            pvrUpload.errorMessage !== null,
            start,
            end,
          ),
    },
    // Operational: daily_player_game
    {
      fileType: "daily_player_game",
      label: LABELS.daily_player_game,
      category: "operational",
      rowCount: gameCount.error ? 0 : gameCount.count,
      periodStart: gameUpload.periodStart,
      periodEnd: gameUpload.periodEnd,
      lastUploadAt: gameUpload.lastUploadAt,
      validationStatus: gameUpload.validationStatus,
      state: gameCount.error
        ? "error"
        : determineState(
            gameCount.count,
            gameUpload.periodStart,
            gameUpload.periodEnd,
            gameUpload.status,
            gameUpload.validationStatus,
            gameUpload.errorMessage !== null,
            start,
            end,
          ),
    },
    // Control: daily_network (derived from daily_pvr)
    {
      fileType: "daily_network",
      label: LABELS.daily_network,
      category: "control",
      rowCount: 0,
      periodStart: networkUpload.periodStart,
      periodEnd: networkUpload.periodEnd,
      lastUploadAt: networkUpload.lastUploadAt,
      validationStatus: networkUpload.validationStatus,
      state: determineControlState(
        networkUpload.status,
        networkUpload.validationStatus,
        networkUpload.errorMessage !== null,
        networkUpload.lastUploadAt,
      ),
    },
    // Control: daily_player (derived from daily_player_game)
    {
      fileType: "daily_player",
      label: LABELS.daily_player,
      category: "control",
      rowCount: 0,
      periodStart: playerUpload.periodStart,
      periodEnd: playerUpload.periodEnd,
      lastUploadAt: playerUpload.lastUploadAt,
      validationStatus: playerUpload.validationStatus,
      state: determineControlState(
        playerUpload.status,
        playerUpload.validationStatus,
        playerUpload.errorMessage !== null,
        playerUpload.lastUploadAt,
      ),
    },
    // Control: player_summary
    {
      fileType: "player_summary",
      label: LABELS.player_summary,
      category: "control",
      rowCount: 0,
      periodStart: summaryUpload.periodStart,
      periodEnd: summaryUpload.periodEnd,
      lastUploadAt: summaryUpload.lastUploadAt,
      validationStatus: summaryUpload.validationStatus,
      state: determineControlState(
        summaryUpload.status,
        summaryUpload.validationStatus,
        summaryUpload.errorMessage !== null,
        summaryUpload.lastUploadAt,
      ),
    },
    // Control: pvr_summary
    {
      fileType: "pvr_summary",
      label: LABELS.pvr_summary,
      category: "control",
      rowCount: 0,
      periodStart: pvrSummaryUpload.periodStart,
      periodEnd: pvrSummaryUpload.periodEnd,
      lastUploadAt: pvrSummaryUpload.lastUploadAt,
      validationStatus: pvrSummaryUpload.validationStatus,
      state: determineControlState(
        pvrSummaryUpload.status,
        pvrSummaryUpload.validationStatus,
        pvrSummaryUpload.errorMessage !== null,
        pvrSummaryUpload.lastUploadAt,
      ),
    },
    // Control: category_summary
    {
      fileType: "category_summary",
      label: LABELS.category_summary,
      category: "control",
      rowCount: 0,
      periodStart: categorySummaryUpload.periodStart,
      periodEnd: categorySummaryUpload.periodEnd,
      lastUploadAt: categorySummaryUpload.lastUploadAt,
      validationStatus: categorySummaryUpload.validationStatus,
      state: determineControlState(
        categorySummaryUpload.status,
        categorySummaryUpload.validationStatus,
        categorySummaryUpload.errorMessage !== null,
        categorySummaryUpload.lastUploadAt,
      ),
    },
  ];
}
