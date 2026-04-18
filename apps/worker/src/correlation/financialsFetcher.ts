import type { QuarterlyFinancials, FundamentalSlopes } from '@bpt/shared';
import { CACHE_TTL_FINANCIALS_MS } from '@bpt/shared';
import { supabase } from '../db/supabaseClient.js';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY ?? '';

// ── EWM slope (mirrors pandas ewm(span=4).mean()) ──────────────────────────
function ewmSlope(values: (number | null)[], span = 4): number | null {
  const vals = values.filter((v): v is number => v !== null && isFinite(v));
  if (vals.length < 2) return null;

  const alpha = 2 / (span + 1);
  const ewm: number[] = [vals[0]];
  for (let i = 1; i < vals.length; i++) {
    ewm.push(alpha * vals[i] + (1 - alpha) * ewm[i - 1]);
  }

  const last    = ewm[ewm.length - 1];
  const lookback = Math.min(5, ewm.length - 1);
  const ref      = ewm[ewm.length - 1 - lookback];
  if (ref === 0 || !isFinite(ref)) return null;
  return (last - ref) / Math.abs(ref);
}

// ── Fetch one closing price near a given date ──────────────────────────────
async function priceNear(ticker: string, dateStr: string): Promise<number | null> {
  const target = new Date(dateStr);
  const from = new Date(target.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  const to   = new Date(target.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);

  // Try our DB first (fast path for recent dates)
  const { data } = await supabase
    .from('historical_prices')
    .select('close_price')
    .eq('ticker', ticker)
    .gte('trade_date', from)
    .lte('trade_date', to)
    .order('trade_date', { ascending: false })
    .limit(1);

  if (data?.[0]?.close_price != null) return data[0].close_price as number;

  // Fall back to Polygon daily aggregates for historical dates
  try {
    const url =
      `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}` +
      `?sort=desc&limit=1&apiKey=${POLYGON_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = (await res.json()) as { results?: Array<{ c: number }> };
    return json.results?.[0]?.c ?? null;
  } catch {
    return null;
  }
}

// ── Pull raw financials from Polygon vX ────────────────────────────────────
async function fetchFromPolygon(ticker: string): Promise<QuarterlyFinancials[]> {
  const url =
    `https://api.polygon.io/vX/reference/financials` +
    `?ticker=${ticker}&timeframe=quarterly&limit=24&apiKey=${POLYGON_API_KEY}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Polygon financials ${ticker}: ${res.status}`);

  const json = (await res.json()) as { results: Array<Record<string, unknown>> };

  return (json.results ?? []).map((r) => {
    type Stmt = Record<string, { value?: number } | undefined>;
    const fin  = (r.financials ?? {}) as Record<string, Stmt>;
    const inc  = fin.income_statement  ?? {};
    const cf   = fin.cash_flow_statement ?? {};
    const bal  = fin.balance_sheet     ?? {};

    const ncfoa   = cf.net_cash_flow_from_operating_activities?.value   ?? null;
    const ncfia   = cf.net_cash_flow_from_investing_activities?.value   ?? null;
    // capex is negative in Polygon; store as positive magnitude
    const capexRaw = cf.capital_expenditure?.value ?? null;
    const capex    = capexRaw !== null ? Math.abs(capexRaw) : null;
    const fcf      = ncfoa !== null && capex !== null ? ncfoa - capex : null;

    const equity = bal.equity_attributable_to_parent?.value
                ?? bal.equity?.value
                ?? null;
    const debt   = bal.long_term_debt?.value ?? null;

    const shares = (inc.basic_average_shares?.value
                 ?? inc.weighted_average_shares?.value
                 ?? null);
    const shares_ = shares !== null ? Math.round(shares) : null;

    return {
      ticker,
      periodEndDate:   (r.end_date    as string) ?? '',
      filingDate:      (r.filing_date as string) ?? null,
      revenues:        inc.revenues?.value                              ?? null,
      netIncome:       inc.net_income_loss?.value                       ?? null,
      ncf:             cf.net_cash_flow?.value                          ?? null,
      ncfoa,
      ncfia,
      capex,
      fcf,
      dilutedEps:      inc.diluted_earnings_per_share?.value            ?? null,
      operatingIncome: inc.operating_income_loss?.value                 ?? null,
      totalEquity:     equity,
      totalDebt:       debt,
      sharesOutstanding: shares_,
      priceAtPeriod:   null,
    } satisfies QuarterlyFinancials;
  });
}

// ── Public: fetch + cache + price-align ────────────────────────────────────
export async function fetchQuarterlyData(
  ticker: string,
  symbolId: string,
): Promise<QuarterlyFinancials[]> {
  const cutoff = new Date(Date.now() - CACHE_TTL_FINANCIALS_MS).toISOString();

  const { data: cached } = await supabase
    .from('quarterly_financials')
    .select('*')
    .eq('ticker', ticker)
    .gte('fetched_at', cutoff)
    .order('period_end_date', { ascending: false })
    .limit(24);

  if (cached && cached.length > 0) {
    return cached.map((row) => ({
      ticker,
      periodEndDate:     row.period_end_date,
      filingDate:        row.filing_date        ?? null,
      revenues:          row.revenues           ?? null,
      netIncome:         row.net_income         ?? null,
      ncf:               row.ncf               ?? null,
      ncfoa:             row.ncfoa             ?? null,
      ncfia:             row.ncfia             ?? null,
      capex:             row.capex             ?? null,
      fcf:               row.fcf               ?? null,
      dilutedEps:        row.diluted_eps       ?? null,
      operatingIncome:   row.operating_income  ?? null,
      totalEquity:       row.total_equity      ?? null,
      totalDebt:         row.total_debt        ?? null,
      sharesOutstanding: row.shares_outstanding ?? null,
      priceAtPeriod:     row.price_at_period   ?? null,
    }));
  }

  const fresh = await fetchFromPolygon(ticker);
  if (fresh.length === 0) return [];

  // Align price to each quarter's filing date (or period_end_date as fallback)
  for (const q of fresh) {
    const dateStr = q.filingDate ?? q.periodEndDate;
    q.priceAtPeriod = await priceNear(ticker, dateStr);
  }

  const rows = fresh.map((q) => ({
    symbol_id:          symbolId,
    ticker:             q.ticker,
    period_end_date:    q.periodEndDate,
    filing_date:        q.filingDate,
    revenues:           q.revenues,
    net_income:         q.netIncome,
    ncf:                q.ncf,
    ncfoa:              q.ncfoa,
    ncfia:              q.ncfia,
    capex:              q.capex,
    fcf:                q.fcf,
    diluted_eps:        q.dilutedEps,
    operating_income:   q.operatingIncome,
    total_equity:       q.totalEquity,
    total_debt:         q.totalDebt,
    shares_outstanding: q.sharesOutstanding,
    price_at_period:    q.priceAtPeriod,
  }));

  await supabase
    .from('quarterly_financials')
    .upsert(rows, { onConflict: 'symbol_id,period_end_date' });

  return fresh;
}

// ── Compute EWM slopes from quarters (sorted oldest→newest) ───────────────
export function computeSlopes(quarters: QuarterlyFinancials[]): FundamentalSlopes {
  // Ensure chronological order (oldest first)
  const sorted = [...quarters].sort(
    (a, b) => new Date(a.periodEndDate).getTime() - new Date(b.periodEndDate).getTime(),
  );

  const rev = sorted.map((q) => q.revenues);
  const fcf = sorted.map((q) => q.fcf);
  const ni  = sorted.map((q) => q.netIncome);
  const eq  = sorted.map((q) => q.totalEquity);
  const oe  = sorted.map((q) => q.operatingIncome);
  const eps = sorted.map((q) => q.dilutedEps);
  const pr  = sorted.map((q) => q.priceAtPeriod);
  const dbt = sorted.map((q) => q.totalDebt);

  // Ratio series
  const roe: (number | null)[] = ni.map((n, i) =>
    n !== null && eq[i] !== null && eq[i]! !== 0 ? n / eq[i]! : null,
  );
  const npm: (number | null)[] = ni.map((n, i) =>
    n !== null && rev[i] !== null && rev[i]! !== 0 ? n / rev[i]! : null,
  );
  const pe: (number | null)[] = pr.map((p, i) =>
    p !== null && eps[i] !== null && eps[i]! !== 0 ? p / eps[i]! : null,
  );
  const de: (number | null)[] = dbt.map((d, i) =>
    d !== null && eq[i] !== null && eq[i]! !== 0 ? d / eq[i]! : null,
  );

  // FCFY: FCF / market_cap = FCF / (price * shares)
  const fcfyVals: (number | null)[] = sorted.map((q) => {
    if (
      q.fcf === null ||
      q.priceAtPeriod === null ||
      q.sharesOutstanding === null ||
      q.priceAtPeriod <= 0 ||
      q.sharesOutstanding <= 0
    ) return null;
    const mktCap = q.priceAtPeriod * q.sharesOutstanding;
    return mktCap > 0 ? q.fcf / mktCap : null;
  });
  // Use latest non-null FCFY
  const fcfyCurrent = [...fcfyVals].reverse().find((v) => v !== null) ?? null;

  return {
    Rev_Slope_5:                    ewmSlope(rev),
    FCF_Slope_5:                    ewmSlope(fcf),
    'Return on Equity_Slope_5':     ewmSlope(roe),
    'Net Profit Margin_Slope_5':    ewmSlope(npm),
    'P/E Ratio_Slope_5':            ewmSlope(pe),
    'Debt to Equity Ratio_Slope_5': ewmSlope(de),
    FCFY:                           fcfyCurrent,
  };
}
