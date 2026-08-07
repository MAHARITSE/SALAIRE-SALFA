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

function nowStamp(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

// Retourne un store initial depuis les données embarquées (ou vide).
function seedStore(): JsonStore {
  const raw: any = initialData && typeof initialData === 'object' ? initialData : {};
  return {
    meta: raw.meta || { annee: 2026 },
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

  // Garantir les utilisateurs par défaut
  if (!Array.isArray(loaded.utilisateurs) || loaded.utilisateurs.length === 0) {
    loaded.utilisateurs = defaultUtilisateurs();
  }

  storeCache = loaded;
  return loaded;
}

export function saveStore(): void {
  if (!storeCache) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storeCache));
  } catch (e) {
    console.error('[LOCAL STORE] Sauvegarde impossible (stockage plein ?)', e);
  }
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
