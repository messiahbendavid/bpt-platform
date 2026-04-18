-- Seed ETFs first
INSERT INTO symbols (ticker, instrument_type, is_active, is_tradable) VALUES
  ('SPY',  'etf', true, true),
  ('QQQ',  'etf', true, true),
  ('IWM',  'etf', true, true),
  ('DIA',  'etf', true, true),
  ('GLD',  'etf', true, true),
  ('SLV',  'etf', true, true),
  ('TLT',  'etf', true, true),
  ('HYG',  'etf', true, true),
  ('XLF',  'etf', true, true),
  ('XLE',  'etf', true, true),
  ('XLK',  'etf', true, true),
  ('XLV',  'etf', true, true),
  ('XLI',  'etf', true, true),
  ('XLY',  'etf', true, true),
  ('XLP',  'etf', true, true),
  ('XLB',  'etf', true, true),
  ('XLU',  'etf', true, true),
  ('XLRE', 'etf', true, true),
  ('VXX',  'etf', true, false)
ON CONFLICT (ticker) DO NOTHING;

-- Core S&P 500 equities (representative sample — expand to full 700+ list)
INSERT INTO symbols (ticker, instrument_type, is_active, is_tradable) VALUES
  ('AAPL', 'equity', true, true),
  ('MSFT', 'equity', true, true),
  ('NVDA', 'equity', true, true),
  ('AMZN', 'equity', true, true),
  ('GOOGL','equity', true, true),
  ('META', 'equity', true, true),
  ('TSLA', 'equity', true, true),
  ('BRK.B','equity', true, true),
  ('JPM',  'equity', true, true),
  ('V',    'equity', true, true),
  ('UNH',  'equity', true, true),
  ('XOM',  'equity', true, true),
  ('MA',   'equity', true, true),
  ('HD',   'equity', true, true),
  ('PG',   'equity', true, true),
  ('JNJ',  'equity', true, true),
  ('COST', 'equity', true, true),
  ('ABBV', 'equity', true, true),
  ('MRK',  'equity', true, true),
  ('CVX',  'equity', true, true),
  ('WMT',  'equity', true, true),
  ('BAC',  'equity', true, true),
  ('NFLX', 'equity', true, true),
  ('CRM',  'equity', true, true),
  ('AMD',  'equity', true, true),
  ('LLY',  'equity', true, true),
  ('TMO',  'equity', true, true),
  ('AVGO', 'equity', true, true),
  ('ACN',  'equity', true, true),
  ('ORCL', 'equity', true, true)
ON CONFLICT (ticker) DO NOTHING;

-- Add remaining 670+ symbols here or load via a script from Polygon /v3/reference/tickers
