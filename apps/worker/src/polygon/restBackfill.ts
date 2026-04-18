import { ingestTick } from '../buffer/priceBuffer.js';

const API_KEY  = process.env.POLYGON_API_KEY ?? '';
const BASE_URL = process.env.POLYGON_REST_URL ?? 'https://api.polygon.io';

export function isMarketOpen(): boolean {
  const now = new Date();
  const et  = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay();
  const mins = et.getHours() * 60 + et.getMinutes();
  if (day === 0 || day === 6) return false;
  return mins >= 9 * 60 + 30 && mins < 16 * 60;
}

function lastTradingDay(): string {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = now.getDay();
  const offset = day === 0 ? 2 : day === 1 ? 3 : 1;
  now.setDate(now.getDate() - offset);
  return now.toISOString().slice(0, 10);
}

interface Agg { c: number; t: number }

async function fetchMinuteBars(ticker: string, date: string): Promise<Agg[]> {
  const url = `${BASE_URL}/v2/aggs/ticker/${ticker}/range/1/minute/${date}/${date}?adjusted=true&sort=asc&limit=500&apiKey=${API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const json = await res.json() as { results?: Agg[] };
  return json.results ?? [];
}

export type BarMap = Map<string, Array<{ price: number; timestamp: Date }>>;

/**
 * Replays last trading day's minute bars through ingestTick AND returns
 * them as a BarMap so backfillBitstreams can use them directly without
 * waiting for a DB flush.
 */
export async function runRestBackfill(tickers: string[]): Promise<BarMap> {
  const result: BarMap = new Map();

  if (isMarketOpen()) return result;

  const date = lastTradingDay();
  console.log(`[restBackfill] Market closed — replaying ${date} minute bars for ${tickers.length} symbols`);

  await Promise.all(
    tickers.slice(0, 50).map(async (ticker) => {
      try {
        const bars = await fetchMinuteBars(ticker, date);
        if (bars.length === 0) return;

        const entries: Array<{ price: number; timestamp: Date }> = [];
        for (const bar of bars) {
          ingestTick(ticker, bar.c);
          entries.push({ price: bar.c, timestamp: new Date(bar.t) });
        }
        result.set(ticker, entries);
        console.log(`[restBackfill] ${ticker}: ${bars.length} bars ingested`);
      } catch (err) {
        console.error(`[restBackfill] ${ticker}:`, (err as Error).message);
      }
    }),
  );

  console.log('[restBackfill] Done');
  return result;
}
