import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import type { MeritScore } from '@bpt/shared';

type DbRow = Record<string, unknown>;

function rowToMeritScore(r: DbRow): MeritScore {
  return {
    ticker:          r.ticker          as string,
    currentPrice:    r.current_price   as number | null,
    price52wHigh:    r.price_52w_high  as number | null,
    price52wLow:     r.price_52w_low   as number | null,
    price52wPct:     r.price_52w_pct   as number | null,

    smsStasisCount:    (r.sms_stasis_count  as number) ?? 0,
    smsRiskReward:     r.sms_risk_reward    as number | null,
    smsSignalStrength: (r.sms_signal_strength as number) ?? 0,
    smsDurationHrs:    (r.sms_duration_hrs   as number) ?? 0,
    smsTotal:          (r.sms_total          as number) ?? 0,

    fmsTotal:          (r.fms_total   as number) ?? 0,
    cmsTotal:          (r.cms_total   as number) ?? 0,
    tms:               (r.tms         as number) ?? 0,

    bandThreshold:  r.band_threshold   as number | null,
    direction:      r.direction        as 'LONG' | 'SHORT' | null,
    signalStrength: r.signal_strength  as string | null,

    corrAtEarnings: r.corr_at_earnings as number | null,
    corrNow:        r.corr_now         as number | null,
    corrDelta:      r.corr_delta       as number | null,
    decorrScore:    r.decorr_score     as number | null,
    divergence:     r.divergence       as string | null,

    revSlope5:      r.rev_slope_5      as number | null,
    fcfSlope5:      r.fcf_slope_5      as number | null,
    fcfy:           r.fcfy             as number | null,

    takeProfit:     r.take_profit      as number | null,
    stopLoss:       r.stop_loss        as number | null,
    durationStr:    r.stasis_duration_str as string | null,

    isTradable:      (r.is_tradable      as boolean) ?? false,
    isDecorrelating: (r.is_decorrelating as boolean) ?? false,
    isStasisActive:  (r.is_stasis_active as boolean) ?? false,

    lastSignalAt:  r.last_signal_at as string | null,
    computedAt:    r.computed_at    as string,
    updatedAt:     r.updated_at     as string,
  };
}

export function useRealtimeScores() {
  const [scores, setScores] = useState<MeritScore[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('merit_scores')
      .select('*')
      .order('tms', { ascending: false })
      .then(({ data }) => {
        if (data) setScores(data.map(rowToMeritScore));
        setLoading(false);
      });

    const channel = supabase
      .channel('merit_scores_live')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'merit_scores' },
        (payload) => {
          const updated = rowToMeritScore(payload.new as DbRow);
          setScores((prev) =>
            prev.map((s) => (s.ticker === updated.ticker ? updated : s)),
          );
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'merit_scores' },
        (payload) => {
          const inserted = rowToMeritScore(payload.new as DbRow);
          setScores((prev) => {
            const exists = prev.some((s) => s.ticker === inserted.ticker);
            return exists ? prev : [...prev, inserted];
          });
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return { scores, loading };
}
