import WebSocket from 'ws';
import { ingestTick } from '../buffer/priceBuffer.js';

const WS_URL = process.env.POLYGON_WS_URL ?? 'wss://socket.massive.com/stocks';
const API_KEY = process.env.POLYGON_API_KEY ?? '';

type PolygonMessage = {
  ev: string;
  sym?: string;
  bp?: number;  // bid price (AM channel)
  ap?: number;  // ask price
  vw?: number;  // VWAP
  lp?: number;  // last price
};

let ws: WebSocket | null = null;
let reconnectDelay = 1000;
let connected = false;
let lastTickAt: Date | null = null;
let trackedSymbols: string[] = [];

export function isConnected(): boolean { return connected; }
export function getLastTickAt(): Date | null { return lastTickAt; }

export function connect(symbols: string[]): void {
  trackedSymbols = symbols;
  _connect();
}

function _connect(): void {
  ws = new WebSocket(WS_URL);

  ws.on('open', () => {
    console.log('[polygon] WebSocket open');
    ws!.send(JSON.stringify({ action: 'auth', params: API_KEY }));
  });

  ws.on('message', (data: Buffer) => {
    let messages: PolygonMessage[];
    try {
      messages = JSON.parse(data.toString());
    } catch {
      return;
    }

    console.log('[polygon] raw message:', data.toString().slice(0, 300));

    for (const msg of messages) {
      if (msg.ev === 'connected') {
        console.log('[polygon] Connected to server');
        continue;
      }

      if (msg.ev === 'auth_success') {
        connected = true;
        reconnectDelay = 1000;
        console.log(`[polygon] Authenticated — subscribing to ${trackedSymbols.length} symbols`);
        _subscribe(trackedSymbols);
        continue;
      }

      if (msg.ev === 'auth_failed') {
        console.error('[polygon] AUTH FAILED — check your API key and plan tier. Raw:', JSON.stringify(msg));
        ws?.close();
        return;
      }

      if (msg.ev === 'AM' && msg.sym) {
        const price = msg.vw ?? msg.lp ?? msg.bp ?? null;
        if (price !== null && price > 0) {
          ingestTick(msg.sym, price);
          lastTickAt = new Date();
        }
      }
    }
  });

  ws.on('close', () => {
    connected = false;
    console.warn(`[polygon] Disconnected — reconnecting in ${reconnectDelay}ms`);
    setTimeout(() => {
      reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
      _connect();
    }, reconnectDelay);
  });

  ws.on('error', (err) => {
    console.error('[polygon] WebSocket error:', err.message);
  });
}

function _subscribe(symbols: string[]): void {
  const batchSize = parseInt(process.env.WORKER_MAX_SYMBOLS_PER_BATCH ?? '25', 10);
  const delayMs   = parseInt(process.env.WORKER_SUBSCRIBE_DELAY_MS ?? '500', 10);

  symbols.forEach((s, i) => {
    const batchIndex = Math.floor(i / batchSize);
    if (i % batchSize !== 0) return;
    const batch  = symbols.slice(i, i + batchSize);
    const params = batch.map((s) => `AM.${s}`).join(',');
    setTimeout(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'subscribe', params }));
        console.log(`[polygon] Subscribed batch ${batchIndex + 1}: ${batch.length} symbols`);
      }
    }, batchIndex * delayMs);
  });
}
