import { describe, it, expect } from 'vitest';
import { formatCurrency, formatPercent, formatCompact } from './data';

describe('formatting utilities', () => {
  it('formats currency with EUR symbol and two decimals', () => {
    const formatted = formatCurrency(1234.56);
    expect(formatted).toContain('€');
    expect(formatted).toMatch(/1[\s.\u202f\u00A0]?234[,.]56/);
    expect(formatCurrency(0)).toMatch(/0[,.]00/);
    expect(formatCurrency(-100)).toMatch(/-100[,.]00/);
  });

  it('formats percent in Italian locale', () => {
    expect(formatPercent(12.5)).toMatch(/12[,.]5%/);
    expect(formatPercent(0)).toMatch(/0[,.]0%/);
  });

  it('formats compact numbers', () => {
    expect(formatCompact(1500)).toMatch(/1[,.]5/);
    expect(formatCompact(1000000)).toMatch(/1/);
  });
});
