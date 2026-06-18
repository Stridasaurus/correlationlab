import { describe, it, expect } from 'vitest';
import { alignToReferenceDates, syntheticTicker, stooqSymbols, inferAssetType } from '../lib/fetchTicker';

describe('alignToReferenceDates', () => {
  it('returns closes on matching dates', () => {
    const fetched = {
      dates: ['2024-01-02', '2024-01-03', '2024-01-04'],
      closes: [100, 102, 105],
      name: 'TEST',
      assetType: 'Stock' as const,
    };
    const ref = ['2024-01-02', '2024-01-03', '2024-01-04'];
    expect(alignToReferenceDates(fetched, ref)).toEqual([100, 102, 105]);
  });

  it('forward-fills missing dates', () => {
    const fetched = {
      dates: ['2024-01-02', '2024-01-04'],
      closes: [100, 105],
      name: 'TEST',
      assetType: 'Stock' as const,
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
      assetType: 'Stock' as const,
    };
    const ref = ['2024-01-02', '2024-01-03', '2024-01-04'];
    const result = alignToReferenceDates(fetched, ref);
    expect(result).toHaveLength(3);
    expect(result[0]).toBe(100); // back-filled with first close
  });

  it('handles single-date reference', () => {
    const fetched = { dates: ['2024-01-02'], closes: [99], name: 'T', assetType: 'Stock' as const };
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

describe('stooqSymbols', () => {
  it('US stocks get .us suffix', () => {
    expect(stooqSymbols('AAPL')[0]).toBe('aapl.us');
    expect(stooqSymbols('VOO')[0]).toBe('voo.us');
  });

  it('crypto gets usd suffix', () => {
    expect(stooqSymbols('BTC')[0]).toBe('btcusd');
    expect(stooqSymbols('ETH')[0]).toBe('ethusd');
  });

  it('strips -USD suffix from crypto inputs', () => {
    expect(stooqSymbols('BTC-USD')[0]).toBe('btcusd');
    expect(stooqSymbols('ETH-USD')[0]).toBe('ethusd');
  });

  it('commodities get f suffix', () => {
    expect(stooqSymbols('GC')[0]).toBe('gcf');
    expect(stooqSymbols('CL')[0]).toBe('clf');
  });

  it('forex 6-letter pairs pass through lowercase', () => {
    expect(stooqSymbols('EURUSD')[0]).toBe('eurusd');
    expect(stooqSymbols('GBPJPY')[0]).toBe('gbpjpy');
  });
});

describe('inferAssetType', () => {
  it('detects crypto', () => {
    expect(inferAssetType('BTC')).toBe('Crypto');
    expect(inferAssetType('BTC-USD')).toBe('Crypto');
    expect(inferAssetType('ETH')).toBe('Crypto');
  });

  it('detects commodities', () => {
    expect(inferAssetType('GC')).toBe('Commodity');
    expect(inferAssetType('CL')).toBe('Commodity');
  });

  it('detects forex', () => {
    expect(inferAssetType('EURUSD')).toBe('Forex');
    expect(inferAssetType('GBPJPY')).toBe('Forex');
  });

  it('defaults to Stock for unknown', () => {
    expect(inferAssetType('AAPL')).toBe('Stock');
    expect(inferAssetType('MSFT')).toBe('Stock');
  });
});
