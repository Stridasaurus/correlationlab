import type { WindowDays } from '../lib/types';

interface Props {
  windowDays: WindowDays;
  onWindowChange: (w: WindowDays) => void;
  windowEndIdx: number;
  onWindowEndChange: (idx: number) => void;
  maxIdx: number;           // filteredDates.length - 1
  filteredDates: string[];
}

const WINDOW_OPTIONS: WindowDays[] = [30, 60, 90, 180];

export default function RollingCorrelationPanel({
  windowDays,
  onWindowChange,
  windowEndIdx,
  onWindowEndChange,
  maxIdx,
  filteredDates,
}: Props) {
  const windowStartIdx = Math.max(0, windowEndIdx - windowDays + 1);
  const startDate = filteredDates[windowStartIdx] ?? '';
  const endDate = filteredDates[windowEndIdx] ?? '';

  const isLatest = windowEndIdx >= maxIdx;
  const canScan = maxIdx > windowDays - 1;

  return (
    <div className="space-y-4">
      {/* Window size selector */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          Window size
        </span>
        <div className="flex gap-1">
          {WINDOW_OPTIONS.map((w) => (
            <button
              key={w}
              onClick={() => onWindowChange(w)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                windowDays === w
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {w}d
            </button>
          ))}
        </div>
        {canScan && (
          <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">
            {isLatest ? (
              <span className="text-indigo-500 dark:text-indigo-400 font-medium">Most recent</span>
            ) : (
              <span>Scroll right for most recent →</span>
            )}
          </span>
        )}
      </div>

      {/* Timeline slider — only shown when the range is longer than the window */}
      {canScan ? (
        <div className="space-y-2">
          <input
            type="range"
            min={windowDays - 1}
            max={maxIdx}
            value={windowEndIdx}
            onChange={(e) => onWindowEndChange(Number(e.target.value))}
            className="w-full accent-indigo-600 cursor-pointer"
          />
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {filteredDates[windowDays - 1] ?? ''}
            </span>
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 bg-indigo-50 dark:bg-indigo-900/30 px-3 py-1 rounded-full border border-indigo-200 dark:border-indigo-700">
              {startDate} → {endDate}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {filteredDates[maxIdx] ?? ''}
            </span>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Drag the slider to scan correlations across the full {filteredDates.length}-day range. The heatmap reflects the selected {windowDays}-day window.
          </p>
        </div>
      ) : (
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Window covers the full selected range — choose a longer time period above to scan across time.
        </p>
      )}
    </div>
  );
}
