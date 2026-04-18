import type { CorrelationResult } from './financials.js';
import type { MeritScore } from './scoring.js';

export interface HealthResponse {
  status: 'ok' | 'degraded';
  timestamp: string;
  polygonConnected: boolean;
  symbolsTracked: number;
  lastTickAt: string | null;
}

export interface CorrelationsResponse {
  data: CorrelationResult[];
  count: number;
  computedAt: string;
}

export interface DecorrelatingResponse {
  data: MeritScore[];
  count: number;
}
