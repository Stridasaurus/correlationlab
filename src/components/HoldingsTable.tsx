import type { HoldingWithWeight } from '../lib/types';

interface Props {
  holdings: HoldingWithWeight[];
  onQuantityChange: (ticker: string, qty: number) => void;
}

export default function HoldingsTable({ holdings, onQuantityChange }: Props) {
  const totalValue = holdings.reduce((s, h) => s + h.value, 0);

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 uppercase text-xs tracking-wide">
            <th className="text-left px-4 py-3">Ticker</th>
            <th className="text-left px-4 py-3 hidden sm:table-cell">Name</th>
            <th className="text-left px-4 py-3 hidden sm:table-cell">Type</th>
            <th className="text-right px-4 py-3">Price</th>
            <th className="text-right px-4 py-3">Qty</th>
            <th className="text-right px-4 py-3">Value</th>
            <th className="text-right px-4 py-3">Weight</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {holdings.map((h) => (
            <tr
              key={h.ticker}
              className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            >
              <td className="px-4 py-3 font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                {h.ticker}
              </td>
              <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden sm:table-cell max-w-xs truncate">
                {h.name}
              </td>
              <td className="px-4 py-3 hidden sm:table-cell">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  h.type === 'ETF'
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                    : 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                }`}>
                  {h.type}
                </span>
              </td>
              <td className="px-4 py-3 text-right font-mono text-gray-700 dark:text-gray-300">
                ${h.price.toFixed(2)}
              </td>
              <td className="px-4 py-3 text-right">
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={h.quantity}
                  onChange={(e) => onQuantityChange(h.ticker, Math.max(0, Number(e.target.value)))}
                  className="w-24 text-right bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600
                    rounded-lg px-2 py-1 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500
                    text-gray-700 dark:text-gray-300"
                />
              </td>
              <td className="px-4 py-3 text-right font-mono text-gray-700 dark:text-gray-300">
                ${h.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-2">
                  <div className="w-16 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 hidden sm:block">
                    <div
                      className="bg-indigo-500 h-1.5 rounded-full"
                      style={{ width: `${(h.weight * 100).toFixed(1)}%` }}
                    />
                  </div>
                  <span className="text-gray-600 dark:text-gray-400 text-xs w-12 text-right">
                    {(h.weight * 100).toFixed(1)}%
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-gray-50 dark:bg-gray-800 font-semibold text-gray-700 dark:text-gray-300 border-t border-gray-200 dark:border-gray-700">
            <td colSpan={5} className="px-4 py-3 text-right hidden sm:table-cell">Total</td>
            <td colSpan={2} className="px-4 py-3 text-right sm:hidden">Total</td>
            <td className="px-4 py-3 text-right font-mono">
              ${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </td>
            <td className="px-4 py-3 text-right text-xs text-gray-500 dark:text-gray-400">100%</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
