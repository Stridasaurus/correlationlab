import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
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

  const totalReturn = (portSeries[portSeries.length - 1] - 1) * 100;

  // Daily returns
  const dailyRets: number[] = [];
  for (let i = 1; i < portSeries.length; i++) {
    dailyRets.push(portSeries[i] / portSeries[i - 1] - 1);
  }
  const mean = dailyRets.reduce((s, r) => s + r, 0) / dailyRets.length;
  const variance = dailyRets.reduce((s, r) => s + (r - mean) ** 2, 0) / dailyRets.length;
  const dailyVol = Math.sqrt(variance);
  const vol = dailyVol * Math.sqrt(252) * 100;
  const sharpe = dailyVol > 0 ? (mean / dailyVol) * Math.sqrt(252) : 0;

  // Max drawdown
  let peak = portSeries[0];
  let maxDD = 0;
  for (const v of portSeries) {
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

  // Full-resolution portfolio series for stats
  const portSeries = computePortfolioSeries(series, holdings, totalValue);
  const { totalReturn, vol, maxDrawdown, sharpe } = portfolioStats(portSeries);

  // Downsampled for the chart
  const step = Math.max(1, Math.floor(dates.length / 252));
  const chartData = dates
    .filter((_, i) => i % step === 0)
    .map((date, idx) => {
      const srcIdx = idx * step;
      return { date, 'Portfolio Return': parseFloat(((portSeries[srcIdx] ?? 1) - 1) * 100 + '' ) };
    });

  const formatYAxis = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`;
  const returnColor = totalReturn >= 0
    ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-red-500 dark:text-red-400';

  return (
    <div className="flex flex-col gap-4">
      {/* Stat strip */}
      {tickers.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-gray-50 dark:bg-gray-800/60 rounded-xl px-4 py-3">
          <Stat
            label="Total return"
            value={`${totalReturn >= 0 ? '+' : ''}${totalReturn.toFixed(2)}%`}
            color={returnColor}
          />
          <Stat
            label="Ann. volatility"
            value={`${vol.toFixed(1)}%`}
          />
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

      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
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
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
