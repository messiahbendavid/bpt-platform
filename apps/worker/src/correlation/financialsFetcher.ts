import type { QuarterlyFinancials } from '@bpt/shared';
import { CACHE_TTL_FINANCIALS_MS } from '@bpt/shared';
import { supabase } from '../db/supabaseClient.js';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY ?? '';

async function fetchFromPolygon(ticker: string): Promise<QuarterlyFinancials[]> {
  const url = `https://api.polygon.io/vX/reference/financials?ticker=${ticker}&timeframe=quarterly&limit=24&apiKey=${POLYGON_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Polygon financials ${ticker}: ${res.status}`);

  const json = await res.json() as { results: Array<Record<string, unknown>> };
  return (json.results ?? []).map((r) => {
    const inc = (r.financials as Record<string, Record<string, { value: number }>>)?.income_statement ?? {};
    const cf  = (r.financials as Record<string, Record<string, { value: number }>>)?.cash_flow_statement ?? {};
    const ncfoa = cf.net_cash_flow_from_operating_activities?.value ?? null;
    const ncfia = cf.net_cash_flow_from_investing_activities?.value ?? null;

    return {
      ticker,
      periodEndDate:  (r.end_date as string) ?? '',
      revenues:       inc.revenues?.value ?? null,
      netIncome:      inc.net_income_loss?.value ?? null,
      ncf:            cf.net_cash_flow?.value ?? null,
      ncfoa:          ncfoa,
      ncfia:          ncfia,
      fcf:            ncfoa !== null && ncfia !== null ? ncfoa - ncfia : null,
      dilutedEps:     inc.diluted_earnings_per_share?.value ?? null,
      priceAtPeriod:  null,
    };
  });
}

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
      ticker:         row.ticker,
      periodEndDate:  row.period_end_date,
      revenues:       row.revenues,
      netIncome:      row.net_income,
      ncf:            row.ncf,
      ncfoa:          row.ncfoa,
      ncfia:          row.ncfia,
      fcf:            row.fcf,
      dilutedEps:     row.diluted_eps,
      priceAtPeriod:  row.price_at_period,
    }));
  }

  const fresh = await fetchFromPolygon(ticker);
  if (fresh.length === 0) return [];

  const rows = fresh.map((q) => ({
    symbol_id:       symbolId,
    ticker:          q.ticker,
    period_end_date: q.periodEndDate,
    revenues:        q.revenues,
    net_income:      q.netIncome,
    ncf:             q.ncf,
    ncfoa:           q.ncfoa,
    ncfia:           q.ncfia,
    fcf:             q.fcf,
    diluted_eps:     q.dilutedEps,
    price_at_period: q.priceAtPeriod,
  }));

  await supabase
    .from('quarterly_financials')
    .upsert(rows, { onConflict: 'symbol_id,period_end_date' });

  return fresh;
}
