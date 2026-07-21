// ── Analysis month utilities (pure functions, no React / no Supabase) ──

const MONTH_NAMES_IT: Record<number, string> = {
  1: "Gennaio",
  2: "Febbraio",
  3: "Marzo",
  4: "Aprile",
  5: "Maggio",
  6: "Giugno",
  7: "Luglio",
  8: "Agosto",
  9: "Settembre",
  10: "Ottobre",
  11: "Novembre",
  12: "Dicembre",
};

const MONTH_NAMES_IT_REVERSE: Record<string, number> = Object.fromEntries(
  Object.entries(MONTH_NAMES_IT).map(([k, v]) => [v.toLowerCase(), Number(k)]),
);

const YYYY_MM_RE = /^(\d{4})[-/](\d{1,2})$/;
const YYYY_MM_DD_RE = /^\d{4}-\d{2}-\d{2}$/;

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Normalise a month value to YYYY-MM format.
 *
 * Accepts:
 *   "2026-06"  → "2026-06"
 *   "2026-6"   → "2026-06"
 *   "2026/06"  → "2026-06"
 *   "Giugno 2026"  → "2026-06"
 *
 * Throws if the value cannot be parsed.
 */
export function normalizeAnalysisMonth(value: string): string {
  const trimmed = value.trim();

  // Try YYYY-MM or YYYY/M
  const numMatch = trimmed.match(YYYY_MM_RE);
  if (numMatch) {
    const year = Number(numMatch[1]);
    const month = Number(numMatch[2]);
    if (month < 1 || month > 12) {
      throw new Error(`Invalid month in "${value}": month must be 1-12`);
    }
    return `${year}-${String(month).padStart(2, "0")}`;
  }

  // Try Italian name "Mese Anno" or "Anno Mese"
  const parts = trimmed.split(/\s+/);
  if (parts.length === 2) {
    const lowerA = parts[0].toLowerCase();
    const lowerB = parts[1].toLowerCase();
    const monthA = MONTH_NAMES_IT_REVERSE[lowerA];
    const monthB = MONTH_NAMES_IT_REVERSE[lowerB];

    let month: number;
    let year: number;

    if (monthA !== undefined && /^\d{4}$/.test(parts[1])) {
      month = monthA;
      year = Number(parts[1]);
    } else if (monthB !== undefined && /^\d{4}$/.test(parts[0])) {
      month = monthB;
      year = Number(parts[0]);
    } else {
      throw new Error(`Cannot parse month from "${value}"`);
    }

    return `${year}-${String(month).padStart(2, "0")}`;
  }

  throw new Error(`Cannot parse month from "${value}"`);
}

/**
 * Convert YYYY-MM to a date range { start, end }.
 * start = YYYY-MM-01, end = YYYY-MM-lastDay
 */
export function analysisMonthToRange(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const endDay = daysInMonth(y, m);
  return {
    start: `${month}-01`,
    end: `${month}-${String(endDay).padStart(2, "0")}`,
  };
}

/**
 * Check whether an ISO date "YYYY-MM-DD" belongs to the given YYYY-MM month.
 */
export function dateBelongsToMonth(date: string, month: string): boolean {
  if (!YYYY_MM_DD_RE.test(date)) return false;
  return date.slice(0, 7) === month;
}

/**
 * Format YYYY-MM to Italian locale (e.g. "Giugno 2026").
 */
export function formatAnalysisMonth(month: string): string {
  const match = month.match(/^(\d{4})-(\d{2})$/);
  if (!match) throw new Error(`Invalid month format: "${month}"`);
  const year = match[1];
  const monthNum = Number(match[2]);
  const monthName = MONTH_NAMES_IT[monthNum];
  if (!monthName) throw new Error(`Invalid month number: ${monthNum}`);
  return `${monthName} ${year}`;
}

/**
 * Extract unique YYYY-MM values from an array of ISO dates (YYYY-MM-DD).
 * Results are sorted chronologically.
 */
export function getMonthsFromDates(dates: string[]): string[] {
  const months = new Set<string>();
  for (const d of dates) {
    if (YYYY_MM_DD_RE.test(d)) {
      months.add(d.slice(0, 7));
    }
  }
  return Array.from(months).sort();
}

// ── Month validation for import ──────────────────────────────────────────

export type ImportFileType =
  | "players_master"
  | "daily_player"
  | "daily_network"
  | "daily_pvr"
  | "daily_player_game"
  | "tickets"
  | "player_summary";

export interface MonthValidationResult {
  valid: boolean;
  selectedMonth: string | null;
  detectedMonths: string[];
  periodStart: string | null;
  periodEnd: string | null;
  validDateRows: number;
  invalidDateRows: number;
  status:
    | "not_applicable"
    | "valid"
    | "month_mismatch"
    | "multiple_months"
    | "missing_date";
}

/**
 * Validate that all dates in a file belong to the selected analysis month.
 *
 * Rules by file type:
 * - daily_network, daily_pvr, daily_player: use "Data" column
 * - daily_player_game: use "Data" column (NOT "Data.1" which is provider)
 * - tickets: use "Data Emissione" column
 * - player_summary: no date column, uses selected month as validation target
 * - players_master: not applicable
 */
export function validateFileMonth(
  fileType: ImportFileType,
  rows: ReadonlyArray<Record<string, unknown>>,
  selectedMonth: string | null,
): MonthValidationResult {
  // players_master: month not applicable
  if (fileType === "players_master") {
    return {
      valid: true,
      selectedMonth: null,
      detectedMonths: [],
      periodStart: null,
      periodEnd: null,
      validDateRows: 0,
      invalidDateRows: 0,
      status: "not_applicable",
    };
  }

  // player_summary: uses selected month as the validation target (no date column)
  if (fileType === "player_summary") {
    if (!selectedMonth) {
      return {
        valid: false,
        selectedMonth: null,
        detectedMonths: [],
        periodStart: null,
        periodEnd: null,
        validDateRows: 0,
        invalidDateRows: rows.length,
        status: "missing_date",
      };
    }
    return {
      valid: true,
      selectedMonth,
      detectedMonths: [selectedMonth],
      periodStart: null,
      periodEnd: null,
      validDateRows: rows.length,
      invalidDateRows: 0,
      status: "valid",
    };
  }

  // Determine the date column name based on file type
  const dateColumn =
    fileType === "tickets"
      ? ["Data Emissione", "emission_date", "data_emissione"]
      : ["Data", "data", "Date", "date"];

  // Extract dates from rows
  const dates: string[] = [];
  let validDateRows = 0;
  let invalidDateRows = 0;

  for (const row of rows) {
    let rawValue: unknown = undefined;
    for (const col of dateColumn) {
      if (col in row) {
        rawValue = row[col];
        break;
      }
    }

    if (rawValue === undefined || rawValue === null || String(rawValue).trim() === "") {
      invalidDateRows++;
      continue;
    }

    // Try to parse date: YYYY-MM-DD or DD/MM/YYYY formats
    const s = String(rawValue).trim();
    let isoDate: string | null = null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      isoDate = s;
    } else if (/^\d{4}\/\d{2}\/\d{2}$/.test(s)) {
      isoDate = s.replace(/\//g, "-");
    } else {
      const parts = s.split("/");
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          // YYYY/MM/DD
          isoDate = `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
        } else {
          // DD/MM/YYYY or DD/MM/YY
          const y = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
          isoDate = `${y}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
        }
      }
    }

    if (isoDate && YYYY_MM_DD_RE.test(isoDate)) {
      dates.push(isoDate);
      validDateRows++;
    } else {
      invalidDateRows++;
    }
  }

  if (dates.length === 0) {
    return {
      valid: false,
      selectedMonth,
      detectedMonths: [],
      periodStart: null,
      periodEnd: null,
      validDateRows,
      invalidDateRows,
      status: "missing_date",
    };
  }

  // Sort dates and get period
  dates.sort();
  const periodStart = dates[0];
  const periodEnd = dates[dates.length - 1];

  // Get unique months from dates
  const detectedMonths = getMonthsFromDates(dates);

  // Multi-month: block
  if (detectedMonths.length > 1) {
    return {
      valid: false,
      selectedMonth,
      detectedMonths,
      periodStart,
      periodEnd,
      validDateRows,
      invalidDateRows,
      status: "multiple_months",
    };
  }

  // Check month matches
  if (selectedMonth && detectedMonths[0] !== selectedMonth) {
    return {
      valid: false,
      selectedMonth,
      detectedMonths,
      periodStart,
      periodEnd,
      validDateRows,
      invalidDateRows,
      status: "month_mismatch",
    };
  }

  return {
    valid: true,
    selectedMonth: selectedMonth || detectedMonths[0],
    detectedMonths,
    periodStart,
    periodEnd,
    validDateRows,
    invalidDateRows,
    status: "valid",
  };
}
