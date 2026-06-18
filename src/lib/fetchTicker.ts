import type { RangePreset } from './types';
import { normalizedCumulativeReturns } from './correlation';

export interface FetchedTicker {
  dates: string[];
  closes: number[];
  name: string;
}

// How many calendar days to look back per range preset (generous to get enough trading days)
const RANGE_CALENDAR_DAYS: Record<RangePreset, number> = {
  '3M': 100,
  '6M': 200,
  '1Y': 380,
  '2Y': 760,
};

function toYYYYMMDD(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Fetch via stooq.com — free, no auth, browser CORS-friendly.
 * Returns CSV: Date,Open,High,Low,Close,Volume
 * Ticker format for US stocks/ETFs: "{ticker}.us"
 */
async function fetchFromStooq(ticker: string, range: RangePreset): Promise<FetchedTicker | null> {
  const calDays = RANGE_CALENDAR_DAYS[range];
  const end = new Date();
  const start = new Date(end.getTime() - calDays * 24 * 60 * 60 * 1000);

  const d1 = toYYYYMMDD(start);
  const d2 = toYYYYMMDD(end);
  const symbol = `${ticker.toLowerCase()}.us`;
  const url = `https://stooq.com/q/d/l/?s=${symbol}&d1=${d1}&d2=${d2}&i=d`;

  const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!resp.ok) return null;

  const text = await resp.text();
  const lines = text.trim().split('\n');
  // Header: Date,Open,High,Low,Close,Volume
  if (lines.length < 3 || !lines[0].toLowerCase().includes('date')) return null;

  const pairs: Array<[string, number]> = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length < 5) continue;
    const date = cols[0].trim();    // YYYY-MM-DD
    const close = parseFloat(cols[4].trim());
    if (!date.match(/^\d{4}-\d{2}-\d{2}$/) || !isFinite(close) || close <= 0) continue;
    pairs.push([date, close]);
  }

  if (pairs.length < 10) return null;

  // Sort ascending by date (stooq returns descending)
  pairs.sort(([a], [b]) => a.localeCompare(b));

  return {
    dates: pairs.map(([d]) => d),
    closes: pairs.map(([, c]) => c),
    name: ticker,  // stooq doesn't return a display name
  };
}

/**
 * Fetch via Yahoo Finance v8 chart API through the allorigins CORS proxy.
 * Kept as fallback in case stooq doesn't have the ticker.
 */
async function fetchFromYahooProxy(ticker: string, range: RangePreset): Promise<FetchedTicker | null> {
  const rangeMap: Record<RangePreset, string> = { '3M': '3mo', '6M': '6mo', '1Y': '1y', '2Y': '2y' };
  const yhRange = rangeMap[range];
  const yhUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${yhRange}&interval=1d`;
  const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(yhUrl)}`;

  try {
    const resp = await fetch(proxyUrl, { signal: AbortSignal.timeout(12000) });
    if (!resp.ok) return null;
    const outer = await resp.json() as { contents?: string };
    if (!outer.contents) return null;
    const data = JSON.parse(outer.contents) as {
      chart: {
        result?: Array<{
          timestamp: number[];
          meta: { longName?: string; shortName?: string };
          indicators: { quote: Array<{ close: number[] }> };
        }>;
      };
    };
    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const timestamps = result.timestamp;
    const closes = result.indicators.quote[0]?.close;
    if (!timestamps || !closes || timestamps.length === 0) return null;

    const name = result.meta.longName || result.meta.shortName || ticker;
    const pairs: Array<[string, number]> = [];
    for (let i = 0; i < timestamps.length; i++) {
      const c = closes[i];
      if (c != null && isFinite(c) && c > 0) {
        pairs.push([new Date(timestamps[i] * 1000).toISOString().slice(0, 10), c]);
      }
    }
    if (pairs.length < 10) return null;

    return {
      dates: pairs.map(([d]) => d),
      closes: pairs.map(([, c]) => c),
      name,
    };
  } catch {
    return null;
  }
}

/**
 * Public API: try stooq first, then Yahoo proxy, then return null (triggers synthetic fallback).
 */
export async function fetchTickerData(
  ticker: string,
  range: RangePreset,
): Promise<FetchedTicker | null> {
  // Try stooq (primary — no auth, no proxy needed)
  try {
    const stooq = await fetchFromStooq(ticker, range);
    if (stooq) return stooq;
  } catch {
    // fall through
  }

  // Try Yahoo Finance via allorigins proxy (secondary)
  try {
    const yahoo = await fetchFromYahooProxy(ticker, range);
    if (yahoo) return yahoo;
  } catch {
    // fall through
  }

  return null;
}

// Synthetic fallback — deterministic per ticker symbol
export function syntheticTicker(
  ticker: string,
  referenceDates: string[],
): FetchedTicker {
  // LCG seeded from ticker chars for reproducibility
  let seed = ticker.split('').reduce((s, c) => s + c.charCodeAt(0), 0) * 1337;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const gauss = () => {
    const u = 1 - rand();
    const v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  const loading = 0.85 + rand() * 0.1;
  const startPrice = 50 + rand() * 200;
  const closes: number[] = [startPrice];

  for (let i = 1; i < referenceDates.length; i++) {
    const marketRet = gauss() * 0.008 + 0.0003;
    const ret = loading * marketRet + gauss() * 0.004;
    closes.push(closes[closes.length - 1] * (1 + ret));
  }

  return { dates: referenceDates, closes, name: `${ticker} (synthetic)` };
}

// Align fetched closes to a reference date array via forward-fill
export function alignToReferenceDates(
  fetched: FetchedTicker,
  referenceDates: string[],
): number[] {
  const fetchedMap = new Map<string, number>();
  fetched.dates.forEach((d, i) => fetchedMap.set(d, fetched.closes[i]));

  const aligned: number[] = [];
  let lastKnown: number | null = null;

  for (const date of referenceDates) {
    const val = fetchedMap.get(date);
    if (val !== undefined) {
      lastKnown = val;
      aligned.push(val);
    } else if (lastKnown !== null) {
      aligned.push(lastKnown); // forward-fill
    } else {
      // Back-fill with the first available close
      const firstClose = fetched.closes[0];
      lastKnown = firstClose;
      aligned.push(firstClose);
    }
  }

  return aligned;
}

export function closesToNormalizedReturns(closes: number[]): number[] {
  return normalizedCumulativeReturns(closes);
}

// Suppress unused import warning — exported for potential external use
export { isoDate };
