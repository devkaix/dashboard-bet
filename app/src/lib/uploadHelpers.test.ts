import { describe, it, expect } from 'vitest';
import { num, normalizeUsername, pDate, pDt, det, col, dateFromTimestamp } from './uploadHelpers';

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

describe('det', () => {
  it('detects tickets', () => {
    expect(det(['Ticket', 'Stato', 'Importo'])).toBe('tickets');
  });

  it('detects real players_master headers', () => {
    expect(det(['index', 'user', 'PVR rif.', 'stato', 'saldo', 'saldo prel', 'creato'])).toBe('players_master');
  });

  it('detects English players_master headers', () => {
    expect(det(['Username', 'Email', 'Kyc Status', 'Withdrawable Balance'])).toBe('players_master');
  });

  it('detects daily_network', () => {
    expect(det(['Data', 'Rake', 'Bet'])).toBe('daily_network');
  });

  it('detects player_summary', () => {
    expect(det(['Username', 'Rake', 'Bet'])).toBe('player_summary');
  });

  it('detects player_summary with extra columns (no data column)', () => {
    expect(det(['Username', 'Rake', 'Bet', 'Won'])).toBe('player_summary');
  });

  it('detects daily_player (data and username present)', () => {
    expect(det(['Data', 'Username', 'Rake'])).toBe('daily_player');
  });

  it('detects daily_player with extra columns', () => {
    expect(det(['Data', 'Username', 'Rake', 'Bet'])).toBe('daily_player');
  });

  it('detects daily_network with data but no username', () => {
    expect(det(['Data', 'Rake', 'Bet'])).toBe('daily_network');
  });

  it('returns unknown for unrecognized headers', () => {
    expect(det(['SomeCol', 'AnotherCol'])).toBe('unknown');
    expect(det(['Rake', 'Bet', 'Won'])).toBe('unknown');
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
