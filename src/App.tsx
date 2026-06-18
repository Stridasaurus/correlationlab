import { useState, useEffect, useCallback } from 'react';
import type { CorrelationData, ReturnsData, PricesData, Holding, HoldingWithWeight } from './lib/types';
import HoldingsTable from './components/HoldingsTable';
import CorrelationHeatmap from './components/CorrelationHeatmap';
import ReturnsChart from './components/ReturnsChart';
import PortfolioChart from './components/PortfolioChart';
import SummaryStats from './components/SummaryStats';

const BASE = import.meta.env.BASE_URL;

const DEFAULT_HOLDINGS: Holding[] = [
  { ticker: 'VXUS',  quantity: 50 },
  { ticker: 'VOO',   quantity: 30 },
  { ticker: 'TRBCX', quantity: 20 },
  { ticker: 'PRFDX', quantity: 100 },
  { ticker: 'PRNHX', quantity: 15 },
];

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{title}</h2>
      {children}
    </div>
  );
}

export default function App() {
  const [dark, setDark] = useState(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
  const [holdings, setHoldings] = useState<Holding[]>(DEFAULT_HOLDINGS);
  const [correlationData, setCorrelationData] = useState<CorrelationData | null>(null);
  const [returnsData, setReturnsData] = useState<ReturnsData | null>(null);
  const [pricesData, setPricesData] = useState<PricesData | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const onQuantityChange = useCallback((ticker: string, qty: number) => {
    setHoldings((prev) =>
      prev.map((h) => (h.ticker === ticker ? { ...h, quantity: qty } : h))
    );
  }, []);

  const enrichedHoldings: HoldingWithWeight[] = (() => {
    if (!pricesData) return [];
    const totalValue = holdings.reduce((s, h) => {
      const meta = pricesData.tickers[h.ticker];
      return s + (meta ? meta.price * h.quantity : 0);
    }, 0);
    return holdings.map((h) => {
      const meta = pricesData.tickers[h.ticker] ?? { price: 0, name: h.ticker, type: 'Unknown' };
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
  })();

  const isSynthetic = correlationData?.synthetic || returnsData?.synthetic || pricesData?.synthetic;

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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 transition-colors">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-gray-900/80 backdrop-blur border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold text-indigo-600 dark:text-indigo-400">PortfolioLens</span>
            {isSynthetic && (
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
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Portfolio Correlation Analysis</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            Edit quantities to compute weights. Data: {correlationData.generated_at.slice(0, 10)}.
          </p>
        </div>

        <SectionCard title="Holdings">
          <HoldingsTable holdings={enrichedHoldings} onQuantityChange={onQuantityChange} />
        </SectionCard>

        <SectionCard title="Summary Statistics">
          <SummaryStats data={correlationData} />
        </SectionCard>

        <SectionCard title="Correlation Heatmap">
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">Hover over a cell for details. 2-year daily returns.</p>
          <CorrelationHeatmap data={correlationData} />
        </SectionCard>

        <SectionCard title="Normalized Returns (vs. start)">
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">All series start at 0%. Shows cumulative return above/below starting price.</p>
          <ReturnsChart data={returnsData} />
        </SectionCard>

        <SectionCard title="Portfolio Weighted Return">
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">Blended portfolio return weighted by current holdings.</p>
          <PortfolioChart returnsData={returnsData} holdings={enrichedHoldings} />
        </SectionCard>
      </main>

      <footer className="max-w-6xl mx-auto px-4 sm:px-6 py-6 text-center text-xs text-gray-400 dark:text-gray-600 border-t border-gray-200 dark:border-gray-800 mt-4">
        {isSynthetic
          ? 'Using synthetic data — live market data unavailable in this environment.'
          : 'Market data via yfinance. Not financial advice.'}
      </footer>
    </div>
  );
}
