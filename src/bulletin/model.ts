import { PaieMensuelle } from '../types';

export interface BulletinRow { libelle: string; gain?: number; retenue?: number; total?: boolean }
const n = (value: unknown) => Number(value) || 0;

/** Calcul du bulletin selon les formules de la feuille BULLETIN du classeur. */
export function construireBulletin(p: PaieMensuelle) {
  const base = n(p.base_aj) + n(p.logt_trsp) + n(p.rendement) + n(p.resp_repres);
  const gains = base + n(p.accessoir);
  const retenues = n(p.cnaps) + n(p.irsa) + n(p.avance) + n(p.med);
  const net = gains - retenues;
  const lignes: BulletinRow[] = [
    { libelle: 'Salaire de base', gain: n(p.base_aj) },
    { libelle: 'Indemnités de Transp et Logement', gain: n(p.logt_trsp) },
    { libelle: 'Indemnité de Rendement', gain: n(p.rendement) },
    { libelle: 'Indemnité de Responsabilité', gain: n(p.resp_repres) },
    { libelle: 'TOTAL', gain: base, total: true },
    { libelle: 'Cotisation CNaPS', retenue: n(p.cnaps) },
    { libelle: 'Retenue IRSA', retenue: n(p.irsa) },
    { libelle: 'Avance sur salaire / Prêt', retenue: n(p.avance) },
    { libelle: 'Médicament', retenue: n(p.med) },
    { libelle: 'Primes divers', gain: n(p.accessoir) },
    { libelle: 'TOTAL', gain: gains, retenue: retenues, total: true },
  ];
  return { lignes, gains, retenues, net, netEnregistre: n(p.net), ecartNet: Math.abs(net - n(p.net)) >= 0.005 };
}

const units = ['zéro','un','deux','trois','quatre','cinq','six','sept','huit','neuf','dix','onze','douze','treize','quatorze','quinze','seize'];
function under100(n: number): string {
  if (n <= 16) return units[n];
  if (n < 20) return `dix-${units[n - 10]}`;
  if (n < 70) {
    const d = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'][Math.floor(n / 10)];
    const u = n % 10;
    return d + (u === 1 ? ' et un' : u ? `-${units[u]}` : '');
  }
  if (n < 80) return n === 71 ? 'soixante et onze' : `soixante-${under100(n - 60)}`;
  return n === 80 ? 'quatre-vingts' : `quatre-vingt-${under100(n - 80)}`;
}
function under1000(n: number): string {
  if (n < 100) return under100(n);
  const hundreds = Math.floor(n / 100), rest = n % 100;
  return (hundreds === 1 ? 'cent' : `${units[hundreds]} cent${rest ? '' : 's'}`) + (rest ? ` ${under100(rest)}` : '');
}
function entierEnLettres(n: number): string {
  if (n < 1000) return under1000(n);
  if (n >= 1_000_000_000_000) return n.toLocaleString('fr-FR');
  const groups = [1_000_000_000, 1_000_000, 1000] as const;
  const names = ['milliard', 'million', 'mille'];
  const parts: string[] = [];
  for (let i = 0; i < groups.length; i++) {
    const count = Math.floor(n / groups[i]);
    if (!count) continue;
    n %= groups[i];
    const suffix = names[i] + (i < 2 && count > 1 ? 's' : '');
    parts.push(i === 2 && count === 1 ? 'mille' : `${under1000(count)} ${suffix}`);
  }
  if (n) parts.push(under1000(n));
  return parts.join(' ');
}

/** Montant affiché à deux décimales, comme sur le bulletin Excel. */
export function montantEnLettres(value: number): string {
  const cents = Math.round(Math.abs(value) * 100);
  const entier = Math.floor(cents / 100), fraction = cents % 100;
  return `${value < 0 ? 'moins ' : ''}${entierEnLettres(entier)} ariary${fraction ? ` et ${under100(fraction)} centime${fraction > 1 ? 's' : ''}` : ''}`;
}

export function formatMontant(value: number | null | undefined): string {
  return n(value).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDate(value: string): string {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : (value || '—');
}
