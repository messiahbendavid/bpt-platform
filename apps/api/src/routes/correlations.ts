import { FastifyInstance } from 'fastify';
import type { CorrelationsResponse } from '@bpt/shared';

export async function correlationRoutes(app: FastifyInstance) {
  app.get<{ Reply: CorrelationsResponse }>('/api/correlations', async (_req, reply) => {
    const { data, error } = await app.supabase
      .from('correlation_scores')
      .select('*')
      .order('computed_at', { ascending: false });

    if (error) {
      return reply.status(500).send({ data: [], count: 0, computedAt: new Date().toISOString() });
    }

    const mapped = (data ?? []).map((r) => ({
      ticker:           r.ticker,
      revCorr:          r.rev_corr,
      revCorrCurrent:   r.rev_corr_current,
      revCorrDiff:      r.rev_corr_diff,
      depsCorr:         r.deps_corr,
      depsCorrCurrent:  r.deps_corr_current,
      depsCorrDiff:     r.deps_corr_diff,
      diffSum:          r.diff_sum,
      isDecorrelating:  r.is_decorrelating,
      quartersUsed:     r.quarters_used,
      computedAt:       r.computed_at,
    }));

    return reply.send({
      data:        mapped,
      count:       mapped.length,
      computedAt:  new Date().toISOString(),
    });
  });
}
