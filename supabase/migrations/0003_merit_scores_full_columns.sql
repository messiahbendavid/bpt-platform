-- Add all columns needed to match the 23-column dashboard from app.py

ALTER TABLE merit_scores
  -- Correlation columns (C@E, C@N, ΔCOR, DCOR, DIV)
  ADD COLUMN IF NOT EXISTS corr_at_earnings   NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS corr_now           NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS corr_delta         NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS decorr_score       NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS divergence         TEXT,          -- 'PRICE_AHEAD' | 'PRICE_BEHIND' | 'ALIGNED'

  -- Fundamental slope columns (REV5, FCF5, FCFY)
  ADD COLUMN IF NOT EXISTS rev_slope_5        NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS fcf_slope_5        NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS fcfy               NUMERIC(10,6),

  -- Fix direction and signal_strength as text
  ADD COLUMN IF NOT EXISTS direction          TEXT,          -- 'LONG' | 'SHORT'
  ADD COLUMN IF NOT EXISTS signal_strength    TEXT,          -- 'VERY_STRONG' | 'STRONG' | 'MODERATE' | 'WEAK'
  ADD COLUMN IF NOT EXISTS band_threshold     NUMERIC(10,6), -- e.g. 0.01 = 1.00%
  ADD COLUMN IF NOT EXISTS stasis_duration_str TEXT;         -- human-readable duration e.g. '2h 15m'

  -- TP / SL stored for dashboard display
  ADD COLUMN IF NOT EXISTS take_profit        NUMERIC(18,6),
  ADD COLUMN IF NOT EXISTS stop_loss          NUMERIC(18,6);

-- 52w_pct should be 0-100 (percentage), fix if stored as 0-1
-- (stored as NUMERIC(6,4) which handles both; we'll just write correctly going forward)
