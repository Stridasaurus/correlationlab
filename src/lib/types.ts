export type AssetType = 'ETF' | 'Mutual Fund' | 'Stock' | 'Crypto' | 'Commodity' | 'Forex' | 'Index';

export interface TickerMeta {
  price: number;
  name: string;
  type: AssetType;
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

export interface CustomTickerEntry {
  closes: number[];
  dates: string[];
  name: string;
  latestPrice: number;
  synthetic: boolean;
  assetType: AssetType;
}

export type RangePreset = '3M' | '6M' | '1Y' | '2Y' | '5Y' | '10Y' | '20Y';
export type WindowDays = 30 | 60 | 90 | 180;
