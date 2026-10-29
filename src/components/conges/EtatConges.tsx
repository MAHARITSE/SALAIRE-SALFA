// ==============================================================================
// ÉTAT « CONTRÔLE DES CONGÉS ET PERMISSIONS » — SALFA
// Reproduction, à l'écran et sur papier, du classeur de suivi de la société :
// le nom, la fonction, une colonne de solde par année, puis le bloc CONGÉ
// (jours demandés / date), le bloc PERMISSION (droit dans l'année / jours
// demandés / date / droit restant) et les motifs. Deux colonnes d'aide ont été
// ajoutées : le matricule (lien avec la paie) et la situation de la demande.
// ==============================================================================
import React, { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { EtatConges, ParcoursConges, LigneEtatConges, fmtJours } from '../../local/conges';
import { dateFr, periodeAbsenceFr } from './FicheAbsence';

const LARGEURS = {
  mat: 46, nom: 200, fonction: 120, annee: 58, jours: 70, date: 132, retour: 96, droit: 74, restant: 70, motifs: 196, suivi: 82,
};

/**
 * Retourne la première année ouverte dans la liste affichée pour ce salarié
 * (ex. 2024 en 2026 [2024, 2025, 2026], 2025 en 2027 [2025, 2026, 2027], ou l'année
 * d'embauche si le salarié est entré plus tard dans la fenêtre).
 */
export function premiereAnneeEditable(p: ParcoursConges, annees: number[]): number | null {
  if (!annees.length) return null;
  const trouv = annees.find((a) => !p.annee_embauche || a >= p.annee_embauche);
  return trouv ?? null;
}

const CellulePremiereAnneeEditable: React.FC<{
  employeId: number;
  nomPrenoms: string;
  annee: number;
  valeur: number;
  maxJours: number;
  estSaisieManuelle: boolean;
  onSaisir: (employeId: number, annee: number, valeur: number | null) => Promise<boolean>;
}> = ({ employeId, nomPrenoms, annee, valeur, maxJours, estSaisieManuelle, onSaisir }) => {
  const [texte, setTexte] = useState(() => String(valeur));
  const [edition, setEdition] = useState(false);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    if (!edition) setTexte(String(valeur));
  }, [valeur, edition]);

  const valider = async () => {
    setEdition(false);
    const brut = texte.trim().replace(',', '.');
    if (brut === '') {
      if (estSaisieManuelle) {
        setEnCours(true);
        try {
          const ok = await onSaisir(employeId, annee, null);
          if (!ok) setTexte(String(valeur));
        } finally {
          setEnCours(false);
        }
      } else {
        setTexte(String(valeur));
      }
      return;
    }
    const num = Number(brut);
    if (!Number.isFinite(num)) {
      setTexte(String(valeur));
      return;
    }
    if (Math.abs(num - valeur) < 0.001) {
      setTexte(String(valeur));
      return;
    }
    setEnCours(true);
    try {
      const ok = await onSaisir(employeId, annee, num);
      if (!ok) setTexte(String(valeur));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <input
      type="number"
      min={0}
      max={maxJours}
      step="0.5"
      disabled={enCours}
      aria-label={`Solde initial ${annee} — ${nomPrenoms}`}
      title={
        estSaisieManuelle
          ? `Solde initial ${annee} saisi manuellement (${fmtJours(valeur)} j / max ${fmtJours(maxJours)} j). Vider puis valider pour revenir au calcul automatique.`
          : `Saisir le solde initial ${annee} (0 à ${fmtJours(maxJours)} j — pas de cumul des congés antérieurs non pris).`
      }
      value={texte}
      onFocus={(e) => {
        setEdition(true);
        e.currentTarget.select();
      }}
      onChange={(e) => setTexte(e.target.value)}
      onBlur={valider}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.currentTarget as HTMLInputElement).blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setEdition(false);
          setTexte(String(valeur));
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
      className={`w-full min-w-[44px] text-right font-mono text-[10px] sm:text-[11px] font-bold px-1 py-0.5 rounded border transition-colors focus:outline-none focus:ring-2 focus:ring-salfa-teal ${
        estSaisieManuelle
          ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-400 dark:border-amber-600 text-amber-900 dark:text-amber-200'
          : valeur < 0
            ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700 text-red-700 dark:text-red-300'
            : 'bg-sky-50/70 dark:bg-sky-900/20 border-sky-300 dark:border-sky-700 text-salfa-dark dark:text-sky-100 hover:border-salfa-teal'
      } ${enCours ? 'opacity-60' : ''}`}
    />
  );
};

export const CelluleSolde: React.FC<{ valeur: number | undefined; negatif?: boolean }> = ({ valeur }) => {
  if (valeur === undefined || valeur === null) return <span>·</span>;
  return <span className={valeur < 0 ? 'text-red-600 dark:text-red-300 font-bold' : ''}>{fmtJours(valeur)}</span>;
};

interface ColonnesEtat {
  cle: keyof LigneEtatConges | 'mat' | 'nom' | 'fonction' | string;
  label: string;
  width: number;
  align: 'left' | 'right' | 'center';
  groupe: number;
}

/** Colonnes de l'état, dans l'ordre du classeur + Daty fiverenana miasa (prise de service). */
export function colonnesEtat(annees: number[]): { groupes: string[]; colonnes: ColonnesEtat[] } {
  const groupes = [
    'IDENTIFICATION',
    annees.length === 3 ? 'SOLDE DE CONGÉ (3 DERNIÈRES ANNÉES)' : 'SOLDE DE CONGÉ PAR ANNÉE',
    'CONGÉ',
    'PERMISSION',
    'SUIVI',
  ];
  const colonnes: ColonnesEtat[] = [
    { cle: 'mat', label: 'MAT', width: LARGEURS.mat, align: 'center', groupe: 0 },
    { cle: 'nom', label: 'NOM ET PRENOMS', width: LARGEURS.nom, align: 'left', groupe: 0 },
    { cle: 'fonction', label: 'FONCTION', width: LARGEURS.fonction, align: 'left', groupe: 0 },
    ...annees.map<ColonnesEtat>((a) => ({ cle: `an${a}`, label: String(a), width: LARGEURS.annee, align: 'right', groupe: 1 })),
    { cle: 'jours_conge', label: 'Jours Demandés', width: LARGEURS.jours, align: 'right', groupe: 2 },
    { cle: 'date_conge', label: 'Date (Du … au …)', width: LARGEURS.date, align: 'center', groupe: 2 },
    { cle: 'conge_restant', label: 'Congé Restant', width: LARGEURS.restant, align: 'right', groupe: 2 },
    { cle: 'perm_droit', label: 'Droit dans l’Année', width: LARGEURS.droit, align: 'right', groupe: 3 },
    { cle: 'perm_jours', label: 'Jours Demandés', width: LARGEURS.jours, align: 'right', groupe: 3 },
    { cle: 'perm_date', label: 'Date (Du … au …)', width: LARGEURS.date, align: 'center', groupe: 3 },
    { cle: 'perm_restant', label: 'Droit Restant', width: LARGEURS.restant, align: 'right', groupe: 3 },
    { cle: 'date_retour', label: 'Daty fiverenana miasa', width: LARGEURS.retour, align: 'center', groupe: 4 },
    { cle: 'motif', label: 'MOTIFS DU CONGÉ / PERMISSION', width: LARGEURS.motifs, align: 'left', groupe: 4 },
    { cle: 'examen_jours', label: 'Examens (j)', width: LARGEURS.annee, align: 'right', groupe: 4 },
    { cle: 'situation', label: 'SITUATION', width: LARGEURS.suivi, align: 'center', groupe: 4 },
  ];
  return { groupes, colonnes };
}

/** Valeur brute d'une cellule, pour l'écran, l'impression et Excel. */
export function valeurCellule(
  ligne: LigneEtatConges, cle: string, p: ParcoursConges, _annees: number[], brut = false
): string | number {
  if (cle === 'mat') return brut ? p.numero_matricule || '' : String(p.numero_matricule || '');
  if (cle === 'nom') return p.nom_prenoms;
  if (cle === 'fonction') return p.fonction;
  if (cle.startsWith('an')) {
    const a = Number(cle.slice(2));
    // Avant l'embauche, le classeur ne porte aucune valeur : on laisse la case vide.
    if (p.annee_embauche && a < p.annee_embauche) return '';
    const v = ligne.solde_par_annee[a];
    if (v === undefined) return brut ? '' : '·';
    return brut ? v : fmtJours(v);
  }
  if (cle === 'jours_conge') {
    if (ligne.type === 'SOLDE_FINAL') {
      const prisAnnee = p.bilans[ligne.annee]?.pris || 0;
      return prisAnnee ? (brut ? prisAnnee : fmtJours(prisAnnee)) : (brut ? 0 : '0');
    }
    return ligne.jours_conge ? (brut ? ligne.jours_conge : fmtJours(ligne.jours_conge)) : '';
  }
  if (cle === 'conge_restant') {
    if (ligne.type === 'SOLDE_FINAL') {
      return brut ? p.soldeActuel : fmtJours(p.soldeActuel);
    }
    return ligne.jours_conge ? (brut ? ligne.restant_apres : fmtJours(ligne.restant_apres)) : '';
  }
  if (cle === 'perm_jours') {
    if (ligne.type === 'SOLDE_FINAL') {
      const permPris = p.bilans[ligne.annee]?.permPris || 0;
      return permPris ? (brut ? permPris : fmtJours(permPris)) : '';
    }
    return ligne.perm_jours ? (brut ? ligne.perm_jours : fmtJours(ligne.perm_jours)) : '';
  }
  if (cle === 'perm_droit') return ligne.perm_droit ? (brut ? ligne.perm_droit : fmtJours(ligne.perm_droit)) : '';
  if (cle === 'perm_restant') return ligne.type === 'SOLDE_FINAL' || ligne.perm_jours ? (brut ? ligne.perm_restant : fmtJours(ligne.perm_restant)) : '';
  if (cle === 'examen_jours') return ligne.examen_jours ? (brut ? ligne.examen_jours : fmtJours(ligne.examen_jours)) : '';
  if (cle === 'date_conge') {
    if (ligne.type === 'SOLDE_FINAL') {
      return p.titreActif ? `Titre ${p.titreActif} (${fmtJours(p.resteTitreActif)} j)` : '';
    }
    return ligne.date_conge ? periodeAbsenceFr(ligne.date_conge, ligne.date_fin) : '';
  }
  if (cle === 'perm_date') return ligne.perm_date ? periodeAbsenceFr(ligne.perm_date, ligne.date_fin) : '';
  if (cle === 'date_retour') return ligne.type === 'DEMANDE' && ligne.date_retour ? dateFr(ligne.date_retour) : '';
  if (cle === 'motif') {
    if (ligne.type === 'SOLDE_FINAL') return ligne.motif;
    const heures = ligne.heures ? ` (${ligne.heures})` : '';
    const remplace = ligne.remplacements ? ` — remplacé(e) par ${ligne.remplacements}` : '';
    return `${ligne.motif}${heures}${remplace}`;
  }
  if (cle === 'situation') return ligne.situation;
  return '';
}

// ------------------------------------------------------------------------------
// Tableau à l'écran
// ------------------------------------------------------------------------------
export const EtatCongesEcran: React.FC<{
  etat: EtatConges;
  onOuvrir: (congeId: number) => void;
  onSaisirOuverture?: (employeId: number, annee: number, valeur: number | null) => Promise<boolean>;
}> = ({ etat, onOuvrir, onSaisirOuverture }) => {
  const { groupes, colonnes } = colonnesEtat(etat.annees);
  const largeur = colonnes.reduce((s, c) => s + c.width, 0);
  const premiereColAnnee = etat.annees[0];
  return (
    <div className="table-responsive thin-scrollbar etat-scroll max-h-[62vh]">
      <table className="border-collapse w-full etat-conge-table" style={{ minWidth: largeur }}>
        <thead className="sticky top-0 z-20">
          <tr>
            {groupes.map((g, gi) => {
              const nb = colonnes.filter((c) => c.groupe === gi).length;
              return (
                <th
                  key={g}
                  colSpan={nb}
                  className={`${gi === 1 ? 'bg-slate-700' : gi === 2 ? 'bg-sky-800' : gi === 3 ? 'bg-indigo-800' : gi === 4 ? 'bg-teal-800' : 'bg-slate-800'} dark:bg-slate-900 text-white text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider py-1 px-2 border border-slate-400 dark:border-slate-600 text-center whitespace-nowrap`}
                >
                  {g}
                </th>
              );
            })}
          </tr>
          <tr className="bg-slate-100 dark:bg-slate-700">
            {colonnes.map((c) => {
              const estPremiereAnnee = premiereColAnnee !== undefined && c.cle === `an${premiereColAnnee}` && Boolean(onSaisirOuverture);
              return (
                <th
                  key={c.cle}
                  title={estPremiereAnnee ? `Saisie directe autorisée (0 à ${fmtJours(etat.config.joursCongeParAn)} j — sans cumul antérieur)` : undefined}
                  className={`text-[9px] sm:text-[10px] font-extrabold uppercase py-1.5 px-1 border border-slate-300 dark:border-slate-600 text-center leading-tight whitespace-nowrap ${
                    estPremiereAnnee
                      ? 'bg-sky-100/80 dark:bg-sky-900/40 text-salfa-dark dark:text-sky-200'
                      : 'text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {c.label}
                  {estPremiereAnnee && <span className="block text-[8px] font-semibold normal-case text-salfa-teal dark:text-sky-300">saisie ≤ {fmtJours(etat.config.joursCongeParAn)}j</span>}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {etat.parcours.length === 0 && (
            <tr><td colSpan={colonnes.length} className="py-10 text-center text-slate-500 text-sm">Aucun salarié à afficher.</td></tr>
          )}
          {etat.parcours.map((p) => {
            const lignes = p.lignes.length ? p.lignes : [];
            if (!lignes.length) return null;
            const anneeEditable = premiereAnneeEditable(p, etat.annees);
            return lignes.map((ligne, index) => (
              <tr
                key={`${p.employe_id}-${ligne.cle}`}
                className={`${ligne.type === 'SOLDE_FINAL' ? 'bg-slate-100/80 dark:bg-slate-700/60 font-bold' : index % 2 ? 'bg-slate-50/60 dark:bg-slate-800/60' : ''} ${ligne.situation === 'En attente' ? 'bg-amber-50/70 dark:bg-amber-900/10' : ''}`}
              >
                {index === 0 && (
                  <>
                    <td rowSpan={lignes.length} className="border border-slate-200 dark:border-slate-700 px-1 py-1 text-center align-top font-bold text-salfa-dark dark:text-white bg-white dark:bg-slate-800 sticky left-0 z-10">
                      {p.numero_matricule}
                    </td>
                    <td rowSpan={lignes.length} className="border border-slate-200 dark:border-slate-700 px-1.5 py-1 text-[11px] align-top bg-white dark:bg-slate-800 sticky z-10" style={{ left: LARGEURS.mat, minWidth: LARGEURS.nom }}>
                      <div className="font-bold whitespace-normal">{p.nom_prenoms}</div>
                      <div className="text-[9px] text-slate-500 dark:text-slate-400 font-normal whitespace-normal">
                        Titre {p.titreActif} : {fmtJours(p.resteTitreActif)} j · cumul {fmtJours(p.soldeActuel)} j · perm. {fmtJours(p.permissionActuelle)} j{p.nbEnAttente ? ` · ${p.nbEnAttente} att.` : ''}
                      </div>
                    </td>
                    <td rowSpan={lignes.length} className="border border-slate-200 dark:border-slate-700 px-1 py-1 text-[10px] align-top bg-white dark:bg-slate-800 whitespace-normal">
                      {p.fonction}
                    </td>
                  </>
                )}
                {colonnes.filter((c) => c.cle !== 'mat' && c.cle !== 'nom' && c.cle !== 'fonction').map((c) => {
                  const estPremiereCaseEditable =
                    Boolean(onSaisirOuverture) &&
                    index === 0 &&
                    anneeEditable !== null &&
                    c.cle === `an${anneeEditable}`;
                  if (estPremiereCaseEditable && onSaisirOuverture && anneeEditable !== null) {
                    const bilanPremiere = p.bilans[anneeEditable];
                    const valOuverture = bilanPremiere ? bilanPremiere.ouverture : 0;
                    return (
                      <td
                        key={c.cle}
                        className="border border-slate-200 dark:border-slate-700 px-0.5 py-0.5 text-right font-mono align-middle"
                      >
                        <CellulePremiereAnneeEditable
                          employeId={p.employe_id}
                          nomPrenoms={p.nom_prenoms}
                          annee={anneeEditable}
                          valeur={valOuverture}
                          maxJours={etat.config.joursCongeParAn}
                          estSaisieManuelle={Boolean(bilanPremiere?.ouvertureSaisie)}
                          onSaisir={onSaisirOuverture}
                        />
                      </td>
                    );
                  }
                  const v = valeurCellule(ligne, c.cle, p, etat.annees);
                  const estVide = v === '' || v === '·';
                  return (
                    <td
                      key={c.cle}
                      title={typeof v === 'string' ? v : undefined}
                      className={`border border-slate-200 dark:border-slate-700 px-1 py-[3px] text-[10px] sm:text-[11px] whitespace-nowrap ${
                        c.align === 'right' ? 'text-right font-mono' : c.align === 'center' ? 'text-center' : 'text-left'
                      } ${estVide ? 'text-slate-300 dark:text-slate-600' : ''} ${
                        (c.cle === 'jours_conge' || c.cle === 'perm_jours') && ligne.type === 'DEMANDE' ? 'font-bold' : ''
                      }`}
                    >
                      {ligne.type === 'DEMANDE' && c.cle === 'motif' ? (
                        <button type="button" onClick={() => ligne.conge_id && onOuvrir(ligne.conge_id)} className="text-left hover:underline decoration-dotted" title="Ouvrir la fiche d’absence">
                          {v}
                        </button>
                      ) : (
                        v
                      )}
                    </td>
                  );
                })}
              </tr>
            ));
          })}
        </tbody>
      </table>
    </div>
  );
};

// ------------------------------------------------------------------------------
// Impression : pages A4 paysage, un salarié ne sont jamais coupés
// ------------------------------------------------------------------------------
const LIGNES_PAR_PAGE = 30;

export function decouperPages(parcours: ParcoursConges[]): ParcoursConges[][] {
  const pages: ParcoursConges[][] = [];
  let courant: ParcoursConges[] = [];
  let compteur = 0;
  for (const p of parcours) {
    const nb = Math.max(1, p.lignes.length);
    if (compteur + nb > LIGNES_PAR_PAGE && courant.length) {
      pages.push(courant);
      courant = [];
      compteur = 0;
    }
    courant.push(p);
    compteur += nb;
    if (compteur >= LIGNES_PAR_PAGE) {
      pages.push(courant);
      courant = [];
      compteur = 0;
    }
  }
  if (courant.length) pages.push(courant);
  return pages.length ? pages : [[]];
}

export const EtatCongesImpression: React.FC<{ etat: EtatConges; annee: number }> = ({ etat, annee }) => {
  const { groupes, colonnes } = colonnesEtat(etat.annees);
  const pages = decouperPages(etat.parcours);
  return (
    <div className="conge-etat-print" aria-hidden="true">
      {pages.map((page, numPage) => (
        <section className="conge-etat-page" key={numPage}>
          <div className="conge-etat-heading">
            <strong>FIANGONANA LOTERANA MALAGASY — SALFA TANAMBAO</strong>
            <strong>CONTRÔLE DES CONGÉS ET PERMISSIONS — ANNÉE {annee}</strong>
            <span>
              « FILAZANA NY FIALAN-TSASATRA SY NY PERMISSION » · {etat.annees.join(' / ')} · page {numPage + 1}/{pages.length}
            </span>
          </div>
          <table className="conge-etat-table">
            <colgroup>
              {colonnes.map((c) => <col key={c.cle} style={{ width: `${c.width}px` }} />)}
            </colgroup>
            <thead>
              <tr>
                {groupes.map((g, gi) => (
                  <th key={g} colSpan={colonnes.filter((c) => c.groupe === gi).length}>{g}</th>
                ))}
              </tr>
              <tr>
                {colonnes.map((c) => <th key={c.cle}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {page.map((p) => {
                const lignes = p.lignes.length ? p.lignes : [];
                if (!lignes.length) return null;
                return lignes.map((ligne, index) => (
                  <tr key={`${p.employe_id}-${ligne.cle}`}>
                    {index === 0 && (
                      <>
                        <th rowSpan={lignes.length} className="cel-mat">{p.numero_matricule}</th>
                        <th rowSpan={lignes.length} className="cel-nom">{p.nom_prenoms}</th>
                        <td rowSpan={lignes.length} className="cel-txt">{p.fonction}</td>
                      </>
                    )}
                    {colonnes.filter((c) => c.cle !== 'mat' && c.cle !== 'nom' && c.cle !== 'fonction').map((c) => {
                      const v = valeurCellule(ligne, c.cle, p, etat.annees);
                      return (
                        <td key={c.cle} className={`cel-${c.align === 'right' ? 'num' : c.align === 'center' ? 'ctr' : 'txt'}${ligne.type === 'SOLDE_FINAL' ? ' cel-final' : ''}`}>
                          {v === '·' ? '' : v}
                        </td>
                      );
                    })}
                  </tr>
                ));
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3 + etat.annees.length}>TOTAUX {annee} — {page.length} salarié(s) de la page</td>
                <td className="cel-num">{fmtJours(page.reduce((s, p) => s + (p.bilans[annee]?.pris || 0), 0))}</td>
                <td className="cel-ctr">—</td>
                <td className="cel-num">{fmtJours(page.reduce((s, p) => s + (p.soldeActuel || 0), 0))}</td>
                <td className="cel-num">{fmtJours(page.reduce((s, p) => s + (p.bilans[annee]?.permDroit || 0), 0))}</td>
                <td className="cel-num">{fmtJours(page.reduce((s, p) => s + (p.bilans[annee]?.permPris || 0), 0))}</td>
                <td className="cel-ctr">—</td>
                <td className="cel-num">{fmtJours(page.reduce((s, p) => s + (p.bilans[annee]?.permFin || 0), 0))}</td>
                <td className="cel-ctr">—</td>
                <td className="cel-txt">Congés validés de la page</td>
                <td className="cel-num">{fmtJours(page.reduce((s, p) => s + (p.bilans[annee]?.examenPris || 0), 0))}</td>
                <td className="cel-ctr">{page.reduce((s, p) => s + (p.bilans[annee]?.nbEnAttente || 0), 0)} en attente</td>
              </tr>
            </tfoot>
          </table>
          <div className="conge-etat-legende">
            Loi malgache (Code du Travail) : droit de {fmtJours(etat.config.joursCongeParAn)} j/an cumulable sur les {etat.config.nbAnneesCumul} dernières années successives
            ({etat.annees.join(', ')}, plafond {fmtJours(etat.config.plafondCumulConge)} j ; prescription au-delà). Solde sur une ligne = congé restant avant la demande.
          </div>
        </section>
      ))}
    </div>
  );
};

// ------------------------------------------------------------------------------
// Export Excel : même trame que le classeur, valeurs numériques
// ------------------------------------------------------------------------------
export function exporterEtatCongesExcel(etat: EtatConges, annee: number): void {
  const { groupes, colonnes } = colonnesEtat(etat.annees);
  const titre = [
    ['FIANGONANA LOTERANA MALAGASY — SALFA TANAMBAO'],
    ['CONTRÔLE DES CONGÉS ET PERMISSIONS'],
    [`Année ${annee} — Loi malgache : ${fmtJours(etat.config.joursCongeParAn)} j/an sur les ${etat.config.nbAnneesCumul} dernières années (${etat.annees.join(', ')}, plafond ${fmtJours(etat.config.plafondCumulConge)} j), ${fmtJours(etat.config.joursPermissionParAn)} j de permission`],
    [`Édité le ${dateFr(new Date().toISOString().slice(0, 10))}`],
    [],
  ];
  const ligneGroupes: any[] = [];
  groupes.forEach((g, gi) => {
    ligneGroupes.push(g);
    for (let i = 1; i < colonnes.filter((c) => c.groupe === gi).length; i++) ligneGroupes.push('');
  });
  const ligneEntete = colonnes.map((c) => c.label);
  const corps: any[][] = [];
  for (const p of etat.parcours) {
    const lignes = p.lignes.length ? p.lignes : [];
    lignes.forEach((ligne, index) => {
      corps.push(colonnes.map((c) => {
        if (index > 0 && (c.cle === 'mat' || c.cle === 'nom' || c.cle === 'fonction')) return '';
        return valeurCellule(ligne, c.cle, p, etat.annees, true);
      }));
    });
  }
  const total = colonnes.map((c, i) => {
    if (i === 0) return 'TOTAUX';
    if (c.cle === 'nom') return `${etat.parcours.length} salarié(s)`;
    if (c.cle === 'jours_conge') return etat.totaux.joursConge;
    if (c.cle === 'conge_restant') return Number(etat.parcours.reduce((s, p) => s + (p.soldeActuel || 0), 0).toFixed(2));
    if (c.cle === 'perm_jours') return etat.totaux.joursPermission;
    if (c.cle === 'examen_jours') return etat.totaux.joursExamen;
    return '';
  });
  const aoa = [...titre, ligneGroupes, ligneEntete, ...corps, total];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = colonnes.map((c) => ({ wch: Math.max(7, Math.round(c.width / 7)) }));
  const merges: XLSX.Range[] = [];
  let col = 0;
  groupes.forEach((_g, gi) => {
    const nb = colonnes.filter((c) => c.groupe === gi).length;
    merges.push({ s: { r: titre.length, c: col }, e: { r: titre.length, c: col + nb - 1 } });
    col += nb;
  });
  for (let r = 0; r < 3; r++) merges.push({ s: { r, c: 0 }, e: { r, c: colonnes.length - 1 } });
  // Fusion des trois premières colonnes sur chaque salarié (comme le classeur).
  let ligneCourante = titre.length + 2;
  for (const p of etat.parcours) {
    const nb = Math.max(1, p.lignes.length);
    if (nb > 1) {
      for (let c = 0; c < 3; c++) merges.push({ s: { r: ligneCourante, c }, e: { r: ligneCourante + nb - 1, c } });
    }
    ligneCourante += nb;
  }
  ws['!merges'] = merges;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `CONGES_${annee}`.replace(/[\\/?*[\]:]/g, '-').slice(0, 31));
  XLSX.writeFile(wb, `CONTROLE_CONGES_PERMISSIONS_SALFA_${annee}.xlsx`);
}
