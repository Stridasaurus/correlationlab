import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { ReturnsData } from '../lib/types';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

interface Props {
  data: ReturnsData;
}

export default function ReturnsChart({ data }: Props) {
  const { dates, series } = data;
  const tickers = Object.keys(series);

  // Subsample dates for performance (show ~252 points max)
  const step = Math.max(1, Math.floor(dates.length / 252));
  const chartData = dates
    .filter((_, i) => i % step === 0)
    .map((date, idx) => {
      const srcIdx = idx * step;
      const row: Record<string, string | number> = { date };
      tickers.forEach((t) => {
        row[t] = parseFloat(((series[t][srcIdx] - 1) * 100).toFixed(2));
      });
      return row;
    });

  const formatYAxis = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`;
  const formatTooltip = (v: number, name: string) => [`${v > 0 ? '+' : ''}${v.toFixed(2)}%`, name];

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.5} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          tickFormatter={(v: string) => v.slice(0, 7)}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={formatYAxis}
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          width={56}
        />
        <Tooltip
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={formatTooltip as any}
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
        <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
        {tickers.map((t, i) => (
          <Line
            key={t}
            type="monotone"
            dataKey={t}
            stroke={COLORS[i % COLORS.length]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
