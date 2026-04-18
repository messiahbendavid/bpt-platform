-- =============================================================
-- EXTENSIONS
-- =============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================
-- TABLE: symbols
-- =============================================================
CREATE TABLE symbols (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticker          TEXT NOT NULL UNIQUE,
    instrument_type TEXT NOT NULL CHECK (instrument_type IN ('equity','etf','forex','futures')),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    is_tradable     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_symbols_ticker ON symbols(ticker);
CREATE INDEX idx_symbols_active ON symbols(is_active) WHERE is_active = TRUE;

-- =============================================================
-- TABLE: price_ticks  (partitioned by day, 5-day rolling TTL)
-- =============================================================
CREATE TABLE price_ticks (
    id        BIGSERIAL,
    symbol_id UUID NOT NULL REFERENCES symbols(id),
    ticker    TEXT NOT NULL,
    price     NUMERIC(18,6) NOT NULL,
    tick_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    source    TEXT NOT NULL DEFAULT 'polygon_ws'
) PARTITION BY RANGE (tick_at);

CREATE INDEX idx_price_ticks_symbol_time ON price_ticks(symbol_id, tick_at DESC);
CREATE INDEX idx_price_ticks_ticker_time ON price_ticks(ticker, tick_at DESC);

-- =============================================================
-- TABLE: historical_prices
-- =============================================================
CREATE TABLE historical_prices (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    symbol_id    UUID NOT NULL REFERENCES symbols(id),
    ticker       TEXT NOT NULL,
    trade_date   DATE NOT NULL,
    open_price   NUMERIC(18,6),
    high_price   NUMERIC(18,6),
    low_price    NUMERIC(18,6),
    close_price  NUMERIC(18,6) NOT NULL,
    volume       BIGINT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (symbol_id, trade_date)
);

CREATE INDEX idx_historical_prices_symbol_date ON historical_prices(symbol_id, trade_date DESC);

-- =============================================================
-- TABLE: bitstream_bands
-- =============================================================
CREATE TABLE bitstream_bands (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    symbol_id        UUID NOT NULL REFERENCES symbols(id),
    ticker           TEXT NOT NULL,
    band_index       SMALLINT NOT NULL CHECK (band_index BETWEEN 1 AND 14),
    bp_range         NUMERIC(12,8) NOT NULL,
    spotlight        SMALLINT NOT NULL CHECK (spotlight BETWEEN 5 AND 15),
    binary_sequence  TEXT NOT NULL,
    decimal_value    INTEGER NOT NULL,
    key_decimal_one  INTEGER NOT NULL,
    key_decimal_zero INTEGER NOT NULL,
    is_stasis        BOOLEAN NOT NULL DEFAULT FALSE,
    stasis_direction SMALLINT CHECK (stasis_direction IN (0,1)),
    signal_price     NUMERIC(18,6),
    signal_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    computed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bitstream_ticker_computed ON bitstream_bands(ticker, computed_at DESC);
CREATE INDEX idx_bitstream_stasis ON bitstream_bands(ticker, is_stasis) WHERE is_stasis = TRUE;

-- =============================================================
-- TABLE: stasis_events
-- =============================================================
CREATE TABLE stasis_events (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    symbol_id         UUID NOT NULL REFERENCES symbols(id),
    ticker            TEXT NOT NULL,
    band_index        SMALLINT NOT NULL,
    spotlight         SMALLINT NOT NULL,
    stasis_direction  SMALLINT NOT NULL CHECK (stasis_direction IN (0,1)),
    stasis_count      INTEGER NOT NULL DEFAULT 1,
    stasis_started_at TIMESTAMPTZ NOT NULL,
    stasis_ended_at   TIMESTAMPTZ,
    peak_price        NUMERIC(18,6),
    trough_price      NUMERIC(18,6),
    entry_price       NUMERIC(18,6),
    breakout_count    INTEGER NOT NULL DEFAULT 0,
    reversion_count   INTEGER NOT NULL DEFAULT 0,
    win_probability   NUMERIC(6,4),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (symbol_id, band_index, spotlight, stasis_started_at)
);

CREATE INDEX idx_stasis_events_ticker_active
    ON stasis_events(ticker, stasis_ended_at)
    WHERE stasis_ended_at IS NULL;

-- =============================================================
-- TABLE: quarterly_financials
-- =============================================================
CREATE TABLE quarterly_financials (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    symbol_id        UUID NOT NULL REFERENCES symbols(id),
    ticker           TEXT NOT NULL,
    period_end_date  DATE NOT NULL,
    filing_date      DATE,
    revenues         NUMERIC(20,2),
    net_income       NUMERIC(20,2),
    ncf              NUMERIC(20,2),
    ncfoa            NUMERIC(20,2),
    ncfia            NUMERIC(20,2),
    fcf              NUMERIC(20,2),
    diluted_eps      NUMERIC(12,6),
    price_at_period  NUMERIC(18,6),
    fetched_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (symbol_id, period_end_date)
);

CREATE INDEX idx_quarterly_financials_ticker_date
    ON quarterly_financials(ticker, period_end_date DESC);

-- =============================================================
-- TABLE: correlation_scores
-- =============================================================
CREATE TABLE correlation_scores (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    symbol_id            UUID NOT NULL REFERENCES symbols(id),
    ticker               TEXT NOT NULL,
    rev_corr             NUMERIC(8,6),
    rev_corr_current     NUMERIC(8,6),
    rev_corr_diff        NUMERIC(8,6),
    deps_corr            NUMERIC(8,6),
    deps_corr_current    NUMERIC(8,6),
    deps_corr_diff       NUMERIC(8,6),
    diff_sum             NUMERIC(8,6),
    is_decorrelating     BOOLEAN NOT NULL DEFAULT FALSE,
    quarters_used        SMALLINT,
    computed_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_correlation_scores_ticker ON correlation_scores(ticker, computed_at DESC);
CREATE INDEX idx_correlation_scores_decorrelating
    ON correlation_scores(is_decorrelating, diff_sum)
    WHERE is_decorrelating = TRUE;

-- =============================================================
-- TABLE: merit_scores  (live state — Realtime publication)
-- =============================================================
CREATE TABLE merit_scores (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    symbol_id       UUID NOT NULL REFERENCES symbols(id) UNIQUE,
    ticker          TEXT NOT NULL UNIQUE,

    current_price   NUMERIC(18,6),
    price_52w_high  NUMERIC(18,6),
    price_52w_low   NUMERIC(18,6),
    price_52w_pct   NUMERIC(6,4),

    sms_stasis_count     INTEGER DEFAULT 0,
    sms_risk_reward      NUMERIC(8,4),
    sms_signal_strength  NUMERIC(8,4),
    sms_duration_hrs     NUMERIC(10,2),
    sms_total            NUMERIC(10,4),

    fms_net_income      NUMERIC(8,4),
    fms_cash_flows      NUMERIC(8,4),
    fms_revenue_trend   NUMERIC(8,4),
    fms_52w_percentile  NUMERIC(6,4),
    fms_total           NUMERIC(10,4),

    cms_decorr_magnitude  NUMERIC(8,6),
    cms_delta_rate        NUMERIC(8,6),
    cms_direction_align   SMALLINT,
    cms_total             NUMERIC(10,4),

    tms                   NUMERIC(10,4),

    is_tradable           BOOLEAN NOT NULL DEFAULT TRUE,
    is_decorrelating      BOOLEAN NOT NULL DEFAULT FALSE,
    is_stasis_active      BOOLEAN NOT NULL DEFAULT FALSE,

    last_signal_at        TIMESTAMPTZ,
    computed_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_merit_scores_tms ON merit_scores(tms DESC NULLS LAST);
CREATE INDEX idx_merit_scores_decorr ON merit_scores(is_decorrelating) WHERE is_decorrelating = TRUE;
CREATE INDEX idx_merit_scores_stasis ON merit_scores(is_stasis_active) WHERE is_stasis_active = TRUE;

-- =============================================================
-- TABLE: watchlist_log  (5-day audit trail)
-- =============================================================
CREATE TABLE watchlist_log (
    id         BIGSERIAL PRIMARY KEY,
    ticker     TEXT NOT NULL,
    tms        NUMERIC(10,4),
    sms_total  NUMERIC(10,4),
    fms_total  NUMERIC(10,4),
    cms_total  NUMERIC(10,4),
    logged_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_watchlist_log_ticker_time ON watchlist_log(ticker, logged_at DESC);

-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================
ALTER TABLE symbols              ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_ticks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE historical_prices    ENABLE ROW LEVEL SECURITY;
ALTER TABLE bitstream_bands      ENABLE ROW LEVEL SECURITY;
ALTER TABLE stasis_events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE quarterly_financials ENABLE ROW LEVEL SECURITY;
ALTER TABLE correlation_scores   ENABLE ROW LEVEL SECURITY;
ALTER TABLE merit_scores         ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist_log        ENABLE ROW LEVEL SECURITY;

-- merit_scores: public read, service_role full access
CREATE POLICY "public read merit_scores"
    ON merit_scores FOR SELECT USING (true);

CREATE POLICY "service role full access merit_scores"
    ON merit_scores FOR ALL USING (auth.role() = 'service_role');

-- symbols: public read
CREATE POLICY "public read symbols"
    ON symbols FOR SELECT USING (true);

-- all other tables: service_role only
CREATE POLICY "service role only price_ticks"
    ON price_ticks FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service role only historical_prices"
    ON historical_prices FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service role only bitstream_bands"
    ON bitstream_bands FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service role only stasis_events"
    ON stasis_events FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service role only quarterly_financials"
    ON quarterly_financials FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service role only correlation_scores"
    ON correlation_scores FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service role only watchlist_log"
    ON watchlist_log FOR ALL USING (auth.role() = 'service_role');

-- =============================================================
-- REALTIME PUBLICATION
-- =============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE merit_scores;
