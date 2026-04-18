import { TMS_WEIGHTS, MIN_TMS_DELTA_TO_UPSERT } from '@bpt/shared';
import type { StasisDetectionResult, QuarterlyFinancials, CorrelationResult } from '@bpt/shared';
import { supabase } from '../db/supabaseClient.js';
import { computeSMS } from './sms.js';
import { computeFMS } from './fms.js';
import { computeCMS } from './cms.js';
import { percentile52w } from '@bpt/shared';

interface SymbolMeta {
  symbolId: string;
  ticker: string;
  currentPrice: number;
  price52wHigh: number;
  price52wLow: number;
  isTradable: boolean;
}

interface PriorScores {
  tms: number;
  priorCorrelation: CorrelationResult | null;
}

export async function computeAndUpsertTMS(
  meta: SymbolMeta,
  stasis: StasisDetectionResult,
  quarters: QuarterlyFinancials[],
  correlation: CorrelationResult | null,
  prior: PriorScores | null,
): Promise<void> {
  const now = new Date();

  const sms = computeSMS(stasis, now);
  const fms = computeFMS(quarters, meta.currentPrice, meta.price52wLow, meta.price52wHigh);
  const cms = correlation
    ? computeCMS(correlation, prior?.priorCorrelation ?? null)
    : { decorrelationMagnitude: 0, deltaRate: 0, directionAlignment: 0 as const, total: 0 };

  const tms =
    sms.total * TMS_WEIGHTS.sms +
    fms.total * TMS_WEIGHTS.fms +
    cms.total * TMS_WEIGHTS.cms;

  const roundedTms = Math.round(tms * 10000) / 10000;

  if (prior && Math.abs(roundedTms - prior.tms) < MIN_TMS_DELTA_TO_UPSERT) {
    return;
  }

  const pct52w = percentile52w(meta.currentPrice, meta.price52wLow, meta.price52wHigh);

  const row = {
    symbol_id:    meta.symbolId,
    ticker:       meta.ticker,
    current_price: meta.currentPrice,
    price_52w_high: meta.price52wHigh,
    price_52w_low:  meta.price52wLow,
    price_52w_pct:  pct52w,

    sms_stasis_count:    stasis.stasisCount,
    sms_risk_reward:     sms.riskReward,
    sms_signal_strength: sms.signalStrength,
    sms_duration_hrs:    sms.durationHours,
    sms_total:           sms.total,

    fms_net_income:     fms.netIncomeScore,
    fms_cash_flows:     fms.cashFlowScore,
    fms_revenue_trend:  fms.revenueTrendScore,
    fms_52w_percentile: fms.percentile52w,
    fms_total:          fms.total,

    cms_decorr_magnitude: cms.decorrelationMagnitude,
    cms_delta_rate:       cms.deltaRate,
    cms_direction_align:  cms.directionAlignment,
    cms_total:            cms.total,

    tms: roundedTms,

    is_tradable:      meta.isTradable,
    is_decorrelating: correlation?.isDecorrelating ?? false,
    is_stasis_active: stasis.isStasis,

    last_signal_at: stasis.stasisStartedAt?.toISOString() ?? null,
    computed_at:    now.toISOString(),
    updated_at:     now.toISOString(),
  };

  const { error } = await supabase
    .from('merit_scores')
    .upsert(row, { onConflict: 'ticker' });

  if (error) {
    console.error(`[tms] upsert error for ${meta.ticker}:`, error.message);
  }
}
