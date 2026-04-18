import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import type { MeritScore } from '@bpt/shared';

type DbRow = Record<string, unknown>;

function rowToMeritScore(r: DbRow): MeritScore {
  return {
    ticker:          r.ticker as string,
    currentPrice:    r.current_price as number | null,
    price52wHigh:    r.price_52w_high as number | null,
    price52wLow:     r.price_52w_low as number | null,
    price52wPct:     r.price_52w_pct as number | null,
    sms: {
      stasisCount:    r.sms_stasis_count as number,
      riskReward:     r.sms_risk_reward as number,
      signalStrength: r.sms_signal_strength as number,
      durationHours:  r.sms_duration_hrs as number,
    },
    smsTotal:        r.sms_total as number,
    fms: {
      netIncomeScore:    r.fms_net_income as number,
      cashFlowScore:     r.fms_cash_flows as number,
      revenueTrendScore: r.fms_revenue_trend as number,
      percentile52w:     r.fms_52w_percentile as number,
    },
    fmsTotal:        r.fms_total as number,
    cms: {
      decorrelationMagnitude: r.cms_decorr_magnitude as number,
      deltaRate:              r.cms_delta_rate as number,
      directionAlignment:     r.cms_direction_align as -1 | 0 | 1,
    },
    cmsTotal:        r.cms_total as number,
    tms:             r.tms as number,
    isTradable:      r.is_tradable as boolean,
    isDecorrelating: r.is_decorrelating as boolean,
    isStasisActive:  r.is_stasis_active as boolean,
    lastSignalAt:    r.last_signal_at as string | null,
    computedAt:      r.computed_at as string,
    updatedAt:       r.updated_at as string,
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
