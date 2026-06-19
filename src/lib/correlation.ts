export function mean(arr: number[]): number {
  return arr.reduce((s, x) => s + x, 0) / arr.length;
}

export function stddev(arr: number[]): number {
  const m = mean(arr);
  const variance = arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

export function pearsonCorrelation(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return NaN;
  const ma = mean(a);
  const mb = mean(b);
  const sa = stddev(a);
  const sb = stddev(b);
  if (sa === 0 || sb === 0) return NaN;
  const cov = a.reduce((s, x, i) => s + (x - ma) * (b[i] - mb), 0) / a.length;
  return cov / (sa * sb);
}

export function dailyReturns(prices: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  return returns;
}

export function normalizedCumulativeReturns(prices: number[]): number[] {
  if (prices.length === 0) return [];
  const base = prices[0];
  return prices.map((p) => p / base);
}

export function correlationMatrix(
  series: Record<string, number[]>
): { tickers: string[]; matrix: number[][] } {
  const tickers = Object.keys(series);
  const returns = tickers.map((t) => dailyReturns(series[t]));
  const matrix = tickers.map((_, i) =>
    tickers.map((_, j) => pearsonCorrelation(returns[i], returns[j]))
  );
  return { tickers, matrix };
}

export function avgPairwiseCorrelation(tickers: string[], matrix: number[][]): number {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < tickers.length; i++) {
    for (let j = i + 1; j < tickers.length; j++) {
      sum += matrix[i][j];
      count++;
    }
  }
  return count === 0 ? NaN : sum / count;
}

export function annualizedVol(series: number[]): number {
  const rets = dailyReturns(series);
  if (rets.length === 0) return NaN;
  return stddev(rets) * Math.sqrt(252);
}

export function annualizedReturn(series: number[]): number {
  if (series.length < 2) return NaN;
  const totalReturn = series[series.length - 1] / series[0] - 1;
  const n = series.length - 1;
  return (1 + totalReturn) ** (252 / n) - 1;
}

// Sharpe ratio (0% risk-free). Computed from daily returns directly to avoid
// mixing geometric annualization of returns with arithmetic annualization of vol.
export function sharpe(series: number[]): number {
  const rets = dailyReturns(series);
  if (rets.length === 0) return NaN;
  const vol = stddev(rets);
  if (vol === 0) return NaN;
  return (mean(rets) / vol) * Math.sqrt(252);
}

export function extremePairs(
  tickers: string[],
  matrix: number[][]
): { mostCorrelated: [string, string, number]; leastCorrelated: [string, string, number] } {
  let maxVal = -Infinity;
  let minVal = Infinity;
  let maxPair: [string, string] = [tickers[0], tickers[1]];
  let minPair: [string, string] = [tickers[0], tickers[1]];

  for (let i = 0; i < tickers.length; i++) {
    for (let j = i + 1; j < tickers.length; j++) {
      const v = matrix[i][j];
      if (isNaN(v)) continue;
      if (v > maxVal) { maxVal = v; maxPair = [tickers[i], tickers[j]]; }
      if (v < minVal) { minVal = v; minPair = [tickers[i], tickers[j]]; }
    }
  }

  return {
    mostCorrelated: [...maxPair, maxVal] as [string, string, number],
    leastCorrelated: [...minPair, minVal] as [string, string, number],
  };
}
