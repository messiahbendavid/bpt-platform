import type { QuarterlyFinancials, MetricSlopes } from '@bpt/shared';
import { CACHE_TTL_FINANCIALS_MS } from '@bpt/shared';
import { supabase } from '../db/supabaseClient.js';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY ?? '';
const POLY_BASE = 'https://api.polygon.io';

// ── EWM slope: relative change over `lookback` EWM steps ───────────────────
function ewmSlope(values: (number | null)[], span = 5, lookback = span): number | null {
  const vals = values.filter((v): v is number => v !== null && isFinite(v));
  if (vals.length < 2) return null;

  const alpha = 2 / (span + 1);
  const ewm: number[] = [vals[0]];
  for (let i = 1; i < vals.length; i++) {
    ewm.push(alpha * vals[i] + (1 - alpha) * ewm[i - 1]);
  }

  const last = ewm[ewm.length - 1];
  const lb   = Math.min(lookback, ewm.length - 1);
  const ref  = ewm[ewm.length - 1 - lb];
  if (ref === 0 || !isFinite(ref)) return null;
  return (last - ref) / Math.abs(ref);
}

export interface DailyCloseData {
  closes: Map<string, number>;
  high52w: number | null;
  low52w: number | null;
}

// ── Fetch 3 years of daily closes in ONE call, return date→close map ────────
export async function fetchDailyCloses(ticker: string): Promise<DailyCloseData> {
  const map = new Map<string, number>();

  // 1. Try our DB (has recent data from restBackfill)
  const since = new Date(Date.now() - 3 * 365 * 86_400_000).toISOString().slice(0, 10);
  const { data: dbRows } = await supabase
    .from('historical_prices')
    .select('trade_date, close_price')
    .eq('ticker', ticker)
    .gte('trade_date', since);

  for (const r of dbRows ?? []) {
    if (r.close_price != null) map.set(r.trade_date as string, r.close_price as number);
  }

  // 2. Always supplement with Polygon (one call gets everything)
  try {
    const to   = new Date().toISOString().slice(0, 10);
    const url  =
      `${POLY_BASE}/v2/aggs/ticker/${ticker}/range/1/day/${since}/${to}` +
      `?adjusted=true&sort=asc&limit=1000&apiKey=${POLYGON_API_KEY}`;
    const res  = await fetch(url);
    if (res.ok) {
      const json = (await res.json()) as { results?: Array<{ t: number; c: number }> };
      for (const bar of json.results ?? []) {
        const date = new Date(bar.t).toISOString().slice(0, 10);
        map.set(date, bar.c);
      }
    } else {
      console.warn(`[financials] daily closes ${ticker}: HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn(`[financials] daily closes ${ticker}:`, (err as Error).message);
  }

  // Compute 52-week high/low from the map
  const cutoff52w = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  let high52w: number | null = null;
  let low52w: number | null  = null;
  for (const [date, close] of map) {
    if (date < cutoff52w) continue;
    if (high52w === null || close > high52w) high52w = close;
    if (low52w  === null || close < low52w)  low52w  = close;
  }

  return { closes: map, high52w, low52w };
}

// ── Find closest trading day price within ±7 days ──────────────────────────
function closestPrice(dateStr: string, closes: Map<string, number>): number | null {
  if (closes.has(dateStr)) return closes.get(dateStr)!;

  const target = new Date(dateStr).getTime();
  let best: number | null = null;
  let bestDiff = Infinity;

  for (const [d, price] of closes) {
    const diff = Math.abs(new Date(d).getTime() - target);
    if (diff < bestDiff && diff <= 7 * 86_400_000) {
      bestDiff = diff;
      best = price;
    }
  }
  return best;
}

// ── Pull raw financials from Polygon vX ────────────────────────────────────
async function fetchFromPolygon(ticker: string): Promise<QuarterlyFinancials[]> {
  const url =
    `${POLY_BASE}/vX/reference/financials` +
    `?ticker=${ticker}&timeframe=quarterly&limit=24&apiKey=${POLYGON_API_KEY}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Polygon financials ${ticker}: ${res.status}`);

  const json = (await res.json()) as { results: Array<Record<string, unknown>> };

  return (json.results ?? []).map((r) => {
    type Stmt = Record<string, { value?: number } | undefined>;
    const fin = (r.financials ?? {}) as Record<string, Stmt>;
    const inc = fin.income_statement    ?? {};
    const cf  = fin.cash_flow_statement ?? {};
    const bal = fin.balance_sheet       ?? {};

    const ncfoa    = cf.net_cash_flow_from_operating_activities?.value ?? null;
    const ncfia    = cf.net_cash_flow_from_investing_activities?.value ?? null;
    const capexRaw = cf.capital_expenditure?.value
                  ?? cf.payments_for_property_plant_and_equipment?.value
                  ?? null;
    const capex    = capexRaw !== null ? Math.abs(capexRaw) : null;
    // FCF = OCF - capex; if capex unknown fall back to OCF + investingCF (ncfia is negative)
    const fcf      = ncfoa !== null
      ? capex !== null
        ? ncfoa - capex
        : ncfia !== null ? ncfoa + ncfia : null
      : null;

    const equity = bal.equity_attributable_to_parent?.value ?? bal.equity?.value ?? null;
    const debt   = bal.long_term_debt?.value ?? null;
    const shares = inc.basic_average_shares?.value ?? inc.weighted_average_shares?.value ?? null;

    // Buybacks: repurchases_of_common_stock is typically negative in Polygon CF
    const buybackRaw = cf.repurchases_of_common_stock?.value
                    ?? cf.payments_for_repurchase_of_common_stock?.value
                    ?? null;
    const shareRepurchases = buybackRaw !== null ? Math.abs(buybackRaw) : null;

    return {
      ticker,
      periodEndDate:      (r.end_date    as string) ?? '',
      filingDate:         (r.filing_date as string) ?? null,
      revenues:           inc.revenues?.value                                        ?? null,
      netIncome:          inc.net_income_loss?.value                                 ?? null,
      ncf:                cf.net_cash_flow?.value                                    ?? null,
      ncfoa,
      ncfia,
      capex,
      fcf,
      dilutedEps:         inc.diluted_earnings_per_share?.value                      ?? null,
      operatingIncome:    inc.operating_income_loss?.value                           ?? null,
      grossProfit:        inc.gross_profit?.value                                    ?? null,
      cashAndEquivalents: bal.cash_and_cash_equivalents?.value
                       ?? bal.cash_and_equivalents?.value                            ?? null,
      totalAssets:        bal.assets?.value                                          ?? null,
      totalLiabilities:   bal.liabilities?.value                                    ?? null,
      shareRepurchases,
      totalEquity:        equity,
      totalDebt:          debt,
      sharesOutstanding:  shares !== null ? Math.round(shares) : null,
      priceAtPeriod:      null,
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

  // If cached AND prices are present, return immediately
  const cachedWithPrices = (cached ?? []).filter((r) => r.price_at_period != null);
  if (cachedWithPrices.length >= 4) {
    return (cached ?? []).map((row) => {
      const ncfoa = (row.ncfoa ?? null) as number | null;
      const ncfia = (row.ncfia ?? null) as number | null;
      const capex = (row.capex ?? null) as number | null;
      // Re-derive FCF in case cached value is null or wrong
      const fcf = (row.fcf ?? null) as number | null
        ?? (ncfoa !== null
          ? capex !== null
            ? ncfoa - capex
            : ncfia !== null ? ncfoa + ncfia : null
          : null);
      return {
        ticker,
        periodEndDate:      row.period_end_date as string,
        filingDate:         (row.filing_date          ?? null) as string | null,
        revenues:           (row.revenues             ?? null) as number | null,
        netIncome:          (row.net_income           ?? null) as number | null,
        ncf:                (row.ncf                 ?? null) as number | null,
        ncfoa,
        ncfia,
        capex,
        fcf,
        dilutedEps:         (row.diluted_eps         ?? null) as number | null,
        operatingIncome:    (row.operating_income    ?? null) as number | null,
        grossProfit:        (row.gross_profit        ?? null) as number | null,
        cashAndEquivalents: (row.cash_and_equivalents ?? null) as number | null,
        totalAssets:        (row.total_assets        ?? null) as number | null,
        totalLiabilities:   (row.total_liabilities   ?? null) as number | null,
        shareRepurchases:   (row.share_repurchases   ?? null) as number | null,
        totalEquity:        (row.total_equity        ?? null) as number | null,
        totalDebt:          (row.total_debt          ?? null) as number | null,
        sharesOutstanding:  (row.shares_outstanding  ?? null) as number | null,
        priceAtPeriod:      (row.price_at_period     ?? null) as number | null,
      };
    });
  }

  // Fetch financials + 3 years of daily closes (2 API calls total per ticker)
  const [fresh, { closes, high52w, low52w }] = await Promise.all([
    fetchFromPolygon(ticker),
    fetchDailyCloses(ticker),
  ]);

  if (fresh.length === 0) return [];

  console.log(`[financials] ${ticker}: ${fresh.length} quarters, ${closes.size} daily closes h52=${high52w?.toFixed(2)} l52=${low52w?.toFixed(2)}`);

  // Align price to each quarter's filing date
  for (const q of fresh) {
    const dateStr = q.filingDate ?? q.periodEndDate;
    q.priceAtPeriod = closestPrice(dateStr, closes);
  }

  const pricesFound = fresh.filter((q) => q.priceAtPeriod !== null).length;
  console.log(`[financials] ${ticker}: ${pricesFound}/${fresh.length} quarters have priceAtPeriod`);

  // Detect shares-in-thousands: Polygon sometimes returns the raw SEC filing value
  // where shares are reported "in thousands". If price × shares < quarterly revenue,
  // the implied market cap is less than one quarter's sales — physically impossible.
  let sharesMultiplier = 1;
  for (const q of fresh) {
    if (q.priceAtPeriod && q.sharesOutstanding && q.revenues && q.revenues > 0) {
      if (q.priceAtPeriod * q.sharesOutstanding < q.revenues) {
        sharesMultiplier = 1000;
        console.warn(`[financials] ${ticker}: shares appear to be in thousands (mktCap=${(q.priceAtPeriod * q.sharesOutstanding / 1e6).toFixed(0)}M < rev=${(q.revenues / 1e6).toFixed(0)}M) — multiplying by 1000`);
        break;
      }
    }
  }
  if (sharesMultiplier !== 1) {
    for (const q of fresh) {
      if (q.sharesOutstanding !== null) q.sharesOutstanding *= sharesMultiplier;
    }
  }

  // Diagnostic: log most recent quarter to catch unit errors (shares in thousands, etc.)
  const latest = [...fresh].sort((a, b) => b.periodEndDate.localeCompare(a.periodEndDate))[0];
  if (latest) {
    const mktCap = latest.priceAtPeriod !== null && latest.sharesOutstanding !== null
      ? (latest.priceAtPeriod * latest.sharesOutstanding / 1e9).toFixed(2) + 'B'
      : 'n/a';
    console.log(
      `[financials] ${ticker} latest (${latest.periodEndDate}):` +
      ` price=${latest.priceAtPeriod?.toFixed(2) ?? 'n/a'}` +
      ` shares=${latest.sharesOutstanding?.toLocaleString() ?? 'n/a'}` +
      ` mktCap=${mktCap}` +
      ` fcf=${latest.fcf?.toFixed(0) ?? 'n/a'}` +
      ` capex=${latest.capex?.toFixed(0) ?? 'n/a'}`
    );
  }


  const rows = fresh.map((q) => ({
    symbol_id:            symbolId,
    ticker:               q.ticker,
    period_end_date:      q.periodEndDate,
    filing_date:          q.filingDate,
    revenues:             q.revenues,
    net_income:           q.netIncome,
    ncf:                  q.ncf,
    ncfoa:                q.ncfoa,
    ncfia:                q.ncfia,
    capex:                q.capex,
    fcf:                  q.fcf,
    diluted_eps:          q.dilutedEps,
    operating_income:     q.operatingIncome,
    gross_profit:         q.grossProfit,
    cash_and_equivalents: q.cashAndEquivalents,
    total_assets:         q.totalAssets,
    total_liabilities:    q.totalLiabilities,
    share_repurchases:    q.shareRepurchases,
    total_equity:         q.totalEquity,
    total_debt:           q.totalDebt,
    shares_outstanding:   q.sharesOutstanding,
    price_at_period:      q.priceAtPeriod,
  }));

  await supabase
    .from('quarterly_financials')
    .upsert(rows, { onConflict: 'symbol_id,period_end_date' });

  return fresh;
}

export interface MetricSlopesResult {
  slopes: MetricSlopes;
  currentFCFY: number | null;
}

// ── Compute EWM slopes for all 20 FMS metrics (sorted oldest→newest) ────────
export function computeMetricSlopes(quarters: QuarterlyFinancials[]): MetricSlopesResult {
  const sorted = [...quarters].sort(
    (a, b) => new Date(a.periodEndDate).getTime() - new Date(b.periodEndDate).getTime(),
  );

  const rev     = sorted.map((q) => q.revenues);
  const ni      = sorted.map((q) => q.netIncome);
  const ocf     = sorted.map((q) => q.ncfoa);
  const fcf     = sorted.map((q) => q.fcf);
  const oi      = sorted.map((q) => q.operatingIncome);
  const gp      = sorted.map((q) => q.grossProfit);
  const cash    = sorted.map((q) => q.cashAndEquivalents);
  const assets  = sorted.map((q) => q.totalAssets);
  const equity  = sorted.map((q) => q.totalEquity);
  const liab    = sorted.map((q) => q.totalLiabilities);
  const buyback = sorted.map((q) => q.shareRepurchases);
  const eps     = sorted.map((q) => q.dilutedEps);
  const pr      = sorted.map((q) => q.priceAtPeriod);
  const dbt     = sorted.map((q) => q.totalDebt);
  const shrs    = sorted.map((q) => q.sharesOutstanding);

  // Defensive shares correction for cached data: same revenue-based heuristic as at fetch time.
  // Handles the case where quarters were cached before the fix was deployed.
  const correctedShrs = sorted.map((q, i) => {
    const sh = shrs[i];
    const p  = pr[i];
    const r  = rev[i];
    if (sh !== null && p !== null && r !== null && r > 0 && p * sh < r) return sh * 1000;
    return sh;
  });

  // Derived series
  const fcfyVals: (number | null)[] = sorted.map((q, i) => {
    if (pr[i] === null || correctedShrs[i] === null || q.fcf === null) return null;
    const mktCap = pr[i]! * correctedShrs[i]!;
    if (mktCap <= 0) return null;
    const fcfy = q.fcf / mktCap;
    if (Math.abs(fcfy) > 0.5) {
      console.warn(`[financials] ${q.ticker} ${q.periodEndDate}: FCFY=${(fcfy*100).toFixed(1)}% still out of range after shares correction — skipped`);
      return null;
    }
    return fcfy;
  });
  const npm: (number | null)[] = ni.map((n, i) =>
    n !== null && rev[i] !== null && rev[i]! !== 0 ? n / rev[i]! : null);
  const roe: (number | null)[] = ni.map((n, i) =>
    n !== null && equity[i] !== null && equity[i]! !== 0 ? n / equity[i]! : null);
  const gm: (number | null)[] = gp.map((g, i) =>
    g !== null && rev[i] !== null && rev[i]! !== 0 ? g / rev[i]! : null);
  const om: (number | null)[] = oi.map((o, i) =>
    o !== null && rev[i] !== null && rev[i]! !== 0 ? o / rev[i]! : null);
  const pe: (number | null)[] = pr.map((p, i) =>
    p !== null && eps[i] !== null && eps[i]! !== 0 ? p / eps[i]! : null);
  const de: (number | null)[] = dbt.map((d, i) =>
    d !== null && equity[i] !== null && equity[i]! !== 0 ? d / equity[i]! : null);
  const pb: (number | null)[] = pr.map((p, i) => {
    const bvps = equity[i] !== null && correctedShrs[i] !== null && correctedShrs[i]! !== 0
      ? equity[i]! / correctedShrs[i]! : null;
    return p !== null && bvps !== null && bvps !== 0 ? p / bvps : null;
  });
  const ps: (number | null)[] = pr.map((p, i) => {
    const mktCap = p !== null && correctedShrs[i] !== null ? p * correctedShrs[i]! : null;
    return mktCap !== null && rev[i] !== null && rev[i]! !== 0 ? mktCap / rev[i]! : null;
  });

  const series: [string, (number | null)[]][] = [
    ['rev',     rev],
    ['ni',      ni],
    ['ocf',     ocf],
    ['fcf',     fcf],
    ['fcfy',    fcfyVals],
    ['oi',      oi],
    ['gp',      gp],
    ['npm',     npm],
    ['roe',     roe],
    ['gm',      gm],
    ['buyback', buyback],
    ['cash',    cash],
    ['om',      om],
    ['pe',      pe],
    ['de',      de],
    ['pb',      pb],
    ['ps',      ps],
    ['assets',  assets],
    ['equity',  equity],
    ['liab',    liab],
  ];

  const slopes: MetricSlopes = {};
  for (const [key, vals] of series) {
    slopes[`${key}_short`] = ewmSlope(vals, 5,  5);
    slopes[`${key}_long`]  = ewmSlope(vals, 20, 20);
  }

  const currentFCFY = [...fcfyVals].reverse().find((v) => v !== null) ?? null;

  return { slopes, currentFCFY };
}
