import type { RangePreset, AssetType } from './types';
import { normalizedCumulativeReturns } from './correlation';

export interface FetchedTicker {
  dates: string[];
  closes: number[];
  name: string;
  assetType: AssetType;
}

const RANGE_CALENDAR_DAYS: Record<RangePreset, number> = {
  '3M': 100,
  '6M': 200,
  '1Y': 380,
  '2Y': 760,
  '5Y': 1900,
  '10Y': 3800,
  '20Y': 7600,
};

// ── Asset class detection ──────────────────────────────────────────────────

const KNOWN_ETFS = new Set([
  'SPY','VOO','VTI','IVV','QQQ','VEA','VWO','VXUS','EFA','EEM',
  'BND','AGG','TLT','LQD','HYG','IEF','SHY','MBB',
  'GLD','SLV','USO','UNG','DBA','DJP','GSG','PDBC',
  'VNQ','IYR','XLRE','XLF','XLE','XLK','XLV','XLI','XLP','XLU','XLB','XLY',
  'IWM','MDY','IJH','IJR','ARKK','ARKW','ARKG',
  'GDX','GDXJ','XOP','OIH','KRE','XBI','IBB',
]);

const CRYPTO_BASES = new Set([
  'BTC','ETH','SOL','XRP','ADA','DOGE','AVAX','DOT','MATIC','LTC',
  'BCH','LINK','UNI','ATOM','XLM','BNB','TON','SHIB','TRX','NEAR',
]);

const COMMODITY_CODES = new Set([
  'GC','SI','CL','NG','ZC','ZW','ZS','HG','PL','PA','RB','HO','CC','KC','SB','CT',
]);

const FOREX_RE = /^[A-Z]{6}$/;

/**
 * Normalize the input ticker and return candidate stooq symbols to try, in order.
 * Stooq formats: "{ticker}.us" for stocks/ETFs, "{base}usd" for crypto,
 * "{code}f" for commodity futures, "{pair}" for forex.
 */
export function stooqSymbols(rawTicker: string): string[] {
  // Normalize: strip common suffixes like -USD, /USD, =F
  const t = rawTicker.toUpperCase()
    .replace(/-USD$/i, '')
    .replace(/\/USD$/i, '')
    .replace(/=F$/i, '');

  if (CRYPTO_BASES.has(t)) {
    return [`${t.toLowerCase()}usd`];
  }
  if (COMMODITY_CODES.has(t)) {
    return [`${t.toLowerCase()}f`, t.toLowerCase()];
  }
  if (FOREX_RE.test(t)) {
    return [t.toLowerCase()];
  }
  // Default: US stock/ETF. Also try bare symbol as fallback (some intl tickers work bare).
  return [`${t.toLowerCase()}.us`, t.toLowerCase()];
}

export function inferAssetType(rawTicker: string): AssetType {
  const t = rawTicker.toUpperCase()
    .replace(/-USD$/i, '')
    .replace(/\/USD$/i, '')
    .replace(/=F$/i, '');

  if (CRYPTO_BASES.has(t)) return 'Crypto';
  if (COMMODITY_CODES.has(t)) return 'Commodity';
  if (FOREX_RE.test(t)) return 'Forex';
  // US mutual funds are typically 5-char tickers ending in X (TRBCX, VTSAX, FXAIX…)
  if (/^[A-Z]{4,5}X$/.test(t)) return 'Mutual Fund';
  return 'Stock';
}

// ── Stooq fetch ────────────────────────────────────────────────────────────

function toYYYYMMDD(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

function parseStooqCsv(text: string): Array<[string, number]> | null {
  const lines = text.trim().split('\n');
  if (lines.length < 3 || !lines[0].toLowerCase().includes('date')) return null;
  const pairs: Array<[string, number]> = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length < 5) continue;
    const date = cols[0].trim();
    const close = parseFloat(cols[4].trim());
    if (!date.match(/^\d{4}-\d{2}-\d{2}$/) || !isFinite(close) || close <= 0) continue;
    pairs.push([date, close]);
  }
  if (pairs.length < 10) return null;
  pairs.sort(([a], [b]) => a.localeCompare(b));
  return pairs;
}

async function tryStooqSymbol(symbol: string, d1: string, d2: string): Promise<Array<[string, number]> | null> {
  const stooqUrl = `https://stooq.com/q/d/l/?s=${symbol}&d1=${d1}&d2=${d2}&i=d`;

  // Try 1: corsproxy.io — returns raw CSV body directly
  try {
    const resp = await fetch(`https://corsproxy.io/?${encodeURIComponent(stooqUrl)}`, { signal: AbortSignal.timeout(10000) });
    if (resp.ok) {
      const text = await resp.text();
      const pairs = parseStooqCsv(text);
      if (pairs) return pairs;
    }
  } catch { /* fall through */ }

  // Try 2: allorigins.win — JSON-wrapped CSV (independent rate limit)
  try {
    const resp = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(stooqUrl)}`, { signal: AbortSignal.timeout(10000) });
    if (resp.ok) {
      const outer = await resp.json() as { contents?: string };
      if (outer.contents) {
        const pairs = parseStooqCsv(outer.contents);
        if (pairs) return pairs;
      }
    }
  } catch { /* fall through */ }

  // Try 3: codetabs.com — raw CSV, independent rate limit
  try {
    const resp = await fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(stooqUrl)}`, { signal: AbortSignal.timeout(10000) });
    if (resp.ok) {
      const text = await resp.text();
      const pairs = parseStooqCsv(text);
      if (pairs) return pairs;
    }
  } catch { /* fall through */ }

  return null;
}

async function fetchFromStooq(ticker: string, range: RangePreset): Promise<FetchedTicker | null> {
  const calDays = RANGE_CALENDAR_DAYS[range];
  const end = new Date();
  const start = new Date(end.getTime() - calDays * 24 * 60 * 60 * 1000);
  const d1 = toYYYYMMDD(start);
  const d2 = toYYYYMMDD(end);

  const candidates = stooqSymbols(ticker);
  for (const symbol of candidates) {
    const pairs = await tryStooqSymbol(symbol, d1, d2);
    if (pairs) {
      const t = ticker.toUpperCase().replace(/-USD$/i, '').replace(/\/USD$/i, '').replace(/=F$/i, '');
      return {
        dates: pairs.map(([d]) => d),
        closes: pairs.map(([, c]) => c),
        name: ticker,
        assetType: KNOWN_ETFS.has(t) ? 'ETF' : inferAssetType(ticker),
      };
    }
  }
  return null;
}

// ── Yahoo Finance proxy fallback ───────────────────────────────────────────

function toYahooSymbol(ticker: string): string {
  const t = ticker.toUpperCase().replace(/-USD$/i, '').replace(/\/USD$/i, '').replace(/=F$/i, '');
  if (CRYPTO_BASES.has(t)) return `${t}-USD`;
  if (FOREX_RE.test(t)) return `${t}=X`;
  if (COMMODITY_CODES.has(t)) return `${t}=F`;
  return ticker;
}

function yahooQuoteTypeToAssetType(qt: string | undefined): AssetType {
  switch (qt) {
    case 'ETF':            return 'ETF';
    case 'MUTUALFUND':     return 'Mutual Fund';
    case 'CRYPTOCURRENCY': return 'Crypto';
    case 'FUTURE':         return 'Commodity';
    case 'FOREX':          return 'Forex';
    case 'INDEX':          return 'Index';
    case 'EQUITY':         return 'Stock';
    default:               return 'Stock';
  }
}

type YahooChartResult = {
  timestamp: number[];
  meta: { longName?: string; shortName?: string; quoteType?: string; instrumentType?: string };
  indicators: { quote: Array<{ close: number[] }> };
};

async function parseYahooResult(ticker: string, result: YahooChartResult): Promise<FetchedTicker | null> {
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
    assetType: yahooQuoteTypeToAssetType(result.meta.instrumentType ?? result.meta.quoteType),
  };
}

async function fetchFromYahooProxy(ticker: string, range: RangePreset): Promise<FetchedTicker | null> {
  const rangeMap: Record<RangePreset, string> = { '3M': '3mo', '6M': '6mo', '1Y': '1y', '2Y': '2y', '5Y': '5y', '10Y': '10y', '20Y': '20y' };
  const yhRange = rangeMap[range];
  const yhTicker = toYahooSymbol(ticker);
  const yhUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yhTicker)}?range=${yhRange}&interval=1d`;

  // Try 1: corsproxy.io — returns raw Yahoo JSON directly
  try {
    const resp = await fetch(`https://corsproxy.io/?${encodeURIComponent(yhUrl)}`, { signal: AbortSignal.timeout(10000) });
    if (resp.ok) {
      const data = await resp.json() as { chart: { result?: YahooChartResult[] } };
      const result = data?.chart?.result?.[0];
      if (result) {
        const ft = await parseYahooResult(ticker, result);
        if (ft) return ft;
      }
    }
  } catch { /* fall through */ }

  // Try 2: allorigins.win — JSON-wrapped Yahoo JSON
  try {
    const resp = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(yhUrl)}`, { signal: AbortSignal.timeout(10000) });
    if (resp.ok) {
      const outer = await resp.json() as { contents?: string };
      if (outer.contents) {
        const data = JSON.parse(outer.contents) as { chart: { result?: YahooChartResult[] } };
        const result = data?.chart?.result?.[0];
        if (result) {
          const ft = await parseYahooResult(ticker, result);
          if (ft) return ft;
        }
      }
    }
  } catch { /* fall through */ }

  return null;
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function fetchTickerData(
  ticker: string,
  range: RangePreset,
): Promise<FetchedTicker | null> {
  // Stooq maps crypto symbols to equity ETFs (e.g. BTC → NYSE:BTC) — skip it for crypto
  if (inferAssetType(ticker) !== 'Crypto') {
    try {
      const stooq = await fetchFromStooq(ticker, range);
      if (stooq) return stooq;
    } catch { /* fall through */ }
  }

  try {
    const yahoo = await fetchFromYahooProxy(ticker, range);
    if (yahoo) return yahoo;
  } catch { /* fall through */ }

  return null;
}

// ── Synthetic fallback ─────────────────────────────────────────────────────

export function syntheticTicker(ticker: string, referenceDates: string[]): FetchedTicker {
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

  // Crypto gets higher volatility
  const isCrypto = inferAssetType(ticker) === 'Crypto';
  const vol = isCrypto ? 0.025 : 0.008;
  const drift = isCrypto ? 0.001 : 0.0003;
  const loading = isCrypto ? 0.5 : 0.85 + rand() * 0.1;
  const startPrice = 50 + rand() * 200;
  const closes: number[] = [startPrice];

  for (let i = 1; i < referenceDates.length; i++) {
    const marketRet = gauss() * vol + drift;
    const ret = loading * marketRet + gauss() * (vol * 0.5);
    closes.push(closes[closes.length - 1] * (1 + ret));
  }

  return {
    dates: referenceDates,
    closes,
    name: `${ticker} (synthetic)`,
    assetType: inferAssetType(ticker),
  };
}

// ── Alignment utility ──────────────────────────────────────────────────────

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
      aligned.push(lastKnown);
    } else {
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
