import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import supabasePlugin from './plugins/supabase.js';
import { healthRoutes } from './routes/health.js';
import { correlationRoutes } from './routes/correlations.js';
import { decorrelatingRoutes } from './routes/decorrelating.js';

const app = Fastify({ logger: true });

await app.register(cors, { origin: process.env.API_CORS_ORIGIN ?? '*' });
await app.register(supabasePlugin);
await app.register(healthRoutes);
await app.register(correlationRoutes);
await app.register(decorrelatingRoutes);

const port = parseInt(process.env.API_PORT ?? '3001', 10);
const host = process.env.API_HOST ?? '0.0.0.0';

app.listen({ port, host }, (err) => {
  if (err) { console.error(err); process.exit(1); }
  console.log(`[api] Listening on ${host}:${port}`);
});
