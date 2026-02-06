'use client';

import { Table, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { QueryResult } from '@/types';

interface DataPreviewProps {
  queryResult: QueryResult | null;
}

export function DataPreview({ queryResult }: DataPreviewProps) {
  const downloadCSV = () => {
    if (!queryResult) return;

    const headers = queryResult.columns.join(',');
    const rows = queryResult.rows
      .map((row) =>
        queryResult.columns
          .map((col) => {
            const value = row[col];
            if (value === null || value === undefined) return '';
            if (typeof value === 'string' && value.includes(',')) {
              return `"${value}"`;
            }
            return String(value);
          })
          .join(',')
      )
      .join('\n');

    const csv = `${headers}\n${rows}`;
    const bom = '\uFEFF';
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `query-result-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!queryResult) {
    return (
      <div className="h-full rounded-xl bg-white border border-gray-200 flex items-center justify-center card-shadow">
        <div className="text-center">
          <div className="w-14 h-14 mx-auto mb-3 rounded-xl bg-gray-100 flex items-center justify-center">
            <Table className="w-6 h-6 text-gray-400" />
          </div>
          <p className="text-gray-600 font-medium text-sm">쿼리 결과가 여기에 표시됩니다</p>
          <p className="text-gray-400 text-xs mt-1">SQL 쿼리를 실행해보세요</p>
        </div>
      </div>
    );
  }

  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        return value.toLocaleString('ko-KR');
      }
      return value.toLocaleString('ko-KR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    }
    return String(value);
  };

  return (
    <div className="h-full rounded-xl bg-white border border-gray-200 flex flex-col overflow-hidden card-shadow">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-gray-900 flex items-center justify-center">
            <Table className="w-3.5 h-3.5 text-white" />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900 text-sm">쿼리 결과</span>
            <span className="text-gray-400 text-xs">
              {queryResult.rowCount}개 행 · {queryResult.executionTime}ms
            </span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={downloadCSV}
          className="text-gray-500 hover:text-gray-900 hover:bg-gray-100 h-8 text-xs"
        >
          <Download className="w-3.5 h-3.5 mr-1" />
          CSV
        </Button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-50 border-b border-gray-100">
              {queryResult.columns.map((col) => (
                <th
                  key={col}
                  className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {queryResult.rows.map((row, idx) => (
              <tr
                key={idx}
                className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors"
              >
                {queryResult.columns.map((col) => (
                  <td
                    key={col}
                    className="px-4 py-2.5 text-gray-700 whitespace-nowrap"
                  >
                    {formatValue(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
