import { describe, it, expect } from 'vitest';
import { num, normalizeUsername, pDate, pDt, det, col } from './uploadHelpers';

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
  });

  it('returns null for invalid input', () => {
    expect(pDate('')).toBeNull();
    expect(pDate('not a date')).toBeNull();
  });
});

describe('pDt', () => {
  it('parses Italian datetime', () => {
    expect(pDt('30/06/2026 14:30:00')).toBe('2026-06-30T14:30:00');
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

  it('detects players_master', () => {
    expect(det(['Username', 'Email', 'Kyc Status', 'Withdrawable Balance'])).toBe('players_master');
  });

  it('detects daily_network', () => {
    expect(det(['Data', 'Rake', 'Bet'])).toBe('daily_network');
  });

  it('detects player_summary', () => {
    expect(det(['Username', 'Rake', 'Bet'])).toBe('player_summary');
  });

  it('defaults to daily_player', () => {
    expect(det(['Data', 'Username', 'Rake'])).toBe('daily_player');
  });
});

describe('col', () => {
  it('returns the first matching column', () => {
    expect(col({ Username: 'marco', Rake: 10 }, ['Username', 'User'])).toBe('marco');
    expect(col({ Rake: 10 }, ['Username', 'User'])).toBeUndefined();
  });
});
