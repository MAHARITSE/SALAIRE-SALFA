export type SortValue = string | number | null | undefined;
export type SortState = { key: string; direction: 'asc' | 'desc' } | null;
export type SortAccessors<T> = Record<string, (row: T) => SortValue>;

const collator = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });

export function nextSort(current: SortState, key: string): SortState {
  if (current?.key !== key) return { key, direction: 'asc' };
  return current.direction === 'asc' ? { key, direction: 'desc' } : null;
}

/** Tri stable sur les valeurs brutes, sans modifier les données métier. */
export function sortTableRows<T>(rows: T[], sort: SortState, accessors: SortAccessors<T>): T[] {
  const value = sort && accessors[sort.key];
  if (!sort || !value) return rows;
  const direction = sort.direction === 'asc' ? 1 : -1;
  return rows.map((row, index) => ({ row, index })).sort((a, b) => {
    const av = value(a.row), bv = value(b.row);
    const emptyA = av === null || av === undefined || av === '' || (typeof av === 'number' && !Number.isFinite(av));
    const emptyB = bv === null || bv === undefined || bv === '' || (typeof bv === 'number' && !Number.isFinite(bv));
    // Valeurs absentes toujours en fin de tableau, dans les deux sens.
    if (emptyA || emptyB) return emptyA === emptyB ? a.index - b.index : emptyA ? 1 : -1;
    const compared = typeof av === 'number' && typeof bv === 'number' ? av - bv : collator.compare(String(av), String(bv));
    return direction * compared || a.index - b.index;
  }).map(({ row }) => row);
}

/** Clé chronologique pour les dates ISO ou JJ/MM/AAAA, jamais sur le texte affiché. */
export function dateSortValue(date: string | null | undefined): string | null {
  const text = String(date || '').trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  const fr = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (!iso && !fr) return null;
  return iso ? `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}` : `${fr![3]}-${fr![2].padStart(2, '0')}-${fr![1].padStart(2, '0')}`;
}
