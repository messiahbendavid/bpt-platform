import { useState } from 'react';
import { useRealtimeScores } from '../hooks/useRealtimeScores.js';
import { useFilter } from '../hooks/useFilter.js';
import { FilterBar } from './FilterBar.js';
import { ScoreTable } from './ScoreTable.js';
import { FMSBreakdown } from './FMSBreakdown.js';
import type { MeritScore } from '@bpt/shared';

export function Dashboard() {
  const { scores, loading } = useRealtimeScores();
  const { mode, setMode, filtered } = useFilter(scores);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);

  const selectedRow: MeritScore | null =
    selectedTicker ? (filtered.find((s) => s.ticker === selectedTicker) ?? null) : null;

  function handleRowClick(ticker: string) {
    setSelectedTicker((prev) => (prev === ticker ? null : ticker));
  }

  return (
    <div style={{ background: '#0d0d0d', minHeight: '100vh', color: '#eee', padding: 16 }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 20, fontFamily: 'monospace' }}>
        BPT — Stasis PM
      </h1>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: '#888', fontFamily: 'monospace' }}>
        {loading ? 'Loading...' : `${filtered.length} symbols — click any row to see FMS breakdown`}
      </p>
      <FilterBar mode={mode} onChange={setMode} />
      {!loading && (
        <ScoreTable
          data={filtered}
          selectedTicker={selectedTicker}
          onRowClick={handleRowClick}
        />
      )}
      {selectedRow && (
        <FMSBreakdown
          row={selectedRow}
          onClose={() => setSelectedTicker(null)}
        />
      )}
    </div>
  );
}
