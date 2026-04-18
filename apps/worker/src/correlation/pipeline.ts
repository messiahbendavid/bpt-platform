import pLimit from 'p-limit';
import { supabase } from '../db/supabaseClient.js';
import { fetchQuarterlyData } from './financialsFetcher.js';
import { computeDecorrelation } from './decorrelation.js';
import { getAllLatestPrices } from '../buffer/priceBuffer.js';

const limit = pLimit(10);

export async function runCorrelationPipeline(
  symbols: Array<{ id: string; ticker: string; instrument_type: string }>,
): Promise<void> {
  console.log(`[correlation] Running pipeline for ${symbols.length} symbols`);
  const latestPrices = getAllLatestPrices();

  const equities = symbols.filter((s) => s.instrument_type === 'equity');

  await Promise.all(
    equities.map((sym) =>
      limit(async () => {
        const currentPrice = latestPrices.get(sym.ticker);
        if (!currentPrice) return;

        try {
          const quarters = await fetchQuarterlyData(sym.ticker, sym.id);
          const result   = computeDecorrelation(sym.ticker, sym.id, quarters, currentPrice);
          if (!result) return;

          await supabase.from('correlation_scores').insert({
            symbol_id:          sym.id,
            ticker:             result.ticker,
            rev_corr:           result.revCorr,
            rev_corr_current:   result.revCorrCurrent,
            rev_corr_diff:      result.revCorrDiff,
            deps_corr:          result.depsCorr,
            deps_corr_current:  result.depsCorrCurrent,
            deps_corr_diff:     result.depsCorrDiff,
            diff_sum:           result.diffSum,
            is_decorrelating:   result.isDecorrelating,
            quarters_used:      result.quartersUsed,
            computed_at:        result.computedAt,
          });
        } catch (err) {
          console.error(`[correlation] ${sym.ticker}:`, (err as Error).message);
        }
      }),
    ),
  );

  console.log('[correlation] Pipeline complete');
}
