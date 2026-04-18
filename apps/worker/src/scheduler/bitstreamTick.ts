import { BAND_THRESHOLDS, AM_THRESHOLDS, MIN_TMS_DELTA_TO_UPSERT } from '@bpt/shared';
import { supabase } from '../db/supabaseClient.js';
import { getAllLatestPrices } from '../buffer/priceBuffer.js';
import { Bitstream } from '../bitstream/Bitstream.js';
import { calculateSMS } from '../scoring/sms.js';
import { calculateCMS } from '../scoring/cms.js';

interface SymbolRecord {
  id: string;
  ticker: string;
  is_tradable: boolean;
  instrument_type: string;
}

const bitstreamStore = new Map<string, Bitstream>();
const volumeCache    = new Map<string, number>();

// Track last known tradable state to avoid redundant DB resets
const lastTradable = new Map<string, boolean>();

function key(ticker: string, threshold: number): string {
  return `${ticker}::${threshold}`;
}

function getBitstream(ticker: string, threshold: number, price: number, volume: number): Bitstream {
  const k = key(ticker, threshold);
  if (!bitstreamStore.has(k)) {
    bitstreamStore.set(k, new Bitstream(ticker, threshold, price, volume));
  }
  return bitstreamStore.get(k)!;
}

export async function backfillBitstreams(
  symbols: SymbolRecord[],
  historicalBars: Map<string, Array<{ price: number; timestamp: Date }>>,
): Promise<void> {
  console.log('[bitstreamTick] Backfilling bitstreams from historical data...');

  for (const sym of symbols) {
    const bars = historicalBars.get(sym.ticker);
    if (!bars || bars.length === 0) continue;

    const volume = volumeCache.get(sym.ticker) ?? 1.5;
    const initialPrice = bars[0].price;

    for (const threshold of BAND_THRESHOLDS) {
      const bs = getBitstream(sym.ticker, threshold, initialPrice, volume);
      for (const bar of bars.slice(1)) {
        bs.processPrice(bar.price, bar.timestamp);
      }
    }
  }

  console.log(`[bitstreamTick] Backfill done. ${bitstreamStore.size} bitstreams initialised.`);
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

function percentile52w(price: number, low: number, high: number): number | null {
  const range = high - low;
  if (range <= 0) return null;
  return ((price - low) / range) * 100;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export async function runBitstreamCycle(symbols: SymbolRecord[]): Promise<void> {
  const latestPrices = getAllLatestPrices();
  if (latestPrices.size === 0) return;

  const now = new Date();

  for (const sym of symbols) {
    const price = latestPrices.get(sym.ticker);
    if (!price) continue;

    const volume = volumeCache.get(sym.ticker) ?? 1.5;

    // Feed price into all AM threshold bitstreams
    for (const threshold of AM_THRESHOLDS) {
      const bs = getBitstream(sym.ticker, threshold, price, volume);
      bs.processPrice(price, now);
    }

    // Find best snapshot (highest stasis count among tradable snaps)
    let bestSnap = null;
    for (const threshold of AM_THRESHOLDS) {
      const bs   = bitstreamStore.get(key(sym.ticker, threshold));
      if (!bs) continue;
      const snap = bs.getSnapshot(price);
      if (!snap.isTradable) continue;
      if (!bestSnap || snap.stasis > bestSnap.stasis) bestSnap = snap;
    }

    const isNowTradable = bestSnap !== null;
    const wasTrading    = lastTradable.get(sym.ticker) ?? false;

    if (!isNowTradable) {
      // Stasis not active — reset flags in DB only if state changed
      if (wasTrading) {
        lastTradable.set(sym.ticker, false);
        await supabase.from('merit_scores').upsert({
          symbol_id:        sym.id,
          ticker:           sym.ticker,
          current_price:    price,
          sms_stasis_count: 0,
          sms_total:        0,
          direction:        null,
          signal_strength:  null,
          band_threshold:   null,
          take_profit:      null,
          stop_loss:        null,
          stasis_duration_str: null,
          is_tradable:      false,
          is_stasis_active: false,
          updated_at:       now.toISOString(),
          computed_at:      now.toISOString(),
        }, { onConflict: 'ticker' });
      }
      continue;
    }

    // ── Active tradable snap ──────────────────────────────────────────────
    lastTradable.set(sym.ticker, true);

    const [meta52w, corrRow, priorScore] = await Promise.all([
      fetch52w(sym.ticker),
      supabase
        .from('correlation_scores')
        .select('rev_corr,rev_corr_current,rev_corr_diff,decorr_score,price_vs_rev_divergence,is_decorrelating')
        .eq('ticker', sym.ticker)
        .order('computed_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('merit_scores')
        .select('tms, fms_total, rev_slope_5, fcf_slope_5, fcfy')
        .eq('ticker', sym.ticker)
        .maybeSingle(),
    ]);

    if (!bestSnap) continue; // re-check after async gap (TS narrowing)
    const w52Pct = meta52w ? percentile52w(price, meta52w.low, meta52w.high) : null;
    const sms    = calculateSMS(bestSnap);
    const fms    = priorScore.data?.fms_total ?? 0;

    const cd = corrRow.data;
    const corrData = cd ? {
      corrAtEarnings:       cd.rev_corr                   ?? null,
      corrNow:              cd.rev_corr_current            ?? null,
      corrDelta:            cd.rev_corr_diff               ?? null,
      decorrelationScore:   cd.decorr_score                ?? null,
      priceVsRevDivergence: (cd.price_vs_rev_divergence as 'PRICE_AHEAD' | 'PRICE_BEHIND' | 'ALIGNED' | null) ?? null,
    } : null;

    const { score: cms } = calculateCMS(corrData, bestSnap.direction);
    const tms = sms + fms + cms;

    if (
      priorScore.data &&
      Math.abs(tms - (priorScore.data.tms ?? 0)) < MIN_TMS_DELTA_TO_UPSERT
    ) continue;

    const durationStr = bestSnap.durationSeconds > 0
      ? formatDuration(bestSnap.durationSeconds)
      : null;

    await supabase.from('merit_scores').upsert({
      symbol_id:    sym.id,
      ticker:       sym.ticker,

      current_price:  price,
      price_52w_high: meta52w?.high ?? null,
      price_52w_low:  meta52w?.low  ?? null,
      price_52w_pct:  w52Pct,

      sms_stasis_count:    bestSnap.stasis,
      sms_risk_reward:     bestSnap.riskReward,
      sms_signal_strength: bestSnap.signalStrength
        ? ['VERY_STRONG','STRONG','MODERATE','WEAK'].indexOf(bestSnap.signalStrength) + 1
        : 0,
      sms_duration_hrs:    bestSnap.durationSeconds / 3600,
      sms_total:           sms,

      fms_52w_percentile: w52Pct,
      fms_total:          fms,
      rev_slope_5:        priorScore.data?.rev_slope_5 ?? null,
      fcf_slope_5:        priorScore.data?.fcf_slope_5 ?? null,
      fcfy:               priorScore.data?.fcfy        ?? null,

      cms_decorr_magnitude: corrData?.decorrelationScore ?? null,
      cms_delta_rate:       corrData?.corrDelta          ?? null,
      cms_direction_align:  cms > 0 ? 1 : 0,
      cms_total:            cms,

      tms,

      band_threshold:      bestSnap.threshold,
      direction:           bestSnap.direction,
      signal_strength:     bestSnap.signalStrength ?? null,
      corr_at_earnings:    corrData?.corrAtEarnings        ?? null,
      corr_now:            corrData?.corrNow               ?? null,
      corr_delta:          corrData?.corrDelta             ?? null,
      decorr_score:        corrData?.decorrelationScore    ?? null,
      divergence:          corrData?.priceVsRevDivergence  ?? null,
      take_profit:         bestSnap.takeProfit  ?? null,
      stop_loss:           bestSnap.stopLoss    ?? null,
      stasis_duration_str: durationStr,

      is_tradable:      true,   // only reach here when bestSnap.isTradable === true
      is_decorrelating: cd?.is_decorrelating ?? false,
      is_stasis_active: bestSnap.stasis >= 2,

      last_signal_at: bestSnap.stasisStartStr !== '—' ? bestSnap.stasisStartStr : null,
      computed_at:    now.toISOString(),
      updated_at:     now.toISOString(),
    }, { onConflict: 'ticker' });
  }
}

export function setVolumeCache(ticker: string, volume: number): void {
  volumeCache.set(ticker, volume);
}
