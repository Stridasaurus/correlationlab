import { useState } from 'react';

interface Props {
  onAdd: (ticker: string) => Promise<void>;
  existingTickers: string[];
}

export default function TickerInput({ onAdd, existingTickers }: Props) {
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ticker = value.trim().toUpperCase();
    if (!ticker) return;
    if (existingTickers.includes(ticker)) {
      setError(`${ticker} is already in your portfolio.`);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await onAdd(ticker);
      setValue('');
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
      <div className="flex gap-2 flex-1">
        <input
          type="text"
          value={value}
          onChange={(e) => { setValue(e.target.value.toUpperCase()); setError(null); }}
          placeholder="Add ticker (e.g. AAPL, BND, QQQ)"
          maxLength={12}
          disabled={loading}
          className="flex-1 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600
            rounded-lg px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:ring-2
            focus:ring-indigo-500 text-gray-800 dark:text-gray-200 placeholder-gray-400
            disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading || !value.trim()}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300
            dark:disabled:bg-indigo-800 text-white text-sm font-semibold rounded-lg
            transition-colors flex items-center gap-2 whitespace-nowrap"
        >
          {loading ? (
            <>
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Fetching…
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add
            </>
          )}
        </button>
      </div>
      {error && (
        <p className="text-xs text-red-500 dark:text-red-400 sm:self-center">{error}</p>
      )}
    </form>
  );
}
