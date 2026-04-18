import { useRealtimeScores } from '../hooks/useRealtimeScores.js';
import { useFilter } from '../hooks/useFilter.js';
import { FilterBar } from './FilterBar.js';
import { ScoreTable } from './ScoreTable.js';

export function Dashboard() {
  const { scores, loading } = useRealtimeScores();
  const { mode, setMode, filtered } = useFilter(scores);

  return (
    <div style={{ background: '#0d0d0d', minHeight: '100vh', color: '#eee', padding: 16 }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 20, fontFamily: 'monospace' }}>
        BPT — Stasis PM
      </h1>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: '#888', fontFamily: 'monospace' }}>
        {loading ? 'Loading...' : `${filtered.length} symbols`}
      </p>
      <FilterBar mode={mode} onChange={setMode} />
      {!loading && <ScoreTable data={filtered} />}
    </div>
  );
}
