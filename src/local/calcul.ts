// ==============================================================================
// CLIENT LOCAL : MOTEUR DE CALCUL DE PAIE - SALFA TANAMBAO (TYPESCRIPT)
// Porté depuis server/calcul.ts pour tourner à 100% dans le navigateur.
// MODIFIÉ pour lire TOUT le paramétrage depuis loadConfig() (IRSA, ancienneté,
// arrondis, plafond espèces, etc.) afin que l'admin puisse modifier les formules.
// ==============================================================================

import { loadConfig, PaieConfig, DEFAULT_BAREME_ANCIENNETE, DEFAULT_BAREME_IRSA, BaremeAncienneteConfig, TrancheIrsaConfig } from './config';

export interface BaremeAnciennete {
  min: number;
  max: number;
  indice: number;
}

// Conserve l'ancien export pour compat, mais la source de vérité est désormais le config
export const BAREME_ANCIENNETE_SALFA: BaremeAnciennete[] = DEFAULT_BAREME_ANCIENNETE.map(b => ({ ...b }));

function getBaremeAnciennete(): BaremeAncienneteConfig[] {
  try {
    const cfg = loadConfig();
    if (Array.isArray(cfg.baremeAnciennete) && cfg.baremeAnciennete.length > 0) return cfg.baremeAnciennete;
  } catch { /* ignore */ }
  return DEFAULT_BAREME_ANCIENNETE;
}

function getBaremeIrsa(): TrancheIrsaConfig[] {
  try {
    const cfg = loadConfig();
    if (Array.isArray(cfg.baremeIrsa) && cfg.baremeIrsa.length > 0) return cfg.baremeIrsa;
  } catch { /* ignore */ }
  return DEFAULT_BAREME_IRSA;
}

export function calculerAnciennete(dateEmbauche: string, anneeRef: number = new Date().getFullYear()): number {
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
  const bareme = getBaremeAnciennete();
  for (const b of bareme) {
    if (ans >= b.min && ans <= b.max) {
      return b.indice;
    }
  }
  // fallback: dernier indice si au-delà, sinon max
  if (bareme.length > 0) {
    const sorted = [...bareme].sort((a, b) => a.max - b.max);
    const last = sorted[sorted.length - 1];
    if (ans > last.max) return last.indice;
  }
  return 1.70;
}

// Version qui prend un bareme custom (pour prévisualisation admin)
export function obtenirIndiceAncienneteAvecBareme(annees: number, bareme: BaremeAncienneteConfig[]): number {
  const ans = typeof annees === 'number' ? annees : 0;
  for (const b of bareme) {
    if (ans >= b.min && ans <= b.max) return b.indice;
  }
  if (bareme.length > 0) {
    const sorted = [...bareme].sort((a, b) => a.max - b.max);
    const last = sorted[sorted.length - 1];
    if (ans > last.max) return last.indice;
  }
  return 1.70;
}

export function evaluerBaseRevalorisee(baseInitiale: number, dateEmbauche: string, anneeRef: number = new Date().getFullYear()) {
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

// --- Cœur générique IRSA utilisable avec une config custom ---

function arrondirBase(base: number, pas: number): number {
  if (!pas || pas <= 0) return Math.floor(base);
  return Math.floor(base / pas) * pas;
}

function calculerIrsaCore(salaireImposable: number, enfantsACharge: number, cfg: PaieConfig) {
  const enfants = (typeof enfantsACharge === 'number' && enfantsACharge > 0) ? enfantsACharge : 0;
  const pas = Number(cfg.arrondiIrsaBase) || 0;
  const base = pas > 0 ? arrondirBase(salaireImposable, pas) : Math.floor(salaireImposable);
  const bareme = Array.isArray(cfg.baremeIrsa) && cfg.baremeIrsa.length ? cfg.baremeIrsa : DEFAULT_BAREME_IRSA;
  const sorted = [...bareme].sort((a, b) => a.min - b.min);

  let irsaBrut = 0;
  for (const tr of sorted) {
    if (base <= tr.min) continue;
    const haut = tr.max === null || tr.max === undefined ? Infinity : tr.max;
    const part = Math.min(base, haut) - tr.min;
    if (part > 0 && tr.taux > 0) {
      irsaBrut += part * (tr.taux / 100);
    }
  }
  const deductionFamille = enfants * Number(cfg.deductionEnfant || 0);
  const avantMin = irsaBrut - deductionFamille;
  const irsaFinal = Math.max(Number(cfg.minIrsa || 0), avantMin);
  return { base, irsaBrut, deductionFamille, avantMin, irsaFinal, bareme: sorted };
}

export function calculerIrsa(salaireImposable: number, enfantsACharge: number = 0): number {
  const cfg = loadConfig();
  const { irsaFinal } = calculerIrsaCore(salaireImposable, enfantsACharge, cfg);
  return Math.round(irsaFinal * 100) / 100;
}

export function calculerIrsaAvecConfig(salaireImposable: number, enfantsACharge: number, cfg: PaieConfig): number {
  const { irsaFinal } = calculerIrsaCore(salaireImposable, enfantsACharge, cfg);
  return Math.round(irsaFinal * 100) / 100;
}

/**
 * Calcule le détail de l'IRSA pour l'affichage dans l'administration (avec config courante).
 */
export function detailIrsa(salaireImposable: number, enfantsACharge: number = 0) {
  const cfg = loadConfig();
  return detailIrsaAvecConfig(salaireImposable, enfantsACharge, cfg);
}

export function detailIrsaAvecConfig(salaireImposable: number, enfantsACharge: number, cfg: PaieConfig) {
  const enfants = (typeof enfantsACharge === 'number' && enfantsACharge > 0) ? enfantsACharge : 0;
  const pas = Number(cfg.arrondiIrsaBase) || 0;
  const base = pas > 0 ? arrondirBase(salaireImposable, pas) : Math.floor(salaireImposable);
  const bareme = Array.isArray(cfg.baremeIrsa) && cfg.baremeIrsa.length ? cfg.baremeIrsa : DEFAULT_BAREME_IRSA;
  const sorted = [...bareme].sort((a, b) => a.min - b.min);

  const tranches: { libelle: string; montant: number; min: number; max: number | null; taux: number; baseTaxable: number }[] = [];
  let irsaBrut = 0;
  for (const tr of sorted) {
    if (base <= tr.min) continue;
    const haut = tr.max === null || tr.max === undefined ? Infinity : tr.max;
    const part = Math.min(base, haut) - tr.min;
    if (part > 0) {
      const mont = part * (tr.taux / 100);
      if (mont > 0 || tr.taux === 0) {
        // on n'affiche que les tranches avec montant >0 ou si toutes à 0, on affiche quand même la première
      }
      tranches.push({
        libelle: tr.max === null ? `Au-delà de ${tr.min.toLocaleString('fr-FR')} (${tr.taux}%)` : `${tr.min.toLocaleString('fr-FR')} — ${tr.max.toLocaleString('fr-FR')} (${tr.taux}%)`,
        montant: Math.round(mont * 100) / 100,
        min: tr.min,
        max: tr.max,
        taux: tr.taux,
        baseTaxable: Math.round(part * 100) / 100,
      });
      irsaBrut += mont;
    }
  }

  const deductionFamille = enfants * Number(cfg.deductionEnfant || 0);
  const avantMin = irsaBrut - deductionFamille;
  const irsaFinal = Math.max(Number(cfg.minIrsa || 0), avantMin);

  return {
    baseArrondie: base,
    pasArrondi: pas,
    tranches,
    irsaBrut: Math.round(irsaBrut * 100) / 100,
    deductionFamille,
    avantMin: Math.round(avantMin * 100) / 100,
    minIrsa: Number(cfg.minIrsa || 0),
    irsaFinal: Math.round(irsaFinal * 100) / 100,
    bareme: sorted,
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

  // Net à payer arrondi à l'unité configurée à l'inférieur (défaut 100 Ar)
  const net_brut_calc = Math.max(0, brut - av - md);
  const pasNet = Number(cfg.arrondiNet) || 0;
  const net_a_payer = pasNet > 0 ? Math.floor(net_brut_calc / pasNet) * pasNet : Math.floor(net_brut_calc);

  let virement: number | null = null;
  let especes: number | null = null;

  const plafond = Number(cfg.plafondEspeces) || 0;
  if (rib && rib.length >= 5) {
    especes = plafond > 0 ? Math.min(plafond, net_a_payer) : net_a_payer;
    virement = Math.max(0.0, net_a_payer - (especes as number));
  } else {
    virement = null;
    especes = net_a_payer;
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
    conge_maternite: isMaternite ? 1 : 0
  };
}
