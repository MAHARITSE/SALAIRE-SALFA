// ==============================================================================
// IMPORT EXCEL INTELLIGENT / LECTURE & ANALYSE DES CLASSEURS DE PAIE SALFA
// Lit les classeurs récents et anciens (.xlsx, .xlsm, .xls, .xlsb, .csv)
// directement dans le navigateur (SheetJS), analyse la structure des feuilles,
// associe intelligemment chaque colonne à son champ SALFA (en-têtes, contenu
// des cellules et cohérence arithmétique des formules de paie) et permet de
// vérifier / réaffecter chaque champ avant l'importation.
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
// Catalogue complet des champs SALFA cibles (pour l'analyse et le mappage UI)
// ------------------------------------------------------------------------------
export type ChampSalfa =
  | 'ignore'
  | 'numero_matricule'
  | 'nom_prenoms'
  | 'prenoms'
  | 'numero_cnaps'
  | 'categorie'
  | 'jobs'
  | 'date_embauche'
  | 'nombre_annees'
  | 'enfant_a_charge'
  | 'base_aj'
  | 'logt_trsp'
  | 'rendement'
  | 'resp_repres'
  | 'salaire_brut'
  | 'cnaps'
  | 'patronal'
  | 'salaire_imposable'
  | 'irsa'
  | 'salaire_net'
  | 'augmentation_divers'
  | 'prime_de_garde'
  | 'anciennete2'
  | 'risque'
  | 'repr_rec'
  | 'accessoir'
  | 'brut'
  | 'avance'
  | 'med'
  | 'net'
  | 'virement'
  | 'especes'
  | 'rib'
  | 'mode_paiement'
  | 'mois'
  | 'conge_maternite';

export type GroupeChampSalfa =
  | 'ignore'
  | 'identite'
  | 'base'
  | 'accessoires'
  | 'retenues'
  | 'reglement'
  | 'periode';

export interface DefinitionChampSalfa {
  key: ChampSalfa;
  label: string;
  groupe: GroupeChampSalfa;
  groupeLabel: string;
  essentiel?: boolean;
}

export const CHAMPS_SALFA: DefinitionChampSalfa[] = [
  { key: 'ignore', label: '— Ignorer cette colonne —', groupe: 'ignore', groupeLabel: 'Non importé' },
  // Identité & fiche salarié
  { key: 'numero_matricule', label: 'N° Matricule', groupe: 'identite', groupeLabel: 'Identité & Fiche salarié', essentiel: true },
  { key: 'nom_prenoms', label: 'Nom et Prénoms', groupe: 'identite', groupeLabel: 'Identité & Fiche salarié', essentiel: true },
  { key: 'prenoms', label: 'Prénoms (colonne séparée)', groupe: 'identite', groupeLabel: 'Identité & Fiche salarié' },
  { key: 'numero_cnaps', label: 'N° CNaPS (immatriculation)', groupe: 'identite', groupeLabel: 'Identité & Fiche salarié' },
  { key: 'categorie', label: 'Catégorie (CAT)', groupe: 'identite', groupeLabel: 'Identité & Fiche salarié' },
  { key: 'jobs', label: 'Fonction / Poste (JOBS)', groupe: 'identite', groupeLabel: 'Identité & Fiche salarié' },
  { key: 'date_embauche', label: "Date d'embauche", groupe: 'identite', groupeLabel: 'Identité & Fiche salarié' },
  { key: 'nombre_annees', label: "Ancienneté (nombre d'années)", groupe: 'identite', groupeLabel: 'Identité & Fiche salarié' },
  { key: 'enfant_a_charge', label: 'Enfants à charge', groupe: 'identite', groupeLabel: 'Identité & Fiche salarié' },
  { key: 'conge_maternite', label: 'Congé de maternité', groupe: 'identite', groupeLabel: 'Identité & Fiche salarié' },
  // Salaire de base & cotisations
  { key: 'base_aj', label: 'Base (Salaire de base)', groupe: 'base', groupeLabel: 'Salaire de base & Cotisations', essentiel: true },
  { key: 'logt_trsp', label: 'Logement / Transport', groupe: 'base', groupeLabel: 'Salaire de base & Cotisations' },
  { key: 'rendement', label: 'Prime de rendement', groupe: 'base', groupeLabel: 'Salaire de base & Cotisations' },
  { key: 'resp_repres', label: 'Responsabilité / Représentation (base)', groupe: 'base', groupeLabel: 'Salaire de base & Cotisations' },
  { key: 'salaire_brut', label: 'Salaire Brut (de base)', groupe: 'base', groupeLabel: 'Salaire de base & Cotisations', essentiel: true },
  { key: 'cnaps', label: 'Cotisation CNaPS salariale (1%)', groupe: 'base', groupeLabel: 'Salaire de base & Cotisations' },
  { key: 'patronal', label: 'Part Patronale CNaPS (13%)', groupe: 'base', groupeLabel: 'Salaire de base & Cotisations' },
  { key: 'salaire_imposable', label: 'Salaire Imposable', groupe: 'base', groupeLabel: 'Salaire de base & Cotisations' },
  { key: 'irsa', label: 'IRSA (impôt sur salaire)', groupe: 'base', groupeLabel: 'Salaire de base & Cotisations' },
  { key: 'salaire_net', label: 'Salaire Net (après IRSA)', groupe: 'base', groupeLabel: 'Salaire de base & Cotisations' },
  // Accessoires & primes
  { key: 'augmentation_divers', label: 'Augmentation / Divers', groupe: 'accessoires', groupeLabel: 'Accessoires & Primes' },
  { key: 'prime_de_garde', label: 'Prime de garde', groupe: 'accessoires', groupeLabel: 'Accessoires & Primes' },
  { key: 'anciennete2', label: "Prime d'ancienneté (montant Ar)", groupe: 'accessoires', groupeLabel: 'Accessoires & Primes' },
  { key: 'risque', label: 'Prime de risque', groupe: 'accessoires', groupeLabel: 'Accessoires & Primes' },
  { key: 'repr_rec', label: 'Représentation / Réception (accessoire)', groupe: 'accessoires', groupeLabel: 'Accessoires & Primes' },
  { key: 'accessoir', label: 'Total Accessoires', groupe: 'accessoires', groupeLabel: 'Accessoires & Primes' },
  { key: 'brut', label: 'BRUT Total (Net base + Accessoires)', groupe: 'accessoires', groupeLabel: 'Accessoires & Primes' },
  // Retenues & net à payer
  { key: 'avance', label: 'Avance sur salaire', groupe: 'retenues', groupeLabel: 'Retenues & Net à payer', essentiel: true },
  { key: 'med', label: 'Médicaments / Pharmacie (MED)', groupe: 'retenues', groupeLabel: 'Retenues & Net à payer', essentiel: true },
  { key: 'net', label: 'NET À PAYER', groupe: 'retenues', groupeLabel: 'Retenues & Net à payer', essentiel: true },
  // Règlement
  { key: 'virement', label: 'Montant Virement', groupe: 'reglement', groupeLabel: 'Mode de règlement & Banque' },
  { key: 'especes', label: 'Montant Espèces', groupe: 'reglement', groupeLabel: 'Mode de règlement & Banque' },
  { key: 'rib', label: 'RIB / Compte bancaire', groupe: 'reglement', groupeLabel: 'Mode de règlement & Banque' },
  { key: 'mode_paiement', label: 'Mode de paiement (texte)', groupe: 'reglement', groupeLabel: 'Mode de règlement & Banque' },
  // Période
  { key: 'mois', label: 'Mois / Période (colonne)', groupe: 'periode', groupeLabel: 'Période' },
];

export type NiveauConfiance = 'haute' | 'moyenne' | 'manuel' | 'ignore';

export interface ColonneAnalyse {
  index: number;
  lettre: string;
  enteteBrut: string;
  exemples: string[];
  champDetecte: ChampSalfa;
  champRetenu: ChampSalfa;
  confiance: NiveauConfiance;
  raison: string;
}

export interface DiagnosticCoherence {
  lignesVerifiees: number;
  brutBaseOk: number;
  accessoiresOk: number;
  brutTotalOk: number;
  netOk: number;
  matriculesRetrouvesParNom: number;
  alertes: string[];
}

export interface FeuilleAnalyse extends SheetInfo {
  incluse: boolean;
  typeDetecte: TypeFeuille;
  moisDetecte: string | null;
  anneeDetectee: number;
  moisRetenu: string | null;
  anneeRetenue: number;
  lignesTotalesBrutes: number;
  colonnesDetail: ColonneAnalyse[];
  coherence?: DiagnosticCoherence;
  peutActiver: boolean;
}

export interface SheetOverride {
  incluse?: boolean;
  type?: TypeFeuille;
  ligneEntete?: number; // 1-based
  mois?: string | null;
  annee?: number;
  colonnes?: Record<number, ChampSalfa>;
}

export interface AnalyseDetailleeOptions {
  anneeDefaut?: number;
  overrides?: Record<string, SheetOverride>;
  employesExistants?: { numero_matricule: number; nom_prenoms: string }[];
}

export interface AnalyseDetailleeResult extends ImportWorkbookResult {
  anneeDetecteeFichier: number | null;
  feuillesDetail: FeuilleAnalyse[];
  coherenceGlobale: {
    lignes: number;
    brutBaseOk: number;
    accessoiresOk: number;
    brutTotalOk: number;
    netOk: number;
    matriculesParNom: number;
  };
}

// ------------------------------------------------------------------------------
// Utilitaires de normalisation et conversion
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

/** Convertit un index de colonne (0 = A, 26 = AA…) en lettre Excel. */
export function colIndexToLetter(idx: number): string {
  let n = idx + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
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
  if (typeof v === 'number' && v > 15000 && v < 80000) {
    const parsed = XLSX.SSF.parse_date_code(v);
    if (parsed && parsed.y) {
      const m = String(parsed.m).padStart(2, '0');
      const d = String(parsed.d).padStart(2, '0');
      return `${parsed.y}-${m}-${d}`;
    }
  }
  const s = String(v).trim();
  if (!s) return '';
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[-/.](\d{4})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}-01`;
  return '';
}

function formatSampleCell(v: any): string {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date && !isNaN(v.getTime())) return toDateISO(v);
  if (typeof v === 'boolean') return v ? 'OUI' : 'NON';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return '';
    if (Number.isInteger(v) && Math.abs(v) < 10000) return String(v);
    return Math.round(v * 100) / 100 === Math.round(v)
      ? Math.round(v).toLocaleString('fr-FR')
      : v.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
  }
  const s = asText(v);
  return s.length > 26 ? s.slice(0, 25) + '…' : s;
}

// ------------------------------------------------------------------------------
// Reconnaissance des en-têtes de colonnes (récents + anciens classeurs SALFA)
// ------------------------------------------------------------------------------
const ALIASES: { key: string; test: RegExp }[] = [
  // Identité
  { key: 'numero_matricule', test: /^(N\s?MAT|NO\s?MAT|NUM\s?MAT|MATRICULE|MAT|MLE|N\s?MLE|IM|LAHARANA)\b/ },
  { key: 'numero_cnaps', test: /^(N|NO|NUM|NUMERO|IMMAT|MATRICULE)\s?CNAPS/ },
  { key: 'cnaps', test: /CNAPS|C\s?N\s?A\s?P\s?S/ },
  { key: 'prenoms', test: /^(PRENOMS?|FANAMPINY)$/ },
  { key: 'nom_prenoms', test: /\bNOMS?\b|\bPRENOMS?\b|\bANARANA\b|\bSALARIES?\b/ },
  { key: 'index', test: /^(N|NO|NUM|NUMERO|ORDRE|ORD)$/ },

  // Gains / retenues (du plus spécifique au plus générique)
  { key: 'salaire_imposable', test: /IMPOSABLE|SALAIRE\s+IMP\b|BASE\s+IRSA|NET\s+IMP/ },
  { key: 'patronal', test: /PATRONAL|PART\s+PAT|13\s?%/ },
  { key: 'salaire_net', test: /SALAIRE\s?NET|SAL\s?NET|NET\s+DE\s+BASE|NET\s+APRES\s+IRSA/ },
  { key: 'net', test: /NET\s?A\s?PAYER|A\s?PAYER|SOLDE\s?A\s?PAYER|KARAMA\s?RAISINA|NET\s?FINAL/ },
  { key: 'net', test: /^NET$/ },
  { key: 'salaire_brut', test: /SALAIRE\s?BRUT|SAL\s?BRUT|SALAIRE\s?DE\s?BASE\s?BRUT|BRUT\s?DE\s?BASE|BRUT\s?IMPOSABLE/ },
  { key: 'brut', test: /^BRUT\b|BRUT\s?TOTAL|BRUT\s?GENERAL|TOTAL\s?BRUT/ },
  { key: 'base_aj', test: /BASE\s?AJ|BASE\s?REVAL|^BASE|SALAIRE\s?DE\s?BASE|SAL\s?BASE|^AJ$|KARAMA\s?FOTOTRA/ },
  { key: 'logt_trsp', test: /LOGT|LOGEMENT|TRANSPORT|TRSP/ },
  { key: 'rendement', test: /RENDEMENT|PRIME\s?REND|^REND\b/ },
  { key: 'resp_repres', test: /RESP|REPRES/ },
  { key: 'irsa', test: /IRSA|IMPOT|I\s?R\s?S\s?A|\bIGR\b/ },
  { key: 'augmentation_divers', test: /AUGMENT|DIVERS|^AUGM|^AUG\b|COMPLEMENT\s?SAL/ },
  { key: 'prime_de_garde', test: /GARDE|ASTREINTE|PERMANENCE/ },
  { key: 'anciennete2', test: /ANC\s?2|ANCIENNETE\s?2|PRIME\s?(D\s?)?ANC|IND\s?(D\s?)?ANC/ },
  { key: 'risque', test: /RISQUE|DANGER/ },
  { key: 'repr_rec', test: /^REPR|REC\b/ },
  { key: 'accessoir', test: /ACCESS|TOTAL\s?PRIMES/ },
  { key: 'avance', test: /AVANCE|ACOMPTE|QUINZAINE/ },
  { key: 'med', test: /^MED$|^MED\b|MEDECIN|MEDICAL|MEDICAMENT|PHARMACIE|FANAFODY|SOINS/ },
  { key: 'virement', test: /VIREMENT|^VIR\b/ },
  { key: 'especes', test: /ESPECE|CASH|CAISSE|BILLETAGE/ },
  { key: 'rib', test: /^RIB\b|COMPTE|BANQUE|IBAN/ },

  // Fiche salarié
  { key: 'mode_paiement', test: /MODE|PAIEMENT|REGLEMENT/ },
  { key: 'categorie', test: /^CAT\b|CATEGORIE|CLASSIFICATION|SOKAJY/ },
  { key: 'jobs', test: /JOB|FONCTION|POSTE|EMPLOI|QUALIFICATION|^ASA$/ },
  { key: 'date_embauche', test: /DATE.*EMB|EMBAUCHE|DATE.*ENTR|ANCIENNETE.*DATE|DATY\s?NIDIRANA/ },
  { key: 'enfant_a_charge', test: /ENFANT|CHARGE|ZAZA/ },
  { key: 'nombre_annees', test: /^(ANNEE|ANNEES|AN|ANS|NB\s?D?\s?AN.*|NOMBRE\s?D\s?ANNEE.*|ANCIENNETE|ANC|TAONA)$/ },
  { key: 'mois', test: /^MOIS|PERIODE/ },
  { key: 'conge_maternite', test: /MATERNITE/ },
];

const IGNORED_HEADER_RE = /^(COLONNE\s*\d+|COLUMN\s*\d+|UNNAMED.*|TRAITE|ECART|NET\s+AVANT|ACCORDER|EMARGEMENT|SIGNATURE|OBSERVATION.*|RAP|R\s?A\s?P)$/;

/** Retourne la clé canonique d'un libellé d'en-tête (ou null). */
export function matchHeader(raw: any): string | null {
  const h = norm(raw);
  if (!h || h.length > 45 || IGNORED_HEADER_RE.test(h)) return null;
  for (const a of ALIASES) {
    if (a.test.test(h)) return a.key;
  }
  return null;
}

// ------------------------------------------------------------------------------
// Détection de la période (mois / année) et de l'année du fichier
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

/** Extrait l'année mentionnée dans le nom du fichier (ex: SALAIRE SALFA 2024.xls -> 2024). */
export function detectAnneeFichier(fileName: string): number | null {
  const base = String(fileName || '').replace(/\.[a-z0-9]+$/i, '');
  const re = /(?:^|[^0-9])(199\d|20[0-4]\d)(?=$|[^0-9])/g;
  const years: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(base)) !== null) {
    years.push(parseInt(m[1], 10));
  }
  if (!years.length) return null;
  // Si « 2024-2025 », retenir la dernière année mentionnée dans le nom du fichier
  const y = years[years.length - 1];
  return y >= 1990 && y <= 2050 ? y : null;
}

export function detectMoisEtAnnee(texte: string, anneeDefaut: number): { mois: string | null; annee: number; anneeExplicite?: boolean } {
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
  let anneeExplicite = false;
  const numMatch = t.match(/(?:^|\s)0?([1-9]|1[0-2])[\s\-_/.]+(199\d|20\d{2})(?:\s|$)/);
  if (numMatch) {
    const moisNum = parseInt(numMatch[1], 10);
    if (!mois) mois = MOIS_FR[moisNum - 1] || null;
    annee = parseInt(numMatch[2], 10);
    return { mois, annee, anneeExplicite: true };
  }
  const y4 =
    t.match(/(?:JANV[A-Z]*|FEV[A-Z]*|MARS|AVR[A-Z]*|MAI|JUIN|JUIL[A-Z]*|AOUT|SEPT[A-Z]*|OCT[A-Z]*|NOV[A-Z]*|DEC[A-Z]*)\s+(199\d|20\d{2})\b/) ||
    t.match(/\b(199\d|20\d{2})\b/);
  if (y4) {
    annee = parseInt(y4[1], 10);
    anneeExplicite = true;
  } else {
    const y2 = t.match(/(?:JANV[A-Z]*|FEV[A-Z]*|MARS|AVR[A-Z]*|MAI|JUIN|JUIL[A-Z]*|AOUT|SEPT[A-Z]*|OCT[A-Z]*|NOV[A-Z]*|DEC[A-Z]*)\s+'?(\d{2})(\s|$)/);
    if (y2) {
      const n = parseInt(y2[1], 10);
      if (n >= 0 && n <= 99) {
        annee = 2000 + n;
        anneeExplicite = true;
      }
    }
  }
  return { mois, annee, anneeExplicite };
}

function periodeLabel(annee: number, mois: string): string {
  return `${mois} ${annee}`;
}

// ------------------------------------------------------------------------------
// Profilage intelligent des colonnes d'une feuille (en-têtes + valeurs + formules)
// ------------------------------------------------------------------------------
type ColMap = Record<string, number>;

interface ColStats {
  nonEmpty: number;
  exemples: string[];
  numCount: number;
  maxAbs: number;
  smallIntCount: number;
  cnapsIdCount: number;
  ribCount: number;
  catCount: number;
  dateCount: number;
  jobTextCount: number;
}

const CAT_CODE_RE = /^(?:[1-6][AB]|TB|HC|OS\d?|OP\d?|M\d|C\d|E\d|A\d|B\d)$/i;
const RIB_VALUE_RE = /(?:\d{5}\s+\d{5}\s+\d{9,13}\s+\d{2})|(?:\d[\d\s\-]{19,32}\d)/;

function profilerColonne(rows: any[][], headerIdx: number, col: number): ColStats {
  const stats: ColStats = {
    nonEmpty: 0,
    exemples: [],
    numCount: 0,
    maxAbs: 0,
    smallIntCount: 0,
    cnapsIdCount: 0,
    ribCount: 0,
    catCount: 0,
    dateCount: 0,
    jobTextCount: 0,
  };
  const limit = Math.min(rows.length, headerIdx + 45);
  for (let i = headerIdx + 1; i < limit; i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const firstCells = [norm(row[0]), norm(row[1])].filter(Boolean);
    if (firstCells.some((c) => /TOTAL|TOTAUX|SOUS TOTAL|CUMUL|RECAPITULATIF|ARRETE/.test(c))) continue;
    const cell = row[col];
    if (cell === null || cell === undefined || String(cell).trim() === '') continue;
    stats.nonEmpty++;
    if (stats.exemples.length < 3) {
      const ex = formatSampleCell(cell);
      if (ex && !stats.exemples.includes(ex)) stats.exemples.push(ex);
    }
    if (cell instanceof Date && !isNaN(cell.getTime())) {
      stats.dateCount++;
      continue;
    }
    const txt = asText(cell);
    if (RIB_VALUE_RE.test(txt)) stats.ribCount++;
    if (CAT_CODE_RE.test(txt)) stats.catCount++;
    if (typeof cell === 'string' && /^\d{1,2}[-/.]\d{1,2}[-/.]\d{4}$|^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(txt)) {
      stats.dateCount++;
      continue;
    }
    const n = toNumber(cell);
    const looksNumeric =
      typeof cell === 'number' ||
      (typeof cell === 'string' && /^[\s\d.,\-]+(\s*Ar)?$/i.test(txt) && /\d/.test(txt) && !RIB_VALUE_RE.test(txt));
    if (looksNumeric) {
      stats.numCount++;
      const abs = Math.abs(n);
      if (abs > stats.maxAbs) stats.maxAbs = abs;
      if (n >= 0 && n <= 65 && Math.abs(n - Math.round(n)) < 1e-6) stats.smallIntCount++;
      if (n >= 100000) stats.cnapsIdCount++;
    } else if (
      txt.length >= 3 &&
      txt.length <= 36 &&
      /[A-Za-zÀ-ÿ]/.test(txt) &&
      !/^(TRUE|FALSE|OUI|NON)$/i.test(txt) &&
      !CAT_CODE_RE.test(txt)
    ) {
      stats.jobTextCount++;
    }
  }
  return stats;
}

function colonneRessembleANumeroCnaps(rows: any[][], headerIdx: number, col: number): boolean {
  let total = 0;
  let longs = 0;
  for (let i = headerIdx + 1; i < Math.min(rows.length, headerIdx + 12); i++) {
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

function findHeaderRow(rows: any[][]): { index: number; score: number } {
  let best = { index: -1, score: 0 };
  const limit = Math.min(rows.length, 60);
  for (let i = 0; i < limit; i++) {
    const row = rows[i];
    if (!Array.isArray(row) || row.length === 0) continue;
    const seen = new Set<string>();
    for (let c = 0; c < row.length; c++) {
      const k = matchHeader(row[c]);
      if (k && k !== 'index') seen.add(`${k}:${k === 'base_aj' || k === 'nombre_annees' || k === 'net' || k === 'brut' ? c : ''}`);
    }
    const distinctKeys = new Set(Array.from(seen).map((s) => s.split(':')[0]));
    const score = distinctKeys.size;
    if (score > best.score) best = { index: i, score };
  }
  return best;
}

/**
 * Analyse multi-signaux des colonnes d'une feuille :
 * 1) En-têtes exacts et synonymes anciens (BASE vs BASE AJ, Ancienneté prime vs années…)
 * 2) En-têtes sur 2 lignes fusionnées si une sous-colonne est vide
 * 3) Profil des valeurs réelles dans les cellules (RIB, CAT, JOBS sans titre, CNaPS immat vs 1%, prime en Ar vs années)
 * 4) Vérification de la position (avant/après Salaire Brut, IRSA, Accessoires) et cohérence arithmétique
 */
function analyserColonnesFeuille(
  rows: any[][],
  headerIdx: number,
  userCols?: Record<number, ChampSalfa>
): { colonnesDetail: ColonneAnalyse[]; map: ColMap } {
  if (headerIdx < 0 || !rows[headerIdx]) {
    return { colonnesDetail: [], map: {} };
  }

  const headerRow = rows[headerIdx] || [];
  const prevRow = headerIdx > 0 ? rows[headerIdx - 1] || [] : [];
  let maxCol = headerRow.length;
  for (let r = headerIdx + 1; r < Math.min(rows.length, headerIdx + 15); r++) {
    if (Array.isArray(rows[r]) && rows[r].length > maxCol) maxCol = rows[r].length;
  }

  const statsByCol: ColStats[] = [];
  const rawHeaders: string[] = [];
  const normHeaders: string[] = [];

  for (let c = 0; c < maxCol; c++) {
    let raw = asText(headerRow[c]);
    if (!raw && prevRow[c] !== null && prevRow[c] !== undefined) {
      const candidate = asText(prevRow[c]);
      const nCand = norm(candidate);
      if (
        candidate &&
        candidate.length <= 28 &&
        !/SALFA|TANAMBAO|FILAZANA|KARAMA|TABLEAU|ETAT DE PAIE/.test(nCand) &&
        !(MOIS_FR.some((m) => nCand.includes(m)) && /\b(199\d|20\d{2})\b/.test(nCand))
      ) {
        raw = candidate;
      }
    }
    rawHeaders.push(raw);
    normHeaders.push(norm(raw));
    statsByCol.push(profilerColonne(rows, headerIdx, c));
  }

  const assigned: { champ: ChampSalfa; confiance: NiveauConfiance; raison: string }[] = Array.from(
    { length: maxCol },
    () => ({ champ: 'ignore', confiance: 'ignore', raison: 'Colonne non utilisée' })
  );

  const taken = new Map<ChampSalfa, number>();
  const assign = (col: number, champ: ChampSalfa, confiance: NiveauConfiance, raison: string) => {
    assigned[col] = { champ, confiance, raison };
    if (champ !== 'ignore') taken.set(champ, col);
  };

  // --- Passe 1 : Pré-repérage des colonnes structurantes (BASE AJ, Salaire Brut, IRSA, Accessoires) ---
  const explicitBaseAjCol = normHeaders.findIndex((h) => /\bBASE\s*AJ\b|\bBASE\s*REVAL/.test(h));
  const explicitSalBrutCol = normHeaders.findIndex((h) => /SALAIRE\s*BRUT|SAL\s*BRUT|BRUT\s*DE\s*BASE|BRUT\s*IMPOSABLE/.test(h));
  const irsaCol = normHeaders.findIndex((h) => /\bIRSA\b|\bIMPOT\b|\bIGR\b/.test(h));
  const accessoirCol = normHeaders.findIndex((h) => /ACCESS/.test(h));
  const avanceCol = normHeaders.findIndex((h) => /AVANCE|ACOMPTE|QUINZAINE/.test(h));
  const medCol = normHeaders.findIndex((h) => /^MED$|^MED\b|MEDICAMENT|PHARMACIE|FANAFODY/.test(h));

  // Colonnes « NET » et « BRUT » présentes dans la feuille (pour lever les ambiguïtés des anciens fichiers)
  const allBrutCols = normHeaders
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => /SALAIRE\s*BRUT|SAL\s*BRUT|^BRUT\b|BRUT\s*TOTAL|TOTAL\s*BRUT/.test(h));
  const allNetCols = normHeaders
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => (/SALAIRE\s*NET|SAL\s*NET|NET\s*A\s*PAYER|A\s*PAYER|^NET$|NET\s*FINAL/.test(h)) && !/NET\s*AVANT|NET\s*IMP/.test(h));

  // --- Passe 2 : Attribution intelligente colonne par colonne ---
  for (let c = 0; c < maxCol; c++) {
    const h = normHeaders[c];
    const st = statsByCol[c];
    if (!h) continue;
    if (IGNORED_HEADER_RE.test(h)) {
      assign(c, 'ignore', 'ignore', `Colonne annexe « ${rawHeaders[c]} » ignorée`);
      continue;
    }

    // 1. BASE vs BASE AJ (cas typique des anciens fichiers SALFA type « JANVIER avant »)
    if (/\bBASE\s*AJ\b|\bBASE\s*REVAL/.test(h)) {
      assign(c, 'base_aj', 'haute', 'En-tête exact « BASE AJ » (base revalorisée)');
      continue;
    }
    if (/^BASE$|^SALAIRE\s*DE\s*BASE$|^SAL\s*BASE$|^KARAMA\s*FOTOTRA$/.test(h)) {
      if (explicitBaseAjCol >= 0 && explicitBaseAjCol !== c) {
        assign(c, 'ignore', 'ignore', 'Ancienne base avant indice ignorée (« BASE AJ » est retenue)');
      } else if (!taken.has('base_aj')) {
        assign(c, 'base_aj', 'haute', 'Salaire de base principal (« BASE »)');
      }
      continue;
    }

    // 2. Ancienneté (nombre d'années vs Prime d'ancienneté en Ariary dans les anciens classeurs !)
    if (/ANC\s*2|ANCIENNETE\s*2|PRIME\s*(D\s*)?ANC|IND\s*(D\s*)?ANC/.test(h)) {
      if (!taken.has('anciennete2')) {
        assign(c, 'anciennete2', 'haute', "En-tête Prime d'ancienneté");
      }
      continue;
    }
    if (/^(NOMBRE\s*D\s*ANNEE.*|NB\s*D?\s*AN.*|ANNEE|ANNEES|AN|ANS|TAONA)$/.test(h)) {
      if (!taken.has('nombre_annees')) {
        assign(c, 'nombre_annees', 'haute', "Nombre d'années d'ancienneté");
      }
      continue;
    }
    if (/^(ANCIENNETE|ANC)$/.test(h)) {
      const apresBlocBase = (explicitSalBrutCol >= 0 && c > explicitSalBrutCol) || (irsaCol >= 0 && c > irsaCol);
      const valeursMonetaires = st.maxAbs > 100;
      if ((valeursMonetaires || apresBlocBase) && !taken.has('anciennete2')) {
        assign(
          c,
          'anciennete2',
          'haute',
          valeursMonetaires
            ? "Ancien intitulé « Ancienneté » contenant des montants en Ar → Prime d'ancienneté"
            : "Placée dans le bloc Accessoires → Prime d'ancienneté"
        );
      } else if (!taken.has('nombre_annees')) {
        assign(c, 'nombre_annees', 'haute', "Ancienneté en années (valeurs 0–65)");
      }
      continue;
    }

    // 3. N° CNaPS (immatriculation) vs CNaPS (cotisation 1%)
    if (/^(N|NO|NUM|NUMERO|IMMAT|MATRICULE)\s*CNAPS/.test(h)) {
      if (!taken.has('numero_cnaps')) assign(c, 'numero_cnaps', 'haute', 'Immatriculation N° CNaPS');
      continue;
    }
    if (/CNAPS|C\s*N\s*A\s*P\s*S/.test(h)) {
      const avantBrut = explicitSalBrutCol >= 0 && c < explicitSalBrutCol;
      if (!taken.has('numero_cnaps') && (colonneRessembleANumeroCnaps(rows, headerIdx, c) || (avantBrut && st.maxAbs >= 100000))) {
        assign(c, 'numero_cnaps', 'moyenne', "Valeurs d'immatriculation CNaPS reconnues");
      } else if (!taken.has('cnaps')) {
        assign(c, 'cnaps', 'haute', 'Cotisation CNaPS salariale (1%)');
      }
      continue;
    }

    // 4. Salaire Brut (de base) vs BRUT Total (Salaire net + Accessoires)
    if (/SALAIRE\s*BRUT|SAL\s*BRUT|BRUT\s*DE\s*BASE|BRUT\s*IMPOSABLE/.test(h)) {
      if (!taken.has('salaire_brut')) assign(c, 'salaire_brut', 'haute', 'Salaire Brut de base');
      continue;
    }
    if (/^BRUT\b|BRUT\s*TOTAL|BRUT\s*GENERAL|TOTAL\s*BRUT/.test(h)) {
      const avantCotisations = irsaCol >= 0 && c < irsaCol;
      if (!taken.has('salaire_brut') && allBrutCols.length === 1 && avantCotisations) {
        assign(c, 'salaire_brut', 'moyenne', 'Colonne BRUT unique placée avant IRSA → Salaire Brut de base');
      } else if (!taken.has('brut')) {
        assign(c, 'brut', 'haute', 'BRUT Total (Salaire net + Accessoires)');
      }
      continue;
    }

    // 5. SALAIRE NET (après IRSA) vs NET À PAYER (après Avance et MED)
    if (/NET\s*A\s*PAYER|A\s*PAYER|SOLDE\s*A\s*PAYER|KARAMA\s*RAISINA|NET\s*FINAL/.test(h)) {
      if (!taken.has('net')) assign(c, 'net', 'haute', 'NET à payer final');
      continue;
    }
    if (/SALAIRE\s*NET|SAL\s*NET|NET\s*DE\s*BASE|NET\s*APRES\s*IRSA/.test(h)) {
      const apresRetenues = (avanceCol >= 0 && c > avanceCol) || (medCol >= 0 && c > medCol);
      if (allNetCols.length === 1 && apresRetenues && !taken.has('net')) {
        assign(c, 'net', 'moyenne', 'Seule colonne Net placée après Avance/MED → NET à payer');
      } else if (!taken.has('salaire_net')) {
        assign(c, 'salaire_net', 'haute', 'Salaire Net de base (après IRSA)');
      }
      continue;
    }
    if (/^NET$/.test(h)) {
      const avantAccessoiresOuRetenues =
        (accessoirCol >= 0 && c < accessoirCol) ||
        ( allNetCols.length >= 2 && allNetCols[0].i === c && ((avanceCol >= 0 && c < avanceCol) || (medCol >= 0 && c < medCol)) );
      if (avantAccessoiresOuRetenues && !taken.has('salaire_net')) {
        assign(c, 'salaire_net', 'moyenne', '1re colonne NET (avant Accessoires/Retenues) → Salaire Net de base');
      } else if (!taken.has('net')) {
        assign(c, 'net', 'haute', 'NET à payer');
      }
      continue;
    }

    // 6. RESP REPRES (bloc base) vs Repr° réc° (bloc accessoires)
    if (/^REPR|REC\b|RESP|REPRES/.test(h)) {
      const dansAccessoires =
        /^REPR|REC\b/.test(h) ||
        (explicitSalBrutCol >= 0 && c > explicitSalBrutCol) ||
        (irsaCol >= 0 && c > irsaCol);
      if (dansAccessoires && !taken.has('repr_rec')) {
        assign(c, 'repr_rec', 'haute', 'Indemnité Repr° / réc° (bloc Accessoires)');
      } else if (!taken.has('resp_repres')) {
        assign(c, 'resp_repres', 'haute', 'Responsabilité / Représentation (bloc Salaire de base)');
      } else if (!taken.has('repr_rec')) {
        assign(c, 'repr_rec', 'moyenne', '2nde colonne Représentation → bloc Accessoires');
      }
      continue;
    }

    // 7. Règle générale via ALIASES
    const key = matchHeader(rawHeaders[c]);
    if (key && key !== 'index') {
      const k = key as ChampSalfa;
      if (!taken.has(k)) {
        assign(c, k, 'haute', `En-tête reconnu (« ${rawHeaders[c]} »)`);
      } else {
        assign(c, 'ignore', 'ignore', `Doublon de « ${k} » ignoré`);
      }
    }
  }

  // --- Passe 3 : Inférence par contenu sur les colonnes sans en-tête (ex: JUIN col E = JOBS) ---
  for (let c = 0; c < maxCol; c++) {
    if (assigned[c].champ !== 'ignore') continue;
    const h = normHeaders[c];
    if (h && IGNORED_HEADER_RE.test(h)) continue;
    const st = statsByCol[c];
    if (st.nonEmpty < 1) continue;

    // RIB sans titre (format 23 chiffres type BOA / BNI sans aucune ambiguïté dès 1 occurrence)
    if (!taken.has('rib') && st.ribCount >= 1 && st.ribCount / st.nonEmpty >= 0.4) {
      assign(c, 'rib', 'moyenne', 'En-tête absent : numéros RIB bancaires détectés dans les cellules');
      continue;
    }
    if (st.nonEmpty < 2) continue;
    // Catégorie professionnelle sans titre
    if (!taken.has('categorie') && !h && st.catCount >= 2 && st.catCount / st.nonEmpty >= 0.6) {
      assign(c, 'categorie', 'moyenne', 'En-tête absent : codes catégories (2B, 3A, 4B…) détectés');
      continue;
    }
    // Date d'embauche sans titre
    if (!taken.has('date_embauche') && !h && st.dateCount >= 2 && st.dateCount / st.nonEmpty >= 0.6) {
      assign(c, 'date_embauche', 'moyenne', "En-tête absent : dates d'embauche détectées");
      continue;
    }
    // Fonction / Poste (JOBS) sans titre (ex: feuille JUIN de SALAIRE SALFA 2026)
    const limitIdentite = taken.get('base_aj') ?? taken.get('salaire_brut') ?? 10;
    if (
      !taken.has('jobs') &&
      !h &&
      c > (taken.get('nom_prenoms') ?? 0) &&
      c < limitIdentite &&
      st.jobTextCount >= 2 &&
      st.jobTextCount / st.nonEmpty >= 0.5
    ) {
      assign(c, 'jobs', 'moyenne', 'En-tête vide : intitulés de fonction / poste détectés dans les cellules');
      continue;
    }
  }

  // --- Construction finale avec surcharges manuelles éventuelles de l'utilisateur ---
  const finalChamps: ChampSalfa[] = assigned.map((a) => a.champ);
  if (userCols) {
    for (const [colStr, target] of Object.entries(userCols)) {
      const colIdx = Number(colStr);
      if (!Number.isInteger(colIdx) || colIdx < 0 || colIdx >= maxCol) continue;
      if (target !== 'ignore') {
        // Libérer l'ancienne colonne qui occupait ce champ pour éviter tout conflit
        for (let k = 0; k < finalChamps.length; k++) {
          if (k !== colIdx && finalChamps[k] === target) finalChamps[k] = 'ignore';
        }
      }
      finalChamps[colIdx] = target;
    }
  }

  const map: ColMap = {};
  const colonnesDetail: ColonneAnalyse[] = [];

  for (let c = 0; c < maxCol; c++) {
    const auto = assigned[c];
    const retenu = finalChamps[c];
    const isManual = userCols !== undefined && userCols[c] !== undefined && userCols[c] !== auto.champ;
    // N'afficher dans l'analyse détaillée que les colonnes non totalement vides ou ayant un titre
    if (rawHeaders[c] || statsByCol[c].nonEmpty > 0 || isManual) {
      colonnesDetail.push({
        index: c,
        lettre: colIndexToLetter(c),
        enteteBrut: rawHeaders[c],
        exemples: statsByCol[c].exemples,
        champDetecte: auto.champ,
        champRetenu: retenu,
        confiance: isManual ? 'manuel' : retenu === 'ignore' ? 'ignore' : auto.confiance,
        raison: isManual
          ? 'Affecté manuellement par vos soins'
          : retenu === 'ignore' && auto.champ !== 'ignore'
          ? 'Réaffecté à une autre colonne'
          : auto.raison,
      });
    }
    if (retenu !== 'ignore' && map[retenu] === undefined) {
      map[retenu] = c;
    }
  }

  return { colonnesDetail, map };
}

function isTotalRow(row: any[], map: ColMap): boolean {
  const cells = [row[map.nom_prenoms], row[map.numero_matricule], row[0], row[1]]
    .map((c) => norm(c))
    .filter(Boolean);
  return cells.some((c) => /TOTAL|TOTAUX|SOUS TOTAL|CUMUL|RECAPITULATIF|ARRETE/.test(c));
}

function isEffectif(row: any[], map: ColMap): boolean {
  const mat = map.numero_matricule !== undefined ? row[map.numero_matricule] : undefined;
  const nom = map.nom_prenoms !== undefined ? row[map.nom_prenoms] : undefined;
  const matNum = toNumber(mat);
  const hasNom = !!asText(nom);
  const hasMat = matNum > 0 || (!!asText(mat) && /\d/.test(asText(mat)));
  return hasNom || hasMat;
}

const MONEY_KEYS: ChampSalfa[] = [
  'base_aj', 'logt_trsp', 'rendement', 'resp_repres', 'salaire_brut', 'cnaps',
  'patronal', 'salaire_imposable', 'irsa', 'salaire_net', 'augmentation_divers',
  'prime_de_garde', 'anciennete2', 'risque', 'repr_rec', 'accessoir', 'brut',
  'avance', 'med', 'net', 'virement', 'especes',
];

/** Détermine si une feuille est une feuille annexe (décharge, prime, virement, comparaison, variante "avant"…). */
function detecterFeuilleAnnexe(
  sheetName: string,
  titleText: string,
  rawHeaders: string[],
  allSheetNorms: Set<string>
): string | null {
  const sn = norm(sheetName);
  const tt = norm(titleText);
  const joinedHeaders = rawHeaders.map(norm).join(' | ');

  // Variante « JANVIER aVANT » quand la feuille « JANVIER » définitive existe déjà dans le classeur
  for (const m of MOIS_FR) {
    if (sn.includes(m) && /\b(AVANT|BROUILLON|ANCIEN|TEST|COPIE)\b/.test(sn) && allSheetNorms.has(m)) {
      return `Variante « ${sheetName} » ignorée par défaut car « ${m} » est présent (activable ci-dessous)`;
    }
  }
  if (/^(VIREMENT|BULLETIN|ANCIENNETE|DECHARGE|PASSATION.*|PAGE DE COUVERTURE|COUVERTURE|SOCIAL|PRIME|PRIMES|ETAT\s*13|13\s*EME)$/.test(sn)) {
    return 'Feuille annexe ignorée par défaut';
  }
  if (/\b(FICHE DECHARGE|ORDRE DE VIREMENT|BULLETIN DE PAIE|VALORISATION DE L ANCIENNETE)\b/.test(tt)) {
    return 'Feuille annexe (document imprimable) ignorée par défaut';
  }
  if (/\bPRIME\s+(199\d|20\d{2})\b/.test(tt) && /\bACCORDER\b/.test(joinedHeaders)) {
    return 'État de prime annuelle ignoré par défaut';
  }
  if (/\bNET\s+AVANT\b/.test(joinedHeaders) && /\bECART\b/.test(joinedHeaders)) {
    return 'Feuille de comparaison des nets ignorée par défaut';
  }
  // Feuille type « SOCIAL » avec mois en colonnes horizontales (septembre | octobre) sans rubriques de paie
  const monthHeadersCount = rawHeaders.map(norm).filter((h) => MOIS_FR.includes(h)).length;
  if (monthHeadersCount >= 2) {
    return 'Tableau horizontal multi-mois (cotisation annexe) ignoré par défaut';
  }
  return null;
}

// ------------------------------------------------------------------------------
// Moteur principal d'analyse détaillée (avec support des ajustements interactifs)
// ------------------------------------------------------------------------------
export function analyserClasseurDetaille(
  data: ArrayBuffer,
  fileName: string,
  options: AnalyseDetailleeOptions = {}
): AnalyseDetailleeResult {
  const anneeFichier = detectAnneeFichier(fileName);
  const anneeDefaut = options.anneeDefaut ?? anneeFichier ?? new Date().getFullYear();
  const overrides = options.overrides || {};
  const existantsParNom = new Map<string, number>();
  for (const e of options.employesExistants || []) {
    if (e.numero_matricule > 0 && e.nom_prenoms) {
      existantsParNom.set(norm(e.nom_prenoms), Number(e.numero_matricule));
    }
  }

  const wb = XLSX.read(data, { type: 'array', cellDates: true, cellText: false });
  const allSheetNorms = new Set(wb.SheetNames.map((n) => norm(n)));

  const result: AnalyseDetailleeResult = {
    fichier: fileName,
    anneeDetecteeFichier: anneeFichier,
    feuilles: [],
    feuillesDetail: [],
    employes: [],
    paies: [],
    periodes: [],
    avertissements: [],
    coherenceGlobale: {
      lignes: 0,
      brutBaseOk: 0,
      accessoiresOk: 0,
      brutTotalOk: 0,
      netOk: 0,
      matriculesParNom: 0,
    },
  };

  const employesMap = new Map<number, ImportedEmploye>();
  const personnelNoms = new Map<number, string>();
  const paiesMap = new Map<string, ImportedPaie>();
  let nextFallbackMat =
    Math.max(0, ...Array.from(existantsParNom.values()), 9000);

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const ov: SheetOverride = overrides[sheetName] || {};
    if (!ws) continue;

    let rows: any[][] = [];
    try {
      rows = XLSX.utils.sheet_to_json<any[]>(ws, {
        header: 1,
        raw: true,
        defval: null,
        blankrows: false,
      });
    } catch {
      result.avertissements.push(`Feuille « ${sheetName} » illisible.`);
      continue;
    }

    if (!rows.length) {
      const emptyDetail: FeuilleAnalyse = {
        nom: sheetName,
        type: 'ignore',
        typeDetecte: 'ignore',
        incluse: false,
        ligneEntete: -1,
        nbLignes: 0,
        lignesTotalesBrutes: 0,
        colonnes: [],
        colonnesDetail: [],
        moisDetecte: null,
        anneeDetectee: anneeDefaut,
        moisRetenu: null,
        anneeRetenue: anneeDefaut,
        peutActiver: false,
        message: 'Feuille vide',
      };
      result.feuilles.push(emptyDetail);
      result.feuillesDetail.push(emptyDetail);
      continue;
    }

    const autoHeader = findHeaderRow(rows);
    const headerIdx =
      ov.ligneEntete !== undefined && ov.ligneEntete >= 1 && ov.ligneEntete <= rows.length
        ? ov.ligneEntete - 1
        : autoHeader.index;

    const { colonnesDetail, map } = analyserColonnesFeuille(rows, headerIdx, ov.colonnes);
    const colonnes = Object.keys(map);
    const rawHeaderStrings = headerIdx >= 0 && Array.isArray(rows[headerIdx]) ? rows[headerIdx].map(asText) : [];

    const titleText =
      headerIdx > 0
        ? rows
            .slice(0, headerIdx)
            .flat()
            .map((c) => {
              if (typeof c === 'string') return c;
              if (c instanceof Date) return `${MOIS_FR[c.getMonth()]} ${c.getFullYear()}`;
              if (typeof c === 'number' && c > 1990 && c < 2100) return String(c);
              return '';
            })
            .join(' ')
        : '';

    const raisonAnnexe = detecterFeuilleAnnexe(sheetName, titleText, rawHeaderStrings, allSheetNorms);
    const hasNom = map.nom_prenoms !== undefined;
    const hasMat = map.numero_matricule !== undefined;
    const hasMoney = MONEY_KEYS.some((k) => map[k] !== undefined);
    const peutActiver = headerIdx >= 0 && hasNom && (hasMat || existantsParNom.size > 0 || ov.incluse === true);

    // Détection période
    const sheetMoisExact = MOIS_FR.includes(norm(sheetName)) ? norm(sheetName) : null;
    const dSheet = detectMoisEtAnnee(sheetName, anneeDefaut);
    const dTitle = detectMoisEtAnnee(titleText, anneeDefaut);
    const moisDetecte = sheetMoisExact || dSheet.mois || dTitle.mois;
    const anneeDetectee = dSheet.anneeExplicite
      ? dSheet.annee
      : dTitle.anneeExplicite
      ? dTitle.annee
      : anneeDefaut;

    // Type automatique de la feuille
    let typeDetecte: TypeFeuille = 'ignore';
    if (!raisonAnnexe && headerIdx >= 0 && colonnes.length >= 2 && hasNom && hasMat) {
      const aUneColonneMois = map.mois !== undefined;
      typeDetecte = hasMoney && (!!moisDetecte || aUneColonneMois) ? 'etat' : 'personnel';
    }

    // Application des choix de l'utilisateur (inclusion, rôle, période)
    let type: TypeFeuille = ov.type !== undefined ? ov.type : typeDetecte;
    if (ov.incluse === false) type = 'ignore';
    else if (ov.incluse === true && type === 'ignore') {
      type = hasMoney ? 'etat' : 'personnel';
    }
    const incluse = type !== 'ignore';

    const moisRetenu = ov.mois !== undefined ? ov.mois : moisDetecte;
    const anneeRetenue = ov.annee !== undefined ? ov.annee : anneeDetectee;

    if (incluse && type === 'etat' && sheetMoisExact === 'OCTOBRE' && /SEPTEMBRE/.test(norm(titleText)) && ov.mois === undefined) {
      result.avertissements.push(
        'La feuille OCTOBRE porte le titre SEPTEMBRE : période OCTOBRE retenue selon le nom de la feuille. Vérifiez ce titre dans le classeur.'
      );
    }

    if (!incluse) {
      const msg =
        ov.incluse === false
          ? 'Feuille désactivée manuellement'
          : raisonAnnexe || (headerIdx < 0 || !hasNom || !hasMat ? 'Aucune colonne de paie reconnue' : 'Feuille ignorée');
      const info: SheetInfo = {
        nom: sheetName,
        type: 'ignore',
        ligneEntete: headerIdx >= 0 ? headerIdx + 1 : -1,
        nbLignes: 0,
        colonnes,
        message: msg,
      };
      result.feuilles.push(info);
      result.feuillesDetail.push({
        ...info,
        incluse: false,
        typeDetecte,
        moisDetecte,
        anneeDetectee,
        moisRetenu,
        anneeRetenue,
        lignesTotalesBrutes: rows.length,
        colonnesDetail,
        peutActiver: headerIdx >= 0 && (hasNom || rows.length > 1),
      });
      continue;
    }

    const coherence: DiagnosticCoherence = {
      lignesVerifiees: 0,
      brutBaseOk: 0,
      accessoiresOk: 0,
      brutTotalOk: 0,
      netOk: 0,
      matriculesRetrouvesParNom: 0,
      alertes: [],
    };

    let nbLignesTraitees = 0;

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
      if (!nom) continue;

      let matNum = map.numero_matricule !== undefined ? Math.round(toNumber(row[map.numero_matricule])) : 0;
      if (matNum <= 0 && existantsParNom.size > 0) {
        const retrouve = existantsParNom.get(norm(nom));
        if (retrouve) {
          matNum = retrouve;
          coherence.matriculesRetrouvesParNom++;
        } else if (ov.incluse === true && map.numero_matricule === undefined) {
          matNum = ++nextFallbackMat;
        }
      }
      if (matNum <= 0) continue;

      nbLignesTraitees++;

      let mois = moisRetenu;
      let annee = anneeRetenue;
      if (map.mois !== undefined && row[map.mois]) {
        const d = detectMoisEtAnnee(String(row[map.mois]), anneeRetenue);
        if (d.mois) mois = d.mois;
        if (d.annee) annee = d.annee;
      }

      const dateEmb = map.date_embauche !== undefined ? toDateISO(row[map.date_embauche]) : '';
      const matricule = matNum;

      const emp: ImportedEmploye = {
        numero_matricule: matricule,
        nom_prenoms: nom,
        numero_cnaps: map.numero_cnaps !== undefined ? asText(row[map.numero_cnaps]) : '',
        categorie: map.categorie !== undefined ? asText(row[map.categorie]) : '',
        jobs: map.jobs !== undefined ? asText(row[map.jobs]) : '',
        date_embauche: dateEmb,
        nombre_annees:
          map.nombre_annees !== undefined && row[map.nombre_annees] !== null && row[map.nombre_annees] !== ''
            ? Math.round(toNumber(row[map.nombre_annees]))
            : calculerAnciennete(dateEmb, annee),
        enfant_a_charge: map.enfant_a_charge !== undefined ? Math.round(toNumber(row[map.enfant_a_charge])) : 0,
        base_aj: map.base_aj !== undefined ? toNumber(row[map.base_aj]) : 0,
        logement_transport: map.logt_trsp !== undefined ? toNumber(row[map.logt_trsp]) : 0,
        rendement: map.rendement !== undefined ? toNumber(row[map.rendement]) : 0,
        responsabilite_representation: map.resp_repres !== undefined ? toNumber(row[map.resp_repres]) : 0,
        rib: map.rib !== undefined ? asText(row[map.rib]) : '',
        mode_paiement: (
          (map.mode_paiement !== undefined ? asText(row[map.mode_paiement]) : '') ||
          (map.rib !== undefined && asText(row[map.rib]) ? 'VIREMENT' : 'ESPECES')
        ).toUpperCase(),
        conge_maternite: map.conge_maternite !== undefined && toNumber(row[map.conge_maternite]) > 0 ? 1 : 0,
        date_debut_maternite: '',
      };

      if (type === 'personnel' && emp.nom_prenoms) {
        personnelNoms.set(matricule, emp.nom_prenoms);
      }

      if (matricule > 0 && (emp.nom_prenoms || emp.base_aj)) {
        const exist = employesMap.get(matricule);
        if (!exist) {
          employesMap.set(matricule, emp);
        } else if (type === 'etat' && personnelNoms.has(matricule)) {
          // La liste du personnel fait foi pour l'orthographe du nom ; les états mensuels actualisent le dernier barème
          employesMap.set(matricule, { ...emp, nom_prenoms: personnelNoms.get(matricule) || exist.nom_prenoms || emp.nom_prenoms });
        } else if (type === 'etat') {
          employesMap.set(matricule, {
            ...exist,
            ...emp,
            nom_prenoms: emp.nom_prenoms || exist.nom_prenoms,
            numero_cnaps: emp.numero_cnaps || exist.numero_cnaps,
            categorie: emp.categorie || exist.categorie,
            jobs: emp.jobs || exist.jobs,
            date_embauche: emp.date_embauche || exist.date_embauche,
          });
        } else {
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
          `Feuille « ${sheetName} » : mois non identifié — choisissez son mois dans l'onglet « Feuilles & Périodes ».`
        );
        nbLignesTraitees = 0;
        break;
      }

      const num = (k: string): number => (map[k] !== undefined ? toNumber(row[map[k]]) : 0);
      const has = (k: string): boolean => map[k] !== undefined;

      const base_aj = num('base_aj');
      const logt_trsp = num('logt_trsp');
      const rendement = num('rendement');
      const resp_repres = num('resp_repres');

      const calcBrutBase = Math.round((base_aj + logt_trsp + rendement + resp_repres) * 100) / 100;
      let salaire_brut = num('salaire_brut');
      if (!has('salaire_brut')) salaire_brut = calcBrutBase;

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

      const calcAccessoir = Math.round((augmentation_divers + prime_de_garde + anciennete2 + risque + repr_rec) * 100) / 100;
      let accessoir = num('accessoir');
      if (!has('accessoir')) accessoir = calcAccessoir;

      const calcBrutTotal = Math.round((salaire_net + accessoir) * 1000) / 1000;
      let brut = num('brut');
      if (!has('brut')) brut = calcBrutTotal;

      const avance = num('avance');
      const med = num('med');
      const calcNet = Math.max(0, Math.round((brut - avance - med) * 1000) / 1000);
      let net = num('net');
      if (!has('net')) net = calcNet;

      // Contrôle de cohérence arithmétique de la ligne
      coherence.lignesVerifiees++;
      if (!has('salaire_brut') || !has('base_aj') || Math.abs(calcBrutBase - salaire_brut) <= 2) coherence.brutBaseOk++;
      const hasAnyAccDetail = has('augmentation_divers') || has('prime_de_garde') || has('anciennete2') || has('risque') || has('repr_rec');
      if (!has('accessoir') || !hasAnyAccDetail || Math.abs(calcAccessoir - accessoir) <= 2) coherence.accessoiresOk++;
      if (!has('brut') || Math.abs(calcBrutTotal - brut) <= 2) coherence.brutTotalOk++;
      // Tolérance de 100 Ar pour l'arrondi du NET à la centaine inférieure pratiqué à SALFA
      if (!has('net') || Math.abs(calcNet - net) <= 105) coherence.netOk++;

      const vide = (k: string): boolean => {
        if (map[k] === undefined) return true;
        const c = row[map[k]];
        return c === null || c === undefined || String(c).trim() === '';
      };
      const hasColsReglement = has('virement') || has('especes');
      let virement: number | null = vide('virement') ? null : num('virement');
      let especes: number | null = vide('especes') ? null : num('especes');
      if (!hasColsReglement) {
        especes = net;
        virement = 0;
      }

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
        rib: emp.rib,
      };

      const key = `${matricule}|${annee}|${mois}`;
      paiesMap.set(key, p);
    }

    if (coherence.lignesVerifiees > 0) {
      if (coherence.accessoiresOk < coherence.lignesVerifiees * 0.7) {
        coherence.alertes.push(
          `Écart sur le sous-total Accessoires (${coherence.accessoiresOk}/${coherence.lignesVerifiees} lignes exactes) : vérifiez les colonnes Prime d'ancienneté / Augmentation.`
        );
      }
      if (coherence.netOk < coherence.lignesVerifiees * 0.7) {
        coherence.alertes.push(
          `Écart entre BRUT − AVANCE − MED et NET (${coherence.netOk}/${coherence.lignesVerifiees} lignes proches) : vérifiez le placement des colonnes BRUT, AVANCE, MED et NET.`
        );
      }
      result.coherenceGlobale.lignes += coherence.lignesVerifiees;
      result.coherenceGlobale.brutBaseOk += coherence.brutBaseOk;
      result.coherenceGlobale.accessoiresOk += coherence.accessoiresOk;
      result.coherenceGlobale.brutTotalOk += coherence.brutTotalOk;
      result.coherenceGlobale.netOk += coherence.netOk;
      result.coherenceGlobale.matriculesParNom += coherence.matriculesRetrouvesParNom;
    }

    const info: SheetInfo = {
      nom: sheetName,
      type,
      ligneEntete: headerIdx + 1,
      nbLignes: nbLignesTraitees,
      colonnes,
      periode: type === 'etat' && moisRetenu ? periodeLabel(anneeRetenue, moisRetenu) : undefined,
      message:
        nbLignesTraitees === 0
          ? 'Aucune ligne de salarié trouvée'
          : type === 'personnel'
          ? 'Liste du personnel'
          : undefined,
    };

    result.feuilles.push(info);
    result.feuillesDetail.push({
      ...info,
      incluse: true,
      typeDetecte,
      moisDetecte,
      anneeDetectee,
      moisRetenu,
      anneeRetenue,
      lignesTotalesBrutes: rows.length,
      colonnesDetail,
      coherence: type === 'etat' ? coherence : undefined,
      peutActiver: peutActiver || true,
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

  if (result.employes.length === 0) {
    result.avertissements.push(
      'Aucun salarié reconnu. Vérifiez ou ajustez les colonnes « N° Matricule » et « Nom et Prénoms » dans l’onglet « Analyse des champs ».'
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

// ------------------------------------------------------------------------------
// API compatible descendante (utilisée par les tests et l'import direct)
// ------------------------------------------------------------------------------
export function parseWorkbook(
  data: ArrayBuffer,
  fileName: string,
  anneeDefaut = new Date().getFullYear()
): ImportWorkbookResult {
  const detail = analyserClasseurDetaille(data, fileName, { anneeDefaut });
  return {
    fichier: detail.fichier,
    feuilles: detail.feuilles,
    employes: detail.employes,
    paies: detail.paies,
    periodes: detail.periodes,
    avertissements: detail.avertissements,
  };
}

/** Lit un fichier navigateur (File) et renvoie le résultat d'analyse. */
export async function lireFichierExcel(
  file: File,
  anneeDefaut = new Date().getFullYear()
): Promise<ImportWorkbookResult> {
  const buf = await file.arrayBuffer();
  return parseWorkbook(buf, file.name, anneeDefaut);
}
