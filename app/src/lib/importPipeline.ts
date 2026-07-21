import { pDate } from "./uploadHelpers";

// ── Types ──────────────────────────────────────────────────────────────────

export type ImportFileType =
  | "players_master"
  | "daily_player"
  | "daily_network"
  | "daily_pvr"
  | "daily_player_game"
  | "tickets"
  | "player_summary"
  | "unknown";

export interface ImportValidationIssue {
  row: number;
  field: string;
  rawValue: unknown;
  reason: string;
  level: "warning" | "error";
}

export interface ParsedImportRow {
  data: Record<string, unknown>;
  issues: ImportValidationIssue[];
}

// ── Validation helpers ─────────────────────────────────────────────────────

/**
 * Parses a required numeric field.
 * Returns an error if the value is undefined, null, empty string, NaN, or non-finite.
 */
export function parseRequiredNumber(
  raw: unknown,
  fieldName: string,
): { value: number; error?: string } {
  if (raw === undefined || raw === null) {
    return { value: 0, error: `${fieldName}: valore mancante` };
  }
  const s = String(raw).trim();
  if (s === "" || s === "None") {
    return { value: 0, error: `${fieldName}: valore mancante` };
  }
  const n = typeof raw === "number" ? raw : parseFloat(s);
  if (isNaN(n) || !isFinite(n)) {
    return { value: 0, error: `${fieldName}: valore non numerico (${s})` };
  }
  return { value: n };
}

/**
 * Parses an optional numeric field.
 * Returns null if undefined, null, or empty string.
 * Returns an error if NaN or non-finite.
 */
export function parseOptionalNumber(
  raw: unknown,
  fieldName: string,
): { value: number | null; error?: string } {
  if (raw === undefined || raw === null) return { value: null };
  const s = String(raw).trim();
  if (s === "" || s === "None") return { value: null };
  const n = typeof raw === "number" ? raw : parseFloat(s);
  if (isNaN(n) || !isFinite(n)) {
    return { value: 0, error: `${fieldName}: valore non numerico (${s})` };
  }
  return { value: n };
}

/**
 * Parses a required date field using pDate().
 * Returns an error if the value cannot be parsed as a date.
 */
export function parseRequiredDate(
  raw: unknown,
  fieldName: string,
): { value: string; error?: string } {
  const d = pDate(raw);
  if (!d) {
    return { value: "", error: `${fieldName}: data non valida (${String(raw ?? "")})` };
  }
  return { value: d };
}

/**
 * Parses a required string field.
 * Trims the value; returns an error if empty after trimming.
 */
export function parseRequiredString(
  raw: unknown,
  fieldName: string,
): { value: string; error?: string } {
  const s = String(raw ?? "").trim();
  if (!s) {
    return { value: "", error: `${fieldName}: valore mancante` };
  }
  return { value: s };
}

// ── File-type contracts ────────────────────────────────────────────────────

interface FileTypeContract {
  type: ImportFileType;
  fields: ImportFieldDef[];
}

interface ImportFieldDef {
  name: string;
  columnNames: string[];
  required: boolean;
  parser: (raw: unknown, fieldName: string) => { value: unknown; error?: string };
}

/**
 * Returns the field definitions for each supported file type.
 * Each field maps to one or more possible Excel column names.
 */
function getContractByType(fileType: ImportFileType): FileTypeContract | null {
  const contracts: Record<string, FileTypeContract> = {
    players_master: {
      type: "players_master",
      fields: [
        { name: "username", columnNames: ["user", "Username", "username", "User"], required: true, parser: parseRequiredString },
        { name: "pvr_ref_code", columnNames: ["PVR rif.", "PVR", "pvr_ref_code", "Pvr Ref Code", "Codice PVR", "Codice Padre"], required: false, parser: (raw, fn) => {
          const { value, error } = parseRequiredString(raw, fn);
          return { value: value || null, error };
        } },
        { name: "email", columnNames: ["Email", "email", "E-mail"], required: false, parser: (raw, fn) => {
          const s = String(raw ?? "").trim();
          return { value: s || null };
        } },
        { name: "kyc_status", columnNames: ["stato", "Kyc Status", "kyc_status", "KYC", "Stato KYC"], required: false, parser: (raw, fn) => {
          const s = String(raw ?? "").trim();
          return { value: s || null };
        } },
        { name: "balance", columnNames: ["saldo", "Balance", "balance"], required: true, parser: parseRequiredNumber },
        { name: "withdrawable_balance", columnNames: ["saldo prel", "Withdrawable Balance", "withdrawable_balance"], required: true, parser: parseRequiredNumber },
        { name: "registration_date", columnNames: ["creato", "Registration Date", "registration_date", "Data Registrazione"], required: false, parser: (raw, fn) => {
          const d = pDate(raw);
          return { value: d };
        } },
      ],
    },
    daily_player: {
      type: "daily_player",
      fields: [
        { name: "date", columnNames: ["Data", "data", "Date", "date"], required: true, parser: parseRequiredDate },
        { name: "username", columnNames: ["Username", "username", "User"], required: true, parser: parseRequiredString },
        { name: "buy_in", columnNames: ["Buy In", "buy_in", "BuyIn"], required: true, parser: parseRequiredNumber },
        { name: "buy_in_bonus", columnNames: ["Buy In Bonus", "buy_in_bonus", "BuyInBonus"], required: true, parser: parseRequiredNumber },
        { name: "stack", columnNames: ["Stack", "stack"], required: true, parser: parseRequiredNumber },
        { name: "bet", columnNames: ["Bet", "bet"], required: true, parser: parseRequiredNumber },
        { name: "won", columnNames: ["Won", "won"], required: true, parser: parseRequiredNumber },
        { name: "rake", columnNames: ["Rake", "rake"], required: true, parser: parseRequiredNumber },
        { name: "payout", columnNames: ["Payout", "payout"], required: true, parser: parseRequiredNumber },
        { name: "bet_bonus", columnNames: ["Bet Bonus", "bet_bonus", "BetBonus"], required: true, parser: parseRequiredNumber },
        { name: "jackpot", columnNames: ["Jackpot", "jackpot"], required: true, parser: parseRequiredNumber },
        { name: "jackpot_won", columnNames: ["Jackpot Won", "jackpot_won", "JackpotWon"], required: true, parser: parseRequiredNumber },
        { name: "overlay", columnNames: ["Overlay", "overlay"], required: true, parser: parseRequiredNumber },
        { name: "refund", columnNames: ["Refund", "refund"], required: true, parser: parseRequiredNumber },
      ],
    },
    daily_network: {
      type: "daily_network",
      fields: [
        { name: "date", columnNames: ["Data", "data", "Date", "date"], required: true, parser: parseRequiredDate },
        { name: "buy_in", columnNames: ["Buy In", "buy_in", "BuyIn"], required: true, parser: parseRequiredNumber },
        { name: "buy_in_bonus", columnNames: ["Buy In Bonus", "buy_in_bonus", "BuyInBonus"], required: true, parser: parseRequiredNumber },
        { name: "stack", columnNames: ["Stack", "stack"], required: true, parser: parseRequiredNumber },
        { name: "bet", columnNames: ["Bet", "bet"], required: true, parser: parseRequiredNumber },
        { name: "won", columnNames: ["Won", "won"], required: true, parser: parseRequiredNumber },
        { name: "rake", columnNames: ["Rake", "rake"], required: true, parser: parseRequiredNumber },
        { name: "payout", columnNames: ["Payout", "payout"], required: true, parser: parseRequiredNumber },
        { name: "bet_bonus", columnNames: ["Bet Bonus", "bet_bonus", "BetBonus"], required: true, parser: parseRequiredNumber },
        { name: "jackpot", columnNames: ["Jackpot", "jackpot"], required: true, parser: parseRequiredNumber },
        { name: "jackpot_won", columnNames: ["Jackpot Won", "jackpot_won", "JackpotWon"], required: true, parser: parseRequiredNumber },
        { name: "overlay", columnNames: ["Overlay", "overlay"], required: true, parser: parseRequiredNumber },
        { name: "refund", columnNames: ["Refund", "refund"], required: true, parser: parseRequiredNumber },
      ],
    },
    daily_pvr: {
      type: "daily_pvr",
      fields: [
        { name: "eid", columnNames: ["ID Liv 1", "id_liv_1", "Pvr Id"], required: true, parser: parseRequiredString },
        { name: "name", columnNames: ["Liv 1", "liv_1", "Pvr Name"], required: true, parser: parseRequiredString },
        { name: "date", columnNames: ["Data", "data", "Date", "date"], required: true, parser: parseRequiredDate },
        { name: "buy_in", columnNames: ["Buy In", "buy_in", "BuyIn"], required: true, parser: parseRequiredNumber },
        { name: "buy_in_bonus", columnNames: ["Buy In Bonus", "buy_in_bonus", "BuyInBonus"], required: true, parser: parseRequiredNumber },
        { name: "stack", columnNames: ["Stack", "stack"], required: true, parser: parseRequiredNumber },
        { name: "bet", columnNames: ["Bet", "bet"], required: true, parser: parseRequiredNumber },
        { name: "won", columnNames: ["Won", "won"], required: true, parser: parseRequiredNumber },
        { name: "rake", columnNames: ["Rake", "rake"], required: true, parser: parseRequiredNumber },
        { name: "payout", columnNames: ["Payout", "payout"], required: true, parser: parseRequiredNumber },
        { name: "bet_bonus", columnNames: ["Bet Bonus", "bet_bonus", "BetBonus"], required: true, parser: parseRequiredNumber },
        { name: "jackpot", columnNames: ["Jackpot", "jackpot"], required: true, parser: parseRequiredNumber },
        { name: "jackpot_won", columnNames: ["Jackpot Won", "jackpot_won", "JackpotWon"], required: true, parser: parseRequiredNumber },
        { name: "overlay", columnNames: ["Overlay", "overlay"], required: true, parser: parseRequiredNumber },
        { name: "refund", columnNames: ["Refund", "refund"], required: true, parser: parseRequiredNumber },
      ],
    },
    daily_player_game: {
      type: "daily_player_game",
      fields: [
        { name: "date", columnNames: ["Data", "data"], required: true, parser: parseRequiredDate },
        { name: "provider", columnNames: ["Data.1", "provider", "Provider"], required: true, parser: parseRequiredString },
        { name: "game_name", columnNames: ["Gioco", "game_name", "GameName", "gioco"], required: true, parser: parseRequiredString },
        { name: "username", columnNames: ["Username", "username", "User"], required: true, parser: parseRequiredString },
        { name: "buy_in", columnNames: ["Buy In", "buy_in", "BuyIn"], required: true, parser: parseRequiredNumber },
        { name: "buy_in_bonus", columnNames: ["Buy In Bonus", "buy_in_bonus", "BuyInBonus"], required: true, parser: parseRequiredNumber },
        { name: "stack", columnNames: ["Stack", "stack"], required: true, parser: parseRequiredNumber },
        { name: "bet", columnNames: ["Bet", "bet"], required: true, parser: parseRequiredNumber },
        { name: "won", columnNames: ["Won", "won"], required: true, parser: parseRequiredNumber },
        { name: "rake", columnNames: ["Rake", "rake"], required: true, parser: parseRequiredNumber },
        { name: "payout", columnNames: ["Payout", "payout"], required: true, parser: parseRequiredNumber },
        { name: "bet_bonus", columnNames: ["Bet Bonus", "bet_bonus", "BetBonus"], required: true, parser: parseRequiredNumber },
        { name: "jackpot", columnNames: ["Jackpot", "jackpot"], required: true, parser: parseRequiredNumber },
        { name: "jackpot_won", columnNames: ["Jackpot Won", "jackpot_won", "JackpotWon"], required: true, parser: parseRequiredNumber },
        { name: "overlay", columnNames: ["Overlay", "overlay"], required: true, parser: parseRequiredNumber },
        { name: "refund", columnNames: ["Refund", "refund"], required: true, parser: parseRequiredNumber },
      ],
    },
    tickets: {
      type: "tickets",
      fields: [
        { name: "ticket_code", columnNames: ["Ticket", "ticket", "Codice Ticket"], required: true, parser: parseRequiredString },
        { name: "username", columnNames: ["Username", "username", "User"], required: true, parser: parseRequiredString },
        { name: "pvr_code", columnNames: ["Codice Padre", "pvr_code", "PVR", "pvr"], required: true, parser: parseRequiredString },
        { name: "emission_date", columnNames: ["Data Emissione", "emission_date"], required: true, parser: parseRequiredDate },
        { name: "status", columnNames: ["Stato", "status", "stato"], required: true, parser: parseRequiredString },
        { name: "competition_date", columnNames: ["Data Competenza", "competition_date"], required: false, parser: (raw, fn) => {
          const d = pDate(raw);
          return { value: d };
        } },
        { name: "amount", columnNames: ["Importo", "amount"], required: true, parser: parseRequiredNumber },
        { name: "win_amount", columnNames: ["Importo vincita", "win_amount", "Vincita"], required: true, parser: parseRequiredNumber },
        { name: "events_count", columnNames: ["Eventi", "events_count", "events"], required: true, parser: parseRequiredNumber },
        { name: "payment_date", columnNames: ["Data Pagamento", "payment_date"], required: false, parser: (raw, fn) => {
          const d = pDate(raw);
          return { value: d };
        } },
      ],
    },
    player_summary: {
      type: "player_summary",
      fields: [
        { name: "username", columnNames: ["Username", "username", "User"], required: true, parser: parseRequiredString },
        { name: "buy_in", columnNames: ["Buy In", "buy_in", "BuyIn"], required: true, parser: parseRequiredNumber },
        { name: "buy_in_bonus", columnNames: ["Buy In Bonus", "buy_in_bonus", "BuyInBonus"], required: true, parser: parseRequiredNumber },
        { name: "stack", columnNames: ["Stack", "stack"], required: true, parser: parseRequiredNumber },
        { name: "bet", columnNames: ["Bet", "bet"], required: true, parser: parseRequiredNumber },
        { name: "won", columnNames: ["Won", "won"], required: true, parser: parseRequiredNumber },
        { name: "rake", columnNames: ["Rake", "rake"], required: true, parser: parseRequiredNumber },
        { name: "payout", columnNames: ["Payout", "payout"], required: true, parser: parseRequiredNumber },
        { name: "bet_bonus", columnNames: ["Bet Bonus", "bet_bonus", "BetBonus"], required: true, parser: parseRequiredNumber },
        { name: "jackpot", columnNames: ["Jackpot", "jackpot"], required: true, parser: parseRequiredNumber },
        { name: "jackpot_won", columnNames: ["Jackpot Won", "jackpot_won", "JackpotWon"], required: true, parser: parseRequiredNumber },
        { name: "overlay", columnNames: ["Overlay", "overlay"], required: true, parser: parseRequiredNumber },
        { name: "refund", columnNames: ["Refund", "refund"], required: true, parser: parseRequiredNumber },
      ],
    },
  };

  return contracts[fileType] ?? null;
}

// ── Column lookup ──────────────────────────────────────────────────────────

function colLookup(row: Record<string, unknown>, names: string[]): unknown {
  for (const n of names) {
    if (n in row) return row[n];
  }
  return undefined;
}

// ── Row parser ─────────────────────────────────────────────────────────────

/**
 * Parses a batch of raw rows according to the file type contract.
 * Returns parsed rows with per-field issues and any structural errors
 * that should block the import entirely.
 */
export function parseImportRows(
  fileType: ImportFileType,
  rawRows: Record<string, unknown>[],
): { rows: ParsedImportRow[]; structuralErrors: ImportValidationIssue[] } {
  const structuralErrors: ImportValidationIssue[] = [];
  const parsedRows: ParsedImportRow[] = [];

  if (fileType === "unknown") {
    structuralErrors.push({
      row: 0,
      field: "__file__",
      rawValue: fileType,
      reason: "Tipo file non riconosciuto",
      level: "error",
    });
    return { rows: [], structuralErrors };
  }

  const contract = getContractByType(fileType);
  if (!contract) {
    structuralErrors.push({
      row: 0,
      field: "__file__",
      rawValue: fileType,
      reason: `Nessun contratto definito per il tipo "${fileType}"`,
      level: "error",
    });
    return { rows: [], structuralErrors };
  }

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const rowNum = i + 2; // 1-indexed + header row = row 2 in Excel
    const data: Record<string, unknown> = {};
    const issues: ImportValidationIssue[] = [];

    for (const field of contract.fields) {
      const raw = colLookup(row, field.columnNames);
      const { value, error } = field.parser(raw, field.name);

      data[field.name] = value;

      if (error) {
        const level = field.required ? ("error" as const) : ("warning" as const);
        issues.push({
          row: rowNum,
          field: field.name,
          rawValue: raw,
          reason: error,
          level,
        });
      }
    }

    parsedRows.push({ data, issues });
  }

  return { rows: parsedRows, structuralErrors };
}
