import type { CorrelationData } from '../lib/types';
import { avgPairwiseCorrelation, extremePairs, annualizedVol, annualizedReturn, sharpe } from '../lib/correlation';

interface Props {
  data: CorrelationData;
  series: Record<string, number[]>;
  rangeLabel: string;
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-2xl font-semibold font-mono text-gray-900 dark:text-gray-100">{value}</span>
      {sub && <span className="text-xs text-gray-500 dark:text-gray-400">{sub}</span>}
    </div>
  );
}

function fmt(n: number, decimals: number, suffix = ''): string {
  if (!isFinite(n) || isNaN(n)) return '—';
  return n.toFixed(decimals) + suffix;
}

export default function SummaryStats({ data, series, rangeLabel }: Props) {
  const { tickers, matrix } = data;
  const avg = avgPairwiseCorrelation(tickers, matrix);
  const { mostCorrelated, leastCorrelated } = extremePairs(tickers, matrix);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Avg pairwise correlation"
          value={avg.toFixed(3)}
          sub={avg > 0.8 ? 'Highly concentrated' : avg > 0.5 ? 'Moderately diversified' : 'Well diversified'}
        />
        <StatCard
          label="Most correlated pair"
          value={`${mostCorrelated[2].toFixed(3)}`}
          sub={`${mostCorrelated[0]} & ${mostCorrelated[1]}`}
        />
        <StatCard
          label="Least correlated pair"
          value={`${leastCorrelated[2].toFixed(3)}`}
          sub={`${leastCorrelated[0]} & ${leastCorrelated[1]}`}
        />
      </div>
      {tickers.length > 0 && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
          <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
            Annualized stats · {rangeLabel}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left pb-2 font-medium">Ticker</th>
                  <th className="text-right pb-2 font-medium">Return</th>
                  <th className="text-right pb-2 font-medium">Volatility</th>
                  <th className="text-right pb-2 font-medium">Sharpe</th>
                </tr>
              </thead>
              <tbody>
                {tickers.map((ticker) => {
                  const s = series[ticker];
                  const ret = s ? annualizedReturn(s) : NaN;
                  const vol = s ? annualizedVol(s) : NaN;
                  const sh = s ? sharpe(s) : NaN;
                  return (
                    <tr key={ticker} className="border-b border-gray-100 dark:border-gray-700/50 last:border-0">
                      <td className="py-2 font-mono font-medium text-gray-900 dark:text-gray-100">{ticker}</td>
                      <td className={`py-2 text-right font-mono ${isFinite(ret) ? (ret >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400') : 'text-gray-400'}`}>
                        {fmt(ret * 100, 1, '%')}
                      </td>
                      <td className="py-2 text-right font-mono text-gray-700 dark:text-gray-300">
                        {fmt(vol * 100, 1, '%')}
                      </td>
                      <td className={`py-2 text-right font-mono ${isFinite(sh) ? (sh >= 1 ? 'text-emerald-600 dark:text-emerald-400' : sh >= 0 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400') : 'text-gray-400'}`}>
                        {fmt(sh, 2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
