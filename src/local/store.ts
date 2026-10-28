// ==============================================================================
// CLIENT LOCAL : STORE 100% NAVIGATEUR (localStorage) - SALFA TANAMBAO
// Remplace le serveur Node / Express + salfa_data.json.
// Les données vivent dans le localStorage du navigateur et sont initialisées
// à partir du fichier JSON embarqué src/data/salfa_data.json.
// ==============================================================================

import initialData from '../data/salfa_data.json';
import { defaultUtilisateurs } from './users';

export interface JsonStore {
  meta: any;
  bareme_anciennete: any;
  employes: any[];
  paies: any[];
  comparaison_net: any[];
  utilisateurs: any[];
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

export function nextComparaisonId(): number {
  const store = getStore();
  return store.comparaison_net.reduce((m, c) => Math.max(m, Number(c.id) || 0), 0) + 1;
}

export { nowStamp };
