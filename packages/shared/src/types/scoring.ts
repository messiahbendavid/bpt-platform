export interface SMSComponents {
  stasisCount: number;
  riskReward: number;
  signalStrength: number;
  durationHours: number;
}

export interface FMSComponents {
  netIncomeScore: number;
  cashFlowScore: number;
  revenueTrendScore: number;
  percentile52w: number;
}

export interface CMSComponents {
  decorrelationMagnitude: number;
  deltaRate: number;
  directionAlignment: -1 | 0 | 1;
}

export interface MeritScore {
  ticker: string;
  currentPrice: number | null;
  price52wHigh: number | null;
  price52wLow: number | null;
  price52wPct: number | null;

  sms: SMSComponents;
  smsTotal: number;

  fms: FMSComponents;
  fmsTotal: number;

  cms: CMSComponents;
  cmsTotal: number;

  tms: number;

  isTradable: boolean;
  isDecorrelating: boolean;
  isStasisActive: boolean;

  lastSignalAt: string | null;
  computedAt: string;
  updatedAt: string;
}

export type FilterMode = 'ALL' | 'TRADABLE' | 'DECORR';

export interface DashboardRow extends MeritScore {
  rank: number;
  signalLabel: string;
  priceDisplay: string;
}
