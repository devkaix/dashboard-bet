// ── Monthly dataset status queries (real Supabase data) ──

import { supabase } from "./supabase";
import {
  analysisMonthToRange,
  analysisMonthToDatabaseDate,
  databaseDateToAnalysisMonth,
} from "./analysisMonth";

// ── Types ──────────────────────────────────────────────────────────────────

export type ImportFileType =
  | "players_master"
  | "daily_player"
  | "daily_network"
  | "daily_pvr"
  | "daily_player_game"
  | "tickets"
  | "player_summary";

export interface MonthlyDatasetStatus {
  fileType: ImportFileType;
  label: string;
  rowCount: number;
  periodStart: string | null;
  periodEnd: string | null;
  lastUploadAt: string | null;
  validationStatus: string | null;
  state: "missing" | "partial" | "complete" | "mismatch" | "error";
}

// ── Constants ──────────────────────────────────────────────────────────────

const LABELS: Record<ImportFileType, string> = {
  daily_network: "Rete",
  daily_pvr: "PVR",
  daily_player: "Giocatori giornalieri",
  daily_player_game: "Provider e giochi",
  tickets: "Ticket",
  player_summary: "Riepilogo mensile",
  players_master: "Anagrafica giocatori",
};

const ALL_FILE_TYPES: ImportFileType[] = [
  "daily_network",
  "daily_pvr",
  "daily_player",
  "daily_player_game",
  "tickets",
  "player_summary",
  "players_master",
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

  // Check if period covers the month
  if (periodStart && periodEnd) {
    const coversStart = periodStart <= monthStart || periodStart <= monthEnd;
    const coversEnd = periodEnd >= monthEnd;
    if (coversStart && coversEnd) return "complete";
  }

  return "partial";
}

// ── Main query ─────────────────────────────────────────────────────────────

export async function getMonthlyDatasetStatus(
  month: string,
): Promise<MonthlyDatasetStatus[]> {
  const { start, end } = analysisMonthToRange(month);

  // Run all independent queries in parallel
  const [
    networkCount,
    pvrCount,
    playerCount,
    gameCount,
    ticketCount,
    playersCount,
    networkUpload,
    pvrUpload,
    playerUpload,
    gameUpload,
    ticketUpload,
    summaryUpload,
    masterUpload,
  ] = await Promise.all([
    countRows("daily_network_stats", "date", start, end),
    countRows("daily_pvr_stats", "date", start, end),
    countRows("daily_player_stats", "date", start, end),
    countRows("daily_player_game_stats", "date", start, end),
    countRows("tickets", "emission_date", start, end),
    supabase
      .from("players")
      .select("*", { count: "exact", head: true })
      .then(({ count, error }) => ({
        count: count ?? 0,
        error: error?.message || null,
      })),
    getUploadInfo("daily_network", month),
    getUploadInfo("daily_pvr", month),
    getUploadInfo("daily_player", month),
    getUploadInfo("daily_player_game", month),
    getUploadInfo("tickets", month),
    getUploadInfo("player_summary", month),
    getUploadInfo("players_master", month),
  ]);

  return [
    // daily_network
    {
      fileType: "daily_network" as ImportFileType,
      label: LABELS.daily_network,
      rowCount: networkCount.error ? 0 : networkCount.count,
      periodStart: networkUpload.periodStart,
      periodEnd: networkUpload.periodEnd,
      lastUploadAt: networkUpload.lastUploadAt,
      validationStatus: networkUpload.validationStatus,
      state: networkCount.error
        ? "error"
        : determineState(
            networkCount.count,
            networkUpload.periodStart,
            networkUpload.periodEnd,
            networkUpload.status,
            networkUpload.validationStatus,
            networkUpload.errorMessage !== null,
            start,
            end,
          ),
    },
    // daily_pvr
    {
      fileType: "daily_pvr" as ImportFileType,
      label: LABELS.daily_pvr,
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
    // daily_player
    {
      fileType: "daily_player" as ImportFileType,
      label: LABELS.daily_player,
      rowCount: playerCount.error ? 0 : playerCount.count,
      periodStart: playerUpload.periodStart,
      periodEnd: playerUpload.periodEnd,
      lastUploadAt: playerUpload.lastUploadAt,
      validationStatus: playerUpload.validationStatus,
      state: playerCount.error
        ? "error"
        : determineState(
            playerCount.count,
            playerUpload.periodStart,
            playerUpload.periodEnd,
            playerUpload.status,
            playerUpload.validationStatus,
            playerUpload.errorMessage !== null,
            start,
            end,
          ),
    },
    // daily_player_game
    {
      fileType: "daily_player_game" as ImportFileType,
      label: LABELS.daily_player_game,
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
    // tickets
    {
      fileType: "tickets" as ImportFileType,
      label: LABELS.tickets,
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
    // player_summary
    {
      fileType: "player_summary" as ImportFileType,
      label: LABELS.player_summary,
      rowCount: 0,
      periodStart: summaryUpload.periodStart,
      periodEnd: summaryUpload.periodEnd,
      lastUploadAt: summaryUpload.lastUploadAt,
      validationStatus: summaryUpload.validationStatus,
      state: summaryUpload.errorMessage !== null && summaryUpload.status === "error"
        ? "error"
        : summaryUpload.validationStatus === "mismatch"
          ? "mismatch"
          : summaryUpload.lastUploadAt !== null
            ? "complete"
            : "missing",
    },
    // players_master
    {
      fileType: "players_master" as ImportFileType,
      label: LABELS.players_master,
      rowCount: playersCount.error ? 0 : playersCount.count,
      periodStart: masterUpload.periodStart,
      periodEnd: masterUpload.periodEnd,
      lastUploadAt: masterUpload.lastUploadAt,
      validationStatus: masterUpload.validationStatus,
      state: masterUpload.errorMessage !== null && masterUpload.status === "error"
        ? "error"
        : playersCount.count > 0
          ? "complete"
          : "missing",
    },
  ];
}
