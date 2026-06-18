export interface TickerMeta {
  price: number;
  name: string;
  type: 'ETF' | 'Mutual Fund' | 'Stock';
}

export interface PricesData {
  tickers: Record<string, TickerMeta>;
  synthetic: boolean;
}

export interface CorrelationData {
  tickers: string[];
  matrix: number[][];
  generated_at: string;
  synthetic: boolean;
}

export interface ReturnsData {
  dates: string[];
  series: Record<string, number[]>;
  synthetic: boolean;
}

export interface Holding {
  ticker: string;
  quantity: number;
}

export interface HoldingWithWeight extends Holding {
  price: number;
  value: number;
  weight: number;
  name: string;
  type: string;
}
