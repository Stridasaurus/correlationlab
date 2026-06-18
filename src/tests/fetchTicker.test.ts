import { describe, it, expect } from 'vitest';
import { alignToReferenceDates, syntheticTicker } from '../lib/fetchTicker';

describe('alignToReferenceDates', () => {
  it('returns closes on matching dates', () => {
    const fetched = {
      dates: ['2024-01-02', '2024-01-03', '2024-01-04'],
      closes: [100, 102, 105],
      name: 'TEST',
    };
    const ref = ['2024-01-02', '2024-01-03', '2024-01-04'];
    expect(alignToReferenceDates(fetched, ref)).toEqual([100, 102, 105]);
  });

  it('forward-fills missing dates', () => {
    const fetched = {
      dates: ['2024-01-02', '2024-01-04'],
      closes: [100, 105],
      name: 'TEST',
    };
    const ref = ['2024-01-02', '2024-01-03', '2024-01-04'];
    const result = alignToReferenceDates(fetched, ref);
    expect(result[0]).toBe(100);
    expect(result[1]).toBe(100); // forward-filled from Jan 2
    expect(result[2]).toBe(105);
  });

  it('back-fills when reference starts before fetched data', () => {
    const fetched = {
      dates: ['2024-01-03', '2024-01-04'],
      closes: [100, 105],
      name: 'TEST',
    };
    const ref = ['2024-01-02', '2024-01-03', '2024-01-04'];
    const result = alignToReferenceDates(fetched, ref);
    expect(result).toHaveLength(3);
    expect(result[0]).toBe(100); // back-filled with first close
  });

  it('handles single-date reference', () => {
    const fetched = { dates: ['2024-01-02'], closes: [99], name: 'T' };
    const result = alignToReferenceDates(fetched, ['2024-01-02']);
    expect(result).toEqual([99]);
  });
});

describe('syntheticTicker', () => {
  it('produces same output for same ticker (deterministic)', () => {
    const dates = ['2024-01-01', '2024-01-02', '2024-01-03'];
    const a = syntheticTicker('AAPL', dates);
    const b = syntheticTicker('AAPL', dates);
    expect(a.closes).toEqual(b.closes);
  });

  it('produces different output for different tickers', () => {
    const dates = ['2024-01-01', '2024-01-02', '2024-01-03'];
    const a = syntheticTicker('AAPL', dates);
    const b = syntheticTicker('MSFT', dates);
    expect(a.closes).not.toEqual(b.closes);
  });

  it('returns correct number of closes', () => {
    const dates = Array.from({ length: 50 }, (_, i) => `2024-01-${String(i + 1).padStart(2, '0')}`);
    const result = syntheticTicker('TEST', dates);
    expect(result.closes).toHaveLength(50);
  });

  it('closes are positive prices', () => {
    const dates = Array.from({ length: 20 }, (_, i) => `2024-01-${String(i + 1).padStart(2, '0')}`);
    const result = syntheticTicker('ZZZZ', dates);
    expect(result.closes.every((c) => c > 0)).toBe(true);
  });
});
