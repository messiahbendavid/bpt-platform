/** All 14 price-band thresholds — exact values from original app.py */
export const BAND_THRESHOLDS: readonly number[] = [
  0.000625, 0.00125, 0.0025, 0.005, 0.0075, 0.01, 0.0125,
  0.015, 0.02, 0.025, 0.03, 0.04, 0.05, 0.10,
] as const;

/** 10 AM-specific thresholds used for dashboard display */
export const AM_THRESHOLDS: readonly number[] = [
  0.005, 0.0075, 0.01, 0.0125, 0.015, 0.02, 0.025, 0.03, 0.04, 0.05,
] as const;

export const MIN_TRADABLE_STASIS = 3;
export const LOOKBACK_DAYS = 5;
export const TICK_INTERVAL_MS = 1000;
export const CORRELATION_REFRESH_INTERVAL_MS = 15 * 60 * 1000;
export const CACHE_TTL_FINANCIALS_MS = 24 * 60 * 60 * 1000;
export const MIN_TMS_DELTA_TO_UPSERT = 0.5;
