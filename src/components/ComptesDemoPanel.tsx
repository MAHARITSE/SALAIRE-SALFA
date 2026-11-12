import React from 'react';
import { BookOpen } from 'lucide-react';
import type { CompteDemoLocal } from '../local/comptesDemo';

/** Bloc réservé à la démonstration locale ; absent de la version WAMP. */
export function ComptesDemoPanel({ comptes, onChoisir, disabled = false }: {
  comptes: CompteDemoLocal[];
  onChoisir: (compte: CompteDemoLocal) => void;
  disabled?: boolean;
}) {
  return (
    <section aria-labelledby="comptes-demo-title" className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-900/60">
      <h2 id="comptes-demo-title" className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />Comptes de démonstration
      </h2>
      <p className="text-xs leading-relaxed text-slate-600 sm:text-sm dark:text-slate-400">Cliquez un rôle pour remplir le formulaire, puis « Se connecter ».</p>
      <div className="grid gap-2">
        {comptes.map(compte => (
          <button key={compte.username} type="button" disabled={disabled} onClick={() => onChoisir(compte)} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs transition-colors hover:border-brand-300 hover:bg-brand-50/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-brand-500 dark:hover:bg-slate-700 sm:text-sm">
            <span className="font-semibold text-slate-700 dark:text-slate-200">{compte.role}</span>
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{compte.username} · {compte.password}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
