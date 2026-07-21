import { fromZonedTime } from "date-fns-tz";

const ROME_TZ = "Europe/Rome";

function expandTwoDigitYear(y: string): string {
  if (y.length !== 2) return y;
  const yy = parseInt(y, 10);
  return String(yy < 50 ? 2000 + yy : 1900 + yy);
}

export function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  const s = String(v).trim();
  if (s === "" || s === "None") return 0;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let clean = s;
  if (lastComma > -1 && lastDot > -1) {
    // Mixed separators: the rightmost one is the decimal separator.
    if (lastComma > lastDot) {
      clean = s.replace(/\./g, "").replace(",", ".");
    } else {
      clean = s.replace(/,/g, "");
    }
  } else if (lastComma > -1) {
    const commaCount = (s.match(/,/g) || []).length;
    clean = commaCount > 1 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (lastDot > -1) {
    const dotCount = (s.match(/\./g) || []).length;
    clean = dotCount > 1 ? s.replace(/\./g, "") : s;
  }
  const n = parseFloat(clean);
  return (isNaN(n) || !isFinite(n)) ? 0 : n;
}

export function normalizeUsername(s: string): string {
  return String(s || "").trim().toLowerCase();
}

export function pDate(v: unknown): string | null {
  if (!v) return null;
  const s = String(v).trim();
  if (/^\d{4}[\/\-]\d{2}[\/\-]\d{2}$/.test(s)) return s.replace(/\//g, "-");
  const p = s.split("/");
  if (p.length === 3) {
    if (p[0].length === 4) {
      // YYYY/MM/DD
      const [y, m, d] = p;
      return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    // DD/MM/YYYY or DD/MM/YY
    const d = p[0].padStart(2, "0");
    const m = p[1].padStart(2, "0");
    const y = expandTwoDigitYear(p[2]);
    return `${y}-${m}-${d}`;
  }
  return null;
}

export function pDt(v: unknown): string | null {
  if (!v) return null;
  const s = String(v).trim().replace(/\/\/\s*/, "");
  if (!s) return null;

  let localIso: string | null = null;

  // ISO-like: 2026-06-19 02:15:39
  const iso = s.match(/^(\d{4})[\-\/](\d{2})[\-\/](\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (iso) {
    localIso = `${iso[1]}-${iso[2]}-${iso[3]}T${iso[4]}:${iso[5]}:${iso[6]}`;
  }

  // Italian: 19/06/2026  03:02:02 (with double space) or 30/06/2026 14:30:00 or 19/06/26 14:30:00
  const it = s.match(/^(\d{2})\/(\d{2})\/(\d{2,4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (it) {
    const y = expandTwoDigitYear(it[3]);
    localIso = `${y}-${it[2]}-${it[1]}T${it[4]}:${it[5]}:${it[6]}`;
  }

  if (!localIso) return null;

  // Convert from Italy local time to UTC so Supabase stores the correct instant.
  try {
    return fromZonedTime(localIso, ROME_TZ).toISOString();
  } catch {
    return null;
  }
}

type FileTypeContract = {
  type: string;
  required: string[]; // must ALL be present (case-insensitive)
  forbidden?: string[]; // if ANY is present, reject this type
}

const FILE_TYPE_CONTRACTS: FileTypeContract[] = [
  { type: "daily_player_game", required: ["Data", "Data.1", "Gioco", "Username", "Bet", "Won", "Rake"] },
  { type: "daily_pvr", required: ["ID Liv 1", "Liv 1", "Data", "Bet", "Won", "Rake"] },
  { type: "tickets", required: ["Ticket", "Username", "Codice Padre", "Data Emissione", "Stato"] },
  { type: "players_master", required: ["user", "PVR rif.", "stato", "saldo", "saldo prel", "creato"] },
  { type: "player_summary", required: ["Username", "Bet", "Won", "Rake"], forbidden: ["Data"] },
  { type: "daily_player", required: ["Data", "Username", "Bet", "Won", "Rake"] },
  { type: "daily_network", required: ["Data", "Bet", "Won", "Rake"], forbidden: ["Username", "ID Liv 1"] },
];

function headerMatches(headers: string[], field: string): boolean {
  const f = field.toLowerCase().trim();
  // Exact match (case-insensitive)
  if (headers.some((h) => h === f)) return true;
  // Normalized match: collapse all non-alphanumeric characters
  const fn = f.replace(/[^a-z0-9]/g, "");
  if (fn.length > 0 && headers.some((h) => h.replace(/[^a-z0-9]/g, "") === fn)) return true;
  return false;
}

export function det(hdr: string[]): string {
  const h = hdr.map((x) => x.toLowerCase().trim());

  for (const contract of FILE_TYPE_CONTRACTS) {
    const hasAllRequired = contract.required.every((r) => headerMatches(h, r));
    if (!hasAllRequired) continue;

    if (contract.forbidden) {
      const hasForbidden = contract.forbidden.some((f) => headerMatches(h, f));
      if (hasForbidden) continue;
    }

    return contract.type;
  }

  // Legacy fallback for English players_master headers
  const joined = h.join("|");
  if (joined.includes("kyc") || joined.includes("pvr ref") || joined.includes("withdrawable")) return "players_master";

  return "unknown";
}

export function col(row: Record<string, unknown>, names: string[]): unknown {
  for (const n of names) {
    if (n in row) return row[n];
  }
  return undefined;
}

export function dateFromTimestamp(ts: string | null): string | null {
  if (!ts) return null;
  return ts.split("T")[0];
}
