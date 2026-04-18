import type { SMSComponents } from '@bpt/shared';
import { SMS_WEIGHTS } from '@bpt/shared';
import type { StasisDetectionResult } from '@bpt/shared';

export function computeSMS(stasis: StasisDetectionResult, now: Date): SMSComponents & { total: number } {
  const durationMs  = stasis.stasisStartedAt ? now.getTime() - stasis.stasisStartedAt.getTime() : 0;
  const durationHrs = durationMs / 3_600_000;

  const riskReward = stasis.winProbability !== null ? stasis.winProbability : 0;
  const signalStrength = stasis.stasisCount > 0
    ? Math.min(1, stasis.stasisCount / 10)
    : 0;

  const components: SMSComponents = {
    stasisCount:    stasis.stasisCount,
    riskReward:     Math.round(riskReward * 10000) / 10000,
    signalStrength: Math.round(signalStrength * 10000) / 10000,
    durationHours:  Math.round(durationHrs * 100) / 100,
  };

  const total =
    components.stasisCount    * SMS_WEIGHTS.stasisCount +
    components.riskReward     * SMS_WEIGHTS.riskReward +
    components.signalStrength * SMS_WEIGHTS.signalStrength +
    Math.min(components.durationHours / 24, 1) * SMS_WEIGHTS.duration;

  return { ...components, total: Math.round(total * 10000) / 10000 };
}
