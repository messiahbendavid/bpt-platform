export interface QuarterlyFinancials {
  ticker: string;
  periodEndDate: string;
  revenues: number | null;
  netIncome: number | null;
  ncf: number | null;
  ncfoa: number | null;
  ncfia: number | null;
  fcf: number | null;
  dilutedEps: number | null;
  priceAtPeriod: number | null;
}

export interface CorrelationResult {
  ticker: string;
  revCorr: number;
  revCorrCurrent: number;
  revCorrDiff: number;
  depsCorr: number;
  depsCorrCurrent: number;
  depsCorrDiff: number;
  diffSum: number;
  isDecorrelating: boolean;
  quartersUsed: number;
  computedAt: string;
}
