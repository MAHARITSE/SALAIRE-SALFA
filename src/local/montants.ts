// =============================================================================
// AFFICHAGE COMPTABLE DES MONTANTS — SALFA
// Les valeurs restent numériques en base ; seul l'affichage change :
//   * montant nul ou absent : « - »
//   * montant non nul : format français à deux décimales
// Les cellules de montant doivent utiliser la classe CSS `money-cell`
// (alignement à droite, chiffres tabulaires) ou `text-right font-mono`.
// =============================================================================

export const TIRET_MONTANT = '-';

export function estMontantNul(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return true;
  const n = Number(value);
  return !Number.isFinite(n) || Math.abs(n) < 0.005;
}

export interface OptionsFormatMontant {
  /** Ajoute « Ar » après le montant non nul. */
  unite?: boolean;
  /** Nombre de décimales (2 par défaut). */
  decimales?: number;
}

/** Format d'affichage : « - » pour zéro, sinon « 1 234,56 » (ou « 1 234,56 Ar »). */
export function formatMontant(value: unknown, options: OptionsFormatMontant = {}): string {
  if (estMontantNul(value)) return TIRET_MONTANT;
  const n = Number(value);
  const decimales = options.decimales ?? 2;
  const texte = n.toLocaleString('fr-FR', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
  return options.unite ? `${texte} Ar` : texte;
}

/** Valeur affichée dans un champ de saisie non actif : « - » si zéro. */
export function formatMontantSaisie(value: unknown): string {
  return estMontantNul(value) ? TIRET_MONTANT : formatMontant(value);
}

/** Valeur éditable brute (vide si zéro) pour faciliter la saisie. */
export function formatMontantEdition(value: unknown): string {
  if (estMontantNul(value)) return '';
  return String(Number(value)).replace('.', ',');
}

/** Parse une saisie française ; « - » ou vide = 0. */
export function parseMontantSaisie(raw: string): number {
  const cleaned = String(raw ?? '').replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.max(0, Math.round(n * 100) / 100) : 0;
}

/** Format Excel : zéro affiché « - », montants alignés à droite par défaut. */
export const FORMAT_EXCEL_MONTANT = '#,##0.00;[Red]-#,##0.00;"-"';
