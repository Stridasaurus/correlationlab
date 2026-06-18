import type { RangePreset } from './types';
import { normalizedCumulativeReturns } from './correlation';

export interface FetchedTicker {
  dates: string[];
  closes: number[];
  name: string;
}

const RANGE_MAP: Record<RangePreset, string> = {
  '3M': '3mo',
  '6M': '6mo',
  '1Y': '1y',
  '2Y': '2y',
};

function toDateStr(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

export async function fetchTickerData(
  ticker: string,
  range: RangePreset,
): Promise<FetchedTicker | null> {
  const yhRange = RANGE_MAP[range];
  const yhUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${yhRange}&interval=1d`;
  const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(yhUrl)}`;

  try {
    const resp = await fetch(proxyUrl, { signal: AbortSignal.timeout(10000) });
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
        error?: unknown;
      };
    };
    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const timestamps = result.timestamp;
    const closes = result.indicators.quote[0]?.close;
    if (!timestamps || !closes || timestamps.length === 0) return null;

    const name = result.meta.longName || result.meta.shortName || ticker;

    // Zip and filter out null closes
    const pairs: Array<[string, number]> = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] != null && isFinite(closes[i])) {
        pairs.push([toDateStr(timestamps[i]), closes[i]]);
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

// Synthetic fallback — deterministic per ticker symbol
export function syntheticTicker(
  ticker: string,
  referenceDates: string[],
): FetchedTicker {
  // Simple LCG seeded from ticker chars for reproducibility
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
      // Back-fill: find the first available close
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
