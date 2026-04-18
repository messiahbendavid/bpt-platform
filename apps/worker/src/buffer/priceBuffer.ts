import { supabase } from '../db/supabaseClient.js';

interface Tick {
  ticker: string;
  price: number;
  tickAt: Date;
}

const latestPrices = new Map<string, number>();
const pendingTicks: Tick[] = [];

export function ingestTick(ticker: string, price: number): void {
  latestPrices.set(ticker, price);
  pendingTicks.push({ ticker, price, tickAt: new Date() });
}

export function getLatestPrice(ticker: string): number | undefined {
  return latestPrices.get(ticker);
}

export function getAllLatestPrices(): Map<string, number> {
  return latestPrices;
}

export async function flushToDatabase(symbolIdMap: Map<string, string>): Promise<void> {
  if (pendingTicks.length === 0) return;

  const batch = pendingTicks.splice(0, pendingTicks.length);

  const rows = batch
    .map((t) => {
      const symbolId = symbolIdMap.get(t.ticker);
      if (!symbolId) return null;
      return {
        symbol_id: symbolId,
        ticker: t.ticker,
        price: t.price,
        tick_at: t.tickAt.toISOString(),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) return;

  const { error } = await supabase.from('price_ticks').insert(rows);
  if (error) {
    console.error('[priceBuffer] flush error:', error.message);
    // Re-queue failed ticks for next flush
    pendingTicks.unshift(...batch);
  }
}
