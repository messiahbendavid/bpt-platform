export interface MeritScore {
  ticker: string;
  currentPrice: number | null;
  price52wHigh: number | null;
  price52wLow: number | null;
  price52wPct: number | null;

  // Stasis Merit Score
  smsStasisCount: number;
  smsRiskReward: number | null;
  smsSignalStrength: number;
  smsDurationHrs: number;
  smsTotal: number;

  // Fundamental Merit Score
  fmsTotal: number;
  fmsRanks: Record<string, number | null> | null;  // per-metric percentile ranks (0-1)

  // Correlation Merit Score
  cmsTotal: number;

  // Total Merit Score
  tms: number;

  // 23-column dashboard fields
  bandThreshold: number | null;       // BAND (e.g. 0.01)
  direction: 'LONG' | 'SHORT' | null; // DIR
  signalStrength: string | null;       // 'VERY_STRONG' | 'STRONG' | 'MODERATE' | 'WEAK'

  corrAtEarnings: number | null;       // C@E
  corrNow: number | null;              // C@N
  corrDelta: number | null;            // ΔCOR
  decorrScore: number | null;          // DCOR
  divergence: string | null;           // DIV

  revSlope5: number | null;            // REV5
  fcfSlope5: number | null;            // FCF5
  fcfy: number | null;                 // FCFY

  takeProfit: number | null;           // TP
  stopLoss: number | null;             // SL
  durationStr: string | null;          // DUR

  isTradable: boolean;
  isDecorrelating: boolean;
  isStasisActive: boolean;

  lastSignalAt: string | null;
  computedAt: string;
  updatedAt: string;
}

export type FilterMode = 'ALL' | 'TRADABLE' | 'DECORR';
