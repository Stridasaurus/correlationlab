import type { CorrelationData } from '../lib/types';
import { avgPairwiseCorrelation, extremePairs } from '../lib/correlation';

interface Props {
  data: CorrelationData;
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

export default function SummaryStats({ data }: Props) {
  const { tickers, matrix } = data;
  const avg = avgPairwiseCorrelation(tickers, matrix);
  const { mostCorrelated, leastCorrelated } = extremePairs(tickers, matrix);

  return (
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
  );
}
