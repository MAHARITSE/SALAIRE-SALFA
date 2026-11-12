import React from 'react';
import type { AppTab } from '../local/roles';

interface ApplicationHeaderProps {
  navigation: React.ReactNode;
  actions?: React.ReactNode;
}

/** Navigation conservée, sans l'ancien bandeau identité/profil. */
export function ApplicationHeader({ navigation, actions }: ApplicationHeaderProps) {
  const maintenant = new Date();
  const dateIso = `${maintenant.getFullYear()}-${String(maintenant.getMonth() + 1).padStart(2, '0')}-${String(maintenant.getDate()).padStart(2, '0')}`;
  return (
    <header className="caisse-header sticky top-0 z-40 no-print">
      <div className="caisse-navigation-row">
        {navigation}
        {actions}
        <time className="caisse-date hidden lg:block" dateTime={dateIso}>
          {maintenant.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
        </time>
      </div>
    </header>
  );
}

const PAGES: Record<AppTab, { titre: string; description: string }> = {
  salaries: { titre: 'Salariés & état de paie', description: 'Retrouvez votre personnel, préparez la paie et suivez chaque période.' },
  bulletins: { titre: 'Bulletins de paie', description: 'Consultez, imprimez et exportez les bulletins de vos salariés.' },
  rapports: { titre: 'Rapports & exports', description: 'Analysez vos états de paie et retrouvez vos données par période.' },
  conges: { titre: 'Congés & permissions', description: 'Suivez les absences, les droits et les soldes de votre personnel.' },
};

export function PageHeading({ onglet }: { onglet: AppTab }) {
  const page = PAGES[onglet];
  return (
    <section className="caisse-page-heading no-print" aria-labelledby="titre-page">
      <p className="caisse-eyebrow mb-1.5">Personnel & ressources humaines</p>
      <h1 id="titre-page" className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{page.titre}</h1>
      <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">{page.description}</p>
    </section>
  );
}
