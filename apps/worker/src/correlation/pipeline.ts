import pLimit from 'p-limit';
import { supabase } from '../db/supabaseClient.js';
import { fetchQuarterlyData, computeSlopes } from './financialsFetcher.js';
import { computeDecorrelation } from './decorrelation.js';
import { getAllLatestPrices } from '../buffer/priceBuffer.js';

const limit = pLimit(5);

/** Last historical close for a ticker — used when live price is not yet available */
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

export async function runCorrelationPipeline(
  symbols: Array<{ id: string; ticker: string; instrument_type: string }>,
): Promise<void> {
  console.log(`[correlation] Running pipeline for ${symbols.length} symbols`);
  const livePrices = getAllLatestPrices();

  const equities = symbols.filter((s) => s.instrument_type === 'equity');

  await Promise.all(
    equities.map((sym) =>
      limit(async () => {
        try {
          // Use live price if available, fall back to last historical close
          const currentPrice =
            livePrices.get(sym.ticker) ?? (await lastHistoricalPrice(sym.ticker));
          if (!currentPrice) return;

          const quarters = await fetchQuarterlyData(sym.ticker, sym.id);
          if (quarters.length === 0) return;

          const slopes = computeSlopes(quarters);
          const result = computeDecorrelation(sym.ticker, sym.id, quarters, currentPrice);

          // Always upsert correlation_scores so merit_scores can read it
          const corrRow = result
            ? {
                symbol_id:               sym.id,
                ticker:                  sym.ticker,
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
                symbol_id:               sym.id,
                ticker:                  sym.ticker,
                rev_corr:                null,
                rev_corr_current:        null,
                rev_corr_diff:           null,
                decorr_score:            null,
                price_vs_rev_divergence: null,
                is_decorrelating:        false,
                quarters_used:           quarters.length,
                computed_at:             new Date().toISOString(),
              };

          await supabase.from('correlation_scores').insert(corrRow);

          // Seed merit_scores with fundamental + correlation data even without a live bitstream snap
          await supabase.from('merit_scores').upsert(
            {
              symbol_id:        sym.id,
              ticker:           sym.ticker,
              current_price:    currentPrice,
              rev_slope_5:      slopes.Rev_Slope_5   ?? null,
              fcf_slope_5:      slopes.FCF_Slope_5   ?? null,
              fcfy:             slopes.FCFY           ?? null,
              corr_at_earnings: result?.revCorr               ?? null,
              corr_now:         result?.revCorrCurrent        ?? null,
              corr_delta:       result?.revCorrDiff           ?? null,
              decorr_score:     result?.decorrScore           ?? null,
              divergence:       result?.priceVsRevDivergence  ?? null,
              is_decorrelating: result?.isDecorrelating       ?? false,
              is_tradable:      false,   // bitstreamTick sets true when stasis qualifies
              is_stasis_active: false,
              computed_at:      new Date().toISOString(),
              updated_at:       new Date().toISOString(),
            },
            { onConflict: 'ticker' },
          );

          console.log(`[correlation] ${sym.ticker}: corr=${result?.revCorr?.toFixed(3) ?? 'n/a'} decorr=${result?.decorrScore?.toFixed(3) ?? 'n/a'}`);
        } catch (err) {
          console.error(`[correlation] ${sym.ticker}:`, (err as Error).message);
        }
      }),
    ),
  );

  console.log('[correlation] Pipeline complete');
}
