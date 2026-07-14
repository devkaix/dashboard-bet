import { describe, it, expect } from 'vitest';
import { formatCurrency, formatPercent, formatCompact } from './data';

describe('formatting utilities', () => {
  it('formats currency in Italian locale', () => {
    expect(formatCurrency(1234.56)).toContain('€');
    expect(formatCurrency(1234.56)).toMatch(/1234,56/);
    expect(formatCurrency(0)).toBe('0,00\u00A0€');
    expect(formatCurrency(-100)).toBe('-100,00\u00A0€');
  });

  it('formats percent in Italian locale', () => {
    expect(formatPercent(12.5)).toBe('12,5%');
    expect(formatPercent(0)).toBe('0,0%');
  });

  it('formats compact numbers', () => {
    expect(formatCompact(1500)).toMatch(/1[,.]5/);
    expect(formatCompact(1000000)).toMatch(/1/);
  });
});
