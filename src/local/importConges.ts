// ==============================================================================
// IMPORT D'UN « CONTRÔLE DES CONGÉS ET PERMISSIONS » (.xlsb / .xlsx / .xls / .csv)
// Lecteur du document de suivi utilisé par SALFA (CONTROL DE CONGE SALFA
// TOLIARA 2024-2025.xlsb) : nom (parfois sur 2 lignes + téléphone en dessous),
// fonction, une colonne de solde par titre d'année, puis le bloc CONGÉ (jours
// demandés / date) et le bloc PERMISSION (droit de l'année / jours demandés /
// date / droit restant / motifs).
// ==============================================================================

import * as XLSX from 'xlsx';
import { toDateISO, toNumber } from './importExcel';
import {
  CategorieAbsence, ImputationConges, retrouverEmploye, anneeDebut, devinerMotifPermission,
} from './conges';

export interface CongeImportLigne {
  employe_id: number | null;
  numero_matricule: number | null;
  nom: string;
  fonction: string;
  contact?: string;
  annee: number;
  titre_annee?: number;
  categorie: CategorieAbsence;
  imputation: ImputationConges;
  jours: number;
  date_debut: string;
  motif: string;
  motif_code?: string;
  /** Solde porté par le fichier au premier événement de l'année (pour la reprise). */
  ouvertureAnnee?: number;
  /** Solde final et titre actif lus au bas du bloc salarié dans cette feuille. */
  soldeFinalTitre?: number;
  titreFinal?: number;
  anneeFeuille?: number;
  feuille: string;
}

export interface CongeImportFeuille {
  nom: string;
  reconnue: boolean;
  nbLignes: number;
  nbSalaries: number;
  annees: number[];
  /** true si une feuille plus récente du même classeur reprend déjà cet historique. */
  archiveProbable?: boolean;
  message: string;
}

export interface CongeImportRapport {
  importees: number;
  ignores: number;
  ajustements: number;
  nonTrouves: string[];
  messages: string[];
}

export interface AnalyseControleConges {
  fichier: string;
  feuilles: CongeImportFeuille[];
  lignes: CongeImportLigne[];
  avertissements: string[];
}

interface Colonnes {
  nom: number;
  fonction: number;
  annees: { col: number; annee: number }[];
  congeJours: number;
  congeDate: number;
  permDroit: number;
  permJours: number;
  permDate: number;
  permRestant: number;
  motifs: number;
}

const norm = (v: any): string =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9*]/g, '')
    .trim();

function cherche(ligne: any[], depart: number, testeur: (cellule: string) => boolean): number {
  for (let i = depart; i < ligne.length; i++) {
    if (testeur(norm(ligne[i]))) return i;
  }
  return -1;
}

/** Détecte un numéro de téléphone écrit sous le nom du salarié (ex. « 034 47 540 28 » ou « 348533036 »). */
function estTelephone(texte: string): boolean {
  const s = String(texte || '').trim().replace(/\.0$/, '');
  const chiffres = s.replace(/\D/g, '');
  const lettres = s.replace(/[^A-Za-zÀ-ÿ]/g, '');
  return chiffres.length >= 7 && lettres.length <= 2;
}

function formaterTelephone(brut: any): string {
  const s = String(brut ?? '').trim().replace(/\.0$/, '');
  if (/^\d{9}$/.test(s) && s.startsWith('3')) return `0${s}`;
  return s.replace(/\s+/g, ' ');
}

/** Nettoyage tolérant des dates saisies à la main dans le contrôle Excel. */
function dateTolerante(v: any): string {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'string') {
    let s = v.trim().replace(/\/+/g, '/').replace(/\.+/g, '/');
    // ex. 15/11/22025 -> 15/11/2025
    s = s.replace(/\/2(20\d{2})\b/, '/$1');
    // ex. 096/01/2026 -> 09/01/2026
    const m3 = s.match(/^0(\d)(\d)\/(\d{1,2})\/(20\d{2})$/);
    if (m3) s = `0${m3[1]}/${m3[3]}/${m3[4]}`;
    const iso = toDateISO(s);
    const y = Number(iso.slice(0, 4));
    return y >= 1990 && y <= 2100 ? iso : '';
  }
  const iso = toDateISO(v);
  const y = Number(iso.slice(0, 4));
  return y >= 1990 && y <= 2100 ? iso : '';
}

/** Indique si la cellule A à la ligne suivant le début d'un bloc prolonge le nom sur 2 lignes. */
function estSuiteDeNom(
  texteNom: string,
  texteFonction: string,
  courant: { nom: string; startRow: number; aDonneesLigne1: boolean },
  rowIndex: number
): boolean {
  if (texteFonction) return false;
  if (rowIndex !== courant.startRow + 1) return false;
  // Ligne 1 ne contenait que le nom de famille sans aucune donnée (ex. R602 « RAVONIHERINDRAINY »)
  if (!courant.aDonneesLigne1) return true;
  // Prénom sur la 2e ligne : commence par un seul mot en casse mixte ou sans patronyme tout en majuscules
  const mots = texteNom.trim().split(/\s+/);
  const premierMot = mots[0] || '';
  const toutMajuscules = premierMot.length >= 2 && premierMot === premierMot.toUpperCase() && /[A-Z]/.test(premierMot);
  return !toutMajuscules;
}

/** Repère la ligne d'en-tête (NOM ET PRENOMS) puis les colonnes du document. */
function localiserColonnes(rows: any[][]): { header: number; colonnes: Colonnes } | null {
  for (let r = 0; r < Math.min(rows.length, 12); r++) {
    const ligne = rows[r] || [];
    const nom = cherche(ligne, 0, (c) => c.startsWith('NOMETPRENOM') || c === 'NOM' || c === 'NOMPRENOMS' || c === 'NOMETPRENOMS');
    if (nom < 0) continue;
    const fonction = cherche(ligne, nom + 1, (c) => c === 'FONCTION' || c === 'POSTE' || c === 'JOB');
    const sousLigne = rows[r + 1] || [];

    const annees: { col: number; annee: number }[] = [];
    const borneGauche = fonction >= 0 ? fonction : nom;
    for (let c = borneGauche + 1; c < Math.max(ligne.length, sousLigne.length); c++) {
      const valeurLigne = Number(ligne[c]);
      const valeurSous = Number(sousLigne[c]);
      const annee =
        Number.isInteger(valeurLigne) && valeurLigne >= 1990 && valeurLigne <= 2100 ? valeurLigne
          : Number.isInteger(valeurSous) && valeurSous >= 1990 && valeurSous <= 2100 ? valeurSous
            : 0;
      if (annee) annees.push({ col: c, annee });
    }

    const apresAnnees = annees.length ? annees[annees.length - 1].col + 1 : borneGauche + 1;
    const concat: any[] = [];
    for (let c = 0; c < Math.max(ligne.length, sousLigne.length); c++) {
      concat[c] = `${sousLigne[c] ?? ''} ${ligne[c] ?? ''}`.trim();
    }

    let congeJours = -1;
    for (let c = apresAnnees; c < concat.length; c++) {
      if (/JOUR/.test(norm(concat[c]))) { congeJours = c; break; }
    }
    let congeDate = -1;
    for (let c = Math.max(apresAnnees, congeJours + 1); c < concat.length; c++) {
      if (/DATE|DATY/.test(norm(concat[c]))) { congeDate = c; break; }
    }
    let permDroit = -1;
    for (let c = Math.max(apresAnnees, congeDate + 1); c < concat.length; c++) {
      if (/DROITDANSLANNEE|DROITDANNEE|DROIT/.test(norm(concat[c]))) { permDroit = c; break; }
    }
    let permJours = -1;
    for (let c = Math.max(apresAnnees, permDroit + 1); c < concat.length; c++) {
      if (/JOUR/.test(norm(concat[c]))) { permJours = c; break; }
    }
    let permDate = -1;
    for (let c = Math.max(apresAnnees, permJours + 1); c < concat.length; c++) {
      if (/DATE|DATY/.test(norm(concat[c]))) { permDate = c; break; }
    }
    let permRestant = -1;
    for (let c = Math.max(apresAnnees, permDate + 1); c < concat.length; c++) {
      if (/RESTANT|SISA/.test(norm(concat[c]))) { permRestant = c; break; }
    }
    let motifs = -1;
    for (let c = 0; c < concat.length; c++) {
      if (/MOTIF/.test(norm(concat[c]))) { motifs = c; break; }
    }

    if (congeJours < 0 && permJours < 0 && motifs < 0) continue;

    if (congeJours < 0) congeJours = apresAnnees;
    if (congeDate < 0) congeDate = congeJours + 1;
    if (permDroit < 0) permDroit = congeDate + 1;
    if (permJours < 0) permJours = permDroit + 1;
    if (permDate < 0) permDate = permJours + 1;
    if (permRestant < 0) permRestant = permDate + 1;
    if (motifs < 0) motifs = permRestant + 1;

    return {
      header: r + 1,
      colonnes: { nom, fonction: fonction >= 0 ? fonction : nom + 1, annees, congeJours, congeDate, permDroit, permJours, permDate, permRestant, motifs },
    };
  }
  return null;
}

function valeurLigne(row: any[], col: number): any {
  if (col < 0) return null;
  return row[col];
}

function estTotal(row: any[]): boolean {
  for (let i = 0; i < Math.min(row.length, 4); i++) {
    const n = norm(row[i]);
    if (n === 'TOTAUX' || n === 'TOTAL' || n === 'T') return true;
  }
  return false;
}

/**
 * Lit le classeur de contrôle (.xlsb, .xlsx, .xls, .csv) et renvoie les demandes
 * repérées, rattachées aux salariés de l'application par leur nom.
 */
export function analyserControleConges(
  data: ArrayBuffer,
  fileName: string,
  employes: any[]
): AnalyseControleConges {
  const resultat: AnalyseControleConges = {
    fichier: fileName,
    feuilles: [],
    lignes: [],
    avertissements: [],
  };
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(data, { type: 'array', cellDates: true, cellText: false });
  } catch {
    try {
      wb = XLSX.read(new TextDecoder().decode(new Uint8Array(data)), { type: 'string', cellDates: true });
    } catch {
      throw new Error('Fichier illisible. Choisissez un classeur Excel (.xlsb, .xlsx, .xls) ou CSV valide.');
    }
  }

  for (const nomFeuille of wb.SheetNames) {
    const ws = wb.Sheets[nomFeuille];
    if (!ws) continue;
    let rows: any[][] = [];
    try {
      rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: true, defval: null, blankrows: false });
    } catch {
      rows = [];
    }
    const localisation = localiserColonnes(rows);
    if (!localisation) {
      resultat.feuilles.push({
        nom: nomFeuille, reconnue: false, nbLignes: 0, nbSalaries: 0, annees: [],
        message: 'En-tête « NOM ET PRENOMS / FONCTION » introuvable — feuille ignorée',
      });
      continue;
    }
    const { colonnes } = localisation;
    if (!colonnes.annees.length) {
      resultat.avertissements.push(`${nomFeuille}: aucune colonne d’année détectée, les demandes sont datées uniquement par leur date de départ.`);
    }

    const anneeFeuille =
      (/^\d{4}$/.test(nomFeuille.trim()) ? Number(nomFeuille.trim()) : 0) ||
      colonnes.annees[colonnes.annees.length - 1]?.annee ||
      new Date().getFullYear();

    interface BlocCourant {
      nom: string;
      fonction: string;
      contact: string;
      mat: number | null;
      id: number | null;
      startRow: number;
      aDonneesLigne1: boolean;
      lignesBloc: CongeImportLigne[];
      dernierSolde: { titre: number; reste: number } | null;
    }

    const lignes: CongeImportLigne[] = [];
    const salaries = new Set<string>();
    const blocs: BlocCourant[] = [];
    let courant: BlocCourant | null = null;
    const ouvertures = new Map<string, number>();

    for (let r = localisation.header + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      if (estTotal(row)) {
        courant = null;
        continue;
      }
      const celluleNom = valeurLigne(row, colonnes.nom);
      const texteNom = String(celluleNom ?? '').trim();
      const texteFonction = String(valeurLigne(row, colonnes.fonction) ?? '').trim();
      const aValeursDroite = row.slice(Math.max(2, colonnes.fonction + 1)).some((x) => x !== null && x !== undefined && String(x).trim() !== '');

      if (texteNom) {
        if (estTelephone(texteNom)) {
          if (courant) {
            const tel = formaterTelephone(texteNom);
            courant.contact = courant.contact ? `${courant.contact} / ${tel}` : tel;
            if (texteFonction && !courant.fonction) courant.fonction = texteFonction;
            for (const l of courant.lignesBloc) {
              l.contact = courant.contact;
              if (!l.fonction && courant.fonction) l.fonction = courant.fonction;
            }
          }
        } else if (courant && estSuiteDeNom(texteNom, texteFonction, courant, r)) {
          courant.nom = `${courant.nom} ${texteNom}`.replace(/\s+/g, ' ').trim();
          const emp = retrouverEmploye(courant.nom, employes);
          courant.id = emp ? Number(emp.id) : courant.id;
          courant.mat = emp ? Number(emp.numero_matricule) || null : courant.mat;
          for (const l of courant.lignesBloc) {
            l.nom = courant.nom;
            l.employe_id = courant.id;
            l.numero_matricule = courant.mat;
          }
        } else {
          const emp = retrouverEmploye(texteNom, employes);
          courant = {
            nom: texteNom,
            fonction: texteFonction,
            contact: '',
            mat: emp ? Number(emp.numero_matricule) || null : null,
            id: emp ? Number(emp.id) : null,
            startRow: r,
            aDonneesLigne1: Boolean(texteFonction || aValeursDroite),
            lignesBloc: [],
            dernierSolde: null,
          };
          blocs.push(courant);
        }
      }
      if (!courant) continue;

      const cleEmploye = `bloc-${blocs.length}`;

      const soldesLigne: { annee: number; valeur: number }[] = [];
      for (const { col, annee } of colonnes.annees) {
        const brut = valeurLigne(row, col);
        if (brut === null || brut === undefined || brut === '') continue;
        const n = Number(brut);
        if (!Number.isFinite(n)) continue;
        soldesLigne.push({ annee, valeur: n });
        const cle = `${cleEmploye}|${annee}`;
        if (!ouvertures.has(cle)) ouvertures.set(cle, n);
      }

      const dateConge = dateTolerante(valeurLigne(row, colonnes.congeDate));
      const datePerm = dateTolerante(valeurLigne(row, colonnes.permDate));
      const motifTxt = String(valeurLigne(row, colonnes.motifs) ?? '').trim();
      const joursConge = toNumber(valeurLigne(row, colonnes.congeJours));
      const joursPerm = toNumber(valeurLigne(row, colonnes.permJours));

      const titreLigne = soldesLigne.length ? soldesLigne[soldesLigne.length - 1].annee : 0;
      if (soldesLigne.length) {
        const dernier = soldesLigne[soldesLigne.length - 1];
        if (!(joursConge > 0)) {
          courant.dernierSolde = { titre: dernier.annee, reste: dernier.valeur };
        } else {
          const somme = soldesLigne.reduce((s, x) => s + x.valeur, 0);
          courant.dernierSolde = { titre: dernier.annee, reste: Math.max(0, somme - joursConge) };
        }
      }

      const anneeConge = (dateConge ? anneeDebut(dateConge) : 0) || titreLigne || colonnes.annees[0]?.annee || anneeFeuille;
      const anneePerm = (datePerm ? anneeDebut(datePerm) : 0) || anneeConge;

      if (joursConge > 0) {
        const estMaternite = /MATERNIT/.test(norm(motifTxt));
        const ligneImport: CongeImportLigne = {
          employe_id: courant.id,
          numero_matricule: courant.mat,
          nom: courant.nom,
          fonction: courant.fonction,
          contact: courant.contact || undefined,
          annee: anneeConge,
          titre_annee: titreLigne || undefined,
          categorie: 'CONGE',
          imputation: 'CONGE',
          jours: Math.round(joursConge * 100) / 100,
          date_debut: dateConge || `${anneeConge}-01-01`,
          motif: estMaternite ? motifTxt : titreLigne ? `Congé annuel (Titre ${titreLigne})` : 'Congé annuel',
          ouvertureAnnee: ouvertures.get(`${cleEmploye}|${anneeConge}`),
          anneeFeuille,
          feuille: nomFeuille,
        };
        lignes.push(ligneImport);
        courant.lignesBloc.push(ligneImport);
        salaries.add(cleEmploye);
      }

      if (joursPerm > 0) {
        const motifDevine = devinerMotifPermission(motifTxt);
        const lignePerm: CongeImportLigne = {
          employe_id: courant.id,
          numero_matricule: courant.mat,
          nom: courant.nom,
          fonction: courant.fonction,
          contact: courant.contact || undefined,
          annee: anneePerm,
          categorie: 'PERMISSION',
          imputation: 'PERMISSION',
          jours: Math.round(joursPerm * 100) / 100,
          date_debut: datePerm || `${anneePerm}-01-01`,
          motif: motifTxt || motifDevine?.libelle || 'Permission',
          motif_code: motifDevine?.code,
          anneeFeuille,
          feuille: nomFeuille,
        };
        lignes.push(lignePerm);
        courant.lignesBloc.push(lignePerm);
        salaries.add(cleEmploye);
      }
    }

    // Reporter le solde final lu au bas de chaque bloc salarié pour un alignement fidèle au contrôle.
    for (const b of blocs) {
      if (b.dernierSolde && b.lignesBloc.length) {
        for (const l of b.lignesBloc) {
          l.soldeFinalTitre = b.dernierSolde.reste;
          l.titreFinal = b.dernierSolde.titre;
        }
      }
    }

    resultat.lignes.push(...lignes);
    resultat.feuilles.push({
      nom: nomFeuille,
      reconnue: true,
      nbLignes: lignes.length,
      nbSalaries: salaries.size,
      annees: colonnes.annees.map((a) => a.annee),
      message: lignes.length ? `${lignes.length} demande(s) repérée(s)` : 'Aucune demande trouvée dans cette feuille',
    });
  }

  // Si une feuille plus récente couvre déjà toutes les années d'une feuille plus ancienne
  // (ex. feuille « 2026 » couvrant 2021..2026 face à la feuille d'archive « 2025 »), la signaler.
  const reconnues = resultat.feuilles.filter((f) => f.reconnue && f.annees.length > 0);
  if (reconnues.length > 1) {
    const maxAnnee = Math.max(...reconnues.map((f) => Math.max(...f.annees)));
    const principale = reconnues.find((f) => Math.max(...f.annees) === maxAnnee && f.annees.length >= 3);
    if (principale) {
      const minP = Math.min(...principale.annees);
      const maxP = Math.max(...principale.annees);
      for (const f of reconnues) {
        if (f === principale) continue;
        const maxF = Math.max(...f.annees);
        if (maxF < maxP && Math.min(...f.annees) >= minP) {
          f.archiveProbable = true;
          f.message = `${f.message} — feuille d’archive antérieure (déjà reprise dans « ${principale.nom} »)`;
        }
      }
    }
  }

  const feuillesActives = new Set(resultat.feuilles.filter((f) => f.reconnue && !f.archiveProbable).map((f) => f.nom));
  const nonMatchees = new Set(
    resultat.lignes
      .filter((l) => l.employe_id === null && (feuillesActives.size === 0 || feuillesActives.has(l.feuille)))
      .map((l) => l.nom)
  );
  if (nonMatchees.size) {
    resultat.avertissements.push(
      `${nonMatchees.size} salarié(s) du contrôle ne figurent pas dans la liste actuelle du personnel (anciens agents ou autre service) : ${[...nonMatchees].slice(0, 8).join(', ')}${nonMatchees.size > 8 ? '…' : ''}`
    );
  }
  if (!resultat.feuilles.some((f) => f.reconnue)) {
    resultat.avertissements.push("Aucune feuille reconnue. Le document doit comporter les en-têtes NOM ET PRENOMS, FONCTION, puis les blocs Jours demandés / Date et MOTIFS.");
  }
  return resultat;
}

export async function lireFichierControle(file: File, employes: any[]): Promise<AnalyseControleConges> {
  const nom = String(file.name || '');
  const buffer = await file.arrayBuffer();
  return analyserControleConges(buffer, nom, employes);
}
