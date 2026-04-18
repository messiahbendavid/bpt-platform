export interface QuarterlyFinancials {
  ticker: string;
  periodEndDate: string;
  filingDate: string | null;
  revenues: number | null;
  netIncome: number | null;
  ncf: number | null;
  ncfoa: number | null;
  ncfia: number | null;
  capex: number | null;
  fcf: number | null;
  dilutedEps: number | null;
  totalEquity: number | null;
  totalDebt: number | null;
  sharesOutstanding: number | null;
  operatingIncome: number | null;
  grossProfit: number | null;
  cashAndEquivalents: number | null;
  totalAssets: number | null;
  totalLiabilities: number | null;
  shareRepurchases: number | null;  // stored as positive (absolute value of buybacks)
  priceAtPeriod: number | null;
}

/** Flat map of metric slopes: keys are "{metricKey}_short" and "{metricKey}_long" */
export type MetricSlopes = Record<string, number | null>;

export interface CorrelationResult {
  ticker: string;
  revCorr: number;
  revCorrCurrent: number;
  revCorrDiff: number;
  decorrScore: number;
  priceVsRevDivergence: 'PRICE_AHEAD' | 'PRICE_BEHIND' | 'ALIGNED' | null;
  isDecorrelating: boolean;
  quartersUsed: number;
  computedAt: string;
}
