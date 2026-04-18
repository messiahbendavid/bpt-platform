function envFloat(key: string, fallback: number): number {
  const val = typeof process !== 'undefined' ? process.env[key] : undefined;
  const parsed = val ? parseFloat(val) : NaN;
  return isNaN(parsed) ? fallback : parsed;
}

export const SMS_WEIGHTS = {
  stasisCount:     envFloat('SMS_WEIGHT_STASIS_COUNT', 0.40),
  riskReward:      envFloat('SMS_WEIGHT_RISK_REWARD', 0.30),
  signalStrength:  envFloat('SMS_WEIGHT_SIGNAL_STRENGTH', 0.20),
  duration:        envFloat('SMS_WEIGHT_DURATION', 0.10),
} as const;

export const FMS_WEIGHTS = {
  netIncome:      envFloat('FMS_WEIGHT_NET_INCOME', 0.30),
  cashFlows:      envFloat('FMS_WEIGHT_CASH_FLOWS', 0.25),
  revenueTrend:   envFloat('FMS_WEIGHT_REVENUE_TREND', 0.30),
  percentile52w:  envFloat('FMS_WEIGHT_52W_PERCENTILE', 0.15),
} as const;

export const CMS_WEIGHTS = {
  decorrelationMagnitude: envFloat('CMS_WEIGHT_DECORR_MAGNITUDE', 0.50),
  deltaRate:              envFloat('CMS_WEIGHT_DELTA_RATE', 0.30),
  directionAlignment:     envFloat('CMS_WEIGHT_DIRECTION_ALIGN', 0.20),
} as const;

export const TMS_WEIGHTS = {
  sms: envFloat('TMS_SMS_WEIGHT', 1.0),
  fms: envFloat('TMS_FMS_WEIGHT', 1.0),
  cms: envFloat('TMS_CMS_WEIGHT', 1.0),
} as const;
