ALTER TABLE quarterly_financials
  ADD COLUMN IF NOT EXISTS gross_profit        NUMERIC(20,2),
  ADD COLUMN IF NOT EXISTS cash_and_equivalents NUMERIC(20,2),
  ADD COLUMN IF NOT EXISTS total_assets         NUMERIC(20,2),
  ADD COLUMN IF NOT EXISTS total_liabilities    NUMERIC(20,2),
  ADD COLUMN IF NOT EXISTS share_repurchases    NUMERIC(20,2);
