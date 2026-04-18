import pLimit from 'p-limit';
import { BAND_MULTIPLIERS, SPOTLIGHT_MIN, SPOTLIGHT_MAX, LOOKBACK_DAYS } from '@bpt/shared';
import { supabase } from '../db/supabaseClient.js';
import { getAllLatestPrices } from '../buffer/priceBuffer.js';
import { computeDecimalWindowSS } from '../bitstream/decimal.js';
import { detectStasis, countBreakoutsAndReversions } from '../bitstream/stasis.js';
import { computeAndUpsertTMS } from '../scoring/tms.js';
import { fetchQuarterlyData } from '../correlation/financialsFetcher.js';
import type { BitstreamInput, DecimalWindow } from '@bpt/shared';

const limit = pLimit(20);

interface SymbolRecord {
  id: string;
  ticker: string;
  is_tradable: boolean;
  instrument_type: string;
}

async function fetchRecentPrices(
  ticker: string,
  lookbackDays: number,
): Promise<{ price: number; tick_at: string }[]> {
  const since = new Date(Date.now() - lookbackDays * 86_400_000).toISOString();
  const { data } = await supabase
    .from('price_ticks')
    .select('price, tick_at')
    .eq('ticker', ticker)
    .gte('tick_at', since)
    .order('tick_at', { ascending: true });
  return data ?? [];
}

async function fetch52w(ticker: string): Promise<{ high: number; low: number } | null> {
  const since = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from('historical_prices')
    .select('high_price, low_price')
    .eq('ticker', ticker)
    .gte('trade_date', since);

  if (!data || data.length === 0) return null;
  const high = Math.max(...data.map((r) => r.high_price ?? 0));
  const low  = Math.min(...data.map((r) => r.low_price ?? Infinity));
  return { high, low };
}

export async function runBitstreamCycle(symbols: SymbolRecord[]): Promise<void> {
  const latestPrices = getAllLatestPrices();
  const lookbackDays = parseInt(process.env.WORKER_HISTORICAL_LOOKBACK_DAYS ?? '5', 10);

  await Promise.all(
    symbols.map((sym) =>
      limit(async () => {
        const currentPrice = latestPrices.get(sym.ticker);
        if (!currentPrice) return;

        const ticks = await fetchRecentPrices(sym.ticker, lookbackDays);
        if (ticks.length < 2) return;

        const prices     = ticks.map((t) => t.price);
        const timestamps = ticks.map((t) => new Date(t.tick_at));

        const meta52w  = await fetch52w(sym.ticker);
        const quarters = sym.instrument_type === 'equity'
          ? await fetchQuarterlyData(sym.ticker, sym.id)
          : [];

        const { data: corrRow } = await supabase
          .from('correlation_scores')
          .select('*')
          .eq('ticker', sym.ticker)
          .order('computed_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const { data: priorScore } = await supabase
          .from('merit_scores')
          .select('tms')
          .eq('ticker', sym.ticker)
          .maybeSingle();

        let bestStasis = null;

        for (let bandIdx = 0; bandIdx < BAND_MULTIPLIERS.length; bandIdx++) {
          const bpRange = BAND_MULTIPLIERS[bandIdx];
          const windows: DecimalWindow[] = [];

          for (let spotlight = SPOTLIGHT_MIN; spotlight <= SPOTLIGHT_MAX; spotlight++) {
            const input: BitstreamInput = {
              ticker:    sym.ticker,
              bandIndex: bandIdx + 1,
              bpRange,
              spotlight,
              prices,
              timestamps,
            };

            const win = computeDecimalWindowSS(input);
            if (!win) continue;
            windows.push(win);

            if (win.isStasis) {
              const { breakoutCount, reversionCount, winProbability } =
                countBreakoutsAndReversions(windows, spotlight);

              const stasis = detectStasis(
                win, 0, null, null, null,
                breakoutCount, reversionCount, winProbability, null,
              );

              if (!bestStasis || stasis.stasisCount > bestStasis.stasisCount) {
                bestStasis = stasis;
              }
            }
          }
        }

        if (!bestStasis) return;

        await computeAndUpsertTMS(
          {
            symbolId:     sym.id,
            ticker:       sym.ticker,
            currentPrice,
            price52wHigh: meta52w?.high ?? currentPrice,
            price52wLow:  meta52w?.low  ?? currentPrice,
            isTradable:   sym.is_tradable,
          },
          bestStasis,
          quarters,
          corrRow
            ? {
                ticker:           corrRow.ticker,
                revCorr:          corrRow.rev_corr,
                revCorrCurrent:   corrRow.rev_corr_current,
                revCorrDiff:      corrRow.rev_corr_diff,
                depsCorr:         corrRow.deps_corr,
                depsCorrCurrent:  corrRow.deps_corr_current,
                depsCorrDiff:     corrRow.deps_corr_diff,
                diffSum:          corrRow.diff_sum,
                isDecorrelating:  corrRow.is_decorrelating,
                quartersUsed:     corrRow.quarters_used,
                computedAt:       corrRow.computed_at,
              }
            : null,
          priorScore ? { tms: priorScore.tms, priorCorrelation: null } : null,
        );
      }),
    ),
  );
}
