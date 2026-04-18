-- Drop the partitioned table and replace with a simple table.
-- The partition for 2026-04-17 only existed for yesterday; today's inserts fail silently.

DROP TABLE IF EXISTS price_ticks CASCADE;

CREATE TABLE price_ticks (
    id        BIGSERIAL PRIMARY KEY,
    symbol_id UUID NOT NULL REFERENCES symbols(id),
    ticker    TEXT NOT NULL,
    price     NUMERIC(18,6) NOT NULL,
    tick_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    source    TEXT NOT NULL DEFAULT 'polygon_ws'
);

CREATE INDEX idx_price_ticks_symbol_time ON price_ticks(symbol_id, tick_at DESC);
CREATE INDEX idx_price_ticks_ticker_time ON price_ticks(ticker, tick_at DESC);

-- TTL cleanup: delete ticks older than 5 days (run manually or via pg_cron)
-- DELETE FROM price_ticks WHERE tick_at < now() - INTERVAL '5 days';

ALTER TABLE price_ticks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role only price_ticks"
    ON price_ticks FOR ALL USING (auth.role() = 'service_role');
