import type { BitstreamSnapshot } from '../bitstream/Bitstream.js';

/** Port of calculate_stasis_merit_score() from app.py */
export function calculateSMS(snap: BitstreamSnapshot): number {
  let ms = 0;

  const st = snap.stasis;
  for (const [t, p] of [[15,10],[12,9],[10,8],[8,7],[7,6],[6,5],[5,4],[4,3],[3,2],[2,1]] as [number,number][]) {
    if (st >= t) { ms += p; break; }
  }

  const rr = snap.riskReward;
  if (rr != null) {
    for (const [t, p] of [[3,5],[2.5,4],[2,3],[1.5,2],[1,1]] as [number,number][]) {
      if (rr >= t) { ms += p; break; }
    }
  }

  const ssMap: Record<string, number> = {
    VERY_STRONG: 4, STRONG: 3, MODERATE: 2, WEAK: 1,
  };
  ms += ssMap[snap.signalStrength ?? ''] ?? 0;

  const dur = snap.durationSeconds;
  if (dur >= 3600)      ms += 3;
  else if (dur >= 1800) ms += 2;
  else if (dur >= 900)  ms += 1;

  return ms;
}
