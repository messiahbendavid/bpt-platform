import type { FilterMode } from '@bpt/shared';

interface Props {
  mode: FilterMode;
  onChange: (mode: FilterMode) => void;
}

const MODES: FilterMode[] = ['ALL', 'TRADABLE', 'DECORR'];

export function FilterBar({ mode, onChange }: Props) {
  return (
    <div style={{ display: 'flex', gap: 8, padding: '8px 0' }}>
      {MODES.map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          style={{
            padding: '4px 16px',
            fontWeight: mode === m ? 700 : 400,
            background: mode === m ? '#1a1a2e' : '#e0e0e0',
            color: mode === m ? '#fff' : '#333',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          {m}
        </button>
      ))}
    </div>
  );
}
