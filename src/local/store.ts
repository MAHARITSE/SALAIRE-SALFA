// ==============================================================================
// CLIENT LOCAL : STORE 100% NAVIGATEUR (localStorage) - SALFA TANAMBAO
// Remplace le serveur Node / Express + salfa_data.json.
// Les données vivent dans le localStorage du navigateur et sont initialisées
// à partir du fichier JSON embarqué src/data/salfa_data.json.
// ==============================================================================

import initialData from '../data/salfa_data.json';
import { defaultUtilisateurs } from './users';
import { appliquerPersonnelAuxFiches, PERSONNEL_VERSION } from './personnel';

export interface JsonStore {
  meta: any;
  bareme_anciennete: any;
  employes: any[];
  paies: any[];
  comparaison_net: any[];
  utilisateurs: any[];
  /** Fiches d'absence : congés, permissions, examens médicaux, ajustements de droit. */
  conges: any[];
  /** Années explicitement ajoutées dans la base par l'utilisateur via le bouton d'ajout d'année. */
  annees?: number[];
}

const STORAGE_KEY = 'salfa_paie_store_v1';

let storeCache: JsonStore | null = null;
let remoteMode = false;
/** Le mode serveur n'utilise jamais le localStorage pour les données de paie. */
export function setRemoteStore(store: JsonStore): void { remoteMode = true; storeCache = store; }
export function remoteStoreActive(): boolean { return remoteMode; }
export function clearRemoteStore(): void { remoteMode = true; storeCache = null; }

function nowStamp(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

// Retourne un store initial depuis les données embarquées (ou vide).
function seedStore(): JsonStore {
  // Ne jamais partager les objets importés : les modifications locales ne doivent
  // pas contaminer les données utilisées par une réinitialisation ultérieure.
  const raw: any = initialData && typeof initialData === 'object'
    ? JSON.parse(JSON.stringify(initialData)) : {};
  return {
    meta: raw.meta || { annee: new Date().getFullYear() },
    bareme_anciennete: raw.bareme_anciennete || {},
    employes: Array.isArray(raw.employes) ? raw.employes : [],
    paies: Array.isArray(raw.paies) ? raw.paies : [],
    comparaison_net: Array.isArray(raw.comparaison_net) ? raw.comparaison_net : [],
    conges: Array.isArray(raw.conges) ? raw.conges : [],
    annees: Array.isArray(raw.annees) ? raw.annees.map((y: any) => Number(y)).filter((y: number) => Number.isInteger(y) && y >= 1990 && y <= 2100) : [],
    utilisateurs:
      Array.isArray(raw.utilisateurs) && raw.utilisateurs.length
        ? raw.utilisateurs
        : defaultUtilisateurs(),
  };
}

export function loadStore(): JsonStore {
  if (storeCache) return storeCache;
  if (remoteMode) throw new Error('Session serveur absente.');

  let loaded: JsonStore | null = null;
  try {
    const rawText = localStorage.getItem(STORAGE_KEY);
    if (rawText) {
      const parsed = JSON.parse(rawText);
      if (parsed && Array.isArray(parsed.employes) && Array.isArray(parsed.paies)) {
        loaded = parsed as JsonStore;
      }
    }
  } catch (e) {
    console.warn('[LOCAL STORE] localStorage illisible, réinitialisation.', e);
  }

  if (!loaded) {
    loaded = seedStore();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(loaded));
    } catch (e) {
      console.error('[LOCAL STORE] Sauvegarde initiale impossible (stockage plein ?)', e);
    }
  }

  // Une seule fois, compléter les anciens navigateurs sans écraser leurs saisies.
  // Ne pas ajouter de lignes à un mois déjà clôturé.
  if (loaded.meta?.source_version !== 'classeur-2026-10') {
    const seed = seedStore();
    const byMat = new Map(loaded.employes.map((e: any) => [Number(e.numero_matricule), e]));
    let nextEmp = loaded.employes.reduce((n: number, e: any) => Math.max(n, Number(e.id) || 0), 0);
    let nextPaie = loaded.paies.reduce((n: number, p: any) => Math.max(n, Number(p.id) || 0), 0);
    for (const e of seed.employes) {
      if (!byMat.has(Number(e.numero_matricule))) {
        const copy = { ...e, id: ++nextEmp };
        loaded.employes.push(copy);
        byMat.set(Number(copy.numero_matricule), copy);
      }
    }
    const periodKey = (p: any) => `${Number(p.annee)}|${String(p.mois).toUpperCase()}`;
    const locked = new Set(loaded.paies.filter((p: any) => Number(p.verrouille) === 1).map(periodKey));
    const keys = new Set(loaded.paies.map((p: any) => `${periodKey(p)}|${Number(p.numero_matricule)}`));
    for (const p of seed.paies) {
      const key = `${periodKey(p)}|${Number(p.numero_matricule)}`;
      if (!locked.has(periodKey(p)) && !keys.has(key)) {
        loaded.paies.push({ ...p, id: ++nextPaie, employe_id: byMat.get(Number(p.numero_matricule)).id });
        keys.add(key);
      }
    }
    loaded.meta = { ...loaded.meta, source_version: 'classeur-2026-10' };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(loaded)); }
    catch (e) { console.error('[LOCAL STORE] Migration non sauvegardée.', e); }
  }

  // Compléter les fiches salariés avec « LISTE DE PERSONNEL.xlsx » sans écraser
  // les saisies existantes : seuls les champs complémentaires absents sont ajoutés.
  if (loaded.meta?.personnel_version !== PERSONNEL_VERSION) {
    appliquerPersonnelAuxFiches(loaded.employes);
    loaded.meta = { ...loaded.meta, personnel_version: PERSONNEL_VERSION };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(loaded)); }
    catch (e) { console.error('[LOCAL STORE] Migration personnel non sauvegardée.', e); }
  }

  // Les fiches d'absence arrivent d'une version antérieure du store : garantir la liste
  // et mettre à jour l'historique du contrôle SALFA oct. 2026 en préservant les saisies manuelles.
  if (!Array.isArray(loaded.conges)) loaded.conges = [];
  if (loaded.meta?.conges_version !== 'controle-2026-10') {
    if (loaded.conges.length === 0 || loaded.meta?.conges_version === 'controle-2026') {
      loaded.conges = loaded.conges.filter((x: any) => x.saisie_par && x.saisie_par !== 'Import Excel');
      const seed = seedStore();
      const byMat = new Map(loaded.employes.map((e: any) => [Number(e.numero_matricule), e]));
      let nextC = loaded.conges.reduce((m: number, x: any) => Math.max(m, Number(x.id) || 0), 0);
      const seen = new Set(
        loaded.conges.map((x: any) => `${Number(x.employe_id)}|${x.date_debut}|${x.categorie}|${Number(x.jours_demandes)}`)
      );
      for (const c of seed.conges || []) {
        const emp = byMat.get(Number(c.numero_matricule));
        if (!emp) continue;
        const key = `${Number(emp.id)}|${c.date_debut}|${c.categorie}|${Number(c.jours_demandes)}`;
        if (!seen.has(key)) {
          loaded.conges.push({ ...c, id: ++nextC, employe_id: Number(emp.id) });
          seen.add(key);
        }
      }
    }
    loaded.meta = { ...loaded.meta, conges_version: 'controle-2026-10' };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(loaded)); }
    catch (e) { console.error('[LOCAL STORE] Migration congés non sauvegardée.', e); }
  }

  // Mise en conformité Code du Travail malgache & règle SALFA (pas de cumul des
  // congés non pris avant 2024 / avant la 1re année de la fenêtre affichée) :
  // purger les anciens ajustements automatiques d'import tout en conservant les saisies manuelles.
  if (loaded.meta?.conges_loi_3ans !== 3) {
    loaded.conges = loaded.conges.filter((c: any) => !(c.categorie === 'AJUSTEMENT' && c.saisie_par === 'Import Excel'));
    for (const c of loaded.conges) {
      const m = /^Titre\s+(20\d{2})$/.exec(String(c.titre_periode || ''));
      if (m && Number(m[1]) < Number(c.annee) - 2) {
        c.titre_periode = `Titre ${Number(c.annee) - 2}`;
      }
    }
    loaded.meta = { ...loaded.meta, conges_loi_3ans: 3 };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(loaded)); }
    catch (e) { console.error('[LOCAL STORE] Migration loi 3 ans non sauvegardée.', e); }
  }

  // Renseigner la date de mise en inactif si un salarié déjà inactif n'en portait pas encore.
  const MOIS_MIG = ['JANVIER','FEVRIER','MARS','AVRIL','MAI','JUIN','JUILLET','AOUT','SEPTEMBRE','OCTOBRE','NOVEMBRE','DECEMBRE'];
  let majInactifs = false;
  for (const e of loaded.employes) {
    if (Number(e.actif) !== 1 && !e.date_inactif) {
      const ps = (loaded.paies || []).filter((p: any) => Number(p.employe_id) === Number(e.id));
      if (ps.length > 0) {
        let maxIdx = -1;
        for (const p of ps) {
          const idx = Number(p.annee) * 12 + MOIS_MIG.indexOf(String(p.mois).toUpperCase());
          if (idx > maxIdx) maxIdx = idx;
        }
        const nextIdx = maxIdx + 1;
        e.date_inactif = `${Math.floor(nextIdx / 12)}-${String((nextIdx % 12) + 1).padStart(2, '0')}-01`;
      } else {
        e.date_inactif = new Date().toISOString().slice(0, 10);
      }
      majInactifs = true;
    }
  }
  if (majInactifs) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(loaded)); }
    catch { /* ignore */ }
  }

  // Suppression définitive de l'ancien champ obsolète `rap` s'il restait en cache navigateur
  let strippedRap = false;
  for (const p of loaded.paies || []) {
    if (p && typeof p === 'object' && 'rap' in p) {
      delete p.rap;
      strippedRap = true;
    }
  }
  if (strippedRap) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(loaded)); }
    catch { /* ignore */ }
  }

  // Garantir les utilisateurs par défaut
  if (!Array.isArray(loaded.utilisateurs) || loaded.utilisateurs.length === 0) {
    loaded.utilisateurs = defaultUtilisateurs();
  }

  storeCache = loaded;
  return loaded;
}

export function saveStore(): boolean {
  if (!storeCache) return false;
  if (remoteMode) return true; // La transaction réseau est validée par l’adaptateur API.
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storeCache));
    return true;
  } catch (e) {
    console.error('[LOCAL STORE] Sauvegarde impossible (stockage plein ?)', e);
    return false;
  }
}

// Détecte une modification dans un autre onglet avant une écriture en lot.
export function storeEstSynchronise(): boolean {
  if (!storeCache) return false;
  if (remoteMode) return true;
  try { return localStorage.getItem(STORAGE_KEY) === JSON.stringify(storeCache); }
  catch { return false; }
}

// Réinitialise complètement les données locales à partir des données embarquées.
export function resetStore(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    /* ignore */
  }
  storeCache = null;
  loadStore();
}

export function getStore(): JsonStore {
  return loadStore();
}

// --- Helpers pour générer des IDs auto-incrémentés ---
export function nextEmployeId(): number {
  const store = getStore();
  return store.employes.reduce((m, e) => Math.max(m, Number(e.id) || 0), 0) + 1;
}

export function nextPaieId(): number {
  const store = getStore();
  return store.paies.reduce((m, p) => Math.max(m, Number(p.id) || 0), 0) + 1;
}

export function nextCongeId(): number {
  const store = getStore();
  return (store.conges || []).reduce((m: number, c: any) => Math.max(m, Number(c.id) || 0), 0) + 1;
}

export function nextUtilisateurId(): number {
  const store = getStore();
  return (store.utilisateurs || []).reduce((m: number, u: any) => Math.max(m, Number(u.id) || 0), 0) + 1;
}

export function nextComparaisonId(): number {
  const store = getStore();
  return store.comparaison_net.reduce((m, c) => Math.max(m, Number(c.id) || 0), 0) + 1;
}

export { nowStamp };
