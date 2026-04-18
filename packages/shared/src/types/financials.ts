export interface QuarterlyFinancials {
  ticker: string;
  periodEndDate: string;
  filingDate: string | null;
  revenues: number | null;
  netIncome: number | null;
  ncf: number | null;
  ncfoa: number | null;     // operating CF
  ncfia: number | null;     // investing CF
  capex: number | null;     // capital expenditure (positive value)
  fcf: number | null;       // = ncfoa - capex
  dilutedEps: number | null;
  totalEquity: number | null;
  totalDebt: number | null;
  sharesOutstanding: number | null;
  operatingIncome: number | null;
  priceAtPeriod: number | null;
}

export interface FundamentalSlopes {
  Rev_Slope_5: number | null;
  FCF_Slope_5: number | null;
  'Return on Equity_Slope_5': number | null;
  'Net Profit Margin_Slope_5': number | null;
  'P/E Ratio_Slope_5': number | null;
  'Debt to Equity Ratio_Slope_5': number | null;
  FCFY: number | null;
}

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
