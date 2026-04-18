import type { MeritScore } from '@bpt/shared';

interface MetricDef {
  key: string;
  label: string;
  tier: 1 | 2 | 3;
  invert: boolean;
}

const METRICS: MetricDef[] = [
  { key: 'rev',     label: 'Revenue',            tier: 1, invert: false },
  { key: 'ni',      label: 'Net Income',          tier: 1, invert: false },
  { key: 'ocf',     label: 'Oper. Cash Flow',     tier: 1, invert: false },
  { key: 'fcf',     label: 'Free Cash Flow',      tier: 1, invert: false },
  { key: 'fcfy',    label: 'FCF Yield',            tier: 1, invert: false },
  { key: 'oi',      label: 'Oper. Income',         tier: 2, invert: false },
  { key: 'gp',      label: 'Gross Profit',         tier: 2, invert: false },
  { key: 'npm',     label: 'Net Profit Margin',    tier: 2, invert: false },
  { key: 'roe',     label: 'Return on Equity',     tier: 2, invert: false },
  { key: 'gm',      label: 'Gross Margin',         tier: 2, invert: false },
  { key: 'om',      label: 'Oper. Margin',         tier: 2, invert: false },
  { key: 'buyback', label: 'Share Repurchases',    tier: 2, invert: false },
  { key: 'cash',    label: 'Cash & Equivalents',   tier: 2, invert: false },
  { key: 'pe',      label: 'P/E Ratio ↓',          tier: 3, invert: true  },
  { key: 'de',      label: 'Debt / Equity ↓',      tier: 3, invert: true  },
  { key: 'pb',      label: 'Price / Book ↓',       tier: 3, invert: true  },
  { key: 'ps',      label: 'Price / Sales ↓',      tier: 3, invert: true  },
  { key: 'assets',  label: 'Total Assets',         tier: 3, invert: false },
  { key: 'equity',  label: 'Total Equity',         tier: 3, invert: false },
  { key: 'liab',    label: 'Total Liabilities ↓',  tier: 3, invert: true  },
];

const TIER_WEIGHT: Record<number, number> = { 1: 3, 2: 2, 3: 1 };
const SHORT_WEIGHT = 1.1;
const LONG_WEIGHT  = 1.0;
const TIER_COLOR: Record<number, string> = { 1: '#4caf50', 2: '#2196f3', 3: '#9c27b0' };

function rankColor(v: number | null | undefined): string {
  if (v == null) return '#555';
  if (v >= 0.8) return '#4caf50';
  if (v >= 0.6) return '#8bc34a';
  if (v >= 0.4) return '#ffc107';
  if (v >= 0.2) return '#ff9800';
  return '#f44336';
}

function fmtRank(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

function fmtContrib(v: number | null | undefined, tierW: number, tfW: number): string {
  if (v == null) return '—';
  return (v * tierW * tfW).toFixed(3);
}

interface Props {
  row: MeritScore;
  onClose: () => void;
}

export function FMSBreakdown({ row, onClose }: Props) {
  const ranks = row.fmsRanks;
  const w52Pct = row.price52wPct;
  const w52Mult = w52Pct !== null ? 1.0 + 1.5 * (1 - w52Pct / 100) : 1.25;

  // Compute totals for footer
  let weightedSum = 0;
  let totalWeight = 0;
  for (const m of METRICS) {
    const tierW = TIER_WEIGHT[m.tier];
    const sRank = ranks?.[`${m.key}_short`] ?? null;
    const lRank = ranks?.[`${m.key}_long`]  ?? null;
    if (sRank !== null) { weightedSum += sRank * tierW * SHORT_WEIGHT; totalWeight += tierW * SHORT_WEIGHT; }
    if (lRank !== null) { weightedSum += lRank * tierW * LONG_WEIGHT;  totalWeight += tierW * LONG_WEIGHT; }
  }
  const rawScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

  const th: React.CSSProperties = {
    padding: '4px 8px', background: '#111', color: '#aaa',
    borderBottom: '1px solid #333', whiteSpace: 'nowrap', textAlign: 'left',
  };
  const td: React.CSSProperties = {
    padding: '3px 8px', whiteSpace: 'nowrap',
  };

  return (
    <div style={{
      background: '#0d0d0d', border: '1px solid #333', borderRadius: 4,
      fontFamily: 'monospace', fontSize: 12, marginTop: 12,
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 12px', borderBottom: '1px solid #333',
      }}>
        <span style={{ color: '#fff', fontSize: 14 }}>
          FMS Breakdown — <strong>{row.ticker}</strong>
          <span style={{ color: '#aaa', marginLeft: 12, fontSize: 12 }}>
            raw={fmtRank(rawScore)} × 52W×{w52Mult.toFixed(2)} × 8 ={' '}
            <strong style={{ color: '#4caf50' }}>{row.fmsTotal.toFixed(1)}</strong>
          </span>
          {w52Pct !== null && (
            <span style={{ color: '#888', marginLeft: 12 }}>
              (52W pct: {w52Pct.toFixed(1)}%)
            </span>
          )}
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: '1px solid #555', color: '#aaa',
            cursor: 'pointer', padding: '2px 8px', fontFamily: 'monospace',
          }}
        >✕</button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={th}>Metric</th>
              <th style={{ ...th, color: TIER_COLOR[1] }}>Tier</th>
              <th style={th}>Short Rank</th>
              <th style={th}>Short Contrib</th>
              <th style={th}>Long Rank</th>
              <th style={th}>Long Contrib</th>
              <th style={th}>Row Sum</th>
            </tr>
          </thead>
          <tbody>
            {METRICS.map((m) => {
              const tierW = TIER_WEIGHT[m.tier];
              const sRank = ranks?.[`${m.key}_short`] ?? null;
              const lRank = ranks?.[`${m.key}_long`]  ?? null;
              const sContrib = sRank !== null ? sRank * tierW * SHORT_WEIGHT : null;
              const lContrib = lRank !== null ? lRank * tierW * LONG_WEIGHT  : null;
              const rowSum   = (sContrib ?? 0) + (lContrib ?? 0);
              const hasData  = sRank !== null || lRank !== null;

              return (
                <tr key={m.key} style={{ borderBottom: '1px solid #1a1a1a' }}>
                  <td style={{ ...td, color: '#ddd' }}>{m.label}</td>
                  <td style={{ ...td, color: TIER_COLOR[m.tier] }}>T{m.tier}</td>
                  <td style={{ ...td, color: rankColor(sRank) }}>{fmtRank(sRank)}</td>
                  <td style={{ ...td, color: '#aaa' }}>{fmtContrib(sRank, tierW, SHORT_WEIGHT)}</td>
                  <td style={{ ...td, color: rankColor(lRank) }}>{fmtRank(lRank)}</td>
                  <td style={{ ...td, color: '#aaa' }}>{fmtContrib(lRank, tierW, LONG_WEIGHT)}</td>
                  <td style={{ ...td, color: hasData ? '#fff' : '#555' }}>
                    {hasData ? rowSum.toFixed(3) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid #444' }}>
              <td colSpan={6} style={{ ...td, color: '#aaa', textAlign: 'right' }}>
                Weighted sum / total weight = raw score:
              </td>
              <td style={{ ...td, color: '#fff', fontWeight: 'bold' }}>
                {fmtRank(rawScore)}
              </td>
            </tr>
            <tr>
              <td colSpan={6} style={{ ...td, color: '#aaa', textAlign: 'right' }}>
                × 52W multiplier ({w52Mult.toFixed(2)}×) × scale (8) =
              </td>
              <td style={{ ...td, color: '#4caf50', fontWeight: 'bold' }}>
                {row.fmsTotal.toFixed(1)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
