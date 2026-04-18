import { supabase } from './db/supabaseClient.js';
import { connect } from './polygon/client.js';
import { runRestBackfill, isMarketOpen } from './polygon/restBackfill.js';
import { flushToDatabase } from './buffer/priceBuffer.js';
import { runBitstreamCycle, backfillBitstreams, setVolumeCache } from './scheduler/bitstreamTick.js';
import { startCorrelationCron } from './scheduler/correlationCron.js';

const TICK_INTERVAL_MS = parseInt(process.env.WORKER_TICK_INTERVAL_MS ?? '1000', 10);
const LOOKBACK_DAYS    = parseInt(process.env.WORKER_HISTORICAL_LOOKBACK_DAYS ?? '5', 10);

type BarList = Array<{ price: number; timestamp: Date }>;

async function fetchHistoricalBars(
  tickers: string[],
): Promise<Map<string, BarList>> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
  const result = new Map<string, BarList>();

  const { data } = await supabase
    .from('price_ticks')
    .select('ticker, price, tick_at')
    .in('ticker', tickers)
    .gte('tick_at', since)
    .order('tick_at', { ascending: true });

  for (const row of data ?? []) {
    if (!result.has(row.ticker)) result.set(row.ticker, []);
    result.get(row.ticker)!.push({ price: row.price, timestamp: new Date(row.tick_at) });
  }

  return result;
}

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

  // Fetch DB historical bars and REST bars in parallel
  const [dbBars, restBars] = await Promise.all([
    fetchHistoricalBars(tickers),
    isMarketOpen() ? Promise.resolve(new Map<string, BarList>()) : runRestBackfill(tickers),
  ]);

  // Merge REST bars (last trading day minute bars) into DB bars per ticker,
  // keeping chronological order. REST bars win if DB is empty for that symbol.
  const historicalBars = new Map<string, BarList>(dbBars);
  for (const [ticker, bars] of restBars) {
    if (!historicalBars.has(ticker) || historicalBars.get(ticker)!.length === 0) {
      historicalBars.set(ticker, bars);
    } else {
      // Append REST bars that are newer than the last DB bar
      const existing = historicalBars.get(ticker)!;
      const lastTs   = existing[existing.length - 1].timestamp.getTime();
      const newBars  = bars.filter((b) => b.timestamp.getTime() > lastTs);
      existing.push(...newBars);
    }
  }

  console.log(`[worker] Historical bars for ${historicalBars.size} symbols (db=${dbBars.size} rest=${restBars.size})`);
  await backfillBitstreams(symbols, historicalBars);

  // Start live WebSocket feed
  connect(tickers);

  // Start correlation pipeline
  startCorrelationCron(symbols);

  // Main tick loop
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
