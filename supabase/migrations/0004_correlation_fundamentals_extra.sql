-- Add decorr_score and divergence label to correlation_scores
ALTER TABLE correlation_scores
  ADD COLUMN IF NOT EXISTS decorr_score           NUMERIC(8,6),
  ADD COLUMN IF NOT EXISTS price_vs_rev_divergence TEXT;  -- 'PRICE_AHEAD' | 'PRICE_BEHIND' | null

-- Add balance-sheet and capex fields to quarterly_financials for ratio/slope computation
ALTER TABLE quarterly_financials
  ADD COLUMN IF NOT EXISTS total_equity       NUMERIC(20,2),
  ADD COLUMN IF NOT EXISTS total_debt         NUMERIC(20,2),
  ADD COLUMN IF NOT EXISTS capex              NUMERIC(20,2),
  ADD COLUMN IF NOT EXISTS shares_outstanding BIGINT,
  ADD COLUMN IF NOT EXISTS operating_income   NUMERIC(20,2);
