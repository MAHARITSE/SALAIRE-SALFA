// ==============================================================================
// IMPORT EXCEL / LECTURE DU CLASSEUR DE PAIE SALFA
// Lit un fichier .xlsx / .xlsm (SALAIRE_SALFA_xxxx.xlsm) entièrement dans le
// navigateur et en extrait :
//   - le PERSONNEL (fiches salariés)
//   - les ÉTATS DE PAIE mensuels (toutes les colonnes du classeur)
// Aucun serveur : tout se passe côté client (SheetJS).
// ==============================================================================

import * as XLSX from 'xlsx';
import { calculerAnciennete } from './calcul';

export const MOIS_FR = [
  'JANVIER', 'FEVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN',
  'JUILLET', 'AOUT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DECEMBRE',
];

export interface ImportedEmploye {
  numero_matricule: number;
  nom_prenoms: string;
  numero_cnaps: string;
  categorie: string;
  jobs: string;
  date_embauche: string;
  nombre_annees: number;
  enfant_a_charge: number;
  base_aj: number;
  logement_transport: number;
  rendement: number;
  responsabilite_representation: number;
  rib: string;
  mode_paiement: string;
  conge_maternite: number;
  date_debut_maternite: string;
}

export interface ImportedPaie {
  numero_matricule: number;
  annee: number;
  mois: string;
  nom_prenoms: string;
  numero_cnaps: string;
  categorie: string;
  jobs: string;
  date_embauche: string;
  nombre_annees: number;
  enfant_a_charge: number;
  base_aj: number;
  logt_trsp: number;
  rendement: number;
  resp_repres: number;
  salaire_brut: number;
  cnaps: number;
  patronal: number;
  salaire_imposable: number;
  irsa: number;
  salaire_net: number;
  augmentation_divers: number;
  prime_de_garde: number;
  anciennete2: number;
  risque: number;
  repr_rec: number;
  accessoir: number;
  brut: number;
  avance: number;
  med: number;
  net: number;
  virement: number | null;
  especes: number | null;
  rap: number;
  rib: string;
}

export type TypeFeuille = 'personnel' | 'etat' | 'ignore';

export interface SheetInfo {
  nom: string;
  type: TypeFeuille;
  ligneEntete: number;
  nbLignes: number;
  colonnes: string[];
  periode?: string;
  message?: string;
}

export interface ImportWorkbookResult {
  fichier: string;
  feuilles: SheetInfo[];
  employes: ImportedEmploye[];
  paies: ImportedPaie[];
  periodes: { annee: number; mois: string; nb: number }[];
  avertissements: string[];
}

// ------------------------------------------------------------------------------
// Utilitaires de normalisation
// ------------------------------------------------------------------------------
function norm(v: any): string {
  return String(v === null || v === undefined ? '' : v)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function asText(v: any): string {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

/** Convertit une cellule en nombre (gère « 1 234,56 », « 1.234,56 », « Ar »…). */
export function toNumber(v: any): number {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  let s = String(v).trim();
  if (!s) return 0;
  s = s.replace(/\u00A0/g, ' ').replace(/[^\d.,\-]/g, '');
  if (!s) return 0;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    // Le dernier séparateur rencontré est le séparateur décimal
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma > -1) {
    s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/** Convertit une cellule en date ISO yyyy-mm-dd. */
export function toDateISO(v: any): string {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date && !isNaN(v.getTime())) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const parsed = XLSX.SSF.parse_date_code(v);
    if (parsed && parsed.y) {
      const m = String(parsed.m).padStart(2, '0');
      const d = String(parsed.d).padStart(2, '0');
      return `${parsed.y}-${m}-${d}`;
    }
  }
  const s = String(v).trim();
  if (!s) return '';
  // 2024-08-23 / 2024/08/23
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  // 23/08/2024
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  // 08/2024 => 1er du mois
  m = s.match(/^(\d{1,2})[-/.](\d{4})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}-01`;
  return '';
}

// ------------------------------------------------------------------------------
// Reconnaissance des en-têtes de colonnes
// ------------------------------------------------------------------------------
const ALIASES: { key: string; test: RegExp }[] = [
  // Identité
  { key: 'numero_matricule', test: /^(N\s?MAT|NO\s?MAT|NUM\s?MAT|MATRICULE|MAT)\b/ },
  // « N° CNAPS » / « N CNAPS » = immatriculation du salarié
  { key: 'numero_cnaps', test: /^(N|NO|NUM|NUMERO)\s?CNAPS/ },
  // « CNaPS » seul = cotisation salariale
  { key: 'cnaps', test: /CNAPS|C N A P S/ },
  { key: 'prenoms', test: /^PRENOM/ },
  { key: 'nom_prenoms', test: /NOM|PRENOM/ },
  { key: 'index', test: /^(N|NO|NUM|NUMERO|ORDRE|ORD)$/ },

  // Gains / retenues (ordre critique : du plus spécifique au plus générique)
  { key: 'salaire_imposable', test: /IMPOSABLE/ },
  { key: 'patronal', test: /PATRONAL/ },
  { key: 'salaire_net', test: /SALAIRE\s?NET/ },
  { key: 'net', test: /NET\s?A\s?PAYER|A\s?PAYER/ },
  { key: 'net', test: /^NET$/ },
  { key: 'salaire_brut', test: /SALAIRE\s?BRUT|SAL\s?BRUT|SALAIRE\s?DE\s?BASE\s?BRUT/ },
  { key: 'brut', test: /^BRUT/ },
  { key: 'base_aj', test: /BASE\s?AJ|^BASE|SALAIRE\s?DE\s?BASE|^AJ$/ },
  { key: 'logt_trsp', test: /LOGT|LOGEMENT|TRANSPORT|TRSP/ },
  { key: 'rendement', test: /RENDEMENT|PRIME\s?REND|^REND/ },
  { key: 'resp_repres', test: /RESP|REPRES/ },
  { key: 'irsa', test: /IRSA|IMPOT|I R S A/ },
  { key: 'augmentation_divers', test: /AUGMENT|DIVERS|^AUGM|^AUG\b/ },
  { key: 'prime_de_garde', test: /GARDE/ },
  { key: 'anciennete2', test: /ANC\s?2|ANCIENNETE\s?2|PRIME\s?ANC/ },
  { key: 'risque', test: /RISQUE/ },
  { key: 'repr_rec', test: /^REPR|REC\b/ },
  { key: 'accessoir', test: /ACCESS/ },
  { key: 'avance', test: /AVANCE/ },
  { key: 'med', test: /^MED$|^MED\b|MEDECIN|MEDICAL/ },
  { key: 'virement', test: /VIREMENT|VIR\b/ },
  { key: 'especes', test: /ESPECE|CASH/ },
  { key: 'rap', test: /^RAP$/ },
  { key: 'rib', test: /^RIB|COMPTE|BANQUE/ },

  // Fiche salarié
  { key: 'mode_paiement', test: /MODE|PAIEMENT|REGLEMENT/ },
  { key: 'categorie', test: /^CAT|CATEGORIE/ },
  { key: 'jobs', test: /JOB|FONCTION|POSTE|EMPLOI/ },
  { key: 'date_embauche', test: /DATE.*EMB|EMBAUCHE|DATE.*ENTREE|ANCIENNETE.*DATE/ },
  { key: 'enfant_a_charge', test: /ENFANT/ },
  { key: 'nombre_annees', test: /^(ANNEE|ANNEES|AN|NB\s?AN|NB\s?ANNEE|ANCIENNETE)$/ },
  { key: 'mois', test: /^MOIS|PERIODE/ },
  { key: 'conge_maternite', test: /MATERNITE|CONGE/ },
];

/** Retourne la clé canonique d'un libellé d'en-tête (ou null). */
export function matchHeader(raw: any): string | null {
  const h = norm(raw);
  if (!h || h.length > 40) return null;
  for (const a of ALIASES) {
    if (a.test.test(h)) return a.key;
  }
  return null;
}

// ------------------------------------------------------------------------------
// Détection de la période (mois / année)
// ------------------------------------------------------------------------------
const MOIS_REGEX: { mois: string; re: RegExp }[] = [
  { mois: 'JANVIER', re: /(^|\s)JANV[A-Z]*(\s|$)/ },
  { mois: 'FEVRIER', re: /(^|\s)FEV[R]?[A-Z]*(\s|$)/ },
  { mois: 'MARS', re: /(^|\s)MARS?(\s|$)/ },
  { mois: 'AVRIL', re: /(^|\s)AVR[A-Z]*(\s|$)/ },
  { mois: 'MAI', re: /(^|\s)MAI(\s|$)/ },
  { mois: 'JUIN', re: /(^|\s)JUIN(\s|$)/ },
  { mois: 'JUILLET', re: /(^|\s)JUIL[A-Z]*(\s|$)/ },
  { mois: 'AOUT', re: /(^|\s)AOUT(\s|$)/ },
  { mois: 'SEPTEMBRE', re: /(^|\s)SEPT?[A-Z]*(\s|$)/ },
  { mois: 'OCTOBRE', re: /(^|\s)OCT[A-Z]*(\s|$)/ },
  { mois: 'NOVEMBRE', re: /(^|\s)NOV[A-Z]*(\s|$)/ },
  { mois: 'DECEMBRE', re: /(^|\s)DEC[A-Z]*(\s|$)/ },
];

export function detectMoisEtAnnee(texte: string, anneeDefaut: number): { mois: string | null; annee: number } {
  const t = norm(texte);
  let mois: string | null = null;
  let bestPos = Number.MAX_SAFE_INTEGER;
  for (const { mois: m, re } of MOIS_REGEX) {
    const r = re.exec(t);
    if (r && r.index < bestPos) {
      bestPos = r.index;
      mois = m;
    }
  }
  let annee = anneeDefaut;
  // Format numérique : « 01 2026 », « 1-2026 », « PAIE 3 2026 »
  const numMatch = t.match(/(?:^|\s)0?([1-9]|1[0-2])[\s\-_/.]+(20\d{2})(?:\s|$)/);
  if (numMatch) {
    const moisNum = parseInt(numMatch[1], 10);
    if (!mois) mois = MOIS_FR[moisNum - 1] || null;
    annee = parseInt(numMatch[2], 10);
    return { mois, annee };
  }
  const y4 = t.match(/(20\d{2})/);
  if (y4) annee = parseInt(y4[1], 10);
  else {
    const y2 = t.match(/(^|\s)'?(\d{2})(\s|$)/);
    if (y2) {
      const n = parseInt(y2[2], 10);
      if (n >= 0 && n <= 99) annee = 2000 + n;
    }
  }
  return { mois, annee };
}

function periodeLabel(annee: number, mois: string): string {
  return `${mois} ${annee}`;
}

// ------------------------------------------------------------------------------
// Lecture d'une feuille
// ------------------------------------------------------------------------------
type ColMap = Record<string, number>;

/** Vrai si la colonne ressemble à des numéros d'immatriculation CNaPS. */
function colonneRessembleANumeroCnaps(rows: any[][], headerIdx: number, col: number): boolean {
  let total = 0;
  let longs = 0;
  for (let i = headerIdx + 1; i < Math.min(rows.length, headerIdx + 10); i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const v = toNumber(row[col]);
    if (v > 0) {
      total++;
      if (v >= 100000000) longs++;
    }
  }
  return total > 0 && longs / total >= 0.6;
}

function buildColMap(headerRow: any[]): ColMap {
  const map: ColMap = {};
  headerRow.forEach((cell, idx) => {
    const key = matchHeader(cell);
    if (key && map[key] === undefined) map[key] = idx;
  });
  return map;
}

function findHeaderRow(rows: any[][]): { index: number; map: ColMap; score: number } {
  let best = { index: -1, map: {} as ColMap, score: 0 };
  const limit = Math.min(rows.length, 60);
  for (let i = 0; i < limit; i++) {
    const row = rows[i];
    if (!Array.isArray(row) || row.length === 0) continue;
    const map = buildColMap(row);
    const score = Object.keys(map).length;
    if (score > best.score) best = { index: i, map, score };
  }
  return best;
}

function isTotalRow(row: any[], map: ColMap): boolean {
  const cells = [row[map.nom_prenoms], row[map.numero_matricule], row[0], row[1]]
    .map((c) => norm(c))
    .filter(Boolean);
  return cells.some((c) => /TOTAL|TOTAUX|SOUS TOTAL|CUMUL|RECAPITULATIF/.test(c));
}

function isEffectif(row: any[], map: ColMap): boolean {
  const mat = row[map.numero_matricule];
  const nom = row[map.nom_prenoms];
  const matNum = toNumber(mat);
  const hasNom = !!asText(nom);
  const hasMat = matNum > 0 || (!!asText(mat) && /\d/.test(asText(mat)));
  return hasNom || hasMat;
}

const MONEY_KEYS = [
  'base_aj', 'logt_trsp', 'rendement', 'resp_repres', 'salaire_brut', 'cnaps',
  'patronal', 'salaire_imposable', 'irsa', 'salaire_net', 'accessoir', 'brut',
  'avance', 'med', 'net', 'virement', 'especes',
];

// ------------------------------------------------------------------------------
// Lecture principale du classeur
// ------------------------------------------------------------------------------
export function parseWorkbook(data: ArrayBuffer, fileName: string, anneeDefaut = 2026): ImportWorkbookResult {
  const wb = XLSX.read(data, { type: 'array', cellDates: true, cellText: false });
  const result: ImportWorkbookResult = {
    fichier: fileName,
    feuilles: [],
    employes: [],
    paies: [],
    periodes: [],
    avertissements: [],
  };

  const employesMap = new Map<number, ImportedEmploye>();
  const paiesMap = new Map<string, ImportedPaie>();

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;

    let rows: any[][] = [];
    try {
      rows = XLSX.utils.sheet_to_json<any[]>(ws, {
        header: 1,
        raw: true,
        defval: null,
        blankrows: false,
      });
    } catch (e) {
      result.avertissements.push(`Feuille « ${sheetName} » illisible.`);
      continue;
    }
    if (!rows.length) {
      result.feuilles.push({ nom: sheetName, type: 'ignore', ligneEntete: -1, nbLignes: 0, colonnes: [], message: 'Feuille vide' });
      continue;
    }

    const { index: headerIdx, map, score } = findHeaderRow(rows);
    // « CNaPS » seul contenant des immatriculations => numéro, pas cotisation
    if (map.numero_cnaps === undefined && map.cnaps !== undefined && headerIdx >= 0) {
      if (colonneRessembleANumeroCnaps(rows, headerIdx, map.cnaps)) {
        map.numero_cnaps = map.cnaps;
        delete map.cnaps;
      }
    }
    const colonnes = Object.keys(map);
    const hasIdentity = map.nom_prenoms !== undefined || map.numero_matricule !== undefined;

    if (headerIdx < 0 || score < 3 || !hasIdentity) {
      result.feuilles.push({
        nom: sheetName,
        type: 'ignore',
        ligneEntete: headerIdx,
        nbLignes: rows.length,
        colonnes,
        message: 'Aucune colonne de paie reconnue',
      });
      continue;
    }

    const hasMoney = MONEY_KEYS.some((k) => map[k] !== undefined);
    // Le mois peut être écrit en texte ou stocké comme vraie date dans le titre
    const titleText = rows
      .slice(0, headerIdx)
      .flat()
      .map((c) => {
        if (typeof c === 'string') return c;
        if (c instanceof Date) return `${MOIS_FR[c.getMonth()]} ${c.getFullYear()}`;
        if (typeof c === 'number' && c > 2000 && c < 2100) return String(c);
        return '';
      })
      .join(' ');
    const entete = `${sheetName} ${titleText}`;
    const { mois: moisDetecte, annee: anneeDetectee } = detectMoisEtAnnee(entete, anneeDefaut);

    // Une feuille sans mois identifiable est une liste de personnel (fiches),
    // même si elle contient des colonnes de montants (base, brut…).
    const aUneColonneMois = map.mois !== undefined;
    let type: TypeFeuille = hasMoney && (!!moisDetecte || aUneColonneMois) ? 'etat' : 'personnel';
    let moisCourant = moisDetecte;
    let anneeCourante = anneeDetectee;

    // Feuille « horizontale » (un mois par colonne) : non gérée finement ici,
    // mais la feuille est signalée pour que l'utilisateur puisse la corriger.
    const nbLignesTraitees: number[] = [];

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!Array.isArray(row) || row.length === 0) continue;
      if (isTotalRow(row, map)) continue;
      if (!isEffectif(row, map)) continue;

      const nom = [
        map.nom_prenoms !== undefined ? asText(row[map.nom_prenoms]) : '',
        map.prenoms !== undefined ? asText(row[map.prenoms]) : '',
      ]
        .filter(Boolean)
        .join(' ')
        .trim();
      const matNum = Math.round(toNumber(row[map.numero_matricule]));
      if (!nom && !matNum) continue;
      if (matNum <= 0 && !nom) continue;

      nbLignesTraitees.push(i);

      // Mois éventuellement porté par une colonne « MOIS » (tableau à plat)
      let mois = moisCourant;
      let annee = anneeCourante;
      if (map.mois !== undefined && row[map.mois]) {
        const d = detectMoisEtAnnee(String(row[map.mois]), anneeCourante);
        if (d.mois) mois = d.mois;
        if (d.annee) annee = d.annee;
      }

      const dateEmb = toDateISO(row[map.date_embauche]);
      const matricule = matNum > 0 ? matNum : 0;

      const emp: ImportedEmploye = {
        numero_matricule: matricule,
        nom_prenoms: nom,
        numero_cnaps: asText(row[map.numero_cnaps]),
        categorie: asText(row[map.categorie]),
        jobs: asText(row[map.jobs]),
        date_embauche: dateEmb,
        nombre_annees:
          map.nombre_annees !== undefined && row[map.nombre_annees] !== null && row[map.nombre_annees] !== ''
            ? Math.round(toNumber(row[map.nombre_annees]))
            : calculerAnciennete(dateEmb, annee),
        enfant_a_charge: Math.round(toNumber(row[map.enfant_a_charge])),
        base_aj: toNumber(row[map.base_aj]),
        logement_transport: toNumber(row[map.logt_trsp]),
        rendement: toNumber(row[map.rendement]),
        responsabilite_representation: toNumber(row[map.resp_repres]),
        rib: asText(row[map.rib]),
        mode_paiement: (asText(row[map.mode_paiement]) || (asText(row[map.rib]) ? 'VIREMENT' : 'ESPECES')).toUpperCase(),
        conge_maternite: map.conge_maternite !== undefined && toNumber(row[map.conge_maternite]) > 0 ? 1 : 0,
        date_debut_maternite: '',
      };

      if (matricule > 0 && (emp.nom_prenoms || emp.base_aj)) {
        const exist = employesMap.get(matricule);
        if (!exist) {
          employesMap.set(matricule, emp);
        } else {
          // Fusion : on complète les champs vides de la fiche existante
          const merged: ImportedEmploye = { ...exist };
          (Object.keys(emp) as (keyof ImportedEmploye)[]).forEach((k) => {
            const v = emp[k] as any;
            const cur = merged[k] as any;
            if ((cur === '' || cur === 0 || cur === null || cur === undefined) && v !== '' && v !== null && v !== undefined) {
              (merged as any)[k] = v;
            }
          });
          merged.nom_prenoms = merged.nom_prenoms || emp.nom_prenoms;
          employesMap.set(matricule, merged);
        }
      }

      if (type !== 'etat') continue;
      if (!mois) {
        result.avertissements.push(
          `Feuille « ${sheetName} » : mois introuvable (nom du mois absent du titre). Lignes ignorées.`
        );
        break;
      }

      const num = (k: string): number => (map[k] !== undefined ? toNumber(row[map[k]]) : 0);
      const has = (k: string): boolean => map[k] !== undefined;

      const base_aj = num('base_aj');
      const logt_trsp = num('logt_trsp');
      const rendement = num('rendement');
      const resp_repres = num('resp_repres');

      let salaire_brut = num('salaire_brut');
      if (!has('salaire_brut') || salaire_brut === 0) {
        salaire_brut = Math.round((base_aj + logt_trsp + rendement + resp_repres) * 100) / 100;
      }
      let cnaps = num('cnaps');
      if (!has('cnaps')) cnaps = Math.round(salaire_brut * 0.01 * 1000) / 1000;
      let patronal = num('patronal');
      if (!has('patronal')) patronal = Math.round(salaire_brut * 0.13 * 1000) / 1000;
      let salaire_imposable = num('salaire_imposable');
      if (!has('salaire_imposable')) salaire_imposable = Math.round((salaire_brut - cnaps) * 1000) / 1000;
      const irsa = num('irsa');
      let salaire_net = num('salaire_net');
      if (!has('salaire_net')) salaire_net = Math.round((salaire_imposable - irsa) * 1000) / 1000;

      const augmentation_divers = num('augmentation_divers');
      const prime_de_garde = num('prime_de_garde');
      const anciennete2 = num('anciennete2');
      const risque = num('risque');
      const repr_rec = num('repr_rec');

      let accessoir = num('accessoir');
      if (!has('accessoir')) {
        accessoir = Math.round((augmentation_divers + prime_de_garde + anciennete2 + risque + repr_rec) * 100) / 100;
      }
      let brut = num('brut');
      if (!has('brut')) brut = Math.round((salaire_net + accessoir) * 1000) / 1000;

      const avance = num('avance');
      const med = num('med');
      let net = num('net');
      if (!has('net')) net = Math.max(0, Math.round((brut - avance - med) * 1000) / 1000);

      const vide = (k: string): boolean => {
        if (map[k] === undefined) return true;
        const c = row[map[k]];
        return c === null || c === undefined || String(c).trim() === '';
      };
      let virement: number | null = vide('virement') ? null : num('virement');
      let especes: number | null = vide('especes') ? null : num('especes');
      if (virement === null && especes === null) {
        // Pas d'information de règlement : tout en espèces par défaut
        especes = net;
      } else if (virement === null) {
        virement = 0;
      } else if (especes === null) {
        especes = 0;
      }

      const rawRap = has('rap') ? row[map.rap] : null;
      const rapVal =
        rawRap === null || rawRap === undefined || String(rawRap).trim() === ''
          ? 1
          : typeof rawRap === 'number'
          ? rawRap > 0
          : !/^(0|NON|N|NO|NON|FALSE)$/i.test(String(rawRap).trim());

      const p: ImportedPaie = {
        numero_matricule: matricule,
        annee,
        mois,
        nom_prenoms: nom,
        numero_cnaps: emp.numero_cnaps,
        categorie: emp.categorie,
        jobs: emp.jobs,
        date_embauche: dateEmb,
        nombre_annees: emp.nombre_annees,
        enfant_a_charge: emp.enfant_a_charge,
        base_aj,
        logt_trsp,
        rendement,
        resp_repres,
        salaire_brut,
        cnaps,
        patronal,
        salaire_imposable,
        irsa,
        salaire_net,
        augmentation_divers,
        prime_de_garde,
        anciennete2,
        risque,
        repr_rec,
        accessoir,
        brut,
        avance,
        med,
        net,
        virement,
        especes,
        rap: rapVal ? 1 : 0,
        rib: emp.rib,
      };

      const key = `${matricule}|${annee}|${mois}`;
      paiesMap.set(key, p);
    }

    result.feuilles.push({
      nom: sheetName,
      type,
      ligneEntete: headerIdx + 1,
      nbLignes: nbLignesTraitees.length,
      colonnes,
      periode: type === 'etat' && moisCourant ? periodeLabel(anneeCourante, moisCourant) : undefined,
      message:
        nbLignesTraitees.length === 0
          ? 'Aucune ligne de salarié trouvée'
          : type === 'personnel'
          ? 'Liste du personnel'
          : undefined,
    });
  }

  result.employes = Array.from(employesMap.values()).filter((e) => e.numero_matricule > 0);
  result.paies = Array.from(paiesMap.values());

  const periodesMap = new Map<string, { annee: number; mois: string; nb: number }>();
  for (const p of result.paies) {
    const k = `${p.annee}|${p.mois}`;
    const cur = periodesMap.get(k);
    if (cur) cur.nb++;
    else periodesMap.set(k, { annee: p.annee, mois: p.mois, nb: 1 });
  }
  result.periodes = Array.from(periodesMap.values()).sort(
    (a, b) => a.annee - b.annee || MOIS_FR.indexOf(a.mois) - MOIS_FR.indexOf(b.mois)
  );

  // Avertissements utiles
  if (result.employes.length === 0) {
    result.avertissements.push(
      "Aucun salarié reconnu. Vérifiez que le classeur contient les colonnes « MATRICULE » et « NOM ET PRENOMS »."
    );
  }
  const doublons = result.paies.length
    ? result.paies.length - new Set(result.paies.map((p) => p.numero_matricule)).size
    : 0;
  if (doublons > 0 && result.periodes.length === 1) {
    result.avertissements.push('Plusieurs lignes pour un même matricule sur la même période : seule la dernière est retenue.');
  }

  return result;
}

/** Lit un fichier navigateur (File) et renvoie le résultat d'analyse. */
export async function lireFichierExcel(file: File, anneeDefaut = 2026): Promise<ImportWorkbookResult> {
  const buf = await file.arrayBuffer();
  return parseWorkbook(buf, file.name, anneeDefaut);
}
