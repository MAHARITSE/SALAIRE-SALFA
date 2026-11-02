import { PaieMensuelle } from '../types';
import { formatMontant as formatMontantComptable } from '../local/montants';

export interface BulletinRow { libelle: string; gain?: number; retenue?: number; total?: boolean }

/** Nombre d’exemplaires imprimés côte à côte sur une page A4 paysage. */
export const NB_EXEMPLAIRES_BULLETIN = 2;

export interface BulletinOptions {
  /** Déduire ou non l'avance sur salaire / prêt de l'état individuel (défaut : true). */
  deduireAvance?: boolean;
  /** Déduire ou non les médicaments de l'état individuel (défaut : true). */
  deduireMed?: boolean;
}

const n = (value: unknown) => Number(value) || 0;

/** Salariés à inscrire sur la décharge : montant réellement payé en espèces strictement supérieur au seuil. */
export function selectionnerPaiesDecharge(paies: PaieMensuelle[], seuil = 5000): PaieMensuelle[] {
  return [...(paies || [])]
    .filter((paie) => Number(paie.especes || 0) > seuil)
    .sort((a, b) => Number(a.numero_matricule) - Number(b.numero_matricule));
}

export function paginerPaiesDecharge(paies: PaieMensuelle[], seuil = 5000, lignesParPage = 24): PaieMensuelle[][] {
  const eligibles = selectionnerPaiesDecharge(paies, seuil);
  if (!eligibles.length) return [[]];
  const taille = Math.max(1, Math.floor(lignesParPage) || 24);
  const pages: PaieMensuelle[][] = [];
  for (let i = 0; i < eligibles.length; i += taille) {
    pages.push(eligibles.slice(i, i + taille));
  }
  return pages;
}

/** Calcul du bulletin selon les formules de la feuille BULLETIN du classeur (avec choix optionnel de déduction Avance / Médicament). */
export function construireBulletin(p: PaieMensuelle, options?: BulletinOptions) {
  const deduireAvance = options?.deduireAvance !== false;
  const deduireMed = options?.deduireMed !== false;

  const base = n(p.base_aj) + n(p.logt_trsp) + n(p.rendement) + n(p.resp_repres);
  const gains = base + n(p.accessoir);
  const avance = deduireAvance ? n(p.avance) : 0;
  const med = deduireMed ? n(p.med) : 0;
  const retenues = n(p.cnaps) + n(p.irsa) + avance + med;
  const net = gains - retenues;

  const montantNonDeduit = (deduireAvance ? 0 : n(p.avance)) + (deduireMed ? 0 : n(p.med));
  let virement = n(p.virement);
  let especes = n(p.especes);
  if (montantNonDeduit > 0) {
    const netArrondiEtat = Math.floor(Math.max(0, net) / 100) * 100;
    const totalReglementInitial = n(p.virement) + n(p.especes);
    const baseRef = totalReglementInitial > 0 ? totalReglementInitial : n(p.net);
    const deltaReglement = Math.max(0, netArrondiEtat - baseRef);
    if (deltaReglement > 0) {
      if (n(p.virement) > 0) {
        virement = n(p.virement) + deltaReglement;
      } else {
        especes = n(p.especes) + deltaReglement;
      }
    }
  }

  const lignes: BulletinRow[] = [
    { libelle: 'Salaire de base', gain: n(p.base_aj) },
    { libelle: 'Indemnités de Transp et Logement', gain: n(p.logt_trsp) },
    { libelle: 'Indemnité de Rendement', gain: n(p.rendement) },
    { libelle: 'Indemnité de Responsabilité', gain: n(p.resp_repres) },
    { libelle: 'TOTAL', gain: base, total: true },
    { libelle: 'Cotisation CNaPS', retenue: n(p.cnaps) },
    { libelle: 'Retenue IRSA', retenue: n(p.irsa) },
    { libelle: 'Avance sur salaire / Prêt', retenue: avance },
    { libelle: 'Medicament', retenue: med },
    { libelle: 'Primes divers', gain: n(p.accessoir) },
    { libelle: 'TOTAL', gain: gains, retenue: retenues, total: true },
  ];
  return {
    lignes,
    base,
    gains,
    retenues,
    avance,
    med,
    net,
    virement,
    especes,
    deduireAvance,
    deduireMed,
    netEnregistre: n(p.net),
    ecartNet: Math.abs(net - n(p.net)) >= 0.005,
  };
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

/** Montant affiché à deux décimales (forme minuscule standard). */
export function montantEnLettres(value: number): string {
  const cents = Math.round(Math.abs(value) * 100);
  const entier = Math.floor(cents / 100), fraction = cents % 100;
  return `${value < 0 ? 'moins ' : ''}${entierEnLettres(entier)} ariary${fraction ? ` et ${under100(fraction)} centime${fraction > 1 ? 's' : ''}` : ''}`;
}

function capitaliserMots(texte: string): string {
  return texte.replace(/(^|[\s-])([a-zàâäéèêëîïôöùûüç])/g, (_m, sep, ch) => sep + ch.toUpperCase());
}

/**
 * Montant en lettres exactement tel qu'affiché par la formule de la cellule B31
 * de la feuille BULLETIN Excel (« Quatre Cents Mille Trente-Cinq Ariary Quatre-Vingt-Quatre »).
 */
export function montantEnLettresBulletin(value: number): string {
  const cents = Math.round(Math.abs(value) * 100);
  const entier = Math.floor(cents / 100);
  const fraction = cents % 100;
  const debut = value < 0 ? 'moins ' : '';
  const corps = `${debut}${entierEnLettres(entier)} ariary${fraction ? ` ${under100(fraction)}` : ''}`;
  return capitaliserMots(corps);
}

export function formatMontant(value: number | null | undefined): string {
  return formatMontantComptable(value);
}

/** Format comptable Excel des rubriques : « - » lorsque le montant vaut zéro. */
export function formatMontantBulletin(value: number | null | undefined): string {
  const val = n(value);
  if (Math.abs(val) < 0.005) return '-';
  return formatMontant(val);
}

export function formatDate(value: string): string {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : (value || '—');
}

const MOIS_ABBR_FR = [
  'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
];

/** Format Excel `[$-40C]mmm\-yy` de la ligne Embauche du bulletin (ex. `janv.-92`). */
export function formatEmbaucheBulletin(value: string | undefined | null): string {
  const s = String(value || '').trim();
  if (!s) return '—';
  let y = 0;
  let m = 0;
  const iso = s.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  if (iso) {
    y = parseInt(iso[1], 10);
    m = parseInt(iso[2], 10);
  } else {
    const fr = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (fr) {
      m = parseInt(fr[2], 10);
      y = parseInt(fr[3], 10);
      if (y < 100) y += y >= 50 ? 1900 : 2000;
    }
  }
  if (m >= 1 && m <= 12 && y >= 1900) {
    const yy = String(y % 100).padStart(2, '0');
    return `${MOIS_ABBR_FR[m - 1]}-${yy}`;
  }
  return s;
}

/** Format numérique espacé de la cellule N° CNaPS sur le bulletin (ex. `863 892`). */
export function formatCnapsBulletin(value: string | number | undefined | null): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '—';
  const digits = raw.replace(/\s+/g, '');
  if (/^\d+$/.test(digits)) {
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }
  return raw;
}

/** Format du nombre de congés restants affiché sur le bulletin (« NB CONGES RESTANTS: 85 jrs »). */
export function formatCongesRestantsBulletin(value: number | undefined | null): string {
  if (value === undefined || value === null || !Number.isFinite(Number(value))) {
    return '........';
  }
  return (Math.round(Number(value) * 100) / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
}
