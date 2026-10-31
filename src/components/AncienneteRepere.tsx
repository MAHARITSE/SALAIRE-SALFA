import React from 'react';
import { changementAncienneteDuMois } from '../local/calcul';

export const AncienneteBadge: React.FC<{ changement: NonNullable<ReturnType<typeof changementAncienneteDuMois>> }> = ({ changement: c }) => (
  <span className="inline-flex rounded-full bg-sky-800 text-white px-1.5 py-0.5 text-[9px] font-bold whitespace-nowrap" title={`Anniversaire d’ancienneté : ${c.avant} → ${c.annees} ans${c.changementPalier ? ` · Indice ×${c.indiceAvant.toFixed(2)} → ×${c.indice.toFixed(2)}` : ' · Même palier du barème'}. La prime saisie n’est pas modifiée automatiquement.`}>
    {c.changementPalier ? 'Nouveau palier' : 'Ancienneté +1 an'} · {c.annees} ans
  </span>
);

export const AncienneteLegende: React.FC<{ count?: number }> = ({ count }) => (
  <div className="no-print flex flex-wrap items-center gap-2 text-[11px] text-slate-700 dark:text-slate-200" role="note">
    <span aria-hidden="true" className="inline-block h-3.5 w-5 rounded border border-sky-500 bg-sky-300 dark:bg-sky-800" />
    <span>Bleu ciel : anniversaire d’ancienneté pendant le mois affiché{count !== undefined ? ` (${count})` : ''}. Le badge « Nouveau palier » signale un changement d’indice.</span>
    <span className="text-slate-500 dark:text-slate-400">En-têtes ↕ : tri croissant, décroissant, puis ordre initial.</span>
  </div>
);
