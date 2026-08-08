// ==============================================================================
// CLIENT LOCAL : MOTEUR DE CALCUL DE PAIE - SALFA TANAMBAO (TYPESCRIPT)
// Porté depuis server/calcul.ts pour tourner à 100% dans le navigateur.
// ==============================================================================

import { loadConfig } from './config';

export interface BaremeAnciennete {
  min: number;
  max: number;
  indice: number;
}

export const BAREME_ANCIENNETE_SALFA: BaremeAnciennete[] = [
  { min: 0, max: 1, indice: 1.00 },
  { min: 2, max: 3, indice: 1.09 },
  { min: 4, max: 5, indice: 1.18 },
  { min: 6, max: 7, indice: 1.27 },
  { min: 8, max: 9, indice: 1.36 },
  { min: 10, max: 11, indice: 1.45 },
  { min: 12, max: 13, indice: 1.53 },
  { min: 14, max: 15, indice: 1.60 },
  { min: 16, max: 17, indice: 1.65 },
  { min: 18, max: 19, indice: 1.68 },
  { min: 20, max: 100, indice: 1.70 }
];

export function calculerAnciennete(dateEmbauche: string, anneeRef: number = 2026): number {
  if (!dateEmbauche) return 0;
  try {
    let y = 0;
    if (dateEmbauche.includes('-')) {
      y = parseInt(dateEmbauche.split('-')[0], 10);
    } else if (dateEmbauche.includes('/')) {
      const parts = dateEmbauche.split('/');
      y = parseInt(parts[2] || parts[0], 10);
    }
    if (y > 1900 && y <= anneeRef) {
      return Math.max(0, anneeRef - y);
    }
  } catch {
    // ignore
  }
  return 0;
}

const MOIS_INDEX: Record<string, number> = {
  JANVIER: 0, FEVRIER: 1, MARS: 2, AVRIL: 3, MAI: 4, JUIN: 5,
  JUILLET: 6, AOUT: 7, SEPTEMBRE: 8, OCTOBRE: 9, NOVEMBRE: 10, DECEMBRE: 11,
};

export function moisToIndex(mois: string): number {
  const m = String(mois || '').toUpperCase();
  return MOIS_INDEX[m] !== undefined ? MOIS_INDEX[m] : -1;
}

/**
 * Détermine si un salarié est en congé maternité pour le mois demandé.
 * Le congé dure `dureeMaterniteMois` mois (3 mois par défaut) à partir de la
 * date de début (mois de début inclus).
 */
export function estEnCongeMaternite(
  dateDebut: string | undefined | null,
  annee: number,
  mois: string
): boolean {
  if (!dateDebut) return false;
  const parts = String(dateDebut).split('-');
  if (parts.length < 2) return false;
  const yDebut = parseInt(parts[0], 10);
  const mDebut = parseInt(parts[1], 10); // 1..12
  if (!yDebut || !mDebut) return false;

  const cfg = loadConfig();
  const duree = Number(cfg.dureeMaterniteMois) || 3;
  const debutIndex = yDebut * 12 + (mDebut - 1);
  const mIdx = moisToIndex(mois);
  if (mIdx === -1) return false;
  const demandeIndex = Number(annee) * 12 + mIdx;

  return demandeIndex >= debutIndex && demandeIndex <= debutIndex + duree - 1;
}

export function obtenirIndiceAnciennete(annees: number): number {
  const ans = typeof annees === 'number' ? annees : 0;
  for (const b of BAREME_ANCIENNETE_SALFA) {
    if (ans >= b.min && ans <= b.max) {
      return b.indice;
    }
  }
  return 1.70;
}

export function evaluerBaseRevalorisee(baseInitiale: number, dateEmbauche: string, anneeRef: number = 2026) {
  const annees = calculerAnciennete(dateEmbauche, anneeRef);
  const indice = obtenirIndiceAnciennete(annees);
  const baseRevalorisee = Math.round(baseInitiale * indice * 100) / 100;
  return {
    nombre_annees: annees,
    indice_augmentation: indice,
    base_initiale: baseInitiale,
    base_revalorisee: baseRevalorisee
  };
}

export function calculerIrsa(salaireImposable: number, enfantsACharge: number = 0): number {
  const enfants = (typeof enfantsACharge === 'number' && enfantsACharge > 0) ? enfantsACharge : 0;
  const cfg = loadConfig();

  // 1. Arrondi de la base imposable à la centaine inférieure (CGI Madagascar)
  const base = Math.floor(salaireImposable / 100) * 100;

  // 2. Barème IRSA Madagascar (progressif)
  let irsaBrut = 0.0;
  if (base > 350000) irsaBrut += Math.min(base - 350000, 50000) * 0.05;
  if (base > 400000) irsaBrut += Math.min(base - 400000, 100000) * 0.10;
  if (base > 500000) irsaBrut += Math.min(base - 500000, 100000) * 0.15;
  if (base > 600000) irsaBrut += (base - 600000) * 0.20;

  // 3. Réduction charges de famille : déduction forfaitaire par enfant
  const irsaNet = irsaBrut - (enfants * Number(cfg.deductionEnfant || 0));

  // 4. Minimum de perception IRSA
  const irsaFinal = Math.max(Number(cfg.minIrsa || 0), irsaNet);
  return Math.round(irsaFinal * 100) / 100;
}

/**
 * Calcule le détail de l'IRSA pour l'affichage dans l'administration.
 */
export function detailIrsa(salaireImposable: number, enfantsACharge: number = 0) {
  const enfants = (typeof enfantsACharge === 'number' && enfantsACharge > 0) ? enfantsACharge : 0;
  const cfg = loadConfig();
  const base = Math.floor(salaireImposable / 100) * 100;

  const tranches: { libelle: string; montant: number }[] = [];
  let irsaBrut = 0.0;
  const pushTranche = (label: string, montant: number) => {
    if (montant > 0) tranches.push({ libelle: label, montant: Math.round(montant * 100) / 100 });
  };
  pushTranche('350 001 — 400 000 (5%)', Math.min(Math.max(base - 350000, 0), 50000) * 0.05);
  pushTranche('400 001 — 500 000 (10%)', Math.min(Math.max(base - 400000, 0), 100000) * 0.10);
  pushTranche('500 001 — 600 000 (15%)', Math.min(Math.max(base - 500000, 0), 100000) * 0.15);
  pushTranche('Au-delà de 600 000 (20%)', Math.max(base - 600000, 0) * 0.20);
  irsaBrut = tranches.reduce((s, t) => s + t.montant, 0);

  const deductionFamille = enfants * Number(cfg.deductionEnfant || 0);
  const avantMin = irsaBrut - deductionFamille;
  const irsaFinal = Math.max(Number(cfg.minIrsa || 0), avantMin);

  return {
    baseArrondie: base,
    tranches,
    irsaBrut: Math.round(irsaBrut * 100) / 100,
    deductionFamille,
    avantMin: Math.round(avantMin * 100) / 100,
    minIrsa: Number(cfg.minIrsa || 0),
    irsaFinal: Math.round(irsaFinal * 100) / 100,
  };
}

export function calculerPaieEmploye(
  employe: any,
  avance: number = 0.0,
  med: number = 0.0,
  accessoires: any = {}
) {
  const base_aj = parseFloat(employe.base_aj || 0);
  const logt_trsp = parseFloat(employe.logement_transport || employe.logt_trsp || 0);
  const rendement = parseFloat(employe.rendement || 0);
  const resp_repres = parseFloat(employe.responsabilite_representation || employe.resp_repres || 0);
  const enfants = parseInt(employe.enfant_a_charge || employe['enfant a charge'] || 0, 10);
  const rib = String(employe.rib || '').trim();

  // Règle Congé de Maternité : si activé, la base brute est réduite selon le
  // coefficient configuré (50% par défaut, sur 3 mois).
  const cfg = loadConfig();
  const isMaternite = employe.conge_maternite === 1 || employe.conge_maternite === true || accessoires.conge_maternite === 1 || accessoires.conge_maternite === true;
  const base_brute_normale = base_aj + logt_trsp + rendement + resp_repres;
  const coeffMaternite = Math.max(0, Math.min(100, Number(cfg.tauxMaternite || 50))) / 100;
  const salaire_brut = Math.round((isMaternite ? base_brute_normale * coeffMaternite : base_brute_normale) * 100) / 100;

  const tauxCnapsSalariale = (Number(cfg.cnapsSalariale || 0)) / 100;
  const tauxCnapsPatronale = (Number(cfg.cnapsPatronale || 0)) / 100;
  const cnaps = Math.round(salaire_brut * tauxCnapsSalariale * 1000) / 1000;
  const patronal = Math.round(salaire_brut * tauxCnapsPatronale * 1000) / 1000;
  const salaire_imposable = Math.round((salaire_brut - cnaps) * 1000) / 1000;
  const irsa = calculerIrsa(salaire_imposable, enfants);
  const salaire_net = Math.round((salaire_imposable - irsa) * 1000) / 1000;

  const aug_div = parseFloat(accessoires.augmentation_divers || 0);
  const prime_garde = parseFloat(accessoires.prime_de_garde || 0);
  const anc2 = parseFloat(accessoires.anciennete2 || 0);
  const risque = parseFloat(accessoires.risque || 0);
  const repr_rec = parseFloat(accessoires.repr_rec || 0);
  const accessoir = Math.round((aug_div + prime_garde + anc2 + risque + repr_rec) * 100) / 100;

  const brut = Math.round((salaire_net + accessoir) * 1000) / 1000;
  const av = parseFloat(String(avance || 0));
  const md = parseFloat(String(med || 0));

  // Net à payer au 100 Ar inférieur
  const net_brut_calc = Math.max(0, brut - av - md);
  const net_a_payer = Math.floor(net_brut_calc / 100) * 100;

  const rap_val = employe.rap !== false && employe.rap !== 0;
  let virement: number | null = null;
  let especes: number | null = null;

  if (rap_val) {
    if (rib && rib.length >= 5) {
      especes = Math.min(5000.0, net_a_payer);
      virement = Math.max(0.0, net_a_payer - especes);
    } else {
      virement = null;
      especes = net_a_payer;
    }
  }

  return {
    salaire_brut,
    cnaps,
    patronal,
    salaire_imposable,
    irsa,
    salaire_net,
    augmentation_divers: aug_div,
    prime_de_garde: prime_garde,
    anciennete2: anc2,
    risque,
    repr_rec,
    accessoir,
    brut,
    avance: av,
    med: md,
    net: net_a_payer,
    virement,
    especes,
    rap: rap_val,
    conge_maternite: isMaternite ? 1 : 0
  };
}
