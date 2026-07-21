// ── Monthly dataset status queries (real Supabase data) ──

import { supabase } from "./supabase";
import { analysisMonthToRange } from "./analysisMonth";

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

/** Minimum rows expected in a complete month (feb has 28 days, most have 30-31). */
const COMPLETE_THRESHOLDS: Partial<Record<ImportFileType, number>> = {
  daily_network: 25,
  daily_pvr: 300,
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
): Promise<number> {
  const { count, error } = await supabase
    .from(table as any)
    .select("*", { count: "exact", head: true })
    .gte(column, start)
    .lt(column, nextDay(end));

  if (error) {
    console.error(`countRows(${table}):`, error);
    return 0;
  }
  return count ?? 0;
}

async function getUploadInfo(
  fileType: string,
  month: string,
): Promise<{
  periodStart: string | null;
  periodEnd: string | null;
  lastUploadAt: string | null;
  validationStatus: string | null;
  errorMessage: string | null;
}> {
  const { data, error } = await supabase
    .from("excel_uploads")
    .select(
      "period_start, period_end, uploaded_at, validation_status, error_message",
    )
    .eq("file_type", fileType)
    .like("period_start", `${month}-%`)
    .order("uploaded_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return {
      periodStart: null,
      periodEnd: null,
      lastUploadAt: null,
      validationStatus: null,
      errorMessage: null,
    };
  }

  return {
    periodStart: data.period_start ?? null,
    periodEnd: data.period_end ?? null,
    lastUploadAt: data.uploaded_at ?? null,
    validationStatus: data.validation_status ?? null,
    errorMessage: data.error_message ?? null,
  };
}

function determineState(
  fileType: ImportFileType,
  rowCount: number,
  validationStatus: string | null,
  hasUploadError: boolean,
): MonthlyDatasetStatus["state"] {
  if (hasUploadError) return "error";
  if (validationStatus === "mismatch") return "mismatch";

  if (rowCount === 0) return "missing";

  const threshold = COMPLETE_THRESHOLDS[fileType];
  if (threshold !== undefined && rowCount >= threshold) return "complete";
  if (threshold !== undefined && rowCount < threshold) return "partial";

  // For file types without a threshold: any rows → complete
  return "complete";
}

// ── Main query ─────────────────────────────────────────────────────────────

export async function getMonthlyDatasetStatus(
  month: string,
): Promise<MonthlyDatasetStatus[]> {
  const { start, end } = analysisMonthToRange(month);

  const results: MonthlyDatasetStatus[] = [];

  for (const fileType of ALL_FILE_TYPES) {
    let rowCount: number;

    switch (fileType) {
      case "daily_network":
        rowCount = await countRows("daily_network_stats", "date", start, end);
        break;
      case "daily_pvr":
        rowCount = await countRows("daily_pvr_stats", "date", start, end);
        break;
      case "daily_player":
        rowCount = await countRows("daily_player_stats", "date", start, end);
        break;
      case "daily_player_game":
        rowCount = await countRows(
          "daily_player_game_stats",
          "date",
          start,
          end,
        );
        break;
      case "tickets":
        rowCount = await countRows("tickets", "emission_date", start, end);
        break;
      case "player_summary": {
        // Check excel_uploads for player_summary in this month
        const uploadInfo = await getUploadInfo("player_summary", month);
        rowCount = 0; // player_summary has no dedicated stats table
        const hasUploadError = uploadInfo.errorMessage !== null;

        results.push({
          fileType,
          label: LABELS[fileType],
          rowCount,
          periodStart: uploadInfo.periodStart,
          periodEnd: uploadInfo.periodEnd,
          lastUploadAt: uploadInfo.lastUploadAt,
          validationStatus: uploadInfo.validationStatus,
          state: hasUploadError
            ? "error"
            : uploadInfo.validationStatus === "mismatch"
              ? "mismatch"
              : uploadInfo.lastUploadAt !== null
                ? "complete"
                : "missing",
        });
        continue;
      }
      case "players_master": {
        // Total players — not month-specific
        const { count, error } = await supabase
          .from("players")
          .select("*", { count: "exact", head: true });

        if (error) {
          console.error("countRows(players):", error);
          rowCount = 0;
        } else {
          rowCount = count ?? 0;
        }

        const uploadInfo = await getUploadInfo("players_master", month);

        results.push({
          fileType,
          label: LABELS[fileType],
          rowCount,
          periodStart: uploadInfo.periodStart,
          periodEnd: uploadInfo.periodEnd,
          lastUploadAt: uploadInfo.lastUploadAt,
          validationStatus: uploadInfo.validationStatus,
          state: uploadInfo.errorMessage !== null
            ? "error"
            : rowCount > 0
              ? "complete"
              : "missing",
        });
        continue;
      }
      default: {
        rowCount = 0;
        break;
      }
    }

    const uploadInfo = await getUploadInfo(fileType, month);

    results.push({
      fileType,
      label: LABELS[fileType],
      rowCount,
      periodStart: uploadInfo.periodStart,
      periodEnd: uploadInfo.periodEnd,
      lastUploadAt: uploadInfo.lastUploadAt,
      validationStatus: uploadInfo.validationStatus,
      state: determineState(
        fileType,
        rowCount,
        uploadInfo.validationStatus,
        uploadInfo.errorMessage !== null,
      ),
    });
  }

  return results;
}
