import type { Holding, RangePreset, WindowDays } from './types';

export interface URLState {
  holdings: Holding[];
  range: RangePreset;
  windowDays: WindowDays;
}

const VALID_RANGES = new Set(['3M', '6M', '1Y', '2Y', '5Y', '10Y', '20Y']);
const VALID_WINDOW_DAYS = new Set([30, 60, 90, 180]);

// Format: #t=SPY:10,BTC-USD:0.5&range=2Y&w=90
// Tickers can contain hyphens (BTC-USD) so we use ':' as qty separator
// and ',' between pairs.
export function encodeURLState(
  holdings: Holding[],
  range: RangePreset,
  windowDays: WindowDays,
): string {
  if (holdings.length === 0) return '';
  const t = holdings.map((h) => `${h.ticker}:${h.quantity}`).join(',');
  return `t=${t}&range=${range}&w=${windowDays}`;
}

export function decodeURLState(hash: string): URLState | null {
  if (!hash || hash === '#') return null;
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return null;

  const params: Record<string, string> = {};
  for (const segment of raw.split('&')) {
    const eq = segment.indexOf('=');
    if (eq === -1) continue;
    params[segment.slice(0, eq)] = segment.slice(eq + 1);
  }

  const { t: tParam, range: rangeParam, w: wParam } = params;
  if (!tParam || !rangeParam) return null;
  if (!VALID_RANGES.has(rangeParam)) return null;

  const wNum = wParam ? parseInt(wParam, 10) : 90;
  if (!VALID_WINDOW_DAYS.has(wNum)) return null;

  const holdings: Holding[] = [];
  for (const pair of tParam.split(',')) {
    // Use lastIndexOf so tickers containing ':' (none currently, but defensive) still parse
    const colonIdx = pair.lastIndexOf(':');
    if (colonIdx <= 0) return null;
    const ticker = pair.slice(0, colonIdx);
    const qty = parseFloat(pair.slice(colonIdx + 1));
    if (!ticker || isNaN(qty)) return null;
    holdings.push({ ticker, quantity: qty });
  }

  if (holdings.length === 0) return null;

  return {
    holdings,
    range: rangeParam as RangePreset,
    windowDays: wNum as WindowDays,
  };
}
