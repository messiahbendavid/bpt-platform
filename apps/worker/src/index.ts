import 'dotenv/config';
import { supabase } from './db/supabaseClient.js';
import { connect } from './polygon/client.js';
import { flushToDatabase } from './buffer/priceBuffer.js';
import { runBitstreamCycle } from './scheduler/bitstreamTick.js';
import { startCorrelationCron } from './scheduler/correlationCron.js';

const TICK_INTERVAL_MS = parseInt(process.env.WORKER_TICK_INTERVAL_MS ?? '1000', 10);

async function main() {
  console.log('[worker] Starting BPT Worker...');

  const { data: symbols, error } = await supabase
    .from('symbols')
    .select('id, ticker, is_tradable, instrument_type')
    .eq('is_active', true);

  if (error || !symbols) {
    console.error('[worker] Failed to load symbols:', error?.message);
    process.exit(1);
  }

  console.log(`[worker] Loaded ${symbols.length} symbols`);

  const symbolIdMap = new Map(symbols.map((s) => [s.ticker, s.id]));
  const tickers     = symbols.map((s) => s.ticker);

  connect(tickers);
  startCorrelationCron(symbols);

  setInterval(async () => {
    try {
      await flushToDatabase(symbolIdMap);
      await runBitstreamCycle(symbols);
    } catch (err) {
      console.error('[worker] tick error:', (err as Error).message);
    }
  }, TICK_INTERVAL_MS);

  console.log('[worker] Running');
}

main().catch((err) => {
  console.error('[worker] Fatal:', err);
  process.exit(1);
});
