import { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceArea,
  ResponsiveContainer,
} from 'recharts';
import type { ReturnsData } from '../lib/types';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#a855f7'];

interface Props {
  data: ReturnsData;
}

type Row = Record<string, string | number>;

export default function ReturnsChart({ data }: Props) {
  const { dates, series } = data;
  const tickers = Object.keys(series);

  const [refLeft, setRefLeft] = useState('');
  const [refRight, setRefRight] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [zoomRange, setZoomRange] = useState<[string, string] | null>(null);

  // Full chart data (all points subsampled to ~252 for perf)
  const step = Math.max(1, Math.floor(dates.length / 252));
  const allChartData: Row[] = dates
    .filter((_, i) => i % step === 0)
    .map((date, _idx) => {
      const srcIdx = _idx * step;
      const row: Row = { date };
      tickers.forEach((t) => {
        row[t] = parseFloat(((series[t][srcIdx] - 1) * 100).toFixed(2));
      });
      return row;
    });

  const visibleData = zoomRange
    ? allChartData.filter((r) => r.date >= zoomRange[0] && r.date <= zoomRange[1])
    : allChartData;

  // Re-normalize visible data so the chart always starts at 0%
  const visibleNorm: Row[] = visibleData.map((row) => {
    const norm: Row = { date: row.date };
    tickers.forEach((t) => {
      const base = (visibleData[0][t] as number) ?? 0;
      norm[t] = parseFloat(((row[t] as number) - base).toFixed(2));
    });
    return norm;
  });

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
  const formatTooltip = (v: number, name: string) => [`${v > 0 ? '+' : ''}${v.toFixed(2)}%`, name];

  return (
    <div className="flex flex-col gap-2">
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

      <ResponsiveContainer width="100%" height={320}>
        <LineChart
          data={visibleNorm}
          margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
          onMouseDown={(e) => { if (e?.activeLabel) { setRefLeft(String(e.activeLabel)); setSelecting(true); } }}
          onMouseMove={(e) => { if (selecting && e?.activeLabel) setRefRight(String(e.activeLabel)); }}
          onMouseUp={commitZoom}
          style={{ userSelect: 'none' }}
        >
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
          {selecting && refLeft && refRight && (
            <ReferenceArea x1={refLeft} x2={refRight} fill="#6366f1" fillOpacity={0.15} stroke="#6366f1" strokeOpacity={0.4} />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
