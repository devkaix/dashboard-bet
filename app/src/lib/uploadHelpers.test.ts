import { describe, it, expect } from 'vitest';
import { num, normalizeUsername, pDate, pDt, det, col, dateFromTimestamp, detectFileTypeFromFilename } from './uploadHelpers';

describe('num', () => {
  it('parses plain numbers', () => {
    expect(num(1234.56)).toBe(1234.56);
    expect(num('1234.56')).toBe(1234.56);
  });

  it('parses Italian/European decimals', () => {
    expect(num('1.234,56')).toBe(1234.56);
    expect(num('1234,56')).toBe(1234.56);
    expect(num('1,234.56')).toBe(1234.56);
  });

  it('returns 0 for empty/null values', () => {
    expect(num('')).toBe(0);
    expect(num(null)).toBe(0);
    expect(num(undefined)).toBe(0);
    expect(num('None')).toBe(0);
  });
});

describe('normalizeUsername', () => {
  it('trims and lowercases', () => {
    expect(normalizeUsername('  MarcoRossi  ')).toBe('marcorossi');
    expect(normalizeUsername('ABC')).toBe('abc');
  });
});

describe('pDate', () => {
  it('parses ISO-like dates', () => {
    expect(pDate('2026-06-30')).toBe('2026-06-30');
    expect(pDate('2026/06/30')).toBe('2026-06-30');
  });

  it('parses Italian dates', () => {
    expect(pDate('30/06/2026')).toBe('2026-06-30');
    expect(pDate('30/06/26')).toBe('2026-06-30');
  });

  it('returns null for invalid input', () => {
    expect(pDate('')).toBeNull();
    expect(pDate('not a date')).toBeNull();
  });
});

describe('pDt', () => {
  // pDt now stores the instant as UTC, interpreting the input as Europe/Rome local time.
  it('parses Italian datetime', () => {
    expect(pDt('30/06/2026 14:30:00')).toBe('2026-06-30T12:30:00.000Z');
    expect(pDt('30/06/26 14:30:00')).toBe('2026-06-30T12:30:00.000Z');
  });

  it('parses Italian datetime with double space', () => {
    expect(pDt('19/06/2026  03:02:02')).toBe('2026-06-19T01:02:02.000Z');
  });

  it('parses ISO datetime', () => {
    expect(pDt('2026-06-19 02:15:39')).toBe('2026-06-19T00:15:39.000Z');
  });

  it('applies winter time offset for January dates', () => {
    expect(pDt('15/01/2026 14:30:00')).toBe('2026-01-15T13:30:00.000Z');
  });

  it('returns null for invalid input', () => {
    expect(pDt('')).toBeNull();
    expect(pDt('2026-06-30')).toBeNull();
  });
});

describe('detectFileTypeFromFilename', () => {
  it('detects daily_network from Exalogic filename', () => {
    expect(detectFileTypeFromFilename('export_grid_stat_all (6)_giocato totale della rete x per singolo giorno giugno.xlsx')).toBe('daily_network');
  });

  it('detects daily_player from Exalogic filename', () => {
    expect(detectFileTypeFromFilename('export_grid_stat_all (17)giocato per conto e data maggio.xlsx')).toBe('daily_player');
  });

  it('detects daily_pvr from Exalogic filename', () => {
    expect(detectFileTypeFromFilename('export_grid_stat_all (9) giocato per ogni singolo pvr di tutta la rete gironaliero giugno.xlsx')).toBe('daily_pvr');
  });

  it('detects pvr_summary from Exalogic filename', () => {
    expect(detectFileTypeFromFilename('export_grid_stat_all (21) giocato totale per ogni singolo pvr di tutta la rete maggio.xlsx')).toBe('pvr_summary');
  });

  it('detects daily_player_game from Exalogic filename', () => {
    expect(detectFileTypeFromFilename('export_grid_stat_all (23) giocato suddiviso per giocare e tipologia di gioco giornaliero maggio.xlsx')).toBe('daily_player_game');
  });

  it('detects player_summary from Exalogic filename', () => {
    expect(detectFileTypeFromFilename('export_grid_stat_all (16)gioca player di tutta la rete maggio.xlsx')).toBe('player_summary');
  });

  it('detects category_summary from Exalogic filename', () => {
    expect(detectFileTypeFromFilename('export_grid_stat_all (18)giocato totale suddiviso per tipologia maggio.xlsx')).toBe('category_summary');
  });

  it('detects tickets from Exalogic filename', () => {
    expect(detectFileTypeFromFilename('Export_ticket_ticket scommesse maggio.xlsx')).toBe('tickets');
  });

  it('detects pvr_hierarchy from Exalogic filename', () => {
    expect(detectFileTypeFromFilename('gestione_punto_gerarchia_387989 (9) sezione da scaricare giornalmente luglio 22.07.26.xlsx')).toBe('pvr_hierarchy');
  });

  it('returns null for unknown filename', () => {
    expect(detectFileTypeFromFilename('documento_generico.xlsx')).toBeNull();
  });
});

describe('det', () => {
  it('detects tickets', () => {
    expect(det(['Ticket', 'Username', 'Codice Padre', 'Data Emissione', 'Stato', 'Importo'])).toBe('tickets');
  });

  it('detects real players_master headers', () => {
    expect(det(['index', 'user', 'PVR rif.', 'stato', 'saldo', 'saldo prel', 'creato'])).toBe('players_master');
  });

  it('detects English players_master headers', () => {
    expect(det(['Username', 'Email', 'Kyc Status', 'Withdrawable Balance'])).toBe('players_master');
  });

  it('detects daily_network', () => {
    expect(det(['Data', 'Rake', 'Bet', 'Won'])).toBe('daily_network');
  });

  it('detects player_summary', () => {
    expect(det(['Username', 'Rake', 'Bet', 'Won'])).toBe('player_summary');
  });

  it('detects player_summary with extra columns (no data column)', () => {
    expect(det(['Username', 'Rake', 'Bet', 'Won'])).toBe('player_summary');
  });

  it('detects daily_player (data and username present)', () => {
    expect(det(['Data', 'Username', 'Rake', 'Bet', 'Won'])).toBe('daily_player');
  });

  it('detects daily_player with extra columns', () => {
    expect(det(['Data', 'Username', 'Rake', 'Bet', 'Won', 'Extra'])).toBe('daily_player');
  });

  it('detects daily_network with data but no username', () => {
    expect(det(['Data', 'Rake', 'Bet', 'Won'])).toBe('daily_network');
  });

  it('returns unknown for unrecognized headers', () => {
    expect(det(['SomeCol', 'AnotherCol'])).toBe('unknown');
    expect(det(['Rake', 'Bet', 'Won'])).toBe('unknown');
  });

  it('detects daily_player_game with real file 10 headers', () => {
    const file10Headers = ['index', 'Data', 'Data.1', 'Gioco', 'Username', 'Buy In', 'Buy In Bonus', 'Stack', 'Bet', 'Won', 'Rake', 'Payout', 'Bet Bonus', 'Jackpot', 'Jackpot Won', 'Overlay', 'Refund'];
    expect(det(file10Headers)).toBe('daily_player_game');
  });

  it('detects player_summary with file 5 headers (no Data column)', () => {
    const file5Headers = ['index', 'Username', 'Buy In', 'Buy In Bonus', 'Stack', 'Bet', 'Won', 'Rake', 'Payout', 'Bet Bonus', 'Jackpot', 'Jackpot Won', 'Overlay', 'Refund'];
    expect(det(file5Headers)).toBe('player_summary');
  });

  it('returns unknown for trivial headers', () => {
    expect(det(['A', 'B', 'C'])).toBe('unknown');
  });
});

describe('col', () => {
  it('returns the first matching column', () => {
    expect(col({ Username: 'marco', Rake: 10 }, ['Username', 'User'])).toBe('marco');
    expect(col({ user: 'marco', Rake: 10 }, ['user', 'Username'])).toBe('marco');
    expect(col({ Rake: 10 }, ['Username', 'User'])).toBeUndefined();
  });
});

describe('dateFromTimestamp', () => {
  it('extracts the date part from ISO timestamp', () => {
    expect(dateFromTimestamp('2026-06-19T02:15:39')).toBe('2026-06-19');
    expect(dateFromTimestamp(null)).toBeNull();
  });
});

describe('pvr_hierarchy parsing (real July 2026 fixture)', () => {
  // Real rows extracted from gestione_punto_gerarchia luglio 22.07.26.xlsx
  const hierarchyHeaders = [
    "Cod. punto", "ID", "Ragione sociale", "Tipo punto", "Stato conto",
    "Prepagato/Fido", "Prepagato / Fido (sottorete)", "Scoperto/Fido provvisorio",
    "Scoperto / Fido provvisorio (sottorete)", "Importo utilizzato/Saldo",
    "Importo utilizzato / Saldo (sottorete)", "Saldo reale", "Saldo reale (sottorete)",
    "Residuo plafond / Disponibile", "Residuo plafond / Disponibile (sottorete)",
    "Saldo Utenti (diretti)", "Saldo Utenti (sottorete)", "Data Creazione"
  ];

  function makeRow(values: string[]) {
    const row: Record<string, string> = {};
    hierarchyHeaders.forEach((h, i) => { row[h] = values[i] || ''; });
    return row;
  }

  it('parses TOTALI header detection', () => {
    expect(det(hierarchyHeaders)).toBe('pvr_hierarchy');
  });

  it('parses REGIONAL row correctly', () => {
    const row = makeRow([
      'MWMSTBETSERVICES', '387989', 'BET SERVICES SRL', 'REGIONAL',
      'ATTIVO', '0,00', '22.750,00', '0,00', '500,00',
      ' -25.966,26', ' -21.976,34', '25.966,26', '44.726,34',
      '25.966,26', '45.226,34', '1478,91', '12.805,06', '24-07-2025'
    ]);
    expect(String(col(row, ['Tipo punto']) || '').trim().toUpperCase()).toBe('REGIONAL');
    expect(String(col(row, ['Ragione sociale']) || '').trim()).toBe('BET SERVICES SRL');
  });

  it('parses PVR row with fido, saldo, disponibile', () => {
    const row = makeRow([
      ' --  -- MWMATYS', '401557', "MATY'S BAR E TABACCHI", 'PVR',
      'ATTIVO', '1500,00', '1500,00', '0,00', '0,00',
      ' 4567,89', ' 4567,89', '0,00', '0,00',
      '0,00', '0,00', '234,50', '234,50', '15-03-2024'
    ]);
    expect(String(col(row, ['Tipo punto']) || '').trim().toUpperCase()).toBe('PVR');
    expect(String(col(row, ['ID']) || '').trim()).toBe('401557');

    const fido = num(col(row, ['Prepagato/Fido']));
    const saldo = num(col(row, ['Importo utilizzato/Saldo']));
    const disp = num(col(row, ['Residuo plafond / Disponibile']));
    const created = pDate(col(row, ['Data Creazione']));

    expect(fido).toBe(1500);
    expect(saldo).toBe(4567.89);
    expect(disp).toBe(0);
    expect(created).toBe('2024-03-15');
  });

  it('parses PVR with negative saldo (debito)', () => {
    const row = makeRow([
      ' -- MWBASSI', '274292', 'BASSI ANDREA', 'PVR',
      'CHIUSO', '0,00', '0,00', '0,00', '0,00',
      ' -392,52', ' -392,52', '0,00', '0,00',
      '392,52', '392,52', '0,00', '0,00', '17-03-2023'
    ]);
    expect(num(col(row, ['Importo utilizzato/Saldo']))).toBe(-392.52);
    expect(num(col(row, ['Prepagato/Fido']))).toBe(0);
    expect(num(col(row, ['Residuo plafond / Disponibile']))).toBe(392.52);
  });

  it('handles PVR with empty/null fido (no fido assigned)', () => {
    const row = makeRow([
      ' --  -- MWEXAMPLE', '999999', 'EXAMPLE PVR', 'PVR',
      'ATTIVO', '', '', '', '',
      '', '', '', '',
      '', '', '', '', ''
    ]);
    const fidoRaw = col(row, ['Prepagato/Fido']);
    const fido = fidoRaw === undefined || fidoRaw === null || String(fidoRaw).trim() === '' ? null : num(fidoRaw);
    expect(fido).toBeNull();
  });

  it('parses AGENTE row and extracts all fields', () => {
    const row = makeRow([
      'MWMSTTHEWINNER', '400233', 'THE WINNER CLUB S.A.S.', 'AGENTE',
      'ATTIVO', '0,00', '0,00', '0,00', '0,00',
      ' 0,00', ' 0,00', '0,00', '0,00',
      '0,00', '0,00', '0,00', '0,00', '01-09-2025'
    ]);
    const tipo = String(col(row, ['Tipo punto']) || '').trim().toUpperCase();
    expect(tipo).toBe('AGENTE');
    expect(String(col(row, ['ID']) || '').trim()).toBe('400233');
    expect(String(col(row, ['Stato conto']) || '').trim()).toBe('ATTIVO');
    expect(pDate(col(row, ['Data Creazione']))).toBe('2025-09-01');
  });

  it('cod. punto strips indentation dashes and whitespace', () => {
    expect(' --  -- MWMATYS'.replace(/^(?:\s*--\s*)+/, '').trim()).toBe('MWMATYS');
    expect('MWMSTBETSERVICES'.replace(/^(?:\s*--\s*)+/, '').trim()).toBe('MWMSTBETSERVICES');
    expect(' -- MWBASSI'.replace(/^(?:\s*--\s*)+/, '').trim()).toBe('MWBASSI');
  });
});
