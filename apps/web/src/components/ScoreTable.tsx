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

const COLUMNS = [
  col.accessor('ticker',        { header: 'Ticker', size: 80 }),
  col.accessor('currentPrice',  { header: 'Price',  size: 90, cell: (i) => i.getValue()?.toFixed(2) ?? '—' }),
  col.accessor('tms',           { header: 'TMS',    size: 80, cell: (i) => i.getValue()?.toFixed(4) ?? '—' }),
  col.accessor('smsTotal',      { header: 'SMS',    size: 70, cell: (i) => i.getValue()?.toFixed(4) ?? '—' }),
  col.accessor('fmsTotal',      { header: 'FMS',    size: 70, cell: (i) => i.getValue()?.toFixed(4) ?? '—' }),
  col.accessor('cmsTotal',      { header: 'CMS',    size: 70, cell: (i) => i.getValue()?.toFixed(4) ?? '—' }),
  col.accessor((r) => r.sms.stasisCount, { id: 'stasisCount', header: 'Stasis#', size: 75 }),
  col.accessor((r) => r.sms.riskReward,  { id: 'riskReward',  header: 'R/R',     size: 60, cell: (i) => i.getValue()?.toFixed(4) ?? '—' }),
  col.accessor((r) => r.cms.decorrelationMagnitude, { id: 'decorrelMag', header: 'Decorr', size: 80, cell: (i) => i.getValue()?.toFixed(6) ?? '—' }),
  col.accessor((r) => r.cms.directionAlignment,     { id: 'dirAlign',    header: 'Dir',    size: 50, cell: (i) => i.getValue() === 1 ? '▲' : i.getValue() === -1 ? '▼' : '—' }),
  col.accessor('price52wPct',   { header: '52w%',   size: 65, cell: (i) => i.getValue() !== null ? `${((i.getValue() as number) * 100).toFixed(1)}%` : '—' }),
  col.accessor((r) => r.fms.netIncomeScore,    { id: 'netIncome',    header: 'NI',       size: 60, cell: (i) => i.getValue()?.toFixed(2) ?? '—' }),
  col.accessor((r) => r.fms.cashFlowScore,     { id: 'cashFlow',     header: 'CF',       size: 60, cell: (i) => i.getValue()?.toFixed(2) ?? '—' }),
  col.accessor((r) => r.fms.revenueTrendScore, { id: 'revTrend',     header: 'RevTrend', size: 80, cell: (i) => i.getValue()?.toFixed(4) ?? '—' }),
  col.accessor('isDecorrelating', { header: 'Decorr?', size: 70, cell: (i) => i.getValue() ? 'YES' : '' }),
  col.accessor('isStasisActive',  { header: 'Stasis?', size: 70, cell: (i) => i.getValue() ? 'YES' : '' }),
  col.accessor('isTradable',      { header: 'Trade?',  size: 65, cell: (i) => i.getValue() ? '✓' : '' }),
  col.accessor('lastSignalAt',    { header: 'Signal At', size: 140, cell: (i) => i.getValue() ? new Date(i.getValue() as string).toLocaleTimeString() : '—' }),
];

function cellBg(row: MeritScore): string {
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
            <tr key={hg.id} style={{ background: '#111', color: '#eee' }}>
              {hg.headers.map((h) => (
                <th
                  key={h.id}
                  style={{ padding: '4px 8px', textAlign: 'left', cursor: h.column.getCanSort() ? 'pointer' : 'default', userSelect: 'none', width: h.getSize() }}
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
            <tr key={row.id} style={{ background: cellBg(row.original), borderBottom: '1px solid #222' }}>
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} style={{ padding: '3px 8px', color: '#ddd' }}>
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
