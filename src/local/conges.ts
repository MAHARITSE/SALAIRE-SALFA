// ==============================================================================
// GESTION DES CONGÉS & PERMISSIONS — RÉFÉRENTIEL SALFA
//source : « FICHE D'ABSENCE 2026.docx » (motifs, droits, circuit de signature)
// et « CONTROL DE CONGE SALFA TOLIARA 2024-2025.xlsb » (présentation de l'état).
//
// Module volontairement SANS dépendance au DOM ni au localStorage : il ne reçoit
// que des données plates et la configuration (CongesConfig). Il peut ainsi être
// testé dans Node (scripts/test-conges.cjs) et utilisé à l'identique par
// l'écran, l'impression et l'export Excel.
// ==============================================================================

// ------------------------------------------------------------------------------
// 1. Le référentiel : catégories et motifs de la fiche d'absence
// ------------------------------------------------------------------------------

/** Les trois colonnes de la fiche d'absence + les ajustements du gestionnaire. */
export type CategorieAbsence = 'CONGE' | 'PERMISSION' | 'EXAMEN_MEDICAL' | 'AJUSTEMENT';

/** Sur quel droit la demande est imputée (choix du gestionnaire). */
export type ImputationConges = 'CONGE' | 'PERMISSION' | 'AUCUNE';

/** Circuit de signature de la fiche : demandeur → chef de service → médecin → gestionnaire. */
export type StatutConges = 'SOUMIS' | 'AVIS_CHF' | 'AVIS_MEDECIN' | 'VALIDE' | 'REFUSE';

export interface MotifAbsence {
  code: string;
  categorie: CategorieAbsence;
  /** Intitulé exact de la fiche d'absence (malgache), colonne « Anton'ny fangatahana ». */
  libelle: string;
  /** Commentaire français affiché à la saisie. */
  libelleFr: string;
  /** Jours prévus par le « FITSIPIKA ANATINY manan-kery » (0 = nombre libre). */
  jours: number;
  /** Le visa du médecin chef est demandé (colonne de droite de la fiche). */
  avisMedecin: boolean;
  /** Groupe affiché sur la fiche (numérotation 1* à 5*). */
  groupe: string;
  /** Texte exact de la colonne « Anton'ny fangatahana » sur la fiche d'absence. */
  libelleDocx: string;
  /** true si la ligne est une sous-catégorie indentation sur la fiche. */
  sousLigne: boolean;
  /** Imputation proposée par défaut au gestionnaire. */
  imputation: ImputationConges;
}

export interface CategorieDef {
  code: CategorieAbsence;
  libelle: string;
  aide: string;
}

export const CATEGORIES_ABSENCE: CategorieDef[] = [
  {
    code: 'PERMISSION',
    libelle: "Permission — Permission (10 andro isan-taona)",
    aide: '10 jours par an, hors congé. Les absences ci-dessous y sont imputées.',
  },
  {
    code: 'CONGE',
    libelle: 'Congé — Congé',
    aide: '30 jours par an, cumul limité à 90 jours (« 30 andro isan-taona ary tsy mihoatra ny 90 andro »).',
  },
  {
    code: 'EXAMEN_MEDICAL',
    libelle: 'Examen médical — Examen medical',
    aide: 'Consultation, dentaire, pré-natale : sur « Taratasy fanamarihana avy @ dokotera » (justificatif du médecin).',
  },
  {
    code: 'AJUSTEMENT',
    libelle: 'Ajustement du droit (gestionnaire)',
    aide: 'Report, droit proratisé à l’entrée, régularisation d’une année : ne provient pas d’une fiche d’absence.',
  },
];

/**
 * Table « Voalazan'ny FITSIPIKA ANATINY manan-kery » de la fiche d'absence 2026,
 * reprise ligne par ligne (libellé malgache + nombre de jours prévu).
 */
export const MOTIFS_ABSENCE: MotifAbsence[] = [
  // —— Permission 1* : accouchement de l'épouse
  { code: 'Tera-bady', categorie: 'PERMISSION', libelle: '1* Tera-bady', libelleFr: 'Accouchement de l’épouse', jours: 3, avisMedecin: false, groupe: '1*', imputation: 'PERMISSION', libelleDocx: '1* Tera-bady', sousLigne: false },
  // —— Permission 2* : circoncision d'un enfant
  { code: 'Didim-poitra zanaka', categorie: 'PERMISSION', libelle: '2* Didim-poitra zanaka', libelleFr: 'Circoncision d’un enfant', jours: 1, avisMedecin: false, groupe: '2*', imputation: 'PERMISSION', libelleDocx: '2*Didim-poitra zanaka', sousLigne: false },
  // —— Permission 3* : mariage
  { code: 'Fanambadiana mpiasa', categorie: 'PERMISSION', libelle: '3* Fanambadiana mpiasa', libelleFr: 'Mariage du salarié', jours: 3, avisMedecin: false, groupe: '3*', imputation: 'PERMISSION', libelleDocx: '3* Fanambadiana mpiasa', sousLigne: false },
  { code: 'Fanambadiana zanaka', categorie: 'PERMISSION', libelle: '3* — zanaka', libelleFr: 'Mariage d’un enfant du salarié', jours: 2, avisMedecin: false, groupe: '3*', imputation: 'PERMISSION', libelleDocx: 'zanaka', sousLigne: true },
  { code: 'Fanambadiana iray tampo', categorie: 'PERMISSION', libelle: '3* — Iray tampo', libelleFr: 'Mariage d’un frère ou d’une sœur', jours: 1, avisMedecin: false, groupe: '3*', imputation: 'PERMISSION', libelleDocx: 'Iray tampo', sousLigne: true },
  // —— Permission 4* : maladie avec hospitalisation
  { code: 'Hopitaly vady', categorie: 'PERMISSION', libelle: '4* Marary miditra hopitaly: vady', libelleFr: 'Hospitalisation du conjoint', jours: 3, avisMedecin: true, groupe: '4*', imputation: 'PERMISSION', libelleDocx: '4* Marary miditra hopitaly: vady', sousLigne: false },
  { code: 'Hopitaly zanaka', categorie: 'PERMISSION', libelle: '4* — Zanaka', libelleFr: 'Hospitalisation d’un enfant', jours: 3, avisMedecin: true, groupe: '4*', imputation: 'PERMISSION', libelleDocx: 'Zanaka', sousLigne: true },
  { code: 'Hopitaly RAD niteraka', categorie: 'PERMISSION', libelle: '4* — RAD niteraka', libelleFr: 'Hospitalisation du père ou de la mère', jours: 3, avisMedecin: true, groupe: '4*', imputation: 'PERMISSION', libelleDocx: 'RAD niteraka', sousLigne: true },
  { code: 'Hopitaly rafozana', categorie: 'PERMISSION', libelle: '4* — Rafozana', libelleFr: 'Hospitalisation d’un beau-parent', jours: 3, avisMedecin: true, groupe: '4*', imputation: 'PERMISSION', libelleDocx: 'Rafozana', sousLigne: true },
  { code: 'Hopitaly iray tampo', categorie: 'PERMISSION', libelle: '4* — Iray tampo', libelleFr: 'Hospitalisation d’un frère ou d’une sœur', jours: 1, avisMedecin: true, groupe: '4*', imputation: 'PERMISSION', libelleDocx: 'Iray tampo', sousLigne: true },
  // —— Permission 5* : décès
  { code: 'Fahafatesana vady', categorie: 'PERMISSION', libelle: '5* Fahafatesana: vady', libelleFr: 'Décès du conjoint', jours: 3, avisMedecin: false, groupe: '5*', imputation: 'PERMISSION', libelleDocx: '5* Fahafatesana;  vady', sousLigne: false },
  { code: 'Fahafatesana zanaka', categorie: 'PERMISSION', libelle: '5* — zanaka', libelleFr: 'Décès d’un enfant', jours: 3, avisMedecin: false, groupe: '5*', imputation: 'PERMISSION', libelleDocx: 'zanaka', sousLigne: true },
  { code: 'Fahafatesana RAD niteraka', categorie: 'PERMISSION', libelle: '5* — RAD niteraka', libelleFr: 'Décès du père ou de la mère', jours: 3, avisMedecin: false, groupe: '5*', imputation: 'PERMISSION', libelleDocx: 'RAD niteraka', sousLigne: true },
  { code: 'Fahafatesana rafozana', categorie: 'PERMISSION', libelle: '5* — Rafozana', libelleFr: 'Décès d’un beau-parent', jours: 3, avisMedecin: false, groupe: '5*', imputation: 'PERMISSION', libelleDocx: 'Rafozana', sousLigne: true },
  { code: 'Fahafatesana iray tampo', categorie: 'PERMISSION', libelle: '5* — Iray tampo', libelleFr: 'Décès d’un frère ou d’une sœur', jours: 3, avisMedecin: false, groupe: '5*', imputation: 'PERMISSION', libelleDocx: 'Iray tampo', sousLigne: true },
  // —— Examen médical (colonne de droite : justificatif du médecin)
  { code: 'Consultation medicale', categorie: 'EXAMEN_MEDICAL', libelle: 'Consultation medicale', libelleFr: 'Consultation médicale', jours: 0, avisMedecin: true, groupe: '', imputation: 'AUCUNE', libelleDocx: 'Consultation medicale', sousLigne: false },
  { code: 'Dentaire', categorie: 'EXAMEN_MEDICAL', libelle: 'Dentaire', libelleFr: 'Soins dentaires', jours: 0, avisMedecin: true, groupe: '', imputation: 'AUCUNE', libelleDocx: 'Dentaire', sousLigne: false },
  { code: 'Pre-natale', categorie: 'EXAMEN_MEDICAL', libelle: 'Pre-natale', libelleFr: 'Consultation prénatale', jours: 0, avisMedecin: true, groupe: '', imputation: 'AUCUNE', libelleDocx: 'Pre-natale', sousLigne: false },
];

const MOTIFS_INDEX: Record<string, MotifAbsence> = MOTIFS_ABSENCE.reduce((acc, m) => {
  acc[m.code] = m;
  return acc;
}, {} as Record<string, MotifAbsence>);

export function trouverMotif(code: string): MotifAbsence | null {
  return MOTIFS_INDEX[String(code || '').trim()] || null;
}

export function motifsDeCategorie(categorie: CategorieAbsence): MotifAbsence[] {
  return MOTIFS_ABSENCE.filter((m) => m.categorie === categorie);
}

/** Groupe d'affichage de la fiche (1* à 5*), pour reprendre l'ordre du document. */
export function groupesDeCategorie(categorie: CategorieAbsence): { groupe: string; libelle: string; motifs: MotifAbsence[] }[] {
  const groupes: { groupe: string; libelle: string; motifs: MotifAbsence[] }[] = [];
  for (const m of motifsDeCategorie(categorie)) {
    const cle = m.groupe || '—';
    let g = groupes.find((x) => x.groupe === cle);
    if (!g) {
      g = { groupe: cle, libelle: m.libelle.replace(/^[\d*—\s]+/, ''), motifs: [] };
      groupes.push(g);
    }
    g.motifs.push(m);
  }
  return groupes;
}

export const LIBELLES_CATEGORIE: Record<CategorieAbsence, string> = {
  CONGE: 'Congé',
  PERMISSION: 'Permission',
  EXAMEN_MEDICAL: 'Examen médical',
  AJUSTEMENT: 'Ajustement du droit',
};

export const LIBELLES_STATUT: Record<StatutConges, string> = {
  SOUMIS: 'Soumise',
  AVIS_CHF: 'Avis chef de service',
  AVIS_MEDECIN: 'Avis médecin chef',
  VALIDE: 'Validée',
  REFUSE: 'Refusée',
};

// ------------------------------------------------------------------------------
// 2. Configuration des droits (éditable dans Administration → Congés)
// ------------------------------------------------------------------------------

export interface CongesConfig {
  /** Congé annuel : « 30 andro isan-taona » (Code du Travail malgache : 2,5 j/mois). */
  joursCongeParAn: number;
  /** Nombre d'années successives cumulables (Loi malgache : les 3 dernières années). */
  nbAnneesCumul: number;
  /** Cumul maximum du congé : « tsy mihoatra ny 90 andro » (3 × 30 j). */
  plafondCumulConge: number;
  /** Permission annuelle : « 10 andro isan-taona ». */
  joursPermissionParAn: number;
  /** Le report du congé s'ajoute au droit de l'année sur les 3 dernières années. */
  reportAutorise: boolean;
  /** Dimanche non décompté d'une absence (jours ouvrables du lundi au samedi). */
  exclureDimanche: boolean;
  /** Samedi non décompté. */
  exclureSamedi: boolean;
  /** Jours fériés non décomptés, liste de dates AAAA-MM-JJ séparées par des espaces/virgules. */
  joursFeries: string;
  /** Un examen médical décompte aussi la permission (rare : non par défaut). */
  examenSurPermission: boolean;
  /** Refuser l'enregistrement d'une demande validée dépassant le solde (sinon simple alerte). */
  bloquerDepassement: boolean;
  /** Marqueur interne de version des règles calendaires persistées. */
  versionCalendrier?: number;
}

export const DEFAULT_CONGES_CONFIG: CongesConfig = {
  joursCongeParAn: 30,
  nbAnneesCumul: 3,
  plafondCumulConge: 30,
  joursPermissionParAn: 10,
  reportAutorise: false,
  exclureDimanche: false,
  exclureSamedi: false,
  joursFeries: '',
  examenSurPermission: false,
  bloquerDepassement: true,
  versionCalendrier: 3,
};

function sanitizeListFeries(raw: any): string {
  if (typeof raw === 'string') return raw.trim();
  if (Array.isArray(raw)) return raw.join(' ');
  return '';
}

/**
 * Nettoie et borne une configuration de congés :
 * plafond strict de 30 jours maximum par an et gestion indépendante année par année
 * (aucun report/cumul d'une année sur l'autre).
 */
export function sanitizeCongesConfig(raw: any): CongesConfig {
  const src = raw && typeof raw === 'object' ? raw : {};
  const pos = (value: any, def: number, max: number) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return def;
    return Math.min(max, Math.round(n * 100) / 100);
  };
  const joursCongeParAn = pos(src.joursCongeParAn, DEFAULT_CONGES_CONFIG.joursCongeParAn, 30);
  const nbBrut = Math.round(Number(src.nbAnneesCumul));
  const nbAnneesCumul = Number.isFinite(nbBrut) && nbBrut >= 1 && nbBrut <= 10
    ? nbBrut
    : DEFAULT_CONGES_CONFIG.nbAnneesCumul;
  const plafondSaisi = pos(src.plafondCumulConge, joursCongeParAn, joursCongeParAn);
  const plafondCumulConge = plafondSaisi > 0 ? Math.min(plafondSaisi, joursCongeParAn) : joursCongeParAn;
  return {
    joursCongeParAn,
    nbAnneesCumul,
    plafondCumulConge,
    joursPermissionParAn: pos(src.joursPermissionParAn, DEFAULT_CONGES_CONFIG.joursPermissionParAn, 3650),
    reportAutorise: false,
    exclureDimanche: src.exclureDimanche === true,
    exclureSamedi: src.exclureSamedi === true,
    joursFeries: sanitizeListFeries(src.joursFeries),
    examenSurPermission: src.examenSurPermission === true,
    bloquerDepassement: true,
    versionCalendrier: 3,
  };
}

/** Dates de jours fériés (AAAA-MM-JJ) à ne pas décompter. */
export function listeJoursFeries(cfg: CongesConfig): Set<string> {
  return new Set(
    String(cfg.joursFeries || '')
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s))
  );
}

// ------------------------------------------------------------------------------
// 3. La demande (une fiche d'absence)
// ------------------------------------------------------------------------------

export interface CongeAbsence {
  id: number;
  employe_id: number;
  numero_matricule: number;
  nom_prenoms: string;
  fonction: string;
  /** Service /Projet de la fiche. */
  service: string;
  /** Adiresy / n° tel ahafahana mifandray (personne à joindre). */
  contact: string;
  categorie: CategorieAbsence;
  motif_code: string;
  /** Libellé repris dans la colonne « MOTIFS DU PERMISSION » de l'état. */
  motif_libelle: string;
  imputation: ImputationConges;
  annee: number;
  /** Datin'ny fangatahana — date à laquelle la fiche est demandée. */
  date_demande: string;
  /** Daty handehanana — premier jour d'absence demandé (Du). */
  date_debut: string;
  heure_debut: string;
  /** Fin de la période d'absence demandée, dernier jour inclus (Au / h@). */
  date_fin: string;
  /** Daty fiverenana miasa — date de prise de service (le jour après la fin de la date demandée). */
  date_retour: string;
  heure_fin: string;
  /** Isan'ny andro angatahana. */
  jours_demandes: number;
  /** Jours retenus par le gestionnaire (solde déduit) ; null = jours demandés. */
  jours_valides: number | null;
  /** Olona hisolo — personne désignée pour assurer l'intérim. */
  remplacant: string;
  /** Congé/Permission sisa ambiny : année ou titre de la période de référence. */
  titre_periode: string;
  justificatif: string;
  observations: string;
  statut: StatutConges;
  visa_chef_par: string;
  visa_chef_le: string;
  visa_medecin_par: string;
  visa_medecin_le: string;
  visa_gestionnaire_par: string;
  visa_gestionnaire_le: string;
  motif_refus: string;
  /** Pour AJUSTEMENT : 'DROIT' modifie le droit de l'année, 'REPORT' le solde reporté, 'OUVERTURE' fixe le solde d'ouverture d'une année affichée (2024, 2025, 2026…). */
  ajustement_type: 'DROIT' | 'REPORT' | 'OUVERTURE' | '';
  saisie_par: string;
  date_saisie: string;
  date_modification: string;
}

export const CONGE_FIELDS: (keyof CongeAbsence)[] = Object.keys({
  id: 0, employe_id: 0, numero_matricule: 0, nom_prenoms: '', fonction: '', service: '',
  contact: '', categorie: 'CONGE', motif_code: '', motif_libelle: '', imputation: 'CONGE',
  annee: 0, date_demande: '', date_debut: '', heure_debut: '', date_fin: '', date_retour: '', heure_fin: '',
  jours_demandes: 0, jours_valides: null, remplacant: '', titre_periode: '', justificatif: '',
  observations: '', statut: 'SOUMIS', visa_chef_par: '', visa_chef_le: '', visa_medecin_par: '',
  visa_medecin_le: '', visa_gestionnaire_par: '', visa_gestionnaire_le: '', motif_refus: '',
  ajustement_type: '', saisie_par: '', date_saisie: '', date_modification: '',
} as CongeAbsence) as (keyof CongeAbsence)[];

/** Valeur par défaut sûre (le store peut contenir des lignes partielles ou importées sans date de fin/reprise). */
export function normaliserConge(raw: any, cfg: CongesConfig = DEFAULT_CONGES_CONFIG): CongeAbsence {
  const conf = cfg ? sanitizeCongesConfig(cfg) : DEFAULT_CONGES_CONFIG;
  const categorie: CategorieAbsence = (['CONGE', 'PERMISSION', 'EXAMEN_MEDICAL', 'AJUSTEMENT'] as CategorieAbsence[]).includes(raw?.categorie)
    ? raw.categorie : 'CONGE';
  const motif = trouverMotif(raw?.motif_code || '');
  // Un ajustement de droit peut être négatif (retrait de jours) : seul un nombre signé
  // a du sens pour cette ligne, les demandes restent positives.
  const borner = (n: number) => (Number.isFinite(n) ? Math.max(-3650, Math.min(3650, Math.round(n * 100) / 100)) : 0);
  const joursDemandes = borner(Number(raw?.jours_demandes) || 0);
  const joursValides = raw?.jours_valides === null || raw?.jours_valides === undefined || raw?.jours_valides === ''
    ? null
    : borner(Number(raw.jours_valides) || 0);
  const statut: StatutConges = (['SOUMIS', 'AVIS_CHF', 'AVIS_MEDECIN', 'VALIDE', 'REFUSE'] as StatutConges[]).includes(raw?.statut)
    ? raw.statut : 'SOUMIS';
  const imputation: ImputationConges = (['CONGE', 'PERMISSION', 'AUCUNE'] as ImputationConges[]).includes(raw?.imputation)
    ? raw.imputation
    : categorie === 'CONGE' ? 'CONGE'
      : categorie === 'PERMISSION' ? 'PERMISSION'
        : categorie === 'AJUSTEMENT' ? 'AUCUNE'
          : motif ? motif.imputation : 'AUCUNE';
  const dateDebut = String(raw?.date_debut || '').slice(0, 10);
  const annee = Number(raw?.annee) || (dateDebut ? Number(dateDebut.slice(0, 4)) : new Date().getFullYear());

  let dateFin = String(raw?.date_fin || '').slice(0, 10);
  let dateRetour = String(raw?.date_retour || '').slice(0, 10);
  const joursEffectifs = joursValides !== null && joursValides > 0 ? joursValides : joursDemandes;

  if (categorie !== 'AJUSTEMENT' && dateDebut) {
    // Migration douce d'anciennes fiches où `date_fin` contenait la date exclusive de reprise (sans `date_retour`).
    if (!dateRetour && dateFin && dateFin > dateDebut && joursEffectifs > 0) {
      const nbInclusif = joursDemandesPour({ date_debut: dateDebut, date_fin: dateFin }, conf);
      if (nbInclusif === Math.ceil(joursEffectifs) + 1) {
        dateRetour = dateFin;
        dateFin = calculerDateFin(dateDebut, joursEffectifs, conf);
      }
    }
    if (!dateFin) {
      dateFin = joursEffectifs > 0 ? calculerDateFin(dateDebut, joursEffectifs, conf) : dateDebut;
    } else if (dateFin < dateDebut) {
      dateFin = dateDebut;
    }
    if (!dateRetour || dateRetour <= dateFin) {
      dateRetour = calculerDateRetourDepuisFin(dateFin, conf);
    }
  } else if (categorie === 'AJUSTEMENT') {
    dateFin = '';
    dateRetour = '';
  }

  return {
    id: Number(raw?.id) || 0,
    employe_id: Number(raw?.employe_id) || 0,
    numero_matricule: Number(raw?.numero_matricule) || 0,
    nom_prenoms: String(raw?.nom_prenoms || '').trim(),
    fonction: String(raw?.fonction || '').trim(),
    service: String(raw?.service || '').trim(),
    contact: String(raw?.contact || '').trim(),
    categorie,
    motif_code: String(raw?.motif_code || '').trim(),
    motif_libelle: String(raw?.motif_libelle || motif?.libelle || LIBELLES_CATEGORIE[categorie]).trim(),
    imputation,
    annee,
    date_demande: String(raw?.date_demande || '').slice(0, 10),
    date_debut: dateDebut,
    heure_debut: String(raw?.heure_debut || '').slice(0, 5),
    date_fin: dateFin,
    date_retour: dateRetour,
    heure_fin: String(raw?.heure_fin || '').slice(0, 5),
    jours_demandes: joursDemandes,
    jours_valides: joursValides,
    remplacant: String(raw?.remplacant || '').trim(),
    titre_periode: String(raw?.titre_periode || '').trim(),
    justificatif: String(raw?.justificatif || '').trim(),
    observations: String(raw?.observations || '').trim(),
    statut,
    visa_chef_par: String(raw?.visa_chef_par || '').trim(),
    visa_chef_le: String(raw?.visa_chef_le || '').slice(0, 10),
    visa_medecin_par: String(raw?.visa_medecin_par || '').trim(),
    visa_medecin_le: String(raw?.visa_medecin_le || '').slice(0, 10),
    visa_gestionnaire_par: String(raw?.visa_gestionnaire_par || '').trim(),
    visa_gestionnaire_le: String(raw?.visa_gestionnaire_le || '').slice(0, 10),
    motif_refus: String(raw?.motif_refus || '').trim(),
    ajustement_type: raw?.ajustement_type === 'OUVERTURE' ? 'OUVERTURE' : raw?.ajustement_type === 'REPORT' ? 'REPORT' : raw?.ajustement_type === 'DROIT' ? 'DROIT' : '',
    saisie_par: String(raw?.saisie_par || '').trim(),
    date_saisie: String(raw?.date_saisie || '').slice(0, 19),
    date_modification: String(raw?.date_modification || '').slice(0, 19),
  };
}

// ------------------------------------------------------------------------------
// 4. Jours d'absence (période Du … au … incluse) & Daty fiverenana miasa
// ------------------------------------------------------------------------------

export function parseDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

export function formatJour(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const j = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${j}`;
}

export interface OptionsJours {
  exclureDimanche: boolean;
  exclureSamedi: boolean;
  feries: Set<string>;
}

/**
 * Nombre de jours d'absence entre « debut » et « fin » INCLUS (Du … au …) :
 * - ex. 05/06/2026 au 05/06/2026 = 1 jour ;
 * - ex. 05/06/2026 au 06/06/2026 = 2 jours ;
 * - sans date de fin, l'absence couvre le seul jour de départ (1 jour si décomptable).
 */
export function compterJoursOuvrables(debut: string, fin: string, opts: OptionsJours): number {
  const d1 = parseDate(debut);
  if (!d1) return 0;
  d1.setHours(0, 0, 0, 0);
  let dernier = new Date(d1.getTime());
  if (fin && String(fin).trim()) {
    const d2 = parseDate(fin);
    if (!d2) return 0;
    d2.setHours(0, 0, 0, 0);
    if (d2 < d1) return 0;
    dernier = new Date(d2.getTime());
  }
  const exclus = new Set<number>();
  if (opts.exclureDimanche) exclus.add(0);
  if (opts.exclureSamedi) exclus.add(6);
  let count = 0;
  const cur = new Date(d1.getTime());
  let garde = 0;
  while (cur <= dernier && garde < 4000) {
    if (!exclus.has(cur.getDay()) && !opts.feries.has(formatJour(cur))) count++;
    cur.setDate(cur.getDate() + 1);
    garde++;
  }
  return count;
}

/** Nombre de jours demandés sur la période incluse Du `date_debut` au `date_fin`. */
export function joursDemandesPour(demande: Pick<CongeAbsence, 'date_debut' | 'date_fin'>, cfg: CongesConfig): number {
  return compterJoursOuvrables(demande.date_debut, demande.date_fin, {
    exclureDimanche: cfg.exclureDimanche,
    exclureSamedi: cfg.exclureSamedi,
    feries: listeJoursFeries(cfg),
  });
}

/**
 * Calcule le dernier jour INCLUS de l'absence (`date_fin`, « au … ») à partir de
 * la date de départ et du nombre de jours demandés :
 * - ex. debut = 2026-06-05, nbJours = 1 -> 2026-06-05 (05/06/2026 au 05/06/2026 = 1 j)
 * - ex. debut = 2026-06-05, nbJours = 2 -> 2026-06-06 (05/06/2026 au 06/06/2026 = 2 j)
 */
export function calculerDateFin(debut: string, nbJours: number, cfg: CongesConfig = DEFAULT_CONGES_CONFIG): string {
  const d1 = parseDate(debut);
  const cible = Math.ceil(Number(nbJours) || 0);
  if (!d1 || cible <= 0) return '';
  const feries = listeJoursFeries(cfg);
  const exclus = new Set<number>();
  if (cfg.exclureDimanche) exclus.add(0);
  if (cfg.exclureSamedi) exclus.add(6);
  const estOuvrable = (d: Date) => !exclus.has(d.getDay()) && !feries.has(formatJour(d));
  const cur = new Date(d1.getTime());
  cur.setHours(0, 0, 0, 0);
  let decomptes = 0;
  let dernierCompte = new Date(d1.getTime());
  let garde = 0;
  while (decomptes < cible && garde < 4000) {
    if (estOuvrable(cur)) {
      decomptes++;
      dernierCompte = new Date(cur.getTime());
    }
    cur.setDate(cur.getDate() + 1);
    garde++;
  }
  return formatJour(dernierCompte);
}

/**
 * Calcule « Daty fiverenana miasa » (date de prise de service) : le jour suivant
 * la fin de la date demandée (`dateFin`), en avançant au prochain jour travaillé
 * si un jour exclu ou férié est configuré.
 */
export function calculerDateRetourDepuisFin(dateFin: string, cfg: CongesConfig = DEFAULT_CONGES_CONFIG): string {
  const df = parseDate(dateFin);
  if (!df) return '';
  const feries = listeJoursFeries(cfg);
  const exclus = new Set<number>();
  if (cfg.exclureDimanche) exclus.add(0);
  if (cfg.exclureSamedi) exclus.add(6);
  const estOuvrable = (d: Date) => !exclus.has(d.getDay()) && !feries.has(formatJour(d));
  const cur = new Date(df.getTime());
  cur.setHours(0, 0, 0, 0);
  cur.setDate(cur.getDate() + 1);
  let garde = 0;
  while (!estOuvrable(cur) && garde < 4000) {
    cur.setDate(cur.getDate() + 1);
    garde++;
  }
  return formatJour(cur);
}

/**
 * Calcule la date de prise de service (« Daty fiverenana miasa ») à partir de la
 * date de départ et du nombre de jours demandés (= lendemain de `calculerDateFin`).
 */
export function calculerDateRetour(debut: string, nbJours: number, cfg: CongesConfig = DEFAULT_CONGES_CONFIG): string {
  const fin = calculerDateFin(debut, nbJours, cfg);
  if (!fin) return '';
  return calculerDateRetourDepuisFin(fin, cfg);
}

/**
 * Retourne les N dernières années successives cumulables selon la loi malgache
 * (par défaut les 3 dernières années : ex. pour 2026 → [2024, 2025, 2026]).
 */
export function anneesSuccessives(annee: number, nbAnneesCumul: number = DEFAULT_CONGES_CONFIG.nbAnneesCumul): number[] {
  const n = Math.max(1, Math.min(10, Math.round(Number(nbAnneesCumul) || DEFAULT_CONGES_CONFIG.nbAnneesCumul)));
  const res: number[] = [];
  for (let a = annee - n + 1; a <= annee; a++) res.push(a);
  return res;
}

/**
 * Décompose un solde cumulé sur les N dernières années successives autorisées par
 * le Code du Travail malgache (par défaut les 3 dernières années : N-2, N-1, N,
 * soit au maximum 3 × 30 = 90 jours). Tout droit antérieur à N-2 est prescrit.
 * Consommation FIFO du titre non prescrit le plus ancien :
 * ex. en 2026, un solde de 85 j = 25 j sur 2024 + 30 j sur 2025 + 30 j sur 2026 ;
 * un solde de 55 j = 0 j sur 2024 + 25 j sur 2025 + 30 j sur 2026.
 */
export function decomposerDroitsSuccessifs(
  soldeTotal: number,
  annee: number,
  droitAnnuel: number = 30,
  _anneeEmbauche: number = 0,
  nbAnneesCumul: number = DEFAULT_CONGES_CONFIG.nbAnneesCumul
): {
  annees: number[];
  droitsParTitre: Record<number, number>;
  titreActif: number;
  resteTitreActif: number;
} {
  const droit = Math.min(30, droitAnnuel > 0 ? droitAnnuel : 30);
  const nb = Math.max(1, Math.min(10, Math.round(Number(nbAnneesCumul) || DEFAULT_CONGES_CONFIG.nbAnneesCumul)));
  const annees = anneesSuccessives(annee, nb);
  const droitsParTitre: Record<number, number> = {};
  for (const a of annees) droitsParTitre[a] = 0;

  const totalBrut = Number((Number(soldeTotal) || 0).toFixed(2));
  if (totalBrut <= 0) {
    droitsParTitre[annee] = totalBrut;
    return { annees, droitsParTitre, titreActif: annee, resteTitreActif: totalBrut };
  }

  const resteAnnee = Number(Math.min(droit, totalBrut).toFixed(2));
  droitsParTitre[annee] = resteAnnee;
  return {
    annees,
    droitsParTitre,
    titreActif: annee,
    resteTitreActif: resteAnnee,
  };
}

/**
 * Décompose un solde cumulé (plafonné aux 3 dernières années = 90 j) selon le mode
 * SALFA par « Titre / Année » (consommation FIFO du titre annuel non prescrit le plus ancien).
 */
export function decomposerTitreActif(
  soldeTotal: number,
  annee: number,
  droitAnnuel: number = 30,
  anneeEmbauche: number = 0,
  nbAnneesCumul: number = DEFAULT_CONGES_CONFIG.nbAnneesCumul
): { titreActif: number; resteTitreActif: number } {
  const { titreActif, resteTitreActif } = decomposerDroitsSuccessifs(
    soldeTotal,
    annee,
    droitAnnuel,
    anneeEmbauche,
    nbAnneesCumul
  );
  return { titreActif, resteTitreActif };
}

// ------------------------------------------------------------------------------
// 5. Moteur de soldes et d'état
// ------------------------------------------------------------------------------

export function estPrisEnCompte(c: CongeAbsence): boolean {
  return c.statut !== 'REFUSE';
}

export function estValide(c: CongeAbsence): boolean {
  return c.statut === 'VALIDE';
}

/** Jours effectivement imputés (validés) d'une demande. */
export function joursImputes(c: CongeAbsence): number {
  if (!estValide(c)) return 0;
  if (c.categorie === 'AJUSTEMENT') return 0;
  return Number(c.jours_valides ?? c.jours_demandes ?? 0);
}

/** Jours réservés par une demande en cours de circuit. */
export function joursAttente(c: CongeAbsence): number {
  if (!estPrisEnCompte(c) || estValide(c)) return 0;
  if (c.categorie === 'AJUSTEMENT') return 0;
  return Number(c.jours_demandes || 0);
}

export function joursAffiches(c: CongeAbsence): number {
  if (c.categorie === 'AJUSTEMENT') return Number(c.jours_valides ?? c.jours_demandes ?? 0);
  return Number((c.jours_valides !== null && c.jours_valides !== undefined ? c.jours_valides : c.jours_demandes) || 0);
}

function dateEvenement(c: CongeAbsence): string {
  return c.date_debut || c.date_demande || `${c.annee}-01-01`;
}

export interface BilanAnnee {
  annee: number;
  report: number;
  /** Jours reportables expirés au-delà des 3 dernières années successives (prescription légale). */
  prescrits: number;
  droit: number;
  ajustements: number;
  ouverture: number;
  pris: number;
  attente: number;
  fin: number;
  /** Indique si le solde d'ouverture de cette année a été saisi manuellement dans l'état de contrôle. */
  ouvertureSaisie?: boolean;
  permDroit: number;
  permPris: number;
  permAttente: number;
  permFin: number;
  examenPris: number;
  examenAttente: number;
  nbDemandes: number;
  nbEnAttente: number;
}

export interface LigneEtatConges {
  cle: string;
  conge_id: number | null;
  type: 'DEMANDE' | 'SOLDE_FINAL';
  annee: number;
  date: string;
  /** Fin de la période demandée (dernier jour inclus). */
  date_fin: string;
  /** Daty fiverenana miasa — date de prise de service (le jour après la fin de la date demandée). */
  date_retour: string;
  categorie: CategorieAbsence;
  libelle_categorie: string;
  motif: string;
  statut: StatutConges | '';
  situation: string;
  /** I — CONGÉ : jours demandés. */
  jours_conge: number;
  /** J — CONGÉ : date de départ. */
  date_conge: string;
  /** K — PERMISSION : droit dans l'année. */
  perm_droit: number;
  /** L — PERMISSION : jours demandés. */
  perm_jours: number;
  /** M — PERMISSION : date. */
  perm_date: string;
  /** N — PERMISSION : droit restant après cette demande. */
  perm_restant: number;
  /** Colonnes d'années (C à H du classeur) : solde de congé avant la demande. */
  solde_par_annee: Record<number, number>;
  /** Colonnes ajoutées pour le suivi. */
  examen_jours: number;
  heures: string;
  remplacements: string;
  observations: string;
  jours: number;
  restant_apres: number;
}

export interface ParcoursConges {
  employe_id: number;
  numero_matricule: number;
  nom_prenoms: string;
  fonction: string;
  /** Salarié inactif : n'a plus aucun droit aux congés ni permissions (droit = 0, restant = 0). */
  inactif?: boolean;
  date_inactif?: string;
  /** Année d'embauche (0 = inconnue) : les exercices antérieurs restent vides, comme au classeur. */
  annee_embauche: number;
  annees: number[];
  bilans: Record<number, BilanAnnee>;
  lignes: LigneEtatConges[];
  soldeActuel: number;
  /** Détail des jours restants sur chacune des 3 dernières années successives (ex. { 2024: 25, 2025: 30, 2026: 30 }). */
  droitsParTitre: Record<number, number>;
  /** Titre/Année actif en cours de consommation (mode FIFO sur les 3 dernières années). */
  titreActif: number;
  /** Jours restants sur le Titre/Année actif (« Congé sisa ambiny »). */
  resteTitreActif: number;
  permissionActuelle: number;
  nbEnAttente: number;
}

export interface EtatConges {
  annees: number[];
  anneeCourante: number;
  config: CongesConfig;
  parcours: ParcoursConges[];
  totaux: {
    nbSalaries: number;
    nbDemandes: number;
    nbEnAttente: number;
    joursConge: number;
    joursPermission: number;
    joursExamen: number;
    totalSolde: number;
    depassements: number;
  };
}

export interface OptionsEtat {
  /** Année centrale de l'état ; les années affichées la précèdent et la suivent. */
  annee: number;
  /** Nombre de colonnes d'années à afficher (le classeur en contient 6). */
  nbAnnees?: number;
  /** Ne montrer que ces salariés (filtre recherche / service). */
  employes?: any[];
  /** Inclure les demandes refusées (par défaut non). */
  inclureRefuses?: boolean;
}

/** Retourne vrai si la fiche salarié est marquée inactive (`actif = 0`). */
export function estEmployeInactif(emp: any): boolean {
  if (!emp || typeof emp !== 'object') return false;
  if (emp.actif === undefined || emp.actif === null || emp.actif === '') return false;
  return Number(emp.actif) === 0;
}

/** Année extraite d'une date AAAA-MM-JJ ou JJ/MM/AAAA (0 si absente). */
export function anneeDebut(v: any): number {
  const s = String(v || '').trim();
  const iso = /^(\d{4})-/.exec(s);
  if (iso) return Number(iso[1]);
  const fr = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/.exec(s);
  if (fr) return Number(fr[3]);
  return 0;
}

function comparaisonDate(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function tourDeTable(c: CongeAbsence): number {
  if (c.categorie === 'AJUSTEMENT') return 0;
  if (estValide(c)) return 1;
  return 2;
}

/**
 * Construit, pour chaque salarié, le déroulé année par année des droits :
 * ouverture = report + droit de l'année, plafonné au cumul, puis une ligne
 * par demande (le solde affiché sur une ligne est celui d'avant la demande,
 * comme dans le classeur).
 * Les années antérieures à la fenêtre affichée sont tout de même consommées
 * (chauffe) pour que le report repris du classeur soit exact.
 */
export function construireEtat(
  employes: any[],
  conges: CongeAbsence[],
  config: CongesConfig,
  options: OptionsEtat
): EtatConges {
  const cfg = sanitizeCongesConfig(config);
  const anneeCourante = Number(options.annee) || new Date().getFullYear();
  const nbSuccessives = Math.max(1, Math.round(cfg.nbAnneesCumul || DEFAULT_CONGES_CONFIG.nbAnneesCumul));
  const nbAnnees = Math.max(1, Math.min(12, Number(options.nbAnnees) || nbSuccessives));
  const inclureRefuses = options.inclureRefuses === true;
  const plafondLoi = Number((nbSuccessives * cfg.joursCongeParAn).toFixed(2));
  const plafondCumul = Number.isFinite(cfg.plafondCumulConge) && cfg.plafondCumulConge > 0
    ? Math.min(cfg.plafondCumulConge, plafondLoi)
    : plafondLoi;

  const listeEmployes = (options.employes && options.employes.length ? options.employes : employes) || [];
  const congesValides = (conges || []).map((c) => normaliserConge(c, cfg)).filter((c) => inclureRefuses || estPrisEnCompte(c));

  // Regrouper par salarié ; un salarié sans identifiant numérique est rattaché par matricule.
  const parEmploye = new Map<number, CongeAbsence[]>();
  for (const c of congesValides) {
    const cle = Number(c.employe_id) || -Math.abs(Number(c.numero_matricule) || 0);
    const liste = parEmploye.get(cle);
    if (liste) liste.push(c);
    else parEmploye.set(cle, [c]);
  }

  // Fenêtre d'années affichées : par défaut les 3 dernières années successives
  // conformément au Code du Travail malgache (ex. en 2026 : 2024, 2025, 2026).
  const finColonnes = anneeCourante;
  const anneesColonnes: number[] = [];
  for (let a = finColonnes - nbAnnees + 1; a <= finColonnes; a++) anneesColonnes.push(a);
  const fenetre = new Set(anneesColonnes);

  const parcours: ParcoursConges[] = [];
  const totaux = {
    nbSalaries: 0, nbDemandes: 0, nbEnAttente: 0,
    joursConge: 0, joursPermission: 0, joursExamen: 0, totalSolde: 0, depassements: 0,
  };

  const employsTries = [...listeEmployes].sort(
    (a, b) => (Number(a.numero_matricule) || 0) - (Number(b.numero_matricule) || 0)
  );

  for (const emp of employsTries) {
    const cle = Number(emp.id) || -Math.abs(Number(emp.numero_matricule) || 0);
    const evenements = (parEmploye.get(cle) || []).slice().sort((a, b) => {
      const da = comparaisonDate(dateEvenement(a), dateEvenement(b));
      if (da !== 0) return da;
      const ta = tourDeTable(a) - tourDeTable(b);
      if (ta !== 0) return ta;
      return Number(a.id) - Number(b.id);
    });

    let premiere = anneeCourante;
    let derniere = anneeCourante;
    for (const c of evenements) {
      const a = Number(c.annee) || anneeCourante;
      if (a < premiere) premiere = a;
      if (a > derniere) derniere = a;
    }
    const debut = Math.min(premiere, anneesColonnes[0] ?? anneeCourante);
    const fin = Math.max(derniere, anneesColonnes[anneesColonnes.length - 1] ?? anneeCourante);

    const anneeEmbauche = anneeDebut(emp.date_embauche);
    const inactif = estEmployeInactif(emp);
    const dateInactif = String(emp.date_inactif || '').trim();
    const p: ParcoursConges = {
      employe_id: Number(emp.id) || 0,
      numero_matricule: Number(emp.numero_matricule) || 0,
      nom_prenoms: String(emp.nom_prenoms || '').trim(),
      fonction: String(emp.jobs || emp.fonction || '').trim(),
      inactif,
      date_inactif: dateInactif,
      annee_embauche: anneeEmbauche,
      annees: anneesColonnes.filter((a) => a >= debut && a <= fin),
      bilans: {},
      lignes: [],
      soldeActuel: 0,
      droitsParTitre: {},
      titreActif: anneeCourante,
      resteTitreActif: 0,
      permissionActuelle: 0,
      nbEnAttente: 0,
    };
    if (!p.annees.length) p.annees = anneesColonnes.slice();

    const plafondAnnee = Math.min(30, cfg.joursCongeParAn);
    let derniereAnnee = Math.max(debut, Math.min(fin, finColonnes));
    // Gestion indépendante année par année : chaque exercice (2024, 2025, 2026…)
    // dispose de son propre solde plafonné à 30 jours maximum par an, sans report
    // positif ni report de dépassement d'une année sur l'autre.
    // Les personnes inactives n'ont plus aucun droit aux congés (droit = 0, solde = 0).
    for (let annee = debut; annee <= fin; annee++) {
      const eventsAnnee = evenements.filter((c) => Number(c.annee) === annee);
      const ajustements = eventsAnnee.filter((c) => c.categorie === 'AJUSTEMENT');
      const droitOuvert = !inactif && (!anneeEmbauche || annee >= anneeEmbauche);
      const droitBase = droitOuvert ? plafondAnnee : 0;
      const ajustsOuverture = ajustements.filter((c) => c.ajustement_type === 'OUVERTURE');
      const derniereOuverture = !inactif && ajustsOuverture.length ? ajustsOuverture[ajustsOuverture.length - 1] : null;
      const ajustDroit = inactif
        ? 0
        : ajustements
            .filter((c) => c.ajustement_type !== 'REPORT' && c.ajustement_type !== 'OUVERTURE')
            .reduce((s, c) => s + joursAffiches(c), 0);

      const prescrits = 0;
      const report = 0;

      let ouverture: number;
      if (inactif) {
        ouverture = 0;
      } else if (derniereOuverture) {
        // Saisie manuelle dans le tableau (2024, 2025, 2026…), gérée indépendamment par année
        // et strictement plafonnée entre 0 et 30 jours (plafond annuel).
        const cibleSaisie = Math.max(0, Math.min(plafondAnnee, Math.round(joursAffiches(derniereOuverture) * 100) / 100));
        ouverture = Math.max(0, Math.min(plafondAnnee, cibleSaisie + ajustDroit));
      } else {
        ouverture = Math.max(0, Math.min(plafondAnnee, droitBase + ajustDroit));
      }
      const ajust = inactif ? 0 : Number((ouverture - droitBase).toFixed(2));

      const dansFenetre = fenetre.has(annee);
      const bilan: BilanAnnee = {
        annee, report: Number(report.toFixed(2)), prescrits, droit: droitBase, ajustements: ajust,
        ouverture: Number(ouverture.toFixed(2)), pris: 0, attente: 0, fin: 0,
        ouvertureSaisie: !inactif && Boolean(derniereOuverture),
        permDroit: !inactif && (droitOuvert || Boolean(derniereOuverture)) ? cfg.joursPermissionParAn : 0,
        permPris: 0, permAttente: 0, permFin: 0,
        examenPris: 0, examenAttente: 0, nbDemandes: 0, nbEnAttente: 0,
      };

      let soldeAnnee = ouverture;
      let permAnnee = bilan.permDroit;
      const lignesAnnee: LigneEtatConges[] = [];

      for (const c of eventsAnnee) {
        if (c.categorie === 'AJUSTEMENT') continue; // déjà intégré dans le droit
        const jours = estValide(c) ? joursImputes(c) : joursAttente(c);
        const total = joursAffiches(c);
        const finAbsence = c.date_fin || (c.date_debut ? (total > 0 ? calculerDateFin(c.date_debut, total, cfg) : c.date_debut) : '');
        const retourService = c.date_retour || (finAbsence ? calculerDateRetourDepuisFin(finAbsence, cfg) : '');
        const ligne: LigneEtatConges = {
          cle: `c${c.id}`,
          conge_id: c.id,
          type: 'DEMANDE',
          annee,
          date: dateEvenement(c),
          date_fin: finAbsence,
          date_retour: retourService,
          categorie: c.categorie,
          libelle_categorie: LIBELLES_CATEGORIE[c.categorie],
          motif: c.motif_libelle || LIBELLES_CATEGORIE[c.categorie],
          statut: c.statut,
          situation: c.statut === 'VALIDE' ? 'Validée' : c.statut === 'REFUSE' ? 'Refusée' : 'En attente',
          jours_conge: 0,
          date_conge: '',
          perm_droit: 0,
          perm_jours: 0,
          perm_date: '',
          perm_restant: 0,
          solde_par_annee: {},
          examen_jours: 0,
          heures: [c.heure_debut, c.heure_fin].filter(Boolean).join(' → '),
          remplacements: c.remplacant || '',
          observations: [c.observations, c.justificatif].filter(Boolean).join(' — '),
          jours: total,
          restant_apres: 0,
        };
        if (c.imputation === 'CONGE') {
          ligne.jours_conge = jours;
          ligne.date_conge = c.date_debut || dateEvenement(c);
          ligne.solde_par_annee[annee] = inactif ? 0 : Number(soldeAnnee.toFixed(2));
          if (estValide(c)) {
            if (!inactif) soldeAnnee -= jours;
            bilan.pris += jours;
          } else {
            bilan.attente += jours;
          }
        } else if (c.imputation === 'PERMISSION') {
          ligne.perm_jours = jours;
          ligne.perm_date = c.date_debut || dateEvenement(c);
          ligne.perm_droit = bilan.permDroit;
          if (estValide(c)) {
            if (!inactif) permAnnee -= jours;
            bilan.permPris += jours;
          } else {
            bilan.permAttente += jours;
          }
          ligne.perm_restant = inactif ? 0 : Number(permAnnee.toFixed(2));
          ligne.solde_par_annee[annee] = inactif ? 0 : Number(soldeAnnee.toFixed(2));
        } else {
          ligne.examen_jours = total;
          ligne.date_conge = c.date_debut || dateEvenement(c);
          ligne.solde_par_annee[annee] = inactif ? 0 : Number(soldeAnnee.toFixed(2));
          if (estValide(c)) bilan.examenPris += total;
          else bilan.examenAttente += total;
        }
        ligne.restant_apres = inactif ? 0 : Number((c.imputation === 'PERMISSION' ? permAnnee : soldeAnnee).toFixed(2));
        if (dansFenetre) lignesAnnee.push(ligne);
        bilan.nbDemandes++;
        if (c.statut !== 'VALIDE') {
          bilan.nbEnAttente++;
          if (dansFenetre) p.nbEnAttente++;
        }
      }

      bilan.fin = inactif ? 0 : Number(soldeAnnee.toFixed(2));
      bilan.permFin = inactif ? 0 : Number(permAnnee.toFixed(2));
      p.bilans[annee] = bilan;
      if (dansFenetre) p.lignes.push(...lignesAnnee);
      derniereAnnee = Math.max(derniereAnnee, annee);
    }

    // Une seule ligne de solde par salarié, qui reprend le solde de fin de chaque
    // année affichée : c'est la dernière valeur de colonne du classeur SALFA.
    const soldeLigne: LigneEtatConges = {
      cle: `s${emp.id}`,
      conge_id: null,
      type: 'SOLDE_FINAL',
      annee: derniereAnnee,
      date: `${derniereAnnee}-12-31`,
      date_fin: '',
      date_retour: '',
      categorie: 'AJUSTEMENT',
      libelle_categorie: '',
      motif: inactif
        ? 'Salarié inactif — aucun droit aux congés'
        : `Solde de fin d’année${p.lignes.length ? '' : ' — aucune demande enregistrée'}`,
      statut: '',
      situation: inactif ? 'Inactif' : '',
      jours_conge: 0,
      date_conge: '',
      perm_droit: inactif ? 0 : ((p.bilans[anneeCourante] || p.bilans[derniereAnnee])?.permDroit || 0),
      perm_jours: 0,
      perm_date: '',
      perm_restant: inactif ? 0 : ((p.bilans[anneeCourante] || p.bilans[derniereAnnee])?.permFin || 0),
      solde_par_annee: {},
      examen_jours: 0,
      heures: '',
      remplacements: '',
      observations: '',
      jours: 0,
      restant_apres: inactif ? 0 : ((p.bilans[anneeCourante] || p.bilans[derniereAnnee])?.fin || 0),
    };
    for (const a of p.annees) soldeLigne.solde_par_annee[a] = inactif ? 0 : (p.bilans[a] ? p.bilans[a].fin : 0);
    p.lignes.push(soldeLigne);

    // Les années hors fenêtre (mais dans la fenêtre d'affichage) doivent quand même
    // apparaître avec leur solde de fin indépendant, plafonné à 30 j (ou 0 j si inactif).
    for (const a of p.annees) {
      if (!p.bilans[a]) {
        const ouvertA = !inactif && (!anneeEmbauche || a >= anneeEmbauche);
        const drA = ouvertA ? plafondAnnee : 0;
        const permA = ouvertA ? cfg.joursPermissionParAn : 0;
        p.bilans[a] = {
          annee: a, report: 0, prescrits: 0, droit: drA, ajustements: 0, ouverture: drA,
          pris: 0, attente: 0, fin: drA, permDroit: permA, permPris: 0,
          permAttente: 0, permFin: permA, examenPris: 0, examenAttente: 0,
          nbDemandes: 0, nbEnAttente: 0,
        };
      }
    }
    const bilanCourant = p.bilans[anneeCourante] || p.bilans[Math.max(...Object.keys(p.bilans).map(Number))] || null;
    const anneeReference = bilanCourant ? bilanCourant.annee : anneeCourante;
    p.soldeActuel = inactif ? 0 : (bilanCourant ? bilanCourant.fin : 0);
    const droitsParTitreIndependants: Record<number, number> = {};
    for (const a of anneesSuccessives(anneeReference, nbSuccessives)) {
      if (inactif) {
        droitsParTitreIndependants[a] = 0;
      } else if (p.bilans[a]) {
        droitsParTitreIndependants[a] = p.bilans[a].fin;
      } else {
        droitsParTitreIndependants[a] = !anneeEmbauche || a >= anneeEmbauche ? plafondAnnee : 0;
      }
    }
    p.droitsParTitre = droitsParTitreIndependants;
    p.titreActif = anneeReference;
    p.resteTitreActif = inactif ? 0 : p.soldeActuel;
    p.permissionActuelle = inactif ? 0 : (bilanCourant ? bilanCourant.permFin : 0);
    if (bilanCourant && !inactif) {
      totaux.nbSalaries++;
      totaux.nbDemandes += bilanCourant.nbDemandes;
      totaux.nbEnAttente += bilanCourant.nbEnAttente;
      totaux.joursConge += bilanCourant.pris;
      totaux.joursPermission += bilanCourant.permPris;
      totaux.joursExamen += bilanCourant.examenPris;
      totaux.totalSolde += bilanCourant.fin;
      if (bilanCourant.fin < 0) totaux.depassements++;
    }
    parcours.push(p);
  }

  return { annees: anneesColonnes, anneeCourante, config: cfg, parcours, totaux };
}

/** Solde disponible d'un salarié pour une année (utilisé à la saisie). */
export interface SoldeSaisie {
  employe_id: number;
  numero_matricule: number;
  nom_prenoms: string;
  inactif?: boolean;
  date_inactif?: string;
  annee_embauche: number;
  annee: number;
  droit: number;
  /** Ajustements saisis par le gestionnaire sur cette année (peuvent être négatifs). */
  ajust: number;
  report: number;
  /** Jours expirés au-delà des 3 dernières années successives (prescription légale). */
  prescrits: number;
  ouverture: number;
  pris: number;
  attente: number;
  restant: number;
  /** Détail des jours restants indépendants sur chaque année affichée (ex. { 2024: 10, 2025: 9, 2026: 5 }). */
  droitsParTitre: Record<number, number>;
  /** Titre/Année actif en cours (géré indépendamment année par année). */
  titreActif: number;
  /** Jours restants sur le Titre/Année actif (« Congé sisa ambiny »). */
  resteTitreActif: number;
  permDroit: number;
  permPris: number;
  permAttente: number;
  permRestant: number;
  examenJours: number;
  nbDemandes: number;
  depassement: boolean;
}

export function calculerSoldes(
  employes: any[],
  conges: CongeAbsence[],
  config: CongesConfig,
  annee: number,
  options: { employes?: any[]; nbAnnees?: number } = {}
): SoldeSaisie[] {
  const cfg = sanitizeCongesConfig(config);
  const etat = construireEtat(employes, conges, cfg, {
    annee,
    nbAnnees: options.nbAnnees || cfg.nbAnneesCumul,
    employes: options.employes,
  });
  return etat.parcours.map((p) => {
    const b = p.bilans[annee];
    const inactif = Boolean(p.inactif);
    const videParTitre: Record<number, number> = {};
    for (const a of anneesSuccessives(annee, etat.config.nbAnneesCumul)) videParTitre[a] = 0;
    if (!b || inactif) {
      return {
        employe_id: p.employe_id, numero_matricule: p.numero_matricule, nom_prenoms: p.nom_prenoms,
        inactif, date_inactif: p.date_inactif || '',
        annee_embauche: p.annee_embauche,
        annee, droit: 0, ajust: 0, report: 0, prescrits: 0, ouverture: 0,
        pris: b ? Number(b.pris.toFixed(2)) : 0,
        attente: b ? Number(b.attente.toFixed(2)) : 0,
        restant: 0,
        droitsParTitre: videParTitre, titreActif: annee, resteTitreActif: 0,
        permDroit: 0,
        permPris: b ? Number(b.permPris.toFixed(2)) : 0,
        permAttente: b ? Number(b.permAttente.toFixed(2)) : 0,
        permRestant: 0,
        examenJours: b ? Number((b.examenPris + b.examenAttente).toFixed(2)) : 0,
        nbDemandes: b ? b.nbDemandes : 0,
        depassement: false,
      };
    }
    const restant = Number((b.fin).toFixed(2));
    return {
      employe_id: p.employe_id,
      numero_matricule: p.numero_matricule,
      nom_prenoms: p.nom_prenoms,
      inactif: false,
      date_inactif: p.date_inactif || '',
      annee_embauche: p.annee_embauche,
      annee,
      droit: b.droit,
      ajust: Number((b.ajustements || 0).toFixed(2)),
      report: b.report,
      prescrits: Number((b.prescrits || 0).toFixed(2)),
      ouverture: Number((b.ouverture).toFixed(2)),
      pris: Number((b.pris).toFixed(2)),
      attente: Number((b.attente).toFixed(2)),
      restant,
      droitsParTitre: { ...p.droitsParTitre },
      titreActif: annee,
      resteTitreActif: restant,
      permDroit: b.permDroit,
      permPris: Number((b.permPris).toFixed(2)),
      permAttente: Number((b.permAttente).toFixed(2)),
      permRestant: Number((b.permFin).toFixed(2)),
      examenJours: Number((b.examenPris + b.examenAttente).toFixed(2)),
      nbDemandes: b.nbDemandes,
      depassement: Number((b.fin - b.attente - b.permAttente).toFixed(2)) < 0,
    };
  });
}

/** Solde restant après une demande pour un salarié donné (contrôle à la validation). */
export interface ControleSolde {
  /** Solde disponible avant cette demande (congé ou permission selon l'imputation). */
  disponible: number;
  /** Solde qui resterait après imputation de la demande. */
  apresDemande: number;
  suffisant: boolean;
  congeRestant: number;
  permissionRestante: number;
  dejaAttente: number;
  /** Les N dernières années successives autorisées par la loi malgache (ex. [2024, 2025, 2026]). */
  anneesAutorisees?: number[];
  /** Détail des jours restants sur chacune des 3 dernières années. */
  droitsParTitre?: Record<number, number>;
  /** Vrai si le titre indiqué dans la demande porte sur une année antérieure aux 3 dernières années (prescrite). */
  titrePrescrit?: boolean;
  /** Vrai si le salarié est inactif (les personnes inactives n'ont plus droit aux congés). */
  salarieInactif?: boolean;
}

/**
 * Contrôle de solde utilisé à la saisie et à la validation : le même moteur que
 * l'état, afin que le chiffre annoncé au comptable soit celui du document imprimé.
 * La demande en cours est retirée du calcul puis réimputée.
 */
export function controleSolde(
  employes: any[],
  conges: CongeAbsence[],
  config: CongesConfig,
  employeId: number,
  annee: number,
  demande: Partial<CongeAbsence> | null
): ControleSolde {
  const cfg = sanitizeCongesConfig(config);
  const idDemande = Number(demande?.id) || 0;
  const employe = (employes || []).find((e) => Number(e.id) === Number(employeId));
  const anneesAutorisees = anneesSuccessives(annee, cfg.nbAnneesCumul);
  const jours = Number(demande?.jours_valides ?? demande?.jours_demandes ?? 0);
  if (employe && estEmployeInactif(employe)) {
    const zeroParTitre: Record<number, number> = {};
    for (const a of anneesAutorisees) zeroParTitre[a] = 0;
    return {
      disponible: 0,
      apresDemande: Number((-jours).toFixed(2)),
      suffisant: false,
      congeRestant: 0,
      permissionRestante: 0,
      dejaAttente: 0,
      anneesAutorisees,
      droitsParTitre: zeroParTitre,
      titrePrescrit: false,
      salarieInactif: true,
    };
  }
  const autres = (conges || [])
    .map((c) => normaliserConge(c, cfg))
    .filter((c) => Number(c.employe_id) === Number(employeId) && Number(c.id) !== idDemande);
  const [solde] = calculerSoldes(employe ? [employe] : [], autres, cfg, annee, { nbAnnees: cfg.nbAnneesCumul });
  const congeRestant = solde ? solde.restant : 0;
  const permissionRestante = solde ? solde.permRestant : 0;
  const imputation: ImputationConges = (demande?.imputation as ImputationConges) || 'CONGE';
  const base = imputation === 'PERMISSION' ? permissionRestante : congeRestant;
  const apres = imputation === 'AUCUNE' ? base : Number((base - jours).toFixed(2));
  const anneeMinLoi = anneesAutorisees[0] ?? annee;
  const matchTitre = /\b(19\d{2}|20\d{2})\b/.exec(String(demande?.titre_periode || ''));
  const anneeTitre = matchTitre ? Number(matchTitre[1]) : 0;
  const titrePrescrit = imputation === 'CONGE' && anneeTitre > 0 && anneeTitre < anneeMinLoi;
  return {
    disponible: Number(base.toFixed(2)),
    apresDemande: apres,
    suffisant: !titrePrescrit && (imputation === 'AUCUNE' || apres >= -0.0001),
    congeRestant,
    permissionRestante,
    dejaAttente: solde ? Number((solde.attente + solde.permAttente).toFixed(2)) : 0,
    anneesAutorisees,
    droitsParTitre: solde?.droitsParTitre,
    titrePrescrit,
  };
}

// ------------------------------------------------------------------------------
// 6. Circuit de validation
// ------------------------------------------------------------------------------

export const ACTIONS_CONGES = {
  AVIS_CHF: { vers: 'AVIS_CHF' as StatutConges, libelle: 'Avis chef de service' },
  AVIS_MEDECIN: { vers: 'AVIS_MEDECIN' as StatutConges, libelle: 'Avis médecin chef' },
  VALIDE: { vers: 'VALIDE' as StatutConges, libelle: 'Valider (gestionnaire)' },
  REFUSE: { vers: 'REFUSE' as StatutConges, libelle: 'Refuser' },
  REOUVRIR: { vers: 'SOUMIS' as StatutConges, libelle: 'Rouvrir la demande' },
};

/** Transitions autorisées depuis un statut, pour n'afficher que les boutons utiles. */
export function actionsAutorisees(statut: StatutConges, motif: MotifAbsence | null): (keyof typeof ACTIONS_CONGES)[] {
  const besoinsMedecin = !!motif?.avisMedecin;
  switch (statut) {
    case 'SOUMIS':
      return besoinsMedecin ? ['AVIS_CHF', 'REFUSE'] : ['AVIS_CHF', 'VALIDE', 'REFUSE'];
    case 'AVIS_CHF':
      return besoinsMedecin ? ['AVIS_MEDECIN', 'REFUSE'] : ['VALIDE', 'REFUSE', 'AVIS_MEDECIN'];
    case 'AVIS_MEDECIN':
      return ['VALIDE', 'REFUSE'];
    case 'VALIDE':
      return ['REOUVRIR'];
    case 'REFUSE':
      return ['REOUVRIR'];
  }
}

export function aBesoinMedecin(c: CongeAbsence): boolean {
  if (c.categorie === 'EXAMEN_MEDICAL') return true;
  const motif = trouverMotif(c.motif_code);
  return !!motif?.avisMedecin;
}

// ------------------------------------------------------------------------------
// 7. Rapprochement avec la liste du personnel (import du contrôle Excel)
// ------------------------------------------------------------------------------

export function normaliserNom(s: string): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokensNom(s: string): string[] {
  return normaliserNom(s).split(' ').filter((t) => t.length >= 3);
}

/** Clé phonétique tolérante pour les variantes d'orthographe courantes à Madagascar. */
function clePhonetique(t: string): string {
  return t
    .replace(/^RANDRIA/, 'RADRIA')
    .replace(/EAU/g, 'O')
    .replace(/AU/g, 'O')
    .replace(/GEU/g, 'GUE')
    .replace(/NN/g, 'N')
    .replace(/LL/g, 'L')
    .replace(/TT/g, 'T')
    .replace(/PH/g, 'F')
    .replace(/H$/g, 'T');
}

/** Distance d'édition bornée à 1 pour tolérer une lettre omise/modifiée sur un nom long. */
function distanceMax1(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let diffs = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else {
      if (++diffs > 1) return false;
      if (a.length > b.length) i++;
      else if (b.length > a.length) j++;
      else {
        i++;
        j++;
      }
    }
  }
  if (i < a.length || j < b.length) diffs++;
  return diffs <= 1;
}

function enrichirTokens(tokens: string[]): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < tokens.length; i++) {
    out.add(clePhonetique(tokens[i]));
    if (i + 1 < tokens.length) {
      out.add(clePhonetique(tokens[i] + tokens[i + 1]));
    }
  }
  return out;
}

/**
 * Retrouve un salarié à partir du nom porté sur le contrôle de congés
 * (le fichier ne contient ni matricule ni code salarié).
 */
export function retrouverEmploye(nom: string, employes: any[]): any | null {
  const clean = normaliserNom(nom);
  if (!clean) return null;
  const exact = employes.find((e) => normaliserNom(e.nom_prenoms) === clean);
  if (exact) return exact;
  const sansEspace = clean.replace(/\s+/g, '');
  const exactSansEspace = employes.find((e) => normaliserNom(e.nom_prenoms).replace(/\s+/g, '') === sansEspace);
  if (exactSansEspace) return exactSansEspace;

  const cherche = tokensNom(nom);
  if (!cherche.length) return null;
  const chercheEnrichi = enrichirTokens(cherche);

  let meilleur: { emp: any; score: number } | null = null;
  for (const e of employes) {
    const tokens = tokensNom(e.nom_prenoms);
    if (!tokens.length) continue;
    // Un nom à un seul mot (ex. FLORESTIEN, JUSTINE) ne rapproche qu'un nom à un seul mot.
    if (cherche.length === 1 || tokens.length === 1) {
      if (cherche.length === 1 && tokens.length === 1 && clePhonetique(cherche[0]) === clePhonetique(tokens[0])) {
        return e;
      }
      continue;
    }
    const cibles = enrichirTokens(tokens);
    const ciblesLongues = Array.from(cibles).filter((c) => c.length >= 7);
    let score = 0;
    for (const t of chercheEnrichi) {
      if (cibles.has(t) || (t.length >= 7 && ciblesLongues.some((c) => distanceMax1(t, c)))) {
        score++;
      }
    }
    if (score >= 2 && (!meilleur || score > meilleur.score)) {
      meilleur = { emp: e, score };
    }
  }
  return meilleur ? meilleur.emp : null;
}

/** Rapproche un motif libre du contrôle Excel avec le motif correspondant de la fiche d'absence. */
export function devinerMotifPermission(texte: string): MotifAbsence | null {
  const n = normaliserNom(texte);
  if (!n) return null;
  if (/TERA\s*BADY|ACCOUCH/.test(n)) return trouverMotif('Tera-bady');
  if (/DIDI\s*M?\s*POITRA|CIRCONC/.test(n)) return trouverMotif('Didim-poitra zanaka');
  if (/HOPITAL|HOSPITAL|MARARY/.test(n)) {
    if (/ZANAKA|ENFANT/.test(n)) return trouverMotif('Hopitaly zanaka');
    if (/RAFOZANA|BEAU/.test(n)) return trouverMotif('Hopitaly rafozana');
    if (/RAD|RAY|RENY|PARENT/.test(n)) return trouverMotif('Hopitaly RAD niteraka');
    if (/TAMPO|ZOKY|ZANDRY|FRERE|SOEUR/.test(n)) return trouverMotif('Hopitaly iray tampo');
    return trouverMotif('Hopitaly vady');
  }
  if (/FAHAFATESANA|DECES|MATY/.test(n)) {
    if (/ZANAKA|ENFANT/.test(n)) return trouverMotif('Fahafatesana zanaka');
    if (/RAFOZANA|BEAU/.test(n)) return trouverMotif('Fahafatesana rafozana');
    if (/RAD|RAY|RENY|PARENT/.test(n)) return trouverMotif('Fahafatesana RAD niteraka');
    if (/TAMPO|ZOKY|ZANDRY|FRERE|SOEUR|FAMILLE/.test(n)) return trouverMotif('Fahafatesana iray tampo');
    return trouverMotif('Fahafatesana vady');
  }
  if (/FANAMBADIANA|MARI+AGE/.test(n)) {
    if (/ZANAKA|ENFANT/.test(n)) return trouverMotif('Fanambadiana zanaka');
    if (/ZOKY|ZANDRY|TAMPO|FAMILLE|FRERE|SOEUR/.test(n)) return trouverMotif('Fanambadiana iray tampo');
    return trouverMotif('Fanambadiana mpiasa');
  }
  return null;
}

export function fmtJours(v: number | null | undefined): string {
  const n = Number(v || 0);
  if (!Number.isFinite(n)) return '0';
  return (Math.round(n * 100) / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
}

export interface SyntheseCongePaie {
  employe_id: number;
  conge_pris_mois: number;
  conge_pris_annee: number;
  conge_restant: number;
  conge_titre_actif: number;
  conge_reste_titre: number;
  permission_pris_mois: number;
  permission_restante: number;
}

const MOIS_INDEX_FR = [
  'JANVIER', 'FEVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN',
  'JUILLET', 'AOUT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DECEMBRE',
];

function bornesMoisIso(annee: number, mois?: string): { debutMois: string; finMois: string } | null {
  if (!mois) return null;
  const idx = MOIS_INDEX_FR.indexOf(String(mois).trim().toUpperCase());
  if (idx < 0) return null;
  const mm = String(idx + 1).padStart(2, '0');
  const dernierJour = new Date(annee, idx + 1, 0).getDate();
  return {
    debutMois: `${annee}-${mm}-01`,
    finMois: `${annee}-${mm}-${String(dernierJour).padStart(2, '0')}`,
  };
}

/**
 * Calcule la synthèse des congés & permissions de chaque salarié pour un mois de paie
 * donné (jours pris sur le mois, cumul pris dans l'année jusqu'à la fin du mois, et
 * solde de congés restants selon la règle des 3 dernières années).
 */
export function calculerSyntheseCongesPeriode(
  employes: any[],
  congesBruts: Partial<CongeAbsence>[],
  cfg: CongesConfig = DEFAULT_CONGES_CONFIG,
  annee: number = new Date().getFullYear(),
  mois?: string
): Map<number, SyntheseCongePaie> {
  const nbAnnees = cfg.nbAnneesCumul || DEFAULT_CONGES_CONFIG.nbAnneesCumul;
  const congesNormalises = (congesBruts || []).map((c) => normaliserConge(c, cfg));
  const soldes = calculerSoldes(employes, congesNormalises, cfg, annee, { nbAnnees });
  const soldeByEmp = new Map<number, SoldeSaisie>(soldes.map((s) => [s.employe_id, s]));
  const bornes = bornesMoisIso(annee, mois);
  const optsOuvrables = {
    exclureDimanche: cfg.exclureDimanche,
    exclureSamedi: cfg.exclureSamedi,
    feries: listeJoursFeries(cfg),
  };

  const congesAnnee = congesNormalises.filter(
    (c) => Number(c.annee) === Number(annee) && estValide(c) && c.categorie !== 'AJUSTEMENT'
  );

  const parEmp = new Map<number, CongeAbsence[]>();
  for (const c of congesAnnee) {
    const id = Number(c.employe_id);
    if (!parEmp.has(id)) parEmp.set(id, []);
    parEmp.get(id)!.push(c);
  }

  const resultat = new Map<number, SyntheseCongePaie>();
  for (const emp of employes) {
    const empId = Number(emp.id);
    const s = soldeByEmp.get(empId);
    const ouverture = s ? s.ouverture : 0;
    const permDroit = s ? s.permDroit : 0;
    const anneeEmb = anneeDebut(emp.date_embauche);

    if (!bornes) {
      const restant = s ? s.restant : 0;
      resultat.set(empId, {
        employe_id: empId,
        conge_pris_mois: 0,
        conge_pris_annee: s ? s.pris : 0,
        conge_restant: restant,
        conge_titre_actif: annee,
        conge_reste_titre: restant,
        permission_pris_mois: 0,
        permission_restante: s ? s.permRestant : 0,
      });
      continue;
    }

    const { debutMois, finMois } = bornes;
    let congeMois = 0;
    let congeJusquaMois = 0;
    let permMois = 0;
    let permJusquaMois = 0;

    for (const c of parEmp.get(empId) || []) {
      const total = joursImputes(c);
      if (total <= 0) continue;
      const debut = c.date_debut || c.date_demande || `${annee}-01-01`;
      const fin = c.date_fin || calculerDateFin(debut, total, cfg) || debut;

      let partMois = 0;
      if (debut >= debutMois && fin <= finMois) {
        partMois = total;
      } else if (debut <= finMois && fin >= debutMois) {
        const d1 = debut > debutMois ? debut : debutMois;
        const d2 = fin < finMois ? fin : finMois;
        partMois = Math.min(total, compterJoursOuvrables(d1, d2, optsOuvrables));
      }

      let partJusquaMois = 0;
      if (fin <= finMois) {
        partJusquaMois = total;
      } else if (debut <= finMois) {
        partJusquaMois = Math.min(total, compterJoursOuvrables(debut, finMois, optsOuvrables));
      }

      if (c.imputation === 'CONGE') {
        congeMois += partMois;
        congeJusquaMois += partJusquaMois;
      } else if (c.imputation === 'PERMISSION') {
        permMois += partMois;
        permJusquaMois += partJusquaMois;
      }
    }

    const inactif = estEmployeInactif(emp);
    const congeRestant = inactif ? 0 : Number((ouverture - congeJusquaMois).toFixed(2));
    const permRestante = inactif ? 0 : Number((permDroit - permJusquaMois).toFixed(2));

    resultat.set(empId, {
      employe_id: empId,
      conge_pris_mois: Number(congeMois.toFixed(2)),
      conge_pris_annee: Number(congeJusquaMois.toFixed(2)),
      conge_restant: congeRestant,
      conge_titre_actif: annee,
      conge_reste_titre: congeRestant,
      permission_pris_mois: Number(permMois.toFixed(2)),
      permission_restante: permRestante,
    });
  }

  return resultat;
}

