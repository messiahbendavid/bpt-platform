-- Add all columns needed to match the 23-column dashboard from app.py

ALTER TABLE merit_scores
  ADD COLUMN IF NOT EXISTS corr_at_earnings    NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS corr_now            NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS corr_delta          NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS decorr_score        NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS divergence          TEXT,
  ADD COLUMN IF NOT EXISTS rev_slope_5         NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS fcf_slope_5         NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS fcfy                NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS direction           TEXT,
  ADD COLUMN IF NOT EXISTS signal_strength     TEXT,
  ADD COLUMN IF NOT EXISTS band_threshold      NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS stasis_duration_str TEXT,
  ADD COLUMN IF NOT EXISTS take_profit         NUMERIC(18,6),
  ADD COLUMN IF NOT EXISTS stop_loss           NUMERIC(18,6);
