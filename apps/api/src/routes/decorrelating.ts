import { FastifyInstance } from 'fastify';
import type { DecorrelatingResponse } from '@bpt/shared';

export async function decorrelatingRoutes(app: FastifyInstance) {
  app.get<{ Reply: DecorrelatingResponse }>('/api/decorrelating', async (_req, reply) => {
    const { data, error } = await app.supabase
      .from('merit_scores')
      .select('*')
      .eq('is_decorrelating', true)
      .order('tms', { ascending: false });

    if (error) {
      return reply.status(500).send({ data: [], count: 0 });
    }

    const mapped = (data ?? []).map((r) => ({
      ticker:         r.ticker,
      currentPrice:   r.current_price,
      price52wHigh:   r.price_52w_high,
      price52wLow:    r.price_52w_low,
      price52wPct:    r.price_52w_pct,
      sms:            { stasisCount: r.sms_stasis_count, riskReward: r.sms_risk_reward, signalStrength: r.sms_signal_strength, durationHours: r.sms_duration_hrs },
      smsTotal:       r.sms_total,
      fms:            { netIncomeScore: r.fms_net_income, cashFlowScore: r.fms_cash_flows, revenueTrendScore: r.fms_revenue_trend, percentile52w: r.fms_52w_percentile },
      fmsTotal:       r.fms_total,
      cms:            { decorrelationMagnitude: r.cms_decorr_magnitude, deltaRate: r.cms_delta_rate, directionAlignment: r.cms_direction_align },
      cmsTotal:       r.cms_total,
      tms:            r.tms,
      isTradable:     r.is_tradable,
      isDecorrelating: r.is_decorrelating,
      isStasisActive: r.is_stasis_active,
      lastSignalAt:   r.last_signal_at,
      computedAt:     r.computed_at,
      updatedAt:      r.updated_at,
    }));

    return reply.send({ data: mapped, count: mapped.length });
  });
}
