import { useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  ResponsiveContainer,
} from 'recharts';
import type { ReturnsData, HoldingWithWeight } from '../lib/types';

interface Props {
  returnsData: ReturnsData;
  holdings: HoldingWithWeight[];
}

function computePortfolioSeries(
  series: Record<string, number[]>,
  holdings: HoldingWithWeight[],
  totalValue: number,
): number[] {
  const tickers = Object.keys(series);
  const len = tickers.length > 0 ? series[tickers[0]].length : 0;
  const result: number[] = [];
  for (let i = 0; i < len; i++) {
    let v = 0;
    tickers.forEach((t) => {
      const h = holdings.find((hh) => hh.ticker === t);
      if (!h || totalValue === 0) return;
      v += (h.value / totalValue) * series[t][i];
    });
    result.push(v);
  }
  return result;
}

function portfolioStats(portSeries: number[]) {
  if (portSeries.length < 2) return { totalReturn: 0, vol: 0, maxDrawdown: 0, sharpe: 0 };

  // Re-base to the start of the slice
  const base = portSeries[0];
  const rebased = portSeries.map((v) => v / base);

  const totalReturn = (rebased[rebased.length - 1] - 1) * 100;

  const dailyRets: number[] = [];
  for (let i = 1; i < rebased.length; i++) dailyRets.push(rebased[i] / rebased[i - 1] - 1);

  const mean = dailyRets.reduce((s, r) => s + r, 0) / dailyRets.length;
  const variance = dailyRets.reduce((s, r) => s + (r - mean) ** 2, 0) / dailyRets.length;
  const dailyVol = Math.sqrt(variance);
  const vol = dailyVol * Math.sqrt(252) * 100;
  const sharpe = dailyVol > 0 ? (mean / dailyVol) * Math.sqrt(252) : 0;

  let peak = rebased[0];
  let maxDD = 0;
  for (const v of rebased) {
    if (v > peak) peak = v;
    const dd = (peak - v) / peak;
    if (dd > maxDD) maxDD = dd;
  }

  return { totalReturn, vol, maxDrawdown: maxDD * 100, sharpe };
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 truncate">{label}</span>
      <span className={`text-lg font-semibold font-mono ${color ?? 'text-gray-900 dark:text-gray-100'}`}>{value}</span>
    </div>
  );
}

export default function PortfolioChart({ returnsData, holdings }: Props) {
  const { dates, series } = returnsData;
  const tickers = Object.keys(series);
  const totalValue = holdings.reduce((s, h) => s + h.value, 0);

  const [refLeft, setRefLeft] = useState('');
  const [refRight, setRefRight] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [zoomRange, setZoomRange] = useState<[string, string] | null>(null);

  // Full-resolution portfolio series
  const portSeries = computePortfolioSeries(series, holdings, totalValue);

  // Build chart data with source index for stats slicing
  const step = Math.max(1, Math.floor(dates.length / 252));
  const allChartData = dates
    .filter((_, i) => i % step === 0)
    .map((date, idx) => {
      const srcIdx = idx * step;
      return { date, srcIdx, value: (portSeries[srcIdx] ?? 1) };
    });

  const visibleChartData = zoomRange
    ? allChartData.filter((r) => r.date >= zoomRange[0] && r.date <= zoomRange[1])
    : allChartData;

  // Re-base visible data to 0% at start
  const baseValue = visibleChartData[0]?.value ?? 1;
  const chartData = visibleChartData.map((r) => ({
    date: r.date,
    srcIdx: r.srcIdx,
    'Portfolio Return': parseFloat(((r.value / baseValue - 1) * 100).toFixed(2)),
  }));

  // Stats over the visible slice of portSeries
  const firstSrcIdx = visibleChartData[0]?.srcIdx ?? 0;
  const lastSrcIdx = (visibleChartData[visibleChartData.length - 1]?.srcIdx ?? portSeries.length - 1) + 1;
  const statsSlice = portSeries.slice(firstSrcIdx, lastSrcIdx);
  const { totalReturn, vol, maxDrawdown, sharpe } = portfolioStats(statsSlice);

  const commitZoom = () => {
    setSelecting(false);
    if (!refLeft || !refRight || refLeft === refRight) {
      setRefLeft(''); setRefRight('');
      return;
    }
    const [l, r] = refLeft < refRight ? [refLeft, refRight] : [refRight, refLeft];
    setZoomRange([l, r]);
    setRefLeft(''); setRefRight('');
  };

  const resetZoom = () => { setZoomRange(null); setRefLeft(''); setRefRight(''); };

  const formatYAxis = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`;
  const returnColor = totalReturn >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400';

  return (
    <div className="flex flex-col gap-4">
      {/* Stats strip */}
      {tickers.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-gray-50 dark:bg-gray-800/60 rounded-xl px-4 py-3">
          <Stat
            label="Total return"
            value={`${totalReturn >= 0 ? '+' : ''}${totalReturn.toFixed(2)}%`}
            color={returnColor}
          />
          <Stat label="Ann. volatility" value={`${vol.toFixed(1)}%`} />
          <Stat
            label="Max drawdown"
            value={`-${maxDrawdown.toFixed(1)}%`}
            color="text-red-500 dark:text-red-400"
          />
          <Stat
            label="Sharpe ratio"
            value={sharpe.toFixed(2)}
            color={sharpe >= 1 ? 'text-emerald-600 dark:text-emerald-400' : sharpe >= 0 ? 'text-gray-900 dark:text-gray-100' : 'text-red-500 dark:text-red-400'}
          />
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400 dark:text-gray-500">
          {zoomRange ? `${zoomRange[0]} → ${zoomRange[1]}` : 'Drag on chart to zoom in'}
        </p>
        {zoomRange && (
          <button
            onClick={resetZoom}
            className="text-xs px-2 py-0.5 rounded border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            Reset zoom
          </button>
        )}
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <AreaChart
          data={chartData}
          margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
          onMouseDown={(e) => { if (e?.activeLabel) { setRefLeft(String(e.activeLabel)); setSelecting(true); } }}
          onMouseMove={(e) => { if (selecting && e?.activeLabel) setRefRight(String(e.activeLabel)); }}
          onMouseUp={commitZoom}
          style={{ userSelect: 'none' }}
        >
          <defs>
            <linearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.5} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            tickFormatter={(v: string) => v.slice(0, 7)}
            interval="preserveStartEnd"
          />
          <YAxis tickFormatter={formatYAxis} tick={{ fontSize: 11, fill: '#9ca3af' }} width={56} />
          <Tooltip
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(v: any) => [`${v > 0 ? '+' : ''}${(v as number).toFixed(2)}%`, 'Portfolio Return']}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            labelFormatter={(label: any) => `Date: ${label}`}
            contentStyle={{
              backgroundColor: 'var(--tooltip-bg, #1f2937)',
              border: 'none',
              borderRadius: '8px',
              color: '#f9fafb',
              fontSize: '12px',
            }}
          />
          <Area
            type="monotone"
            dataKey="Portfolio Return"
            stroke="#6366f1"
            strokeWidth={2}
            fill="url(#portfolioGrad)"
            dot={false}
          />
          {selecting && refLeft && refRight && (
            <ReferenceArea x1={refLeft} x2={refRight} fill="#6366f1" fillOpacity={0.15} stroke="#6366f1" strokeOpacity={0.4} />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
