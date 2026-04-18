import { FastifyInstance } from 'fastify';
import type { HealthResponse } from '@bpt/shared';

export async function healthRoutes(app: FastifyInstance) {
  app.get<{ Reply: HealthResponse }>('/api/health', async (_req, reply) => {
    const { count, error } = await app.supabase
      .from('symbols')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    const { data: lastTick } = await app.supabase
      .from('price_ticks')
      .select('tick_at')
      .order('tick_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return reply.send({
      status:           error ? 'degraded' : 'ok',
      timestamp:        new Date().toISOString(),
      polygonConnected: lastTick !== null,
      symbolsTracked:   count ?? 0,
      lastTickAt:       lastTick?.tick_at ?? null,
    });
  });
}
