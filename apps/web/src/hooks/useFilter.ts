import { useState, useMemo } from 'react';
import type { MeritScore, FilterMode } from '@bpt/shared';

export function useFilter(scores: MeritScore[]) {
  const [mode, setMode] = useState<FilterMode>('ALL');

  const filtered = useMemo(() => {
    if (mode === 'TRADABLE') return scores.filter((s) => s.isTradable);
    if (mode === 'DECORR')   return scores.filter((s) => s.isDecorrelating);
    return scores;
  }, [scores, mode]);

  return { mode, setMode, filtered };
}
