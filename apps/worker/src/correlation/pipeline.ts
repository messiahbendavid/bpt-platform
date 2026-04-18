import pLimit from 'p-limit';
import { supabase } from '../db/supabaseClient.js';
import { fetchQuarterlyData, computeMetricSlopes, fetchDailyCloses } from './financialsFetcher.js';
import { computeDecorrelation } from './decorrelation.js';
import { computeFMSCrossSectional } from '../scoring/fms.js';
import { getAllLatestPrices } from '../buffer/priceBuffer.js';
import type { MetricSlopes } from '@bpt/shared';

const limit = pLimit(5);

async function lastHistoricalPrice(ticker: string): Promise<number | null> {
  const { data } = await supabase
    .from('historical_prices')
    .select('close_price')
    .eq('ticker', ticker)
    .order('trade_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.close_price ?? null;
}

interface TickerData {
  symId:        string;
  ticker:       string;
  currentPrice: number;
  slopes:       MetricSlopes;
  currentFCFY:  number | null;
  price52wPct:  number | null;
  high52w:      number | null;
  low52w:       number | null;
  corrResult:   ReturnType<typeof computeDecorrelation>;
  quartersUsed: number;
}

export async function runCorrelationPipeline(
  symbols: Array<{ id: string; ticker: string; instrument_type: string }>,
): Promise<void> {
  console.log(`[correlation] Running pipeline for ${symbols.length} symbols`);
  const livePrices = getAllLatestPrices();
  const equities   = symbols.filter((s) => s.instrument_type === 'equity');

  // ── Phase 1: gather data for all equities in parallel ────────────────────
  const gathered = new Map<string, TickerData>();

  await Promise.all(
    equities.map((sym) =>
      limit(async () => {
        try {
          const currentPrice =
            livePrices.get(sym.ticker) ?? (await lastHistoricalPrice(sym.ticker));
          if (!currentPrice) return;

          const [quarters, { high52w, low52w }] = await Promise.all([
            fetchQuarterlyData(sym.ticker, sym.id),
            fetchDailyCloses(sym.ticker),
          ]);
          if (quarters.length === 0) return;

          let price52wPct: number | null = null;
          if (high52w !== null && low52w !== null) {
            const range = high52w - low52w;
            if (range > 0) price52wPct = ((currentPrice - low52w) / range) * 100;
          }

          const { slopes, currentFCFY } = computeMetricSlopes(quarters);
          const corrResult = computeDecorrelation(sym.ticker, sym.id, quarters, currentPrice);

          gathered.set(sym.ticker, {
            symId:        sym.id,
            ticker:       sym.ticker,
            currentPrice,
            slopes,
            currentFCFY,
            price52wPct,
            high52w,
            low52w,
            corrResult,
            quartersUsed: quarters.length,
          });
        } catch (err) {
          console.error(`[correlation] ${sym.ticker}:`, (err as Error).message);
        }
      }),
    ),
  );

  // ── Phase 2: cross-sectional FMS ranking ─────────────────────────────────
  const allSlopes = new Map<string, MetricSlopes>(
    [...gathered.entries()].map(([t, d]) => [t, d.slopes]),
  );
  const all52wPct = new Map<string, number | null>(
    [...gathered.entries()].map(([t, d]) => [t, d.price52wPct]),
  );
  const fmsMap = computeFMSCrossSectional(allSlopes, all52wPct);

  // ── Phase 3: upsert results ───────────────────────────────────────────────
  await Promise.all(
    [...gathered.values()].map((d) =>
      limit(async () => {
        try {
          const fms    = fmsMap.get(d.ticker) ?? 0;
          const result = d.corrResult;
          const now    = new Date().toISOString();

          const corrRow = result
            ? {
                symbol_id:               d.symId,
                ticker:                  d.ticker,
                rev_corr:                result.revCorr,
                rev_corr_current:        result.revCorrCurrent,
                rev_corr_diff:           result.revCorrDiff,
                decorr_score:            result.decorrScore,
                price_vs_rev_divergence: result.priceVsRevDivergence,
                is_decorrelating:        result.isDecorrelating,
                quarters_used:           result.quartersUsed,
                computed_at:             result.computedAt,
              }
            : {
                symbol_id:               d.symId,
                ticker:                  d.ticker,
                rev_corr:                null,
                rev_corr_current:        null,
                rev_corr_diff:           null,
                decorr_score:            null,
                price_vs_rev_divergence: null,
                is_decorrelating:        false,
                quarters_used:           d.quartersUsed,
                computed_at:             now,
              };

          await supabase.from('correlation_scores').insert(corrRow);

          await supabase.from('merit_scores').upsert(
            {
              symbol_id:          d.symId,
              ticker:             d.ticker,
              current_price:      d.currentPrice,
              price_52w_high:     d.high52w,
              price_52w_low:      d.low52w,
              price_52w_pct:      d.price52wPct,
              fms_52w_percentile: d.price52wPct,
              fms_total:          fms,
              rev_slope_5:        d.slopes['rev_short']  ?? null,
              fcf_slope_5:        d.slopes['fcf_short']  ?? null,
              fcfy:               d.currentFCFY,
              corr_at_earnings:   result?.revCorr                    ?? null,
              corr_now:           result?.revCorrCurrent             ?? null,
              corr_delta:         result?.revCorrDiff                ?? null,
              decorr_score:       result?.decorrScore                ?? null,
              divergence:         result?.priceVsRevDivergence       ?? null,
              is_decorrelating:   result?.isDecorrelating            ?? false,
              is_tradable:        false,
              is_stasis_active:   false,
              computed_at:        now,
              updated_at:         now,
            },
            { onConflict: 'ticker' },
          );

          console.log(
            `[correlation] ${d.ticker}: fms=${fms.toFixed(1)} corr=${result?.revCorr?.toFixed(3) ?? 'n/a'} decorr=${result?.decorrScore?.toFixed(3) ?? 'n/a'}`,
          );
        } catch (err) {
          console.error(`[correlation] upsert ${d.ticker}:`, (err as Error).message);
        }
      }),
    ),
  );

  console.log(`[correlation] Pipeline complete — ${gathered.size}/${equities.length} equities processed`);
}
