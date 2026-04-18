import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table';
import { useState } from 'react';
import type { MeritScore } from '@bpt/shared';

const col = createColumnHelper<MeritScore>();

// ── Formatters ──────────────────────────────────────────────────────────────
const fmt2   = (v: number | null | undefined) => v != null ? v.toFixed(2)  : '—';
const fmt4   = (v: number | null | undefined) => v != null ? v.toFixed(4)  : '—';
const fmtCorr  = (v: number | null | undefined) => v != null ? v.toFixed(3)  : '—';
const fmtSlope = (v: number | null | undefined) => v != null ? v.toFixed(4)  : '—';
const fmtPct   = (v: number | null | undefined) => v != null ? `${(v * 100).toFixed(1)}%` : '—';
const fmtBand  = (v: number | null | undefined) => v != null ? `${(v * 100).toFixed(3)}%` : '—';
const fmtPrice = (v: number | null | undefined) => v != null ? v.toFixed(2)  : '—';
const fmt52w   = (v: number | null | undefined) => v != null ? `${v.toFixed(1)}%` : '—';

// Column order matches app.py dashboard:
// ✓ SYM BAND STS DIR SMS FMS CMS TMS C@E C@N ΔCOR DCOR DIV REV5 FCF5 FCFY 52W PRICE TP SL R:R DUR
const COLUMNS = [
  col.accessor('isTradable',    { header: '✓',    size: 24,  cell: (i) => i.getValue() ? '✓' : '' }),
  col.accessor('ticker',        { header: 'SYM',  size: 72 }),
  col.accessor('bandThreshold', { header: 'BAND', size: 72,  cell: (i) => fmtBand(i.getValue()) }),
  col.accessor('smsStasisCount',{ header: 'STS',  size: 48 }),
  col.accessor('direction',     { header: 'DIR',  size: 56,  cell: (i) => {
    const v = i.getValue();
    if (v === 'LONG')  return <span style={{ color: '#4caf50' }}>LONG</span>;
    if (v === 'SHORT') return <span style={{ color: '#f44336' }}>SHORT</span>;
    return '—';
  }}),
  col.accessor('smsTotal', { header: 'SMS', size: 48, cell: (i) => fmt4(i.getValue()) }),
  col.accessor('fmsTotal', { header: 'FMS', size: 48, cell: (i) => fmt4(i.getValue()) }),
  col.accessor('cmsTotal', { header: 'CMS', size: 48, cell: (i) => fmt4(i.getValue()) }),
  col.accessor('tms',      { header: 'TMS', size: 56, cell: (i) => fmt4(i.getValue()) }),

  col.accessor('corrAtEarnings', { header: 'C@E',  size: 64, cell: (i) => fmtCorr(i.getValue()) }),
  col.accessor('corrNow',        { header: 'C@N',  size: 64, cell: (i) => fmtCorr(i.getValue()) }),
  col.accessor('corrDelta',      { header: 'ΔCOR', size: 64, cell: (i) => {
    const v = i.getValue();
    if (v == null) return '—';
    const s = fmtCorr(v);
    return <span style={{ color: v < 0 ? '#4caf50' : '#f44336' }}>{s}</span>;
  }}),
  col.accessor('decorrScore', { header: 'DCOR', size: 56, cell: (i) => fmtCorr(i.getValue()) }),
  col.accessor('divergence',  { header: 'DIV',  size: 88, cell: (i) => {
    const v = i.getValue();
    if (v === 'PRICE_AHEAD')  return <span style={{ color: '#ff9800' }}>AHEAD</span>;
    if (v === 'PRICE_BEHIND') return <span style={{ color: '#2196f3' }}>BEHIND</span>;
    return '—';
  }}),

  col.accessor('revSlope5', { header: 'REV5', size: 64, cell: (i) => fmtSlope(i.getValue()) }),
  col.accessor('fcfSlope5', { header: 'FCF5', size: 64, cell: (i) => fmtSlope(i.getValue()) }),
  col.accessor('fcfy',      { header: 'FCFY', size: 64, cell: (i) => fmtPct(i.getValue()) }),

  col.accessor('price52wPct',  { header: '52W',   size: 56, cell: (i) => fmt52w(i.getValue()) }),
  col.accessor('currentPrice', { header: 'PRICE', size: 80, cell: (i) => fmtPrice(i.getValue()) }),
  col.accessor('takeProfit',   { header: 'TP',    size: 72, cell: (i) => fmtPrice(i.getValue()) }),
  col.accessor('stopLoss',     { header: 'SL',    size: 72, cell: (i) => fmtPrice(i.getValue()) }),
  col.accessor('smsRiskReward',{ header: 'R:R',   size: 56, cell: (i) => fmt2(i.getValue()) }),
  col.accessor('durationStr',  { header: 'DUR',   size: 72, cell: (i) => i.getValue() ?? '—' }),
];

function rowBg(row: MeritScore): string {
  if (row.isDecorrelating && row.isStasisActive) return '#1a2e1a';
  if (row.isDecorrelating) return '#1a1a2e';
  if (row.isStasisActive)  return '#2e1a1a';
  return 'transparent';
}

interface Props { data: MeritScore[] }

export function ScoreTable({ data }: Props) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'tms', desc: true }]);

  const table = useReactTable({
    data,
    columns: COLUMNS,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div style={{ overflowX: 'auto', fontFamily: 'monospace', fontSize: 12 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} style={{ background: '#111', color: '#aaa' }}>
              {hg.headers.map((h) => (
                <th
                  key={h.id}
                  style={{
                    padding: '4px 6px',
                    textAlign: 'left',
                    cursor: h.column.getCanSort() ? 'pointer' : 'default',
                    userSelect: 'none',
                    width: h.getSize(),
                    whiteSpace: 'nowrap',
                    borderBottom: '1px solid #333',
                  }}
                  onClick={h.column.getToggleSortingHandler()}
                >
                  {flexRender(h.column.columnDef.header, h.getContext())}
                  {h.column.getIsSorted() === 'asc' ? ' ▲' : h.column.getIsSorted() === 'desc' ? ' ▼' : ''}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              style={{ background: rowBg(row.original), borderBottom: '1px solid #1a1a1a' }}
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} style={{ padding: '3px 6px', color: '#ddd', whiteSpace: 'nowrap' }}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
