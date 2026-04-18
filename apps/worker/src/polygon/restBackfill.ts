import { ingestTick } from '../buffer/priceBuffer.js';

const API_KEY  = process.env.POLYGON_API_KEY ?? '';
const BASE_URL = process.env.POLYGON_REST_URL ?? 'https://api.polygon.io';

/** Returns true if US markets are currently open (Mon-Fri 9:30-16:00 ET). */
export function isMarketOpen(): boolean {
  const now = new Date();
  const et  = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay();
  const h   = et.getHours();
  const m   = et.getMinutes();
  const mins = h * 60 + m;
  if (day === 0 || day === 6) return false;
  return mins >= 9 * 60 + 30 && mins < 16 * 60;
}

/** Returns the date string (YYYY-MM-DD) of the last trading day. */
function lastTradingDay(): string {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = now.getDay();
  const offset = day === 0 ? 2 : day === 1 ? 3 : 1; // Sun→Fri, Mon→Fri, else yesterday
  now.setDate(now.getDate() - offset);
  return now.toISOString().slice(0, 10);
}

interface Agg { c: number; t: number; }

async function fetchMinuteBars(ticker: string, date: string): Promise<Agg[]> {
  const url = `${BASE_URL}/v2/aggs/ticker/${ticker}/range/1/minute/${date}/${date}?adjusted=true&sort=asc&limit=500&apiKey=${API_KEY}`;
  const res  = await fetch(url);
  if (!res.ok) return [];
  const json = await res.json() as { results?: Agg[] };
  return json.results ?? [];
}

/**
 * Replays last trading day's minute bars through ingestTick.
 * Used on weekends / after-hours so the bitstream has data to process.
 */
export async function runRestBackfill(tickers: string[]): Promise<void> {
  if (isMarketOpen()) return;

  const date = lastTradingDay();
  console.log(`[restBackfill] Market closed — replaying ${date} minute bars for ${tickers.length} symbols`);

  const equities = tickers.slice(0, 50); // cap to avoid rate limits
  await Promise.all(
    equities.map(async (ticker) => {
      try {
        const bars = await fetchMinuteBars(ticker, date);
        for (const bar of bars) {
          ingestTick(ticker, bar.c);
        }
        if (bars.length > 0) {
          console.log(`[restBackfill] ${ticker}: ${bars.length} bars ingested`);
        }
      } catch (err) {
        console.error(`[restBackfill] ${ticker}:`, (err as Error).message);
      }
    }),
  );

  console.log('[restBackfill] Done');
}
