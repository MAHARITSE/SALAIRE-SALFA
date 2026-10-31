import React, { useState } from 'react';
import { nextSort, SortState, SortAccessors, sortTableRows } from '../local/tableSort';

export function useTableSort<T>(rows: T[], accessors: SortAccessors<T>) {
  const [state, setState] = useState<SortState>(null);
  return {
    rows: sortTableRows(rows, state, accessors),
    state,
    toggle: (key: string) => setState(current => nextSort(current, key)),
  };
}

type Props = React.ThHTMLAttributes<HTMLTableCellElement> & {
  sortable?: boolean;
  column: string;
  sort: { state: SortState; toggle: (key: string) => void };
};

export const SortableHeader: React.FC<Props> = ({ sortable = true, column, sort, children, className = '', title, ...props }) => {
  if (!sortable) return <th {...props} className={className} title={title}>{children}</th>;
  const active = sort.state?.key === column;
  const next = !active ? 'croissant' : sort.state?.direction === 'asc' ? 'décroissant' : 'initial';
  return (
    <th {...props} className={className} aria-sort={active ? (sort.state?.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => sort.toggle(column)} title={`${title ? title + ' · ' : ''}Trier : ordre ${next}`} className="inline-flex items-center gap-1 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 hover:underline" style={{ font: 'inherit', textTransform: 'inherit' }}>
        {children}<span aria-hidden="true" className={active ? 'font-black' : 'opacity-50'}>{active ? (sort.state?.direction === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  );
};
