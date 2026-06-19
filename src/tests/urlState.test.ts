import { describe, it, expect } from 'vitest';
import { encodeURLState, decodeURLState } from '../lib/urlState';
import type { Holding } from '../lib/types';

const holdings: Holding[] = [
  { ticker: 'SPY', quantity: 10 },
  { ticker: 'BND', quantity: 5.5 },
];

describe('encodeURLState', () => {
  it('produces expected format', () => {
    const result = encodeURLState(holdings, '2Y', 90);
    expect(result).toBe('t=SPY:10,BND:5.5&range=2Y&w=90');
  });

  it('handles tickers with hyphens (BTC-USD)', () => {
    const result = encodeURLState([{ ticker: 'BTC-USD', quantity: 0.5 }], '1Y', 60);
    expect(result).toBe('t=BTC-USD:0.5&range=1Y&w=60');
  });

  it('returns empty string for empty holdings', () => {
    expect(encodeURLState([], '2Y', 90)).toBe('');
  });
});

describe('decodeURLState', () => {
  it('round-trips through encode', () => {
    const encoded = encodeURLState(holdings, '2Y', 90);
    const decoded = decodeURLState('#' + encoded);
    expect(decoded).toEqual({ holdings, range: '2Y', windowDays: 90 });
  });

  it('decodes hash without leading #', () => {
    const decoded = decodeURLState('t=SPY:10&range=1Y&w=30');
    expect(decoded).toEqual({ holdings: [{ ticker: 'SPY', quantity: 10 }], range: '1Y', windowDays: 30 });
  });

  it('decodes BTC-USD ticker correctly', () => {
    const decoded = decodeURLState('#t=BTC-USD:0.5&range=2Y&w=90');
    expect(decoded?.holdings[0]).toEqual({ ticker: 'BTC-USD', quantity: 0.5 });
  });

  it('defaults windowDays to 90 when w param is missing', () => {
    const decoded = decodeURLState('#t=SPY:10&range=2Y');
    expect(decoded?.windowDays).toBe(90);
  });

  it('returns null for empty hash', () => {
    expect(decodeURLState('')).toBeNull();
    expect(decodeURLState('#')).toBeNull();
  });

  it('returns null when required params are missing', () => {
    expect(decodeURLState('#range=2Y')).toBeNull();
    expect(decodeURLState('#t=SPY:10')).toBeNull();
  });

  it('returns null for invalid range', () => {
    expect(decodeURLState('#t=SPY:10&range=3Y')).toBeNull();
  });

  it('returns null for invalid windowDays', () => {
    expect(decodeURLState('#t=SPY:10&range=2Y&w=45')).toBeNull();
  });

  it('returns null for malformed ticker pair', () => {
    expect(decodeURLState('#t=SPY&range=2Y&w=90')).toBeNull();
  });

  it('returns null for non-numeric quantity', () => {
    expect(decodeURLState('#t=SPY:abc&range=2Y&w=90')).toBeNull();
  });
});
