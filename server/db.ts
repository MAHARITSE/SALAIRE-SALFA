// ==============================================================================
// SERVEUR NODE : STORE JSON PUR (SANS SQLITE) - SALFA TANAMBAO
// Toute la persistence est dans salfa_data.json à la racine du projet.
// ==============================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '..');
const JSON_PATH = path.resolve(process.env.JSON_PATH || path.join(PROJECT_ROOT, 'salfa_data.json'));

// --- Types internes du store JSON ---
export interface JsonStore {
  meta: any;
  bareme_anciennete: any;
  employes: any[];
  paies: any[];
  comparaison_net: any[];
  utilisateurs: any[];
}

let storeCache: JsonStore | null = null;
let initialized = false;

// Migration depuis ancien format imbriqué (paie_mensuelle: {JANVIER: {employes: []}})
function migrateLegacyIfNeeded(raw: any): JsonStore | null {
  // Nouveau format flat : il faut employes + paies
  if (raw && Array.isArray(raw.employes) && Array.isArray(raw.paies)) {
    return {
      meta: raw.meta || {},
      bareme_anciennete: raw.bareme_anciennete || {},
      employes: raw.employes,
      paies: raw.paies,
      comparaison_net: raw.comparaison_net || [],
      utilisateurs: raw.utilisateurs || defaultUtilisateurs(),
    };
  }

  // Ancien format : paie_mensuelle imbriquée
  if (raw && raw.paie_mensuelle && typeof raw.paie_mensuelle === 'object') {
    console.log('[JSON STORE] Format legacy détecté (paie_mensuelle imbriquée). Migration vers format plat...');
    const employesMap: Record<number, any> = {};
    const paies: any[] = [];
    let nextEmpId = 1;
    let nextPaieId = 1;

    // Construire la map des employés depuis toutes les périodes
    for (const mois of Object.keys(raw.paie_mensuelle)) {
      for (const emp of raw.paie_mensuelle[mois].employes || []) {
        const mat = emp['N° Mat'];
        if (!mat || mat === 'Total') continue;
        const mInt = Number(mat);
        if (!employesMap[mInt]) {
          employesMap[mInt] = {
            id: nextEmpId++,
            numero_matricule: mInt,
            nom_prenoms: String(emp['NOM ET PRENOMS'] || '').trim(),
            numero_cnaps: String(emp['N° CNaPS'] || '').trim(),
            categorie: String(emp['CAT'] || ''),
            jobs: String(emp['JOBS'] || ''),
            date_embauche: String(emp['Date emb'] || ''),
            nombre_annees: Number(emp["Nombre d'année"] || 0),
            enfant_a_charge: Number(emp['enfant a charge'] || 0),
            base_aj: Number(emp['BASE AJ'] || 0),
            logement_transport: Number(emp['Logt Trsp'] || 0),
            rendement: Number(emp['Rendement'] || 0),
            responsabilite_representation: Number(emp['RESP REPRES'] || 0),
            rib: String(emp['RIB'] || '').trim(),
            mode_paiement: emp['RIB'] ? 'VIREMENT' : 'ESPECES',
            actif: 1,
            date_creation: new Date().toISOString().slice(0, 19).replace('T',' '),
            conge_maternite: 0
          };
        }
      }
    }

    // Inclure aussi les employés de comparaison_net s'ils manquent
    if (raw.comparaison_net?.employes) {
      for (const cemp of raw.comparaison_net.employes) {
        const mat = cemp['N° Mat'];
        if (!mat || mat === 'Total') continue;
        const mInt = Number(mat);
        if (!employesMap[mInt]) {
          employesMap[mInt] = {
            id: nextEmpId++,
            numero_matricule: mInt,
            nom_prenoms: String(cemp['NOM ET PRENOMS'] || '').trim(),
            numero_cnaps: '',
            categorie: String(cemp['CAT'] || ''),
            jobs: String(cemp['JOBS'] || ''),
            date_embauche: '',
            nombre_annees: 0,
            enfant_a_charge: 0,
            base_aj: 0,
            logement_transport: 0,
            rendement: 0,
            responsabilite_representation: 0,
            rib: '',
            mode_paiement: 'ESPECES',
            actif: 1,
            date_creation: new Date().toISOString().slice(0, 19).replace('T',' '),
            conge_maternite: 0
          };
        }
      }
    }

    const employes = Object.values(employesMap).sort((a,b)=>a.numero_matricule-b.numero_matricule);
    const matToId: Record<number, number> = {};
    for (const e of employes) matToId[e.numero_matricule] = e.id;

    // Construire les paies en format plat
    for (const mois of Object.keys(raw.paie_mensuelle)) {
      for (const emp of raw.paie_mensuelle[mois].employes || []) {
        const mat = emp['N° Mat'];
        if (!mat || mat === 'Total') continue;
        const empId = matToId[Number(mat)];
        paies.push({
          id: nextPaieId++,
          employe_id: empId,
          numero_matricule: Number(mat),
          annee: Number(raw.meta?.annee || 2026),
          mois: mois.toUpperCase(),
          nom_prenoms: String(emp['NOM ET PRENOMS'] || ''),
          numero_cnaps: String(emp['N° CNaPS'] || ''),
          categorie: String(emp['CAT'] || ''),
          jobs: String(emp['JOBS'] || ''),
          date_embauche: String(emp['Date emb'] || ''),
          nombre_annees: Number(emp["Nombre d'année"] || 0),
          enfant_a_charge: Number(emp['enfant a charge'] || 0),
          base_aj: Number(emp['BASE AJ'] || 0),
          logt_trsp: Number(emp['Logt Trsp'] || 0),
          rendement: Number(emp['Rendement'] || 0),
          resp_repres: Number(emp['RESP REPRES'] || 0),
          salaire_brut: Number(emp['Salaire Brut'] || 0),
          cnaps: Number(emp['CNaPS'] || 0),
          patronal: Number(emp['Patronal'] || 0),
          salaire_imposable: Number(emp['salaire imp.'] || 0),
          irsa: Number(emp['IRSA'] || 0),
          salaire_net: Number(emp['SALAIRE NET'] || 0),
          augmentation_divers: Number(emp['AUGMENTATION DIVERS'] || 0),
          prime_de_garde: Number(emp['Prime  de garde'] || 0),
          anciennete2: Number(emp['Ancienneté2'] || 0),
          risque: Number(emp['RISQUE'] || 0),
          repr_rec: Number(emp["Repr° réc°"] || 0),
          accessoir: Number(emp['Accessoir'] || 0),
          brut: Number(emp['BRUT'] || 0),
          avance: Number(emp['AVANCE'] || 0),
          med: Number(emp['MED'] || 0),
          net: Number(emp['NET'] || 0),
          virement: emp['Virement'] != null ? Number(emp['Virement']) : null,
          especes: emp['Espèces'] != null ? Number(emp['Espèces']) : 0,
          rap: emp['RAP'] !== false ? 1 : 0,
          rib: String(emp['RIB'] || '').trim(),
          verrouille: 1,
          conge_maternite: 0,
          date_modification: new Date().toISOString().slice(0, 19).replace('T',' ')
        });
      }
    }

    // Comparaison
    const comparaison: any[] = [];
    let compId = 1;
    for (const cemp of raw.comparaison_net?.employes || []) {
      const mat = cemp['N° Mat'];
      if (!mat || mat === 'Total') continue;
      comparaison.push({
        id: compId++,
        numero_matricule: Number(mat),
        nom_prenoms: String(cemp['NOM ET PRENOMS'] || ''),
        categorie: String(cemp['CAT'] || ''),
        jobs: String(cemp['JOBS'] || ''),
        net_actuel: Number(cemp['NET'] || 0),
        net_avant: Number(cemp['Net Avant'] || 0),
        ecart: Number(cemp['ECART'] || 0)
      });
    }

    return {
      meta: raw.meta || {},
      bareme_anciennete: raw.bareme_anciennete || {},
      employes,
      paies,
      comparaison_net: comparaison,
      utilisateurs: defaultUtilisateurs()
    };
  }

  return null;
}

function defaultUtilisateurs() {
  // Hashes salés avec sel "salfa_tanambao_2026_salt_"
  return [
    {
      id: 1,
      username: 'admin',
      password_hash: '5a9e592c4c66b0fbabc6246cb059e6852c72652da3cf1dc485a721a3e4db1a97',
      nom_complet: 'Administrateur Principal SALFA',
      role: 'Administrateur',
      actif: 1
    },
    {
      id: 2,
      username: 'comptable',
      password_hash: '8acd1a4e11b1720b3b80be7db7f3e1340bb093a16f4553f2001b0bdaf9459fc6',
      nom_complet: 'Comptable Clinique SALFA',
      role: 'Comptable',
      actif: 1
    }
  ];
}

function loadStoreSync(): JsonStore {
  if (storeCache) return storeCache;

  // Si fichier n'existe pas, créer un store vide
  if (!fs.existsSync(JSON_PATH)) {
    console.log(`[JSON STORE] Aucun fichier trouvé à ${JSON_PATH}, création d'un store vide.`);
    const empty: JsonStore = {
      meta: {
        source_file: 'SALAIRE_SALFA_2026_2.xlsm',
        entreprise: 'SALFA TANAMBAO',
        titre: 'FILAZANA NY KARAMA SY NY TOA AZY ISAM-BATAN\'OLONA',
        annee: 2026,
        mois_disponibles: ['JANVIER','FEVRIER','MARS','AVRIL','MAI','JUIN']
      },
      bareme_anciennete: {
        description: "Barème de valorisation de l'ancienneté",
        regle: "Une unité = 2 années",
        bareme: []
      },
      employes: [],
      paies: [],
      comparaison_net: [],
      utilisateurs: defaultUtilisateurs()
    };
    storeCache = empty;
    saveStoreSync(empty);
    return empty;
  }

  const rawText = fs.readFileSync(JSON_PATH, 'utf8');
  let raw: any;
  try {
    raw = JSON.parse(rawText);
  } catch (e) {
    console.error(`[JSON STORE] Fichier JSON corrompu à ${JSON_PATH}, recréation.`, e);
    const empty: JsonStore = {
      meta: { annee: 2026 },
      bareme_anciennete: {},
      employes: [],
      paies: [],
      comparaison_net: [],
      utilisateurs: defaultUtilisateurs()
    };
    storeCache = empty;
    return empty;
  }

  // Essayer migration legacy si nécessaire
  const migrated = migrateLegacyIfNeeded(raw);
  if (migrated) {
    // Si c'était un legacy, sauvegarder immédiatement en nouveau format plat
    // mais seulement si le fichier original était vraiment legacy (pas déjà plat)
    const isLegacyFormat = raw.paie_mensuelle && !raw.paies;
    if (isLegacyFormat) {
      console.log('[JSON STORE] Sauvegarde du fichier migré en format plat JSON...');
      storeCache = migrated;
      saveStoreSync(migrated);
      return migrated;
    }
    storeCache = migrated;
    return migrated;
  }

  // Cas déjà plat mais peut manquer certains champs
  const store: JsonStore = {
    meta: raw.meta || {},
    bareme_anciennete: raw.bareme_anciennete || {},
    employes: Array.isArray(raw.employes) ? raw.employes : [],
    paies: Array.isArray(raw.paies) ? raw.paies : [],
    comparaison_net: Array.isArray(raw.comparaison_net) ? raw.comparaison_net : [],
    utilisateurs: Array.isArray(raw.utilisateurs) && raw.utilisateurs.length ? raw.utilisateurs : defaultUtilisateurs()
  };

  // S'assurer que les utilisateurs ont bien les champs requis
  if (!store.utilisateurs || store.utilisateurs.length === 0) {
    store.utilisateurs = defaultUtilisateurs();
  }

  storeCache = store;
  return store;
}

function saveStoreSync(store: JsonStore) {
  // Écriture atomique via fichier temporaire
  const tmpPath = JSON_PATH + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(tmpPath, JSON_PATH);
  storeCache = store;
}

// API publique - garde la compatibilité avec l'ancien db.ts
export async function getStore(): Promise<JsonStore> {
  if (!initialized) {
    loadStoreSync();
    initialized = true;
  }
  return storeCache!;
}

// Alias historique pour server/index.ts (anciennement getDb)
export async function getDb(): Promise<JsonStore> {
  return getStore();
}

export function saveStore() {
  if (storeCache) {
    saveStoreSync(storeCache);
  }
}

// Alias historique
export function saveDb() {
  saveStore();
}

// Helpers pour générer des IDs auto-incrémentés
export function nextEmployeId(): number {
  const store = loadStoreSync();
  const max = store.employes.reduce((m, e) => Math.max(m, Number(e.id) || 0), 0);
  return max + 1;
}

export function nextPaieId(): number {
  const store = loadStoreSync();
  const max = store.paies.reduce((m, p) => Math.max(m, Number(p.id) || 0), 0);
  return max + 1;
}

export function nextComparaisonId(): number {
  const store = loadStoreSync();
  const max = store.comparaison_net.reduce((m, c) => Math.max(m, Number(c.id) || 0), 0);
  return max + 1;
}

// Stubs pour compatibilité SQL si malgré tout du code appelle queryAll (ne doit plus arriver)
export async function queryAll<T = any>(_sql: string, _params: any[] = []): Promise<T[]> {
  console.warn('[JSON STORE] queryAll appelé mais obsolète en mode JSON pur. Retourne []');
  return [];
}
export async function queryOne<T = any>(_sql: string, _params: any[] = []): Promise<T | null> {
  console.warn('[JSON STORE] queryOne appelé mais obsolète en mode JSON pur.');
  return null;
}
export async function execWrite(_sql: string, _params: any[] = []): Promise<void> {
  console.warn('[JSON STORE] execWrite appelé mais obsolète en mode JSON pur.');
}
