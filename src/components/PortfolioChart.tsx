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

export default function PortfolioChart({ returnsData, holdings }: Props) {
  const { dates, series } = returnsData;
  const tickers = Object.keys(series);

  // Compute total portfolio value over time using weights × normalized price
  const totalValue = holdings.reduce((s, h) => s + h.value, 0);

  const step = Math.max(1, Math.floor(dates.length / 252));
  const chartData = dates
    .filter((_, i) => i % step === 0)
    .map((date, idx) => {
      const srcIdx = idx * step;
      let portfolioValue = 0;
      tickers.forEach((t) => {
        const h = holdings.find((hh) => hh.ticker === t);
        if (!h || totalValue === 0) return;
        const weight = h.value / totalValue;
        portfolioValue += weight * (series[t][srcIdx] - 1) * 100;
      });
      return { date, 'Portfolio Return': parseFloat(portfolioValue.toFixed(2)) };
    });

  const formatYAxis = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`;

  return (
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
  );
}
