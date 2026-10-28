import React from 'react';

export interface YearProps { annee: number; setAnnee: (annee: number) => void; }

/** Une période annuelle partagée, avec accès aux anciens et futurs exercices. */
export const YearSelect: React.FC<YearProps> = ({ annee, setAnnee }) => {
  const first = Math.min(2000, annee);
  const last = Math.max(new Date().getFullYear() + 10, annee);
  return <select aria-label="Année de paie" value={annee} onChange={e => setAnnee(Number(e.target.value))} className="rounded-lg border dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-bold">
    {Array.from({ length: last - first + 1 }, (_, i) => first + i).map(y => <option key={y} value={y}>{y}</option>)}
  </select>;
};
