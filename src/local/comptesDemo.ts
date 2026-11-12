import { defaultUtilisateurs } from './users';
import { getStore, lireComptesPourSession } from './store';

export interface CompteDemoLocal {
  role: 'Administrateur' | 'Comptable';
  username: string;
  password: string;
}

// Uniquement les accès publics de la démonstration locale de PAIE SALFA.
// Aucun compte personnalisé ni mot de passe MySQL n'est lu ou affiché.
const COMPTES_DEMO: CompteDemoLocal[] = [
  { role: 'Administrateur', username: 'admin', password: 'admin123' },
  { role: 'Comptable', username: 'comptable', password: 'comptable123' },
];

/** N'afficher un accès de démonstration que s'il est encore actif et inchangé. */
export function listerComptesDemoLocaux(): CompteDemoLocal[] {
  getStore();
  const comptes = lireComptesPourSession();
  const defauts = defaultUtilisateurs();
  return COMPTES_DEMO.filter(demo => {
    const origine = defauts.find(c => c.username === demo.username)!;
    return comptes.some(c => String(c.username || '').trim().toLowerCase() === demo.username &&
      Number(c.actif) === 1 && c.role === demo.role && c.password_hash === origine.password_hash);
  }).map(c => ({ ...c }));
}
