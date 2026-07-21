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
