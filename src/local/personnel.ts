// =============================================================================
// DONNÉES COMPLÉMENTAIRES « LISTE DE PERSONNEL.xlsx »
// Rapprochement conservateur : on ne complète qu'un champ absent, sans jamais
// écraser une saisie existante ni modifier la paie.
// =============================================================================
import personnel from '../data/salfa_personnel.json';

export const PERSONNEL_VERSION = String((personnel as any).version || 'liste-personnel-2026-11');
export const PERSONNEL_SOURCE = String((personnel as any).source || 'LISTE DE PERSONNEL.xlsx');

export interface RapportPersonnel {
  version: string;
  source: string;
  rapproches: number;
  nonRapproches: { feuille: string; nom: string; identifiant?: string }[];
  conflits: { matricule: number; nom: string; champ: string; feuilles: string[]; retenu: string }[];
}

export function rapportPersonnel(): RapportPersonnel {
  const doc = personnel as any;
  return {
    version: PERSONNEL_VERSION,
    source: PERSONNEL_SOURCE,
    rapproches: Array.isArray(doc.entries) ? doc.entries.length : 0,
    nonRapproches: Array.isArray(doc.nonRapproches) ? doc.nonRapproches : [],
    conflits: Array.isArray(doc.conflits) ? doc.conflits : [],
  };
}

export const CHAMPS_PERSONNEL = [
  'genre', 'date_naissance', 'lieu_naissance', 'pere', 'mere',
  'cin', 'date_cin', 'lieu_cin', 'situation_matrimoniale', 'adresse',
  'service', 'diplome', 'etablissement', 'statut', 'numero_ordre',
  'nature_contrat', 'duree_contrat', 'lieu_embauche', 'lieu_travail', 'date_effet',
] as const;

export type ChampPersonnel = typeof CHAMPS_PERSONNEL[number];

/** Champs de fiche historique complétés uniquement s'ils sont vides. */
const CHAMPS_FICHE_COMPLEMENTAIRES = ['numero_cnaps', 'jobs', 'categorie', 'date_embauche'] as const;

/** Données personnelles réservées à l'Administrateur (masquées au Comptable). */
export const CHAMPS_PERSONNEL_SENSIBLES: readonly ChampPersonnel[] = CHAMPS_PERSONNEL;

function champVide(v: unknown): boolean {
  return v === null || v === undefined || String(v).trim() === '';
}

/** Normalise les champs complémentaires reçus d'un formulaire ou d'un import. */
export function normaliserChampsPersonnel(source: Record<string, unknown>): Partial<Record<ChampPersonnel, string>> {
  const out: Partial<Record<ChampPersonnel, string>> = {};
  for (const cle of CHAMPS_PERSONNEL) {
    if (source[cle] === undefined) continue;
    out[cle] = String(source[cle] ?? '').replace(/\s+/g, ' ').trim();
  }
  return out;
}

/** Complète les fiches avec les entrées rapprochées, uniquement si le champ est vide. */
export function appliquerPersonnelAuxFiches(employes: any[]): { fiches: number; champs: number } {
  const entries = Array.isArray((personnel as any).entries) ? (personnel as any).entries : [];
  const parMat = new Map<number, Record<string, string>>(
    entries.map((e: any) => [Number(e.numero_matricule), e.champs || {}])
  );
  let fiches = 0;
  let champs = 0;
  for (const emp of employes || []) {
    const src = parMat.get(Number(emp.numero_matricule));
    if (!src) continue;
    let touche = false;
    for (const cle of [...CHAMPS_PERSONNEL, ...CHAMPS_FICHE_COMPLEMENTAIRES]) {
      const valeur = src[cle];
      if (!valeur) continue;
      if (champVide(emp[cle])) {
        emp[cle] = valeur;
        champs++;
        touche = true;
      }
    }
    if (touche) fiches++;
  }
  return { fiches, champs };
}

/** Lors d'une fusion, reprendre les informations complémentaires manquantes. */
export function completerFicheFusionnee(cible: any, source: any): void {
  for (const cle of CHAMPS_PERSONNEL) {
    if (champVide(cible[cle]) && !champVide(source?.[cle])) {
      cible[cle] = String(source[cle]).trim();
    }
  }
}
