// ==============================================================================
// CLIENT API LOCALE 100% NAVIGATEUR - SALFA TANAMBAO (.TSX / REACT)
// Plus aucun appel réseau : toutes les fonctions lisent/écrivent dans le
// store local (localStorage) via src/local/*. Compatible Cloudflare Pages
// (site statique).
// ==============================================================================

import { Employe, PaieMensuelle, TotauxMois, ComparaisonNet, UserSession } from './types';
import { getStore, saveStore, storeEstSynchronise, nextEmployeId, nextPaieId, nowStamp } from './local/store';
import { calculerPaieEmploye, calculerAnciennete, estEnCongeMaternite } from './local/calcul';
import { hashPassword } from './local/hash';
import { loadConfig } from './local/config';
import { ImportWorkbookResult, ImportedEmploye, ImportedPaie, MOIS_FR } from './local/importExcel';

// ------------------------------------------------------------------------------
// AUTHENTIFICATION (locale)
// ------------------------------------------------------------------------------
export async function apiLogin(username: string, password: string): Promise<UserSession | null> {
  const store = getStore();
  const hash = await hashPassword(password);
  const user = (store.utilisateurs || []).find(
    (u: any) =>
      String(u.username).trim() === String(username).trim() &&
      u.password_hash === hash &&
      Number(u.actif) === 1
  );
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    nom_complet: user.nom_complet,
    role: user.role,
    actif: user.actif,
  };
}

export async function checkHealth(): Promise<boolean> {
  return true;
}

// ------------------------------------------------------------------------------
// EMPLOYÉS (SALARIÉS)
// ------------------------------------------------------------------------------
export async function fetchEmployes(actifsOnly: boolean = false, search: string = ''): Promise<Employe[]> {
  const store = getStore();
  let employes = [...(store.employes || [])];

  if (actifsOnly) {
    employes = employes.filter((e: any) => Number(e.actif) === 1);
  }
  if (search) {
    const q = search.trim().toLowerCase();
    employes = employes.filter((e: any) =>
      String(e.nom_prenoms || '').toLowerCase().includes(q) ||
      String(e.jobs || '').toLowerCase().includes(q) ||
      String(e.categorie || '').toLowerCase().includes(q) ||
      String(e.numero_matricule || '').includes(q)
    );
  }

  employes.sort((a: any, b: any) => Number(a.numero_matricule) - Number(b.numero_matricule));
  return employes;
}

export async function fetchEmployePaies(id: number): Promise<PaieMensuelle[]> {
  const store = getStore();
  return (store.paies || [])
    .filter((p: any) => Number(p.employe_id) === id)
    .sort(
      (a: any, b: any) =>
        Number(a.annee) - Number(b.annee) ||
        String(a.mois).localeCompare(String(b.mois)) ||
        Number(a.id) - Number(b.id)
    );
}

export async function createEmploye(employe: Partial<Employe>): Promise<boolean> {
  const store = getStore();
  const mat = Number(employe.numero_matricule);
  if (store.employes.some((e: any) => Number(e.numero_matricule) === mat)) {
    return false;
  }
  const dateEmb = String(employe.date_embauche || '').trim();
  const newEmp: any = {
    id: nextEmployeId(),
    numero_matricule: mat,
    nom_prenoms: String(employe.nom_prenoms || '').trim(),
    numero_cnaps: String(employe.numero_cnaps || '').trim(),
    categorie: String(employe.categorie || '').trim(),
    jobs: String(employe.jobs || '').trim(),
    date_embauche: dateEmb,
    nombre_annees: calculerAnciennete(dateEmb, new Date().getFullYear()),
    enfant_a_charge: Number(employe.enfant_a_charge || 0),
    base_aj: Number(employe.base_aj || 0),
    logement_transport: Number(employe.logement_transport || 0),
    rendement: Number(employe.rendement || 0),
    responsabilite_representation: Number(employe.responsabilite_representation || 0),
    rib: String(employe.rib || '').trim(),
    mode_paiement: String(employe.mode_paiement || 'ESPECES').toUpperCase(),
    actif: 1,
    conge_maternite: employe.conge_maternite ? 1 : 0,
    date_debut_maternite: String(employe.date_debut_maternite || '').trim(),
    date_creation: nowStamp(),
  };
  store.employes.push(newEmp);
  saveStore();
  return true;
}

export async function updateEmploye(id: number, employe: Partial<Employe>): Promise<boolean> {
  const store = getStore();
  const idx = store.employes.findIndex((e: any) => Number(e.id) === id);
  if (idx === -1) return false;

  const mat = Number(employe.numero_matricule);
  if (store.employes.some((e: any) => Number(e.numero_matricule) === mat && Number(e.id) !== id)) {
    return false;
  }
  const dateEmb = String(employe.date_embauche || '').trim();

  const updated = {
    ...store.employes[idx],
    numero_matricule: mat,
    nom_prenoms: String(employe.nom_prenoms || '').trim(),
    numero_cnaps: String(employe.numero_cnaps || '').trim(),
    categorie: String(employe.categorie || '').trim(),
    jobs: String(employe.jobs || '').trim(),
    date_embauche: dateEmb,
    nombre_annees: calculerAnciennete(dateEmb, new Date().getFullYear()),
    enfant_a_charge: Number(employe.enfant_a_charge || 0),
    base_aj: Number(employe.base_aj || 0),
    logement_transport: Number(employe.logement_transport || 0),
    rendement: Number(employe.rendement || 0),
    responsabilite_representation: Number(employe.responsabilite_representation || 0),
    rib: String(employe.rib || '').trim(),
    mode_paiement: String(employe.mode_paiement || 'ESPECES').toUpperCase(),
    actif: employe.actif !== undefined ? Number(employe.actif) : store.employes[idx].actif,
    conge_maternite:
      employe.conge_maternite !== undefined
        ? employe.conge_maternite
          ? 1
          : 0
        : store.employes[idx].conge_maternite,
    date_debut_maternite:
      employe.date_debut_maternite !== undefined
        ? String(employe.date_debut_maternite || '').trim()
        : store.employes[idx].date_debut_maternite,
  };

  store.employes[idx] = updated;
  saveStore();
  return true;
}

export async function toggleActifEmploye(id: number, actif: boolean): Promise<boolean> {
  const store = getStore();
  const idx = store.employes.findIndex((e: any) => Number(e.id) === id);
  if (idx === -1) return false;
  store.employes[idx].actif = actif ? 1 : 0;
  saveStore();
  return true;
}

// ------------------------------------------------------------------------------
// PAIES MENSUELLES (BULLETINS)
// ------------------------------------------------------------------------------
export async function fetchPaiesMois(
  annee: number,
  mois: string
): Promise<{ employes: PaieMensuelle[]; verrouille: boolean; totaux: TotauxMois }> {
  const store = getStore();
  const a = Number(annee);
  const m = String(mois).toUpperCase();

  const employes = (store.paies || [])
    .filter((p: any) => Number(p.annee) === a && String(p.mois).toUpperCase() === m)
    .sort((x: any, y: any) => Number(x.numero_matricule) - Number(y.numero_matricule));

  const verrouille = employes.some((p: any) => Number(p.verrouille) === 1);

  const totaux: TotauxMois = {
    count_employes: employes.length,
    total_enfant_a_charge: 0,
    total_base_aj: 0,
    total_logt_trsp: 0,
    total_rendement: 0,
    total_resp_repres: 0,
    total_salaire_brut: 0,
    total_cnaps: 0,
    total_patronal: 0,
    total_salaire_imposable: 0,
    total_irsa: 0,
    total_salaire_net: 0,
    total_augmentation_divers: 0,
    total_prime_de_garde: 0,
    total_anciennete2: 0,
    total_risque: 0,
    total_repr_rec: 0,
    total_accessoir: 0,
    total_brut: 0,
    total_avance: 0,
    total_med: 0,
    total_net: 0,
    total_virement: 0,
    total_especes: 0,
  };

  const keys: (keyof TotauxMois)[] = [
    'total_enfant_a_charge', 'total_base_aj', 'total_logt_trsp', 'total_rendement',
    'total_resp_repres', 'total_salaire_brut', 'total_cnaps', 'total_patronal',
    'total_salaire_imposable', 'total_irsa', 'total_salaire_net', 'total_augmentation_divers',
    'total_prime_de_garde', 'total_anciennete2', 'total_risque', 'total_repr_rec',
    'total_accessoir', 'total_brut', 'total_avance', 'total_med', 'total_net',
    'total_virement', 'total_especes',
  ];
  const srcKeys: Record<keyof TotauxMois, string> = {
    count_employes: 'count_employes',
    total_enfant_a_charge: 'enfant_a_charge',
    total_base_aj: 'base_aj',
    total_logt_trsp: 'logt_trsp',
    total_rendement: 'rendement',
    total_resp_repres: 'resp_repres',
    total_salaire_brut: 'salaire_brut',
    total_cnaps: 'cnaps',
    total_patronal: 'patronal',
    total_salaire_imposable: 'salaire_imposable',
    total_irsa: 'irsa',
    total_salaire_net: 'salaire_net',
    total_augmentation_divers: 'augmentation_divers',
    total_prime_de_garde: 'prime_de_garde',
    total_anciennete2: 'anciennete2',
    total_risque: 'risque',
    total_repr_rec: 'repr_rec',
    total_accessoir: 'accessoir',
    total_brut: 'brut',
    total_avance: 'avance',
    total_med: 'med',
    total_net: 'net',
    total_virement: 'virement',
    total_especes: 'especes',
  };
  for (const key of keys) {
    let sum = 0;
    for (const p of employes) {
      sum += Number((p as any)[srcKeys[key]] || 0);
    }
    (totaux as any)[key] = sum;
  }

  return { employes, verrouille, totaux };
}

const MOIS_ORDRE: Record<string, number> = {
  JANVIER: 0, FEVRIER: 1, MARS: 2, AVRIL: 3, MAI: 4, JUIN: 5,
  JUILLET: 6, AOUT: 7, SEPTEMBRE: 8, OCTOBRE: 9, NOVEMBRE: 10, DECEMBRE: 11,
};

function indexPaiesParEmploye(store: any): Record<number, any[]> {
  const paiesParEmploye: Record<number, any[]> = {};
  for (const p of store.paies || []) {
    const id = Number(p.employe_id);
    if (!paiesParEmploye[id]) paiesParEmploye[id] = [];
    paiesParEmploye[id].push(p);
  }
  for (const id of Object.keys(paiesParEmploye)) {
    paiesParEmploye[Number(id)].sort((x: any, y: any) => {
      const ix = Number(x.annee) * 12 + (MOIS_ORDRE[String(x.mois).toUpperCase()] ?? 0);
      const iy = Number(y.annee) * 12 + (MOIS_ORDRE[String(y.mois).toUpperCase()] ?? 0);
      return iy - ix;
    });
  }
  return paiesParEmploye;
}

/** Construit (sans l'enregistrer) le bulletin d'un salarié pour une période. */
function construirePaie(
  emp: any,
  a: number,
  m: string,
  paiesParEmploye: Record<number, any[]>
): any {
  const dernier = (paiesParEmploye[Number(emp.id)] || []).find(
    (p: any) => Number(p.annee) * 12 + (MOIS_ORDRE[String(p.mois).toUpperCase()] ?? 0) < a * 12 + (MOIS_ORDRE[m] ?? 0)
  );
  const accessoires = dernier
    ? {
        augmentation_divers: Number(dernier.augmentation_divers || 0),
        prime_de_garde: Number(dernier.prime_de_garde || 0),
        anciennete2: Number(dernier.anciennete2 || 0),
        risque: Number(dernier.risque || 0),
        repr_rec: Number(dernier.repr_rec || 0),
      }
    : {};

  const annees = calculerAnciennete(emp.date_embauche, a);
  const enMaternite = emp.conge_maternite === 1 || estEnCongeMaternite(emp.date_debut_maternite, a, m);
  const empCalc = {
    base_aj: emp.base_aj,
    logement_transport: emp.logement_transport,
    rendement: emp.rendement,
    responsabilite_representation: emp.responsabilite_representation,
    enfant_a_charge: emp.enfant_a_charge,
    rib: emp.rib,
    rap: true,
    conge_maternite: enMaternite ? 1 : 0,
  };
  const r = calculerPaieEmploye(empCalc, 0, 0, accessoires);

  return {
    id: nextPaieId(),
    employe_id: emp.id,
    numero_matricule: emp.numero_matricule,
    annee: a,
    mois: m,
    nom_prenoms: emp.nom_prenoms,
    numero_cnaps: emp.numero_cnaps || '',
    categorie: emp.categorie || '',
    jobs: emp.jobs || '',
    date_embauche: emp.date_embauche || '',
    nombre_annees: annees,
    enfant_a_charge: emp.enfant_a_charge || 0,
    base_aj: emp.base_aj || 0,
    logt_trsp: emp.logement_transport || 0,
    rendement: emp.rendement || 0,
    resp_repres: emp.responsabilite_representation || 0,
    salaire_brut: r.salaire_brut,
    cnaps: r.cnaps,
    patronal: r.patronal,
    salaire_imposable: r.salaire_imposable,
    irsa: r.irsa,
    salaire_net: r.salaire_net,
    augmentation_divers: r.augmentation_divers,
    prime_de_garde: r.prime_de_garde,
    anciennete2: r.anciennete2,
    risque: r.risque,
    repr_rec: r.repr_rec,
    accessoir: r.accessoir,
    brut: r.brut,
    avance: 0,
    med: 0,
    net: r.net,
    virement: r.virement,
    especes: r.especes,
    rap: 1,
    rib: emp.rib || '',
    verrouille: 0,
    conge_maternite: enMaternite ? 1 : 0,
    date_debut_maternite: emp.date_debut_maternite || '',
    date_modification: nowStamp(),
  };
}

/** Crée le bulletin d'UN seul salarié pour une période (s'il n'existe pas). */
export async function initPaieEmploye(
  employeId: number,
  annee: number,
  mois: string
): Promise<{ success: boolean; created: boolean }> {
  const store = getStore();
  const a = Number(annee);
  const m = String(mois).toUpperCase();
  const emp = (store.employes || []).find((e: any) => Number(e.id) === Number(employeId));
  if (!emp) return { success: false, created: false };

  const dejaCree = (store.paies || []).some(
    (p: any) =>
      Number(p.employe_id) === Number(employeId) &&
      Number(p.annee) === a &&
      String(p.mois).toUpperCase() === m
  );
  if (dejaCree) return { success: true, created: false };

  const paiesParEmploye = indexPaiesParEmploye(store);
  store.paies.push(construirePaie(emp, a, m, paiesParEmploye));
  saveStore();
  return { success: true, created: true };
}

export async function initMoisPaie(
  annee: number,
  mois: string
): Promise<{ success: boolean; initializedCount: number }> {
  const store = getStore();
  const a = Number(annee);
  const m = String(mois).toUpperCase();

  const employesActifs = (store.employes || [])
    .filter((e: any) => Number(e.actif) === 1)
    .sort((x: any, y: any) => Number(x.numero_matricule) - Number(y.numero_matricule));

  const paiesParEmploye = indexPaiesParEmploye(store);

  let count = 0;
  for (const emp of employesActifs) {
    const exist = (store.paies || []).some(
      (p: any) =>
        Number(p.employe_id) === Number(emp.id) &&
        Number(p.annee) === a &&
        String(p.mois).toUpperCase() === m
    );
    if (exist) continue;

    store.paies.push(construirePaie(emp, a, m, paiesParEmploye));
    count++;
  }

  if (count > 0) saveStore();
  return { success: true, initializedCount: count };
}

export async function savePaieSaisie(
  id: number,
  avance: number,
  med: number,
  accessoires?: any
): Promise<{ success: boolean; updated?: PaieMensuelle }> {
  const store = getStore();
  const idx = store.paies.findIndex((p: any) => Number(p.id) === id);
  if (idx === -1) {
    return { success: false };
  }
  const row = store.paies[idx];
  if (Number(row.verrouille) === 1) {
    return { success: false };
  }

  const acc = accessoires || {
    augmentation_divers: row.augmentation_divers,
    prime_de_garde: row.prime_de_garde,
    anciennete2: row.anciennete2,
    risque: row.risque,
    repr_rec: row.repr_rec,
  };

  const rowWithMaternite = { ...row, conge_maternite: row.conge_maternite };
  const r = calculerPaieEmploye(rowWithMaternite, Number(avance || 0), Number(med || 0), acc);

  const updated = {
    ...row,
    salaire_brut: r.salaire_brut,
    cnaps: r.cnaps,
    patronal: r.patronal,
    salaire_imposable: r.salaire_imposable,
    irsa: r.irsa,
    salaire_net: r.salaire_net,
    augmentation_divers: r.augmentation_divers,
    prime_de_garde: r.prime_de_garde,
    anciennete2: r.anciennete2,
    risque: r.risque,
    repr_rec: r.repr_rec,
    accessoir: r.accessoir,
    brut: r.brut,
    avance: r.avance,
    med: r.med,
    net: r.net,
    virement: r.virement,
    especes: r.especes,
    date_modification: nowStamp(),
  };

  store.paies[idx] = updated;
  saveStore();
  return { success: true, updated: r as any };
}

export async function cloturerMois(annee: number, mois: string): Promise<boolean> {
  const store = getStore();
  const a = Number(annee);
  const m = String(mois).toUpperCase();
  let touched = 0;
  for (const p of store.paies) {
    if (Number(p.annee) === a && String(p.mois).toUpperCase() === m) {
      p.verrouille = 1;
      p.date_modification = nowStamp();
      touched++;
    }
  }
  if (touched) saveStore();
  return true;
}

export async function deverrouillerMois(annee: number, mois: string, userRole: string): Promise<boolean> {
  if (userRole !== 'Administrateur') return false;
  const store = getStore();
  const a = Number(annee);
  const m = String(mois).toUpperCase();
  let touched = 0;
  for (const p of store.paies) {
    if (Number(p.annee) === a && String(p.mois).toUpperCase() === m) {
      p.verrouille = 0;
      p.date_modification = nowStamp();
      touched++;
    }
  }
  if (touched) saveStore();
  return true;
}

// ------------------------------------------------------------------------------
// RAPPORTS & COMPARAISONS
// ------------------------------------------------------------------------------
export async function fetchComparaison(
  annee: number,
  moisActuel: string,
  moisAvant: string,
  useHist: boolean
): Promise<ComparaisonNet[]> {
  const store = getStore();
  const a = Number(annee);
  const mActuel = String(moisActuel).toUpperCase();
  const mAvant = String(moisAvant).toUpperCase();

  let data: any[] = [];
  if (useHist) {
    data = [...(store.comparaison_net || [])].sort(
      (x: any, y: any) => Number(x.numero_matricule) - Number(y.numero_matricule)
    );
  } else {
    const paiesActuel = (store.paies || []).filter(
      (p: any) => Number(p.annee) === a && String(p.mois).toUpperCase() === mActuel
    );
    const paiesAvantMap: Record<number, any> = {};
    for (const p of (store.paies || []).filter(
      (p: any) => Number(p.annee) === a && String(p.mois).toUpperCase() === mAvant
    )) {
      paiesAvantMap[Number(p.employe_id)] = p;
    }

    for (const p1 of paiesActuel.sort(
      (x: any, y: any) => Number(x.numero_matricule) - Number(y.numero_matricule)
    )) {
      const p2 = paiesAvantMap[Number(p1.employe_id)];
      const netAvant = p2 ? Number(p2.net || 0) : 0;
      const netActuel = Number(p1.net || 0);
      data.push({
        numero_matricule: p1.numero_matricule,
        nom_prenoms: p1.nom_prenoms,
        categorie: p1.categorie,
        jobs: p1.jobs,
        net_actuel: netActuel,
        net_avant: netAvant,
        ecart: Math.round((netActuel - netAvant) * 100) / 100,
      });
    }
  }

  return data;
}

// ------------------------------------------------------------------------------
// IMPORT D'UN CLASSEUR EXCEL (.xlsx / .xlsm) : PERSONNEL + ÉTATS MENSUELS
// ------------------------------------------------------------------------------
export interface ImportOptions {
  /** « fusion » : complète les données existantes — « remplacement » : repart de zéro. */
  mode: 'fusion' | 'remplacement';
  /** Importer également les états de paie mensuels trouvés dans le classeur. */
  importPaies: boolean;
  /** Écraser les bulletins déjà présents pour une même période. */
  ecraserPaies: boolean;
}

export interface ImportRapport {
  employesAjoutes: number;
  employesMisAJour: number;
  paiesAjoutees: number;
  paiesMisesAJour: number;
  periodes: { annee: number; mois: string }[];
}

const CHAMPS_TEXTE: (keyof ImportedEmploye)[] = [
  'nom_prenoms', 'numero_cnaps', 'categorie', 'jobs', 'date_embauche', 'rib', 'mode_paiement',
];
const CHAMPS_NOMBRE: (keyof ImportedEmploye)[] = [
  'nombre_annees', 'enfant_a_charge', 'base_aj', 'logement_transport', 'rendement',
  'responsabilite_representation',
];

function fusionnerEmploye(base: any, src: ImportedEmploye): any {
  const out: any = { ...base };
  for (const k of CHAMPS_TEXTE) {
    const v = String((src as any)[k] || '').trim();
    if (v) out[k] = v;
  }
  for (const k of CHAMPS_NOMBRE) {
    const v = Number((src as any)[k] || 0);
    if (v > 0) out[k] = v;
  }
  out.nom_prenoms = out.nom_prenoms || src.nom_prenoms;
  return out;
}

function nouveauEmploye(src: ImportedEmploye): any {
  return {
    id: nextEmployeId(),
    numero_matricule: Number(src.numero_matricule),
    nom_prenoms: src.nom_prenoms || `SALARIÉ ${src.numero_matricule}`,
    numero_cnaps: src.numero_cnaps || '',
    categorie: src.categorie || '',
    jobs: src.jobs || '',
    date_embauche: src.date_embauche || '',
    nombre_annees: src.nombre_annees || calculerAnciennete(src.date_embauche, new Date().getFullYear()),
    enfant_a_charge: src.enfant_a_charge || 0,
    base_aj: src.base_aj || 0,
    logement_transport: src.logement_transport || 0,
    rendement: src.rendement || 0,
    responsabilite_representation: src.responsabilite_representation || 0,
    rib: src.rib || '',
    mode_paiement: src.mode_paiement || 'ESPECES',
    actif: 1,
    conge_maternite: src.conge_maternite ? 1 : 0,
    date_debut_maternite: src.date_debut_maternite || '',
    date_creation: nowStamp(),
  };
}

function lignePaie(src: ImportedPaie, employeId: number, id: number): any {
  return {
    id,
    employe_id: employeId,
    numero_matricule: Number(src.numero_matricule),
    annee: Number(src.annee),
    mois: String(src.mois).toUpperCase(),
    nom_prenoms: src.nom_prenoms || '',
    numero_cnaps: src.numero_cnaps || '',
    categorie: src.categorie || '',
    jobs: src.jobs || '',
    date_embauche: src.date_embauche || '',
    nombre_annees: src.nombre_annees || 0,
    enfant_a_charge: src.enfant_a_charge || 0,
    base_aj: src.base_aj || 0,
    logt_trsp: src.logt_trsp || 0,
    rendement: src.rendement || 0,
    resp_repres: src.resp_repres || 0,
    salaire_brut: src.salaire_brut || 0,
    cnaps: src.cnaps || 0,
    patronal: src.patronal || 0,
    salaire_imposable: src.salaire_imposable || 0,
    irsa: src.irsa || 0,
    salaire_net: src.salaire_net || 0,
    augmentation_divers: src.augmentation_divers || 0,
    prime_de_garde: src.prime_de_garde || 0,
    anciennete2: src.anciennete2 || 0,
    risque: src.risque || 0,
    repr_rec: src.repr_rec || 0,
    accessoir: src.accessoir || 0,
    brut: src.brut || 0,
    avance: src.avance || 0,
    med: src.med || 0,
    net: src.net || 0,
    virement: src.virement,
    especes: src.especes,
    rap: src.rap === 0 ? 0 : 1,
    rib: src.rib || '',
    verrouille: 0,
    conge_maternite: 0,
    date_debut_maternite: '',
    date_modification: nowStamp(),
  };
}

export async function importerClasseur(
  result: ImportWorkbookResult,
  options: ImportOptions
): Promise<ImportRapport> {
  const store = getStore();

  if (options.mode === 'remplacement') {
    store.employes = [];
    store.paies = [];
  }

  const rapport: ImportRapport = {
    employesAjoutes: 0,
    employesMisAJour: 0,
    paiesAjoutees: 0,
    paiesMisesAJour: 0,
    periodes: [],
  };

  // Index matricule -> employé
  const parMatricule = new Map<number, any>();
  for (const e of store.employes) parMatricule.set(Number(e.numero_matricule), e);

  for (const src of result.employes) {
    if (!src.numero_matricule) continue;
    const exist = parMatricule.get(Number(src.numero_matricule));
    if (exist) {
      const merged = fusionnerEmploye(exist, src);
      Object.assign(exist, merged);
      rapport.employesMisAJour++;
    } else {
      const created = nouveauEmploye(src);
      store.employes.push(created);
      parMatricule.set(Number(src.numero_matricule), created);
      rapport.employesAjoutes++;
    }
  }

  // Les bulletins peuvent référencer un matricule absent de la liste du personnel
  for (const p of result.paies) {
    if (!parMatricule.has(Number(p.numero_matricule))) {
      const created = nouveauEmploye({
        numero_matricule: p.numero_matricule,
        nom_prenoms: p.nom_prenoms,
        numero_cnaps: p.numero_cnaps,
        categorie: p.categorie,
        jobs: p.jobs,
        date_embauche: p.date_embauche,
        nombre_annees: p.nombre_annees,
        enfant_a_charge: p.enfant_a_charge,
        base_aj: p.base_aj,
        logement_transport: p.logt_trsp,
        rendement: p.rendement,
        responsabilite_representation: p.resp_repres,
        rib: p.rib,
        mode_paiement: p.rib ? 'VIREMENT' : 'ESPECES',
        conge_maternite: 0,
        date_debut_maternite: '',
      });
      store.employes.push(created);
      parMatricule.set(Number(p.numero_matricule), created);
      rapport.employesAjoutes++;
    }
  }

  if (options.importPaies) {
    const periodesSet = new Set<string>();
    for (const src of result.paies) {
      const emp = parMatricule.get(Number(src.numero_matricule));
      if (!emp) continue;
      const idx = store.paies.findIndex(
        (p: any) =>
          Number(p.employe_id) === Number(emp.id) &&
          Number(p.annee) === Number(src.annee) &&
          String(p.mois).toUpperCase() === String(src.mois).toUpperCase()
      );
      if (idx >= 0) {
        if (!options.ecraserPaies) continue;
        const existing = store.paies[idx];
        store.paies[idx] = {
          ...lignePaie(src, Number(emp.id), Number(existing.id)),
          verrouille: Number(existing.verrouille) || 0,
        };
        rapport.paiesMisesAJour++;
      } else {
        store.paies.push(lignePaie(src, Number(emp.id), nextPaieId()));
        rapport.paiesAjoutees++;
      }
      periodesSet.add(`${src.mois} ${src.annee}`);
    }
    rapport.periodes = result.periodes.map((p) => ({ annee: p.annee, mois: p.mois }));
  }

  // Mise à jour de l'en-tête (année / mois disponibles)
  try {
    const annees = Array.from(new Set(store.paies.map((p: any) => Number(p.annee)))).sort();
    if (annees.length) store.meta.annee = annees[annees.length - 1];
    store.meta.mois_disponibles = MOIS_FR.filter((m) =>
      store.paies.some((p: any) => String(p.mois).toUpperCase() === m)
    );
  } catch {
    /* ignore */
  }

  saveStore();
  return rapport;
}

/** Liste des périodes (année + mois) effectivement présentes dans les données. */
export async function fetchPeriodes(): Promise<{ annee: number; mois: string; nb: number }[]> {
  const store = getStore();
  const map = new Map<string, { annee: number; mois: string; nb: number }>();
  for (const p of store.paies || []) {
    const a = Number(p.annee);
    const m = String(p.mois).toUpperCase();
    const k = `${a}|${m}`;
    const cur = map.get(k);
    if (cur) cur.nb++;
    else map.set(k, { annee: a, mois: m, nb: 1 });
  }
  return Array.from(map.values()).sort(
    (x, y) => x.annee - y.annee || MOIS_FR.indexOf(x.mois) - MOIS_FR.indexOf(y.mois)
  );
}

export interface SaisieLot {
  paieId: number;
  avance?: number;
  med?: number;
  /** Valeurs affichées à l'ouverture, pour éviter d'écraser une autre saisie. */
  avanceInitiale: number;
  medInitial: number;
}

/** Sauvegarde atomique d'un lot pour une seule période, sans recalculer les gains importés. */
export async function enregistrerSaisieLot(annee: number, mois: string, lignes: SaisieLot[]): Promise<{ success: boolean; message?: string; count?: number }> {
  const store = getStore();
  const periode = (p: any) => Number(p.annee) === Number(annee) && String(p.mois).toUpperCase() === String(mois).toUpperCase();
  if (!lignes.length) return { success: false, message: 'Ajoutez au moins une saisie.' };
  if (!storeEstSynchronise()) return { success: false, message: 'Les données ont changé dans un autre onglet. Rechargez la page avant de saisir à nouveau.' };
  if (store.paies.some((p: any) => periode(p) && Number(p.verrouille) === 1)) return { success: false, message: 'Cette période est clôturée. Déverrouillez-la avant de saisir.' };
  const seen = new Set<number>();
  const updates: { index: number; row: any }[] = [];
  const cfg = loadConfig();
  for (const line of lignes) {
    const id = Number(line.paieId);
    const index = store.paies.findIndex((p: any) => Number(p.id) === id && periode(p));
    if (!Number.isInteger(id) || seen.has(id) || index < 0) return { success: false, message: 'Un bulletin est introuvable ou figure plusieurs fois dans le lot. Rechargez la période.' };
    seen.add(id);
    const p = store.paies[index];
    if (Number(p.verrouille) === 1) return { success: false, message: 'Un bulletin est clôturé. Aucune saisie enregistrée.' };
    if (Number(p.avance || 0) !== line.avanceInitiale || Number(p.med || 0) !== line.medInitial) return { success: false, message: `Les retenues de ${p.nom_prenoms} ont changé depuis l'ouverture. Fermez et rechargez la période.` };
    if (line.avance === undefined && line.med === undefined) return { success: false, message: 'Une ligne ne contient aucun montant.' };
    for (const value of [line.avance, line.med]) {
      if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER / 100 || Math.abs(value * 100 - Math.round(value * 100)) > 0.00001)) return { success: false, message: 'Les montants doivent être des nombres positifs valides.' };
    }
    const avance = line.avance === undefined ? Number(p.avance || 0) : line.avance;
    const med = line.med === undefined ? Number(p.med || 0) : line.med;
    if (avance === Number(p.avance || 0) && med === Number(p.med || 0)) continue;
    // Même arrondi que le moteur de paie, à partir du BRUT existant de l'état.
    const brutApresRetenues = Math.max(0, Number(p.brut || 0) - avance - med);
    const pas = Number(cfg.arrondiNet) || 0;
    const net = pas > 0 ? Math.floor(brutApresRetenues / pas) * pas : Math.floor(brutApresRetenues);
    let virement = p.virement == null ? null : Number(p.virement);
    let especes = p.especes == null ? null : Number(p.especes);
    // Conserver le mode de règlement de la ligne existante (un RIB ne signifie
    // pas forcément que le salarié a été payé par virement dans le classeur).
    if (virement === null && especes === null) {
      // Pas de ventilation connue : ne pas l'inventer.
    } else if (virement !== null && (virement > 0 || (Number(p.net || 0) === 0 && (especes === null || especes === 0)))) {
      const partEspeces = Math.min(Math.max(0, Number(especes || 0)), net);
      virement = net - partEspeces;
      if (especes !== null) especes = partEspeces;
    } else {
      if (virement !== null) virement = 0;
      especes = net;
    }
    updates.push({ index, row: { ...p, avance, med, net, virement, especes, date_modification: nowStamp() } });
  }
  if (!updates.length) return { success: true, count: 0 };
  const anciens = updates.map(({ index }) => store.paies[index]);
  updates.forEach(({ index, row }) => { store.paies[index] = row; });
  if (!saveStore()) {
    updates.forEach(({ index }, i) => { store.paies[index] = anciens[i]; });
    return { success: false, message: "L'enregistrement a échoué. Vérifiez l'espace de stockage du navigateur." };
  }
  return { success: true, count: updates.length };
}
