import { CORRELATION_REFRESH_INTERVAL_MS } from '@bpt/shared';
import { runCorrelationPipeline } from '../correlation/pipeline.js';

export function startCorrelationCron(
  symbols: Array<{ id: string; ticker: string; instrument_type: string }>,
): void {
  const run = async () => {
    try {
      await runCorrelationPipeline(symbols);
    } catch (err) {
      console.error('[correlationCron] error:', (err as Error).message);
    }
  };

  run();
  setInterval(run, CORRELATION_REFRESH_INTERVAL_MS);
}
