// ==============================================================================
// FICHE D'ABSENCE — aperçu et impression du document de la société
// (FICHE D'ABSENCE 2026.docx). Les libellés malgaches, l'ordre des motifs et la
// colonne « Voalazan'ny FITSIPIKA ANATINY manan-kery » sont repris du document.
// ==============================================================================
import React from 'react';
import {
  CongeAbsence, MOTIFS_ABSENCE, MotifAbsence, trouverMotif, fmtJours, LIBELLES_STATUT,
  calculerDateFin, calculerDateRetourDepuisFin,
} from '../../local/conges';
import { loadBulletinHeader } from '../../bulletin/header';

export interface RecapFiche {
  annee: number;
  droitConge: number;
  report: number;
  soldeAvant: number;
  soldeApres: number;
  permDroit: number;
  permAvant: number;
  permApres: number;
  titreAvant?: number;
  resteTitreAvant?: number;
  titreApres?: number;
  resteTitreApres?: number;
}

interface LigneFiche {
  cle: string;
  motif: MotifAbsence | null;
  /** Texte exact de la colonne « Anton'ny fangatahana ». */
  texte: string;
  sousLigne: boolean;
  droit: string;
  code: string;
}

interface BlocFiche {
  categorie: 'PERMISSION' | 'CONGE' | 'EXAMEN';
  enTete: string;
  droitGlobal: string;
  lignes: LigneFiche[];
  /** La colonne de droite est fusionnée sur tout le bloc (examen médical). */
  droitFusionne: boolean;
}

const andro = (n: number): string => `${String(Math.abs(Math.round(Number(n) || 0))).padStart(2, '0')} andro`;

export const dateFr = (iso: string): string => {
  const s = String(iso || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || '……………………';
  const [a, m, j] = s.split('-');
  return `${j}/${m}/${a}`;
};

/** Période demandée incluse « JJ/MM/AAAA au JJ/MM/AAAA ». */
export const periodeAbsenceFr = (debut: string, fin?: string): string => {
  if (!debut) return '—';
  const f = fin || debut;
  return `${dateFr(debut)} au ${dateFr(f)}`;
};

/** Période sur la FICHE D'ABSENCE (« …… h@ …… » dans FICHE D'ABSENCE 2026.docx). */
export const periodeAbsenceDocx = (conge: Pick<CongeAbsence, 'date_debut' | 'date_fin' | 'jours_demandes' | 'jours_valides'>): string => {
  if (!conge.date_debut) return '…………………… h@ ……………………';
  const nb = Number(conge.jours_valides ?? conge.jours_demandes ?? 0);
  const fin = conge.date_fin || (nb > 0 ? calculerDateFin(conge.date_debut, nb) : conge.date_debut);
  return `${dateFr(conge.date_debut)} h@ ${dateFr(fin)}`;
};

/** Date de prise de service (« Daty fiverenana miasa ») : le jour après la fin de la date demandée. */
export const dateRetourFiche = (conge: Pick<CongeAbsence, 'date_debut' | 'date_fin' | 'date_retour' | 'jours_demandes' | 'jours_valides'>): string => {
  if (conge.date_retour) return conge.date_retour;
  const nb = Number(conge.jours_valides ?? conge.jours_demandes ?? 0);
  const fin = conge.date_fin || (conge.date_debut ? (nb > 0 ? calculerDateFin(conge.date_debut, nb) : conge.date_debut) : '');
  return fin ? calculerDateRetourDepuisFin(fin) : '';
};

const heureDocx = (h: string): string => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(h || '').trim());
  return m ? `@ ${m[1]} Ora ${m[2]} mn` : '@ ……… Ora ……… mn';
};

/** Les trois blocs du tableau de la fiche, dans l'ordre du document. */
export function blocsFiche(): BlocFiche[] {
  const permissions: LigneFiche[] = MOTIFS_ABSENCE.filter((m) => m.categorie === 'PERMISSION').map((m) => ({
    cle: m.code,
    motif: m,
    texte: m.libelleDocx,
    sousLigne: m.sousLigne,
    droit: andro(m.jours),
    code: m.code,
  }));
  const examens: LigneFiche[] = MOTIFS_ABSENCE.filter((m) => m.categorie === 'EXAMEN_MEDICAL').map((m) => ({
    cle: m.code,
    motif: m,
    texte: m.libelleDocx,
    sousLigne: false,
    droit: '',
    code: m.code,
  }));
  return [
    {
      categorie: 'PERMISSION',
      enTete: 'Permission\n(10 andro isan-taona)',
      droitGlobal: '',
      lignes: permissions,
      droitFusionne: false,
    },
    {
      categorie: 'CONGE',
      enTete: 'Congé',
      droitGlobal: '30 andro isan-taona ary tsy mihoatra ny 90 andro',
      lignes: [{ cle: 'CONGE', motif: null, texte: '', sousLigne: false, droit: '', code: '' }],
      droitFusionne: true,
    },
    {
      categorie: 'EXAMEN',
      enTete: 'Examen medical',
      droitGlobal: 'Taratasy fanamarihana avy @ dokotera',
      lignes: examens,
      droitFusionne: true,
    },
  ];
}

export interface FicheAbsenceProps {
  conge: CongeAbsence;
  recap?: RecapFiche | null;
  /** Le document est destiné à l'impression : on force le rendu noir et blanc. */
  compact?: boolean;
}

export const FicheAbsence: React.FC<FicheAbsenceProps> = ({ conge, recap, compact = false }) => {
  const blocs = blocsFiche();
  const motif = trouverMotif(conge.motif_code);
  const categorieFiche =
    conge.categorie === 'PERMISSION' ? 'PERMISSION'
      : conge.categorie === 'EXAMEN_MEDICAL' ? 'EXAMEN'
        : 'CONGE';
  const jours = Number(conge.jours_valides ?? conge.jours_demandes ?? 0);
  const objet = conge.motif_libelle || LIBELLES_STATUT[conge.statut];

  // Solde affiché selon l'imputation : « sisa ambiny » avant, « sisa tavela » après.
  const surPermission = conge.imputation === 'PERMISSION';
  const avant = recap
    ? surPermission
      ? recap.permAvant
      : recap.resteTitreAvant !== undefined ? recap.resteTitreAvant : recap.soldeAvant
    : 0;
  const apres = recap
    ? surPermission
      ? recap.permApres
      : recap.resteTitreApres !== undefined ? recap.resteTitreApres : recap.soldeApres
    : 0;
  const titreAvantAffiche =
    conge.titre_periode ||
    (recap ? String(surPermission ? recap.annee : recap.titreAvant || recap.annee) : '……………………');
  const anneeApresAffichee = recap
    ? String(surPermission ? recap.annee : recap.titreApres || recap.annee)
    : String(conge.annee);

  return (
    <div className={`fiche-sheet ${compact ? 'fiche-compact' : ''}`}>
      <div className="fiche-entete">
        <img src={loadBulletinHeader().image} alt="Entête SALFA" className="fiche-entete-img" />
      </div>

      <div className="fiche-titre-wrap">
        <div className="fiche-titre">FICHE D'ABSENCE</div>
      </div>

      <div className="fiche-champs">
        <div>
          <span className="fiche-cle">Anarana &amp; Fanampin'anarana</span>
          <span className="fiche-points"> :</span> {conge.nom_prenoms || '………………………………………………………………'}
          {conge.numero_matricule ? <span className="fiche-mat">(Mat. {conge.numero_matricule}{conge.fonction ? ` — ${conge.fonction}` : ''})</span> : null}
        </div>
        <div>
          <span className="fiche-cle">Service /Projet</span>
          <span className="fiche-points"> :</span> {conge.service || conge.fonction || '……………………………………………………………………………'}
        </div>
        <div>
          <span className="fiche-cle">Adiresy / n° tel ahafahana mifandray</span>
          <span className="fiche-points"> :</span> {conge.contact || '………………………………………………………'}
        </div>
        <div>
          <span className="fiche-cle">Fangatahana</span>
          <span className="fiche-points"> :</span> {objet}
          {jours ? ` — ${fmtJours(jours)} andro / jour(s)` : ''}
        </div>
      </div>

      <table className="fiche-table">
        <thead>
          <tr>
            <th colSpan={2} className="fiche-col-objet">Anton'ny fangatahana</th>
            <th className="fiche-col-x">x</th>
            <th className="fiche-col-jours">Isan'ny andro angatahana</th>
            <th className="fiche-col-droit">Voalazan'ny FITSIPIKA ANATINY manan-kery</th>
          </tr>
        </thead>
        <tbody>
          {blocs.map((bloc) => {
            const cocheGlobal = bloc.categorie === 'CONGE' && categorieFiche === 'CONGE';
            const nbLignes = bloc.lignes.length;
            return bloc.lignes.map((ligne, index) => {
              const coche = bloc.categorie === 'CONGE'
                ? cocheGlobal
                : ligne.code === conge.motif_code && categorieFiche === bloc.categorie;
              return (
                <tr key={`${bloc.categorie}-${ligne.cle}`} className={coche ? 'fiche-ligne-cochee' : ''}>
                  {index === 0 && (
                    <th className="fiche-bloc" rowSpan={nbLignes}>{bloc.enTete}</th>
                  )}
                  <td className={ligne.sousLigne ? 'fiche-sous' : ''}>
                    {bloc.categorie === 'CONGE' ? (conge.titre_periode && coche ? conge.titre_periode : '\u00A0') : ligne.texte}
                  </td>
                  <td className="fiche-x">{coche ? 'X' : ''}</td>
                  <td className="fiche-jours">{coche ? andro(jours) : ''}</td>
                  {bloc.droitFusionne ? (
                    index === 0 ? <td className="fiche-droit" rowSpan={nbLignes}>{bloc.droitGlobal}</td> : null
                  ) : (
                    <td className="fiche-droit">{ligne.droit}</td>
                  )}
                </tr>
              );
            });
          })}
        </tbody>
      </table>

      <div className="fiche-soldes">
        <div>
          <span className="fiche-cle">Congé/Permission sisa ambiny</span>
          <span className="fiche-points">: </span>{recap ? `${fmtJours(avant)} andro` : '…………'}
          {'    '}<span className="fiche-cle">Titre/Année</span>
          <span className="fiche-points">: </span>{titreAvantAffiche}
          {'    '}<span className="fiche-cle">Isan'ny angatahina</span>
          <span className="fiche-points">: </span>{fmtJours(jours)}
        </div>
        <div>
          <span className="fiche-cle">Olona hisolo</span>
          <span className="fiche-points">: </span>{conge.remplacant || '………………………………………'}
          {'    '}<span className="fiche-cle">Sisa tavela</span>
          <span className="fiche-points">: </span>{recap ? `${fmtJours(apres)} andro` : '………'}
          {'    '}<span className="fiche-cle">Année</span>
          <span className="fiche-points">: </span>{anneeApresAffichee}
        </div>
      </div>

      <table className="fiche-dates">
        <thead>
          <tr>
            <th>Datin'ny fangatahana</th>
            <th>Daty handehanana (congé , permission, repos medical)</th>
            <th>Daty fiverenana miasa</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="fiche-date">{dateFr(conge.date_demande)}</td>
            <td className="fiche-date">
              {periodeAbsenceDocx(conge)}
              <div className="fiche-heure">{heureDocx(conge.heure_debut)}</div>
            </td>
            <td className="fiche-date">
              {dateFr(dateRetourFiche(conge))}
              <div className="fiche-heure">{heureDocx(conge.heure_fin)}</div>
            </td>
          </tr>
        </tbody>
      </table>

      {(conge.justificatif || conge.observations || conge.motif_refus) && (
        <div className="fiche-notes">
          {conge.justificatif ? <div><b>Justificatif :</b> {conge.justificatif}</div> : null}
          {conge.observations ? <div><b>Observations :</b> {conge.observations}</div> : null}
          {conge.motif_refus ? <div className="fiche-refus"><b>Motif du refus :</b> {conge.motif_refus}</div> : null}
        </div>
      )}

      <table className="fiche-signatures">
        <thead>
          <tr>
            <th>Ny mpangataka</th>
            <th>Chef de Service</th>
            <th>Médecin Chef</th>
            <th>Gestionnaire</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <div className="fiche-visa-nom">{conge.nom_prenoms}</div>
              <div className="fiche-visa-date">{conge.date_demande ? dateFr(conge.date_demande) : ''}</div>
            </td>
            <td>
              <div className="fiche-visa-nom">{conge.visa_chef_par || ''}</div>
              <div className="fiche-visa-date">{conge.visa_chef_le ? dateFr(conge.visa_chef_le) : ''}</div>
            </td>
            <td>
              <div className="fiche-visa-nom">{conge.visa_medecin_par || ''}</div>
              <div className="fiche-visa-date">{conge.visa_medecin_le ? dateFr(conge.visa_medecin_le) : ''}</div>
            </td>
            <td>
              <div className="fiche-visa-nom">{conge.visa_gestionnaire_par || ''}</div>
              <div className="fiche-visa-date">{conge.visa_gestionnaire_le ? dateFr(conge.visa_gestionnaire_le) : ''}</div>
            </td>
          </tr>
        </tbody>
      </table>

      <div className="fiche-pied">
        <span>Situation : {LIBELLES_STATUT[conge.statut]}</span>
        <span>Fiche n° {conge.id} — imputation {conge.imputation === 'CONGE' ? 'congé' : conge.imputation === 'PERMISSION' ? 'permission' : 'sans décompte'}</span>
        <span>{conge.date_saisie ? `Saisie le ${dateFr(conge.date_saisie.slice(0, 10))}${conge.saisie_par ? ` par ${conge.saisie_par}` : ''}` : ''}</span>
      </div>
    </div>
  );
};

/** Le texte d'un bloc de la fiche, pour l'infobulle des motifs. */
export function droitDuMotif(motif: MotifAbsence | null): string {
  if (!motif) return '';
  return motif.categorie === 'PERMISSION' ? `Prévu par le règlement : ${andro(motif.jours)}` : 'Sur justificatif du médecin';
}

export default FicheAbsence;
