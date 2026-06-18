import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type {
  CorrelationData,
  ReturnsData,
  PricesData,
  Holding,
  HoldingWithWeight,
  CustomTickerEntry,
  RangePreset,
  WindowDays,
} from './lib/types';
import { correlationMatrix, normalizedCumulativeReturns } from './lib/correlation';
import {
  fetchTickerData,
  syntheticTicker,
  alignToReferenceDates,
} from './lib/fetchTicker';
import HoldingsTable from './components/HoldingsTable';
import CorrelationHeatmap from './components/CorrelationHeatmap';
import ReturnsChart from './components/ReturnsChart';
import PortfolioChart from './components/PortfolioChart';
import SummaryStats from './components/SummaryStats';
import RollingCorrelationPanel from './components/RollingCorrelationPanel';
import TickerInput from './components/TickerInput';

const BASE = import.meta.env.BASE_URL;

const RANGE_DAYS: Record<RangePreset, number> = {
  '3M': 63, '6M': 126, '1Y': 252, '2Y': 504,
  '5Y': 1260, '10Y': 2520, '20Y': 5040,
};

const EXTENDED_RANGES = new Set<RangePreset>(['5Y', '10Y', '20Y']);

interface Preset {
  name: string;
  description: string;
  // allocation 0–1, must sum to 1
  holdings: { ticker: string; allocation: number }[];
  // target portfolio value in today's dollars (historical presets inflation-adjusted)
  totalValue: number;
  range?: RangePreset;
}

const PRESETS: Preset[] = [
  {
    name: 'Diversified Core',
    description: 'Classic broad-market allocation: US equities, bonds, gold, emerging markets',
    totalValue: 50_000,
    holdings: [
      { ticker: 'SPY',  allocation: 0.60 },
      { ticker: 'BND',  allocation: 0.30 },
      { ticker: 'GLD',  allocation: 0.07 },
      { ticker: 'VWO',  allocation: 0.03 },
    ],
    range: '2Y',
  },
  {
    name: 'All-Weather',
    description: "Dalio's risk-parity balance across economic environments",
    totalValue: 50_000,
    holdings: [
      { ticker: 'SPY',  allocation: 0.30 },
      { ticker: 'TLT',  allocation: 0.40 },
      { ticker: 'IEF',  allocation: 0.15 },
      { ticker: 'GLD',  allocation: 0.075 },
      { ticker: 'DJP',  allocation: 0.075 },
    ],
    range: '5Y',
  },
  {
    name: 'Crypto & Equities',
    description: 'Growth-oriented mix of equities, crypto, and gold hedge',
    totalValue: 25_000,
    holdings: [
      { ticker: 'SPY',     allocation: 0.40 },
      { ticker: 'QQQ',     allocation: 0.25 },
      { ticker: 'BTC-USD', allocation: 0.20 },
      { ticker: 'ETH-USD', allocation: 0.10 },
      { ticker: 'GLD',     allocation: 0.05 },
    ],
    range: '2Y',
  },
  {
    name: 'US Sectors',
    description: 'Equal-weight sector rotation: financials, energy, tech, health, utilities',
    totalValue: 50_000,
    holdings: [
      { ticker: 'XLF', allocation: 0.20 },
      { ticker: 'XLE', allocation: 0.20 },
      { ticker: 'XLK', allocation: 0.20 },
      { ticker: 'XLV', allocation: 0.20 },
      { ticker: 'XLU', allocation: 0.20 },
    ],
    range: '5Y',
  },
  {
    // $50k in 2008 ≈ $75k in 2026 (~2.2% annual inflation)
    name: '2008 Crisis',
    description: 'See how equities, bonds, gold, real estate & financials diverged in 2008',
    totalValue: 75_000,
    holdings: [
      { ticker: 'SPY', allocation: 0.50 },
      { ticker: 'GLD', allocation: 0.20 },
      { ticker: 'TLT', allocation: 0.20 },
      { ticker: 'VNQ', allocation: 0.05 },
      { ticker: 'XLF', allocation: 0.05 },
    ],
    range: '20Y',
  },
  {
    // $50k in 2000 ≈ $90k in 2026 (~2.7% annual inflation)
    name: 'Dot-com Bubble',
    description: 'Tech euphoria vs safe havens through the 2000–2003 collapse',
    totalValue: 90_000,
    holdings: [
      { ticker: 'QQQ', allocation: 0.40 },
      { ticker: 'SPY', allocation: 0.40 },
      { ticker: 'GLD', allocation: 0.10 },
      { ticker: 'TLT', allocation: 0.10 },
    ],
    range: '20Y',
  },
];

function SectionCard({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

export default function App() {
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [correlationData, setCorrelationData] = useState<CorrelationData | null>(null);
  const [returnsData, setReturnsData] = useState<ReturnsData | null>(null);
  const [pricesData, setPricesData] = useState<PricesData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // New feature state
  const [rangePreset, setRangePreset] = useState<RangePreset>('2Y');
  const [windowDays, setWindowDays] = useState<WindowDays>(90);
  const [windowEndIdx, setWindowEndIdx] = useState<number>(0);
  const [customTickers, setCustomTickers] = useState<Record<string, CustomTickerEntry>>({});

  useEffect(() => {
    if (dark) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [dark]);

  useEffect(() => {
    Promise.all([
      fetch(`${BASE}data/correlation.json`).then((r) => r.json()),
      fetch(`${BASE}data/returns.json`).then((r) => r.json()),
      fetch(`${BASE}data/prices.json`).then((r) => r.json()),
    ])
      .then(([corr, ret, prices]) => {
        setCorrelationData(corr);
        setReturnsData(ret);
        setPricesData(prices);
      })
      .catch((e) => setError(String(e)));
  }, []);

  // ── Derived: date axis ────────────────────────────────────────────────────
  // In extended ranges, drive the axis from the longest custom ticker fetch.
  // In standard ranges, use the pre-built static JSON dates.
  const allDates = useMemo(() => {
    if (EXTENDED_RANGES.has(rangePreset)) {
      let longest: string[] = [];
      for (const entry of Object.values(customTickers)) {
        if (entry.dates.length > longest.length) longest = entry.dates;
      }
      return longest;
    }
    return returnsData?.dates ?? [];
  }, [rangePreset, returnsData, customTickers]);

  // ── Derived: merged series (static + custom tickers) ──────────────────────
  const mergedSeries = useMemo(() => {
    if (!returnsData) return {};
    const activeTickers = new Set(holdings.map((h) => h.ticker));
    const series: Record<string, number[]> = {};
    // Static default-ticker data only covers ~2Y — exclude in extended ranges
    if (!EXTENDED_RANGES.has(rangePreset)) {
      for (const [t, vals] of Object.entries(returnsData.series)) {
        if (activeTickers.has(t)) series[t] = vals;
      }
    }
    for (const [ticker, entry] of Object.entries(customTickers)) {
      if (allDates.length === 0) continue;
      const aligned = alignToReferenceDates(
        { dates: entry.dates, closes: entry.closes, name: entry.name, assetType: entry.assetType },
        allDates,
      );
      series[ticker] = normalizedCumulativeReturns(aligned);
    }
    return series;
  }, [returnsData, customTickers, allDates, holdings, rangePreset]);

  // ── Derived: time-range filtered data ─────────────────────────────────────
  const filteredReturns = useMemo((): ReturnsData => {
    if (!returnsData) return { dates: [], series: {}, synthetic: false };
    const maxDays = RANGE_DAYS[rangePreset];
    const startIdx = Math.max(0, allDates.length - maxDays);
    const filteredDates = allDates.slice(startIdx);
    const filteredSeries: Record<string, number[]> = {};
    for (const [t, vals] of Object.entries(mergedSeries)) {
      const sliced = vals.slice(startIdx);
      // Re-normalize so the chart starts at 0%
      filteredSeries[t] = normalizedCumulativeReturns(sliced);
    }
    return { dates: filteredDates, series: filteredSeries, synthetic: returnsData.synthetic };
  }, [returnsData, mergedSeries, rangePreset, allDates]);

  // Clamp window index when the date range shrinks; on initial load (idx===0) jump to end
  useEffect(() => {
    const newMax = Math.max(0, filteredReturns.dates.length - 1);
    setWindowEndIdx((prev) => {
      if (prev === 0 || prev > newMax) return newMax;
      return prev;
    });
  }, [filteredReturns.dates.length]);

  // ── Derived: rolling correlation for selected window ──────────────────────
  const rollingCorrelation = useMemo((): CorrelationData => {
    const dates = filteredReturns.dates;
    const series = filteredReturns.series;
    const tickers = Object.keys(series);
    if (tickers.length === 0 || dates.length === 0) {
      return { tickers: [], matrix: [], generated_at: '', synthetic: false };
    }

    const startIdx = Math.max(0, windowEndIdx - windowDays + 1);
    const endIdx = windowEndIdx + 1; // exclusive

    // Slice each ticker's normalized returns for the window
    const windowedRaw: Record<string, number[]> = {};
    for (const t of tickers) {
      // Use raw (un-re-normalized) closes for correct return computation
      // We derive daily returns from the normalized series directly
      windowedRaw[t] = series[t].slice(startIdx, endIdx);
    }

    const { tickers: corrTickers, matrix } = correlationMatrix(windowedRaw);
    const windowStart = dates[startIdx] ?? '';
    const windowEnd = dates[windowEndIdx] ?? '';

    return {
      tickers: corrTickers,
      matrix,
      generated_at: `${windowStart} → ${windowEnd}`,
      synthetic: filteredReturns.synthetic || Object.values(customTickers).some((e) => e.synthetic),
    };
  }, [filteredReturns, windowEndIdx, windowDays, customTickers]);

  const onQuantityChange = useCallback((ticker: string, qty: number) => {
    setHoldings((prev) =>
      prev.map((h) => (h.ticker === ticker ? { ...h, quantity: qty } : h))
    );
  }, []);

  const onRemoveTicker = useCallback((ticker: string) => {
    setCustomTickers((prev) => {
      const next = { ...prev };
      delete next[ticker];
      return next;
    });
    setHoldings((prev) => prev.filter((h) => h.ticker !== ticker));
  }, []);

  // ── Add ticker handler ────────────────────────────────────────────────────
  const onAddTicker = useCallback(async (ticker: string) => {
    let fetched = await fetchTickerData(ticker, rangePreset);
    let isSynthetic = false;

    if (!fetched) {
      // Synthetic fallback: use allDates or a generated date list
      const refDates = allDates.length > 0 ? allDates : filteredReturns.dates;
      fetched = syntheticTicker(ticker, refDates);
      isSynthetic = true;
    }

    // Store raw dates+closes so mergedSeries can re-align when the date axis changes
    const latestPrice = fetched.closes[fetched.closes.length - 1] ?? 0;

    setCustomTickers((prev) => ({
      ...prev,
      [ticker]: {
        closes: fetched!.closes,
        dates: fetched!.dates,
        name: fetched!.name,
        latestPrice,
        synthetic: isSynthetic,
        assetType: fetched!.assetType,
      },
    }));

    setHoldings((prev) => {
      if (prev.find((h) => h.ticker === ticker)) return prev;
      return [...prev, { ticker, quantity: 0 }];
    });
  }, [allDates, filteredReturns.dates, rangePreset]);

  const onLoadPreset = useCallback(async (preset: Preset) => {
    const targetRange = preset.range ?? rangePreset;
    setHoldings([]);
    setCustomTickers({});
    if (preset.range) setRangePreset(preset.range);

    const refDates = allDates.length > 0 ? allDates : filteredReturns.dates;
    const results = await Promise.all(
      preset.holdings.map(async ({ ticker, allocation }) => {
        let fetched = await fetchTickerData(ticker, targetRange);
        let isSynthetic = false;
        if (!fetched) {
          fetched = syntheticTicker(ticker, refDates);
          isSynthetic = true;
        }
        const latestPrice = fetched.closes[fetched.closes.length - 1] ?? 1;
        const quantity = latestPrice > 0
          ? Math.round((preset.totalValue * allocation) / latestPrice * 100) / 100
          : 0;
        return { ticker, fetched, isSynthetic, latestPrice, allocation, quantity };
      })
    );

    const newCustomTickers: typeof customTickers = {};
    const newHoldings: { ticker: string; quantity: number }[] = [];
    for (const { ticker, fetched, isSynthetic, latestPrice, quantity } of results) {
      newCustomTickers[ticker] = {
        closes: fetched.closes,
        dates: fetched.dates,
        name: fetched.name,
        latestPrice,
        synthetic: isSynthetic,
        assetType: fetched.assetType,
      };
      newHoldings.push({ ticker, quantity });
    }
    setCustomTickers(newCustomTickers);
    setHoldings(newHoldings);
  }, [rangePreset, allDates, filteredReturns.dates, customTickers]);

  // Re-fetch all custom tickers whenever range changes so data always covers the selected span.
  const onAddTickerRef = useRef(onAddTicker);
  onAddTickerRef.current = onAddTicker;
  const prevRangeRef = useRef<RangePreset>(rangePreset);
  useEffect(() => {
    const prev = prevRangeRef.current;
    prevRangeRef.current = rangePreset;
    if (prev !== rangePreset) {
      Object.keys(customTickers).forEach((t) => onAddTickerRef.current(t));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangePreset]);

  // ── Enriched holdings ─────────────────────────────────────────────────────
  const allTickers = useMemo(() => [
    ...holdings.map((h) => h.ticker),
  ], [holdings]);

  const enrichedHoldings: HoldingWithWeight[] = useMemo(() => {
    const priceMap: Record<string, { price: number; name: string; type: string }> = {};

    if (pricesData) {
      for (const [t, meta] of Object.entries(pricesData.tickers)) {
        priceMap[t] = { price: meta.price, name: meta.name, type: meta.type };
      }
    }
    for (const [t, entry] of Object.entries(customTickers)) {
      priceMap[t] = { price: entry.latestPrice, name: entry.name, type: entry.assetType };
    }

    const totalValue = holdings.reduce((s, h) => {
      return s + (priceMap[h.ticker]?.price ?? 0) * h.quantity;
    }, 0);

    return holdings.map((h) => {
      const meta = priceMap[h.ticker] ?? { price: 0, name: h.ticker, type: 'Unknown' };
      const value = meta.price * h.quantity;
      return {
        ...h,
        price: meta.price,
        name: meta.name,
        type: meta.type,
        value,
        weight: totalValue > 0 ? value / totalValue : 0,
      };
    });
  }, [holdings, pricesData, customTickers]);

  // ── Render helpers ────────────────────────────────────────────────────────
  const isSynthetic = correlationData?.synthetic || Object.values(customTickers).some((e) => e.synthetic);
  const hasSyntheticCustom = Object.values(customTickers).some((e) => e.synthetic);
  const maxWindowIdx = Math.max(0, filteredReturns.dates.length - 1);
  const rangeOptions: RangePreset[] = ['3M', '6M', '1Y', '2Y', '5Y', '10Y', '20Y'];
  const isExtendedRange = EXTENDED_RANGES.has(rangePreset);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-center">
          <p className="text-red-600 dark:text-red-400 font-mono">{error}</p>
          <p className="text-gray-500 mt-2 text-sm">Could not load data files.</p>
        </div>
      </div>
    );
  }

  if (!correlationData || !returnsData || !pricesData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="animate-pulse text-gray-400 dark:text-gray-500 text-lg">Loading portfolio data…</div>
      </div>
    );
  }

  const dailyReturnsCount = filteredReturns.dates.length;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 transition-colors">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-gray-900/80 backdrop-blur border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold text-indigo-600 dark:text-indigo-400">CorrelationLab</span>
            {isSynthetic && !hasSyntheticCustom && (
              <span className="text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full font-medium">
                Synthetic data
              </span>
            )}
          </div>
          <button
            onClick={() => setDark((d) => !d)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Toggle theme"
          >
            {dark ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m8.66-9h-1M4.34 12h-1m15.07-6.07-.707.707M6.343 17.657l-.707.707m12.02 0-.707-.707M6.343 6.343l-.707-.707M12 7a5 5 0 100 10 5 5 0 000-10z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">
        {/* Title + Range selector */}
        <div className="flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Portfolio Correlation Analysis</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
              Showing {dailyReturnsCount} trading days · Data: {correlationData.generated_at.slice(0, 10)}
            </p>
          </div>
          {/* Range preset buttons */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-medium">Range</span>
            <div className="flex gap-1">
              {rangeOptions.map((r) => (
                <button
                  key={r}
                  onClick={() => setRangePreset(r)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                    rangePreset === r
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Holdings */}
        <SectionCard title="Holdings">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <TickerInput onAdd={onAddTicker} existingTickers={allTickers} />
              </div>
              {holdings.length > 0 && (
                <button
                  onClick={() => { setHoldings([]); setCustomTickers({}); }}
                  className="shrink-0 px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  title="Remove all tickers"
                >
                  Clear all
                </button>
              )}
            </div>
            {/* Preset selector */}
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wide shrink-0">Presets</span>
              {PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => onLoadPreset(preset)}
                  title={preset.description}
                  className="px-2.5 py-1 text-xs rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                >
                  {preset.name}
                </button>
              ))}
            </div>
            {holdings.length === 0 && (
              <div className="text-sm text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2">
                {isExtendedRange
                  ? 'Add tickers above or pick a preset to compare long-term history.'
                  : 'Pick a preset above or type a ticker to get started.'}
              </div>
            )}
            {hasSyntheticCustom && (
              <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg px-3 py-2">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                Some tickers are using synthetic data (live fetch unavailable). Correlation structure is realistic but prices are not real.
              </div>
            )}
            <HoldingsTable
              holdings={enrichedHoldings}
              onQuantityChange={onQuantityChange}
              onRemove={onRemoveTicker}
              removableTickers={enrichedHoldings.map((h) => h.ticker)}
            />
          </div>
        </SectionCard>

        {/* Summary stats */}
        <SectionCard title="Summary Statistics">
          <SummaryStats data={rollingCorrelation} />
        </SectionCard>

        {/* Correlation heatmap + rolling window controls */}
        <SectionCard title="Correlation Heatmap">
          <div className="space-y-6">
            <RollingCorrelationPanel
              windowDays={windowDays}
              onWindowChange={setWindowDays}
              windowEndIdx={windowEndIdx}
              onWindowEndChange={setWindowEndIdx}
              maxIdx={maxWindowIdx}
              filteredDates={filteredReturns.dates}
            />
            <CorrelationHeatmap data={rollingCorrelation} />
          </div>
        </SectionCard>

        {/* Returns chart */}
        <SectionCard title="Normalized Returns (vs. period start)">
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
            All series start at 0% at the beginning of the selected range.
          </p>
          <ReturnsChart data={filteredReturns} />
        </SectionCard>

        {/* Portfolio chart */}
        <SectionCard title="Portfolio Weighted Return">
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
            Blended portfolio return weighted by current holdings.
          </p>
          <PortfolioChart returnsData={filteredReturns} holdings={enrichedHoldings} />
        </SectionCard>
      </main>

      <footer className="max-w-6xl mx-auto px-4 sm:px-6 py-6 text-center text-xs text-gray-400 dark:text-gray-600 border-t border-gray-200 dark:border-gray-800 mt-4">
        {correlationData.synthetic
          ? 'Using synthetic data — live market data unavailable in this environment.'
          : 'Market data via yfinance (pre-built) and Yahoo Finance (live additions). Not financial advice.'}
      </footer>
    </div>
  );
}
