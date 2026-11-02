// Modèle de contrat de travail SALFA.
// Les clauses proviennent de « CONTRAT DE TRAVAIL SALFA.docx » et ne sont pas
// réinterprétées. Les données de paie ne sont jamais modifiées par ce module.
import { Employe, PaieMensuelle } from '../types';
import { formatMontant } from '../local/montants';

// Valeur affichée pour une information manquante, distincte de la mention PROJET.
export const PLACEHOLDER_CONTRAT = '-';
export const MENTION_PROJET_CONTRAT = 'PROJET — À COMPLÉTER AVANT SIGNATURE';
export const REPRESENTANT_DEFAUT = 'RASOARININDRINA Lalao Voangy';

export interface ContratDonnees {
  civilite: string;
  nom_prenoms: string;
  date_naissance: string;
  lieu_naissance: string;
  pere: string;
  mere: string;
  cin: string;
  date_cin: string;
  lieu_cin: string;
  situation_matrimoniale: string;
  adresse: string;
  service: string;
  nature_contrat: string;
  duree_contrat: string;
  qualite: string;
  lieu_embauche: string;
  lieu_travail: string;
  classification: string;
  salaire_base: string;
  indemnite_logement: string;
  indemnite_rendement: string;
  indemnite_responsabilite: string;
  date_effet: string;
  lieu_signature: string;
  date_signature: string;
  representant: string;
}

export type ContratDonneesCles = keyof ContratDonnees;

export const NATURES_CONTRAT = ['CDI', 'CDD', 'Autre'] as const;

export const LIBELLES_CHAMPS_CONTRAT: Record<ContratDonneesCles, string> = {
  civilite: 'Civilité',
  nom_prenoms: 'Nom et prénoms',
  date_naissance: 'Date de naissance',
  lieu_naissance: 'Lieu de naissance',
  pere: 'Père',
  mere: 'Mère',
  cin: 'N° CIN',
  date_cin: 'Date de délivrance de la CIN',
  lieu_cin: 'Lieu de délivrance de la CIN',
  situation_matrimoniale: 'Situation matrimoniale',
  adresse: 'Adresse',
  service: 'Service d’affectation',
  nature_contrat: 'Nature du contrat',
  duree_contrat: 'Durée du contrat',
  qualite: 'Qualité / fonction',
  lieu_embauche: 'Lieu d’embauche',
  lieu_travail: 'Lieu d’exécution du travail',
  classification: 'Classification professionnelle',
  salaire_base: 'Salaire de base mensuel',
  indemnite_logement: 'Indemnité de logement',
  indemnite_rendement: 'Indemnité de rendement',
  indemnite_responsabilite: 'Indemnité de responsabilité',
  date_effet: 'Date d’effet du contrat',
  lieu_signature: 'Lieu de signature',
  date_signature: 'Date de signature',
  representant: 'Représentant de l’employeur',
};

const CHAMPS_MONTANT: ContratDonneesCles[] = [
  'salaire_base', 'indemnite_logement', 'indemnite_rendement', 'indemnite_responsabilite',
];
const CHAMPS_DATE: ContratDonneesCles[] = [
  'date_naissance', 'date_cin', 'date_effet', 'date_signature',
];

// Champs attendus par le modèle fourni. La civilité reste facultative.
const CHAMPS_REQUIS: ContratDonneesCles[] = [
  'nom_prenoms', 'date_naissance', 'lieu_naissance', 'pere', 'mere', 'cin',
  'date_cin', 'lieu_cin', 'situation_matrimoniale', 'adresse', 'service',
  'nature_contrat', 'duree_contrat', 'qualite', 'lieu_embauche', 'lieu_travail',
  'classification', 'salaire_base', 'indemnite_logement', 'indemnite_rendement',
  'indemnite_responsabilite', 'date_effet', 'lieu_signature', 'date_signature',
  'representant',
];

function texte(v: unknown): string {
  return String(v ?? '').replace(/\s+/g, ' ').trim();
}

/** Un tiret saisi dans un champ texte/date reste une information manquante. */
function valeurTexte(v: unknown): string {
  const s = texte(v);
  return s === PLACEHOLDER_CONTRAT ? '' : s;
}

function montantInitial(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? String(n).replace('.', ',') : '';
}

/** Préremplit uniquement ce qui est connu, sans déduire une durée, un service ou un effet.
 *  Quand une paie du mois est fournie, l'indemnité de logement reprend LOGT/TRSP et
 *  l'indemnité de responsabilité reprend RESP/REPRES du tableau de salaire. */
export function initialiserContratDepuisEmploye(
  emp: Employe,
  paie?: Pick<PaieMensuelle, 'logt_trsp' | 'resp_repres'>,
): ContratDonnees {
  return {
    civilite: /^f/i.test(texte(emp.genre)) ? 'Mme' : /^m/i.test(texte(emp.genre)) ? 'Mr' : '',
    nom_prenoms: texte(emp.nom_prenoms),
    date_naissance: texte(emp.date_naissance),
    lieu_naissance: texte(emp.lieu_naissance),
    pere: texte(emp.pere),
    mere: texte(emp.mere),
    cin: texte(emp.cin),
    date_cin: texte(emp.date_cin),
    lieu_cin: texte(emp.lieu_cin),
    situation_matrimoniale: texte(emp.situation_matrimoniale),
    adresse: texte(emp.adresse),
    service: texte(emp.service),
    nature_contrat: texte(emp.nature_contrat),
    duree_contrat: texte(emp.duree_contrat),
    qualite: texte(emp.jobs),
    lieu_embauche: texte(emp.lieu_embauche),
    lieu_travail: texte(emp.lieu_travail),
    classification: texte(emp.categorie),
    salaire_base: Number(emp.base_aj) > 0 ? montantInitial(emp.base_aj) : '',
    indemnite_logement: paie?.logt_trsp ? montantInitial(paie.logt_trsp) : '',
    indemnite_rendement: montantInitial(emp.rendement),
    indemnite_responsabilite: paie?.resp_repres ? montantInitial(paie.resp_repres) : '',
    date_effet: texte(emp.date_effet),
    lieu_signature: '',
    date_signature: '',
    representant: REPRESENTANT_DEFAUT,
  };
}

/** Accepte les saisies françaises ; une chaîne vide signifie « non renseigné ». */
export function parseMontantContrat(raw: string): number | null | undefined {
  const value = texte(raw).replace(/[\s\u00a0\u202f]/g, '');
  if (!value) return undefined;
  if (value === '-') return 0;
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value)) return null;
  const n = Number(value.replace(',', '.'));
  return Number.isFinite(n) && n <= 1_000_000_000_000 ? n : null;
}

export function formaterMontantContrat(raw: string): string {
  const n = parseMontantContrat(raw);
  if (n === undefined) return PLACEHOLDER_CONTRAT;
  if (n === null) return PLACEHOLDER_CONTRAT;
  return formatMontant(n, { unite: true });
}

export function formaterDateContrat(raw: string): string {
  const s = valeurTexte(raw);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return s || PLACEHOLDER_CONTRAT;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function dateValide(raw: string): boolean {
  const s = texte(raw);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (y < 1900 || y > 2100) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export interface ValidationContrat {
  complets: boolean;
  champsManquants: ContratDonneesCles[];
  erreurs: string[];
}

export function validerContrat(d: ContratDonnees): ValidationContrat {
  const erreurs: string[] = [];
  const champsManquants: ContratDonneesCles[] = [];
  for (const key of CHAMPS_REQUIS) {
    // Pour les montants, « - » représente zéro ; pour les autres champs, une absence.
    const value = CHAMPS_MONTANT.includes(key) ? texte(d[key]) : valeurTexte(d[key]);
    if (!value) {
      // Une durée indéterminée est implicite pour un CDI explicitement choisi.
      if (key === 'duree_contrat' && valeurTexte(d.nature_contrat) === 'CDI') continue;
      champsManquants.push(key);
    }
  }
  for (const key of CHAMPS_MONTANT) {
    const raw = texte(d[key]);
    if (!raw) continue;
    if (parseMontantContrat(raw) === null) {
      erreurs.push(`${LIBELLES_CHAMPS_CONTRAT[key]} : montant invalide (positif ou nul, deux décimales maximum).`);
    }
  }
  for (const key of CHAMPS_DATE) {
    const raw = valeurTexte(d[key]);
    if (!raw) continue;
    if (!dateValide(raw)) erreurs.push(`${LIBELLES_CHAMPS_CONTRAT[key]} : date invalide.`);
  }
  const nature = valeurTexte(d.nature_contrat);
  if (nature && !(NATURES_CONTRAT as readonly string[]).includes(nature)) {
    erreurs.push('Nature du contrat : choisissez CDI, CDD ou Autre.');
  }
  return { complets: champsManquants.length === 0 && erreurs.length === 0, champsManquants, erreurs };
}

export type BlocContrat =
  | { type: 'titre'; texte: string }
  | { type: 'mention'; texte: string }
  | { type: 'paragraphe'; texte: string }
  | { type: 'champ'; label: string; valeur: string; manquant: boolean }
  | { type: 'article'; numero: number; titre: string; valeur?: string; manquant?: boolean }
  | { type: 'signature'; lieu: string; date: string; representant: string };

export interface ContratDocument {
  donnees: ContratDonnees;
  validation: ValidationContrat;
  mentionProjet: string;
  blocs: BlocContrat[];
}

const CLAUSES = {
  mobilite: 'Étant donné l’envergure de la SALFA au niveau national, l’employé peut faire l’objet d’une affectation au niveau des autres centres dans tout Madagascar tout en bénéficiant les droits relatifs au dite affectation.',
  conge1: 'La jouissance du congé payé annuel respecte les modalités imposées par le code du travail.',
  conge2: 'Il est néanmoins à noter que la demande de départ en congé doit être validée par le responsable du service auquel l’employé est rattaché et visée par le responsable des ressources humaines',
  fin1: 'Le présent contrat peut prendre fin par l’initiative de l’une des deux parties soit par licenciement, soit par démission.',
  fin2: 'La retraite de l’employé qui a atteint ses 60 ans met fin automatiquement au contrat de travail.',
  fin3: 'Toutefois, la rupture du contrat doit respecter les procédures et exigences énumérées par le code du travail en vigueur, notamment en ce qui concerne le PRÉAVIS.',
  litige: 'Les deux parties s’engagent à régler tout litige en passant par toutes les structures d’arbitrage et de conciliation existant au sein de l’établissement avant de le porter devant les autorités compétentes.',
  tribunal: 'Le tribunal compétent est celui du lieu d’exécution du travail.',
  remarque1: 'Il est interdit à l’employé d’entrer en concurrence à l’établissement ainsi que de divulguer les secrets professionnels de ce dernier sous quelque forme que ce soit.',
  remarque2: 'Le non-respect de cet article 10a peut entraîner des poursuites judiciaires ainsi qu’à un licenciement sans préavis de l’employé fautif.',
  remarque3: 'Toute modification du présent contrat est nulle et de nul effet sauf prise d’un commun accord des deux parties.',
  remarque4: 'Les parties s’engagent à respecter les dispositions légales, réglementaires et conventionnelles en vigueur dans l’entreprise et le salarié déclare avoir pris connaissance du Règlement Intérieur.',
} as const;

export function construireContrat(donnees: ContratDonnees): ContratDocument {
  const validation = validerContrat(donnees);
  const mentionProjet = validation.complets ? '' : MENTION_PROJET_CONTRAT;
  const v = (key: ContratDonneesCles) => valeurTexte(donnees[key]) || PLACEHOLDER_CONTRAT;
  const champ = (key: ContratDonneesCles, label: string, valeur?: string, manquant?: boolean): BlocContrat => ({
    type: 'champ', label, valeur: valeur ?? v(key), manquant: manquant ?? validation.champsManquants.includes(key),
  });
  const civilite = valeurTexte(donnees.civilite);
  const estFeminin = /^(mme|mlle)/i.test(civilite);
  const labelCivilite = civilite || 'Mr/Mme/Mlle';
  const labelNaissance = estFeminin ? 'Née le :' : 'Né le :';
  const labelParents = estFeminin ? 'Fille de :' : 'Fils de :';
  const nature = valeurTexte(donnees.nature_contrat);
  const duree = valeurTexte(donnees.duree_contrat) || (nature === 'CDI' ? 'Durée indéterminée' : '');
  const natureDuree = [nature, duree].filter(Boolean).join(' — ') || PLACEHOLDER_CONTRAT;
  const dateEffet = valeurTexte(donnees.date_effet) ? formaterDateContrat(donnees.date_effet) : PLACEHOLDER_CONTRAT;

  const blocs: BlocContrat[] = [
    { type: 'titre', texte: 'CONTRAT DE TRAVAIL' },
  ];
  if (mentionProjet) blocs.push({ type: 'mention', texte: mentionProjet });
  blocs.push(
    { type: 'paragraphe', texte: `Entre la SAMPAN’ASA LOTERANA MOMBA NY FAHASALAMANA (SALFA), dénommée, l’employeur, représenté par ${v('representant')}` },
    champ('nom_prenoms', `${labelCivilite} :`, valeurTexte(donnees.nom_prenoms) || PLACEHOLDER_CONTRAT),
    { type: 'champ', label: labelNaissance, valeur: `${formaterDateContrat(donnees.date_naissance)} à ${v('lieu_naissance')}`, manquant: validation.champsManquants.includes('date_naissance') || validation.champsManquants.includes('lieu_naissance') },
    { type: 'champ', label: labelParents, valeur: `${v('pere')} <strong>et de :</strong> ${v('mere')}`, manquant: validation.champsManquants.includes('pere') || validation.champsManquants.includes('mere') },
    champ('cin', 'Titulaire de la CIN N° :'),
    { type: 'champ', label: 'Délivrée le :', valeur: `${formaterDateContrat(donnees.date_cin)} à ${v('lieu_cin')}`, manquant: validation.champsManquants.includes('date_cin') || validation.champsManquants.includes('lieu_cin') },
    champ('situation_matrimoniale', 'Situation Matrimoniale :'),
    champ('adresse', 'Demeurant à :'),
    { type: 'paragraphe', texte: 'D’autre part, ci-après dénommé(e) l’employé(e) ;' },
    { type: 'paragraphe', texte: 'Il a été d’un commun accord arrêté et convenu ce qui suit :' },
    { type: 'article', numero: 1, titre: 'SERVICE D’AFFECTATION', valeur: v('service'), manquant: validation.champsManquants.includes('service') },
    { type: 'article', numero: 2, titre: 'NATURE ET DURÉE DE CONTRAT', valeur: natureDuree, manquant: !nature || !duree },
    { type: 'article', numero: 3, titre: '' },
    champ('qualite', 'L’employé est engagé en qualité de :'),
    champ('lieu_embauche', 'Lieu d’embauche :'),
    champ('lieu_travail', 'Lieu d’exécution du travail en dehors de toute mission :'),
    champ('classification', 'Classification professionnelle :'),
    { type: 'article', numero: 4, titre: 'RÉMUNÉRATION' },
    champ('salaire_base', 'Salaire de base mensuel :', formaterMontantContrat(donnees.salaire_base)),
    { type: 'paragraphe', texte: 'Accessoires du salaire :' },
    champ('indemnite_logement', 'b1- Indemnité de Logement :', formaterMontantContrat(donnees.indemnite_logement)),
    champ('indemnite_rendement', 'b2- Indemnité de Rendement :', formaterMontantContrat(donnees.indemnite_rendement)),
    champ('indemnite_responsabilite', 'b3- Indemnité de Responsabilité :', formaterMontantContrat(donnees.indemnite_responsabilite)),
    { type: 'article', numero: 5, titre: 'CLAUSE DE MOBILITÉ' },
    { type: 'paragraphe', texte: CLAUSES.mobilite },
    { type: 'article', numero: 6, titre: 'CONGE' },
    { type: 'paragraphe', texte: CLAUSES.conge1 },
    { type: 'paragraphe', texte: CLAUSES.conge2 },
    { type: 'article', numero: 7, titre: 'LA FIN DU CONTRAT' },
    { type: 'paragraphe', texte: CLAUSES.fin1 },
    { type: 'paragraphe', texte: CLAUSES.fin2 },
    { type: 'paragraphe', texte: CLAUSES.fin3 },
    { type: 'article', numero: 8, titre: 'LITIGE' },
    { type: 'paragraphe', texte: CLAUSES.litige },
    { type: 'article', numero: 9, titre: 'tribunal compétent' },
    { type: 'paragraphe', texte: CLAUSES.tribunal },
    { type: 'article', numero: 10, titre: 'remarques' },
    { type: 'paragraphe', texte: CLAUSES.remarque1 },
    { type: 'paragraphe', texte: CLAUSES.remarque2 },
    { type: 'paragraphe', texte: CLAUSES.remarque3 },
    { type: 'paragraphe', texte: CLAUSES.remarque4 },
    { type: 'paragraphe', texte: `Article 11 : ce présent contrat prend effet à compter du ${dateEffet}.` },
    { type: 'signature', lieu: v('lieu_signature'), date: valeurTexte(donnees.date_signature) ? formaterDateContrat(donnees.date_signature) : PLACEHOLDER_CONTRAT, representant: v('representant') },
  );
  return { donnees, validation, mentionProjet, blocs };
}

/** Valeurs injectées dans le modèle Word. Aucun champ vide n'est masqué. */
export function valeursModeleContrat(doc: ContratDocument): Record<string, string> {
  const d = doc.donnees;
  const v = (key: ContratDonneesCles) => valeurTexte(d[key]) || PLACEHOLDER_CONTRAT;
  const nature = valeurTexte(d.nature_contrat);
  const duree = valeurTexte(d.duree_contrat) || (nature === 'CDI' ? 'Durée indéterminée' : '');
  return {
    mention_projet: doc.mentionProjet,
    representant: v('representant'),
    identite: [valeurTexte(d.civilite), valeurTexte(d.nom_prenoms)].filter(Boolean).join(' ') || PLACEHOLDER_CONTRAT,
    date_naissance: formaterDateContrat(d.date_naissance),
    lieu_naissance: v('lieu_naissance'),
    pere: v('pere'),
    mere: v('mere'),
    cin: v('cin'),
    date_cin: formaterDateContrat(d.date_cin),
    lieu_cin: v('lieu_cin'),
    situation_matrimoniale: v('situation_matrimoniale'),
    adresse: v('adresse'),
    service: v('service'),
    nature_duree: [nature, duree].filter(Boolean).join(' — ') || PLACEHOLDER_CONTRAT,
    qualite: v('qualite'),
    lieu_embauche: v('lieu_embauche'),
    lieu_travail: v('lieu_travail'),
    classification: v('classification'),
    salaire_base: formaterMontantContrat(d.salaire_base),
    indemnite_logement: formaterMontantContrat(d.indemnite_logement),
    indemnite_rendement: formaterMontantContrat(d.indemnite_rendement),
    indemnite_responsabilite: formaterMontantContrat(d.indemnite_responsabilite),
    date_effet: valeurTexte(d.date_effet) ? formaterDateContrat(d.date_effet) : PLACEHOLDER_CONTRAT,
    lieu_signature: v('lieu_signature'),
    date_signature: valeurTexte(d.date_signature) ? formaterDateContrat(d.date_signature) : PLACEHOLDER_CONTRAT,
  };
}

export function nomFichierContrat(emp: Employe, doc: ContratDocument, extension: 'pdf' | 'docx'): string {
  const nom = texte(emp.nom_prenoms).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'SALARIE';
  const projet = doc.validation.complets ? '' : '_PROJET';
  return `CONTRAT_SALFA_MAT_${emp.numero_matricule}_${nom}${projet}.${extension}`;
}
