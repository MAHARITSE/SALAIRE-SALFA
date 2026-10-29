// ==============================================================================
// MODALE « FICHE D'ABSENCE » — saisie d'une demande de congé, de permission ou
// d'examen médical, selon la fiche utilisée par la société. Les motifs et les
// droits proposés viennent du référentiel (local/conges.ts), le nombre de jours
// est calculé en jours ouvrables, et le solde affiché est celui de l'état.
// ==============================================================================
import React, { useMemo, useState } from 'react';
import {
  CongeAbsence, CategorieAbsence, ImputationConges, SoldeSaisie, MotifAbsence,
  CATEGORIES_ABSENCE, MOTIFS_ABSENCE, trouverMotif, joursDemandesPour,
  calculerDateFin, calculerDateRetour, calculerDateRetourDepuisFin,
  decomposerTitreActif, anneesSuccessives, fmtJours, LIBELLES_CATEGORIE, DEFAULT_CONGES_CONFIG, CongesConfig,
} from '../../local/conges';
import { FicheAbsence, dateFr } from './FicheAbsence';
import { downloadFicheAbsencePDF } from '../../pdf/congesPdf';
import { X, Save, Printer, Eye, PenLine, CalendarClock, Info, CheckCircle2, Download } from 'lucide-react';

export interface BrouillonConge extends Partial<CongeAbsence> {
  id?: number;
}

interface FicheAbsenceModalProps {
  initial: BrouillonConge | null;
  employes: any[];
  soldes: Record<number, SoldeSaisie>;
  contactsConnus?: Record<number, string>;
  config?: CongesConfig;
  annee: number;
  utilisateur: { utilisateur: string; role: string };
  onClose: () => void;
  onEnregistrer: (
    draft: Partial<CongeAbsence>,
    options: { imprimerApres: boolean; valider: boolean }
  ) => Promise<{ success: boolean; message?: string; avertissement?: string }>;
}

const aujourdHui = (): string => new Date().toISOString().slice(0, 10);

const champ =
  'w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-salfa-teal';
const etiquette = 'block text-[10px] sm:text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-1';

export const FicheAbsenceModal: React.FC<FicheAbsenceModalProps> = ({
  initial, employes, soldes, contactsConnus, config, annee, utilisateur, onClose, onEnregistrer,
}) => {
  const cfg = config || DEFAULT_CONGES_CONFIG;
  const [onglet, setOnglet] = useState<'saisie' | 'apercu'>('saisie');
  const [recherche, setRecherche] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState('');
  const [b, setB] = useState<BrouillonConge>(() => {
    const soldeInit = initial?.employe_id ? soldes[Number(initial.employe_id)] : undefined;
    const base: BrouillonConge = {
      employe_id: undefined,
      categorie: 'CONGE',
      motif_code: '',
      motif_libelle: '',
      imputation: 'CONGE',
      annee,
      date_demande: aujourdHui(),
      date_debut: '',
      date_fin: '',
      date_retour: '',
      heure_debut: '',
      heure_fin: '',
      jours_demandes: 0,
      jours_valides: null,
      service: '',
      contact: '',
      remplacant: '',
      titre_periode: soldeInit ? `Titre ${soldeInit.titreActif}` : `Titre ${annee}`,
      justificatif: '',
      observations: '',
      statut: 'SOUMIS',
      ajustement_type: 'DROIT',
      ...initial,
    };
    if (base.categorie !== 'AJUSTEMENT' && base.date_debut) {
      const nb = Number(base.jours_demandes) || 0;
      if (!base.date_fin) {
        base.date_fin = nb > 0 ? calculerDateFin(base.date_debut, nb, cfg) : base.date_debut;
      }
      if (!base.date_retour || base.date_retour <= base.date_fin) {
        base.date_retour = calculerDateRetourDepuisFin(base.date_fin, cfg);
      }
    }
    return base;
  });

  const set = <K extends keyof BrouillonConge>(cle: K, valeur: BrouillonConge[K]) =>
    setB((prev) => ({ ...prev, [cle]: valeur }));

  const changerDateDebut = (debut: string) => {
    setB((prev) => {
      if (!debut) return { ...prev, date_debut: '', date_fin: '', date_retour: '' };
      if (prev.categorie === 'AJUSTEMENT') return { ...prev, date_debut: debut };
      const anneeAuto = Number(debut.slice(0, 4)) || prev.annee;
      const nbActuel = Number(prev.jours_demandes) || 0;
      if (nbActuel > 0) {
        const fin = calculerDateFin(debut, nbActuel, cfg);
        const retour = fin ? calculerDateRetourDepuisFin(fin, cfg) : '';
        return { ...prev, date_debut: debut, date_fin: fin, date_retour: retour, annee: anneeAuto };
      }
      if (prev.date_fin && prev.date_fin >= debut) {
        const jours = joursDemandesPour({ date_debut: debut, date_fin: prev.date_fin }, cfg);
        const retour = calculerDateRetourDepuisFin(prev.date_fin, cfg);
        return { ...prev, date_debut: debut, jours_demandes: jours, date_retour: retour, annee: anneeAuto };
      }
      const fin = debut;
      const jours = joursDemandesPour({ date_debut: debut, date_fin: fin }, cfg) || 1;
      const retour = calculerDateRetourDepuisFin(fin, cfg);
      return { ...prev, date_debut: debut, date_fin: fin, date_retour: retour, jours_demandes: jours, annee: anneeAuto };
    });
  };

  const changerDateFin = (fin: string) => {
    setB((prev) => {
      if (!fin) {
        const retour = prev.date_debut ? calculerDateRetourDepuisFin(prev.date_debut, cfg) : '';
        return { ...prev, date_fin: '', date_retour: retour };
      }
      if (prev.date_debut && fin >= prev.date_debut) {
        const jours = joursDemandesPour({ date_debut: prev.date_debut, date_fin: fin }, cfg);
        const retour = calculerDateRetourDepuisFin(fin, cfg);
        return { ...prev, date_fin: fin, jours_demandes: jours, date_retour: retour };
      }
      if (!prev.date_debut) {
        const jours = joursDemandesPour({ date_debut: fin, date_fin: fin }, cfg) || 1;
        const retour = calculerDateRetourDepuisFin(fin, cfg);
        return { ...prev, date_debut: fin, date_fin: fin, jours_demandes: jours, date_retour: retour };
      }
      return { ...prev, date_fin: fin };
    });
  };

  const changerJoursDemandes = (jours: number) => {
    setB((prev) => {
      if (prev.categorie === 'AJUSTEMENT' || !prev.date_debut || !(jours > 0)) {
        return { ...prev, jours_demandes: jours };
      }
      const fin = calculerDateFin(prev.date_debut, jours, cfg);
      const retour = fin ? calculerDateRetourDepuisFin(fin, cfg) : prev.date_retour;
      return { ...prev, jours_demandes: jours, date_fin: fin, date_retour: retour };
    });
  };

  const employe = useMemo(
    () => employes.find((e) => Number(e.id) === Number(b.employe_id)) || null,
    [employes, b.employe_id]
  );
  const motif = useMemo(() => trouverMotif(b.motif_code || ''), [b.motif_code]);
  const motifs = useMemo(
    () => MOTIFS_ABSENCE.filter((m) => m.categorie === b.categorie),
    [b.categorie]
  );
  const solde: SoldeSaisie | null = b.employe_id ? soldes[Number(b.employe_id)] || null : null;
  const q = recherche.trim().toLowerCase();
  const candidats = useMemo(() => {
    const liste = employes.filter((e) => Number(e.actif) === 1 || Number(e.id) === Number(b.employe_id));
    const filtres = q
      ? liste.filter((e) =>
          String(e.nom_prenoms || '').toLowerCase().includes(q) ||
          String(e.numero_matricule || '').includes(q) ||
          String(e.jobs || '').toLowerCase().includes(q)
        )
      : liste;
    return filtres.slice(0, 40);
  }, [employes, q, b.employe_id]);

  // Jours calculés sur la période incluse Du … au … et date de prise de service (Daty fiverenana miasa).
  const joursCalcules = useMemo(
    () => (b.date_debut && b.date_fin ? joursDemandesPour({ date_debut: b.date_debut, date_fin: b.date_fin }, cfg) : 0),
    [b.date_debut, b.date_fin, cfg]
  );
  const repriseSuggeree = useMemo(() => {
    if (b.date_fin) return calculerDateRetourDepuisFin(b.date_fin, cfg);
    if (b.date_debut && Number(b.jours_demandes) > 0) return calculerDateRetour(b.date_debut, Number(b.jours_demandes), cfg);
    return '';
  }, [b.date_debut, b.date_fin, b.jours_demandes, cfg]);

  const choisirMotif = (m: MotifAbsence | null) => {
    setB((prev) => {
      const joursDefaut = m && m.jours > 0 ? m.jours : prev.jours_demandes;
      const finAuto = prev.date_debut && Number(joursDefaut) > 0
        ? calculerDateFin(prev.date_debut, Number(joursDefaut), cfg)
        : prev.date_fin;
      const retourAuto = finAuto ? calculerDateRetourDepuisFin(finAuto, cfg) : prev.date_retour;
      return {
        ...prev,
        motif_code: m ? m.code : '',
        motif_libelle: m ? m.libelle : LIBELLES_CATEGORIE[prev.categorie || 'CONGE'],
        imputation: m ? m.imputation : prev.categorie === 'CONGE' ? 'CONGE' : prev.categorie === 'AJUSTEMENT' ? 'AUCUNE' : 'PERMISSION',
        jours_demandes: joursDefaut,
        date_fin: finAuto,
        date_retour: retourAuto,
      };
    });
  };

  const choisirCategorie = (categorie: CategorieAbsence) => {
    const premier = MOTIFS_ABSENCE.find((m) => m.categorie === categorie) || null;
    setB((prev) => {
      const nvJours = categorie === 'AJUSTEMENT' ? 0 : categorie === 'PERMISSION' && premier?.jours ? premier.jours : prev.jours_demandes;
      const finAuto = categorie !== 'AJUSTEMENT' && prev.date_debut && Number(nvJours) > 0
        ? calculerDateFin(prev.date_debut, Number(nvJours), cfg)
        : categorie === 'AJUSTEMENT' ? '' : prev.date_fin;
      const retourAuto = categorie !== 'AJUSTEMENT' && finAuto
        ? calculerDateRetourDepuisFin(finAuto, cfg)
        : '';
      return {
        ...prev,
        categorie,
        motif_code: categorie === 'CONGE' || categorie === 'AJUSTEMENT' ? '' : premier?.code || '',
        motif_libelle: categorie === 'CONGE' ? 'Congé annuel' : premier?.libelle || LIBELLES_CATEGORIE[categorie],
        imputation: categorie === 'CONGE' ? 'CONGE' : categorie === 'AJUSTEMENT' ? 'AUCUNE' : premier?.imputation || 'PERMISSION',
        ajustement_type: categorie === 'AJUSTEMENT' ? prev.ajustement_type || 'DROIT' : '',
        jours_demandes: nvJours,
        date_fin: finAuto,
        date_retour: retourAuto,
      };
    });
  };

  // Projection du solde après cette demande, pour avertir avant d'enregistrer.
  const projection = useMemo(() => {
    if (!solde) return null;
    const jours = Number(b.jours_demandes || 0);
    if (b.imputation === 'PERMISSION') {
      return { avant: solde.permRestant, apres: Number((solde.permRestant - jours).toFixed(2)), libelle: 'permission' };
    }
    if (b.imputation === 'AUCUNE') {
      return { avant: solde.restant, apres: solde.restant, libelle: 'sans décompte' };
    }
    return { avant: solde.restant, apres: Number((solde.restant - jours).toFixed(2)), libelle: 'congé' };
  }, [solde, b.jours_demandes, b.imputation]);

  const draft = (): Partial<CongeAbsence> => ({
    ...b,
    annee: Number(b.annee) || annee,
    jours_demandes: Number(b.jours_demandes || 0),
    jours_valides: b.jours_valides === null || b.jours_valides === undefined || (b.jours_valides as any) === '' ? null : Number(b.jours_valides),
    statut: b.categorie === 'AJUSTEMENT' ? 'VALIDE' : b.statut,
  });

  const enregistrer = async (options: { imprimerApres: boolean; valider: boolean }) => {
    setErreur('');
    setEnCours(true);
    const draftValue = draft();
    if (options.valider && draftValue.statut !== 'VALIDE') draftValue.statut = 'VALIDE';
    const res = await onEnregistrer(draftValue, options);
    setEnCours(false);
    if (res.success) onClose();
    else setErreur(res.message || "Enregistrement impossible.");
  };

  const apercuConge: CongeAbsence = {
    ...normaliserPourApercu(draft()),
    nom_prenoms: employe?.nom_prenoms || b.nom_prenoms || '',
    numero_matricule: Number(employe?.numero_matricule || b.numero_matricule || 0),
    fonction: employe?.jobs || b.fonction || '',
    motif_libelle:
      b.motif_libelle ||
      (motif ? motif.libelle : b.categorie === 'CONGE' ? 'Congé annuel' : LIBELLES_CATEGORIE[b.categorie || 'CONGE']),
  };
  const anneesLoi = useMemo(
    () => anneesSuccessives(Number(b.annee) || annee, cfg.nbAnneesCumul),
    [b.annee, annee, cfg.nbAnneesCumul]
  );
  const anneeMinLoi = anneesLoi[0] ?? (Number(b.annee) || annee);
  const anneeTitreSaisi = useMemo(() => {
    const m = /\b(19\d{2}|20\d{2})\b/.exec(String(b.titre_periode || ''));
    return m ? Number(m[1]) : 0;
  }, [b.titre_periode]);
  const titrePrescrit = b.imputation === 'CONGE' && anneeTitreSaisi > 0 && anneeTitreSaisi < anneeMinLoi;

  const recap = useMemo(() => {
    if (!solde) return null;
    const soldeApres = projection && b.imputation === 'CONGE' ? projection.apres : solde.restant;
    const decApres = decomposerTitreActif(soldeApres, solde.annee, cfg.joursCongeParAn, solde.annee_embauche, cfg.nbAnneesCumul);
    return {
      annee: solde.annee,
      droitConge: solde.droit,
      report: solde.report,
      soldeAvant: solde.restant,
      soldeApres,
      permDroit: solde.permDroit,
      permAvant: solde.permRestant,
      permApres: projection && b.imputation === 'PERMISSION' ? projection.apres : solde.permRestant,
      titreAvant: solde.titreActif,
      resteTitreAvant: solde.resteTitreActif,
      titreApres: decApres.titreActif,
      resteTitreApres: decApres.resteTitreActif,
    };
  }, [solde, projection, b.imputation, cfg.joursCongeParAn]);

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-slate-900/80 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-6xl border border-slate-200 dark:border-slate-700 max-h-[96dvh] flex flex-col">
        <div className="bg-salfa-dark dark:bg-slate-900 px-4 py-3 flex items-center justify-between text-white shrink-0 rounded-t-2xl">
          <div className="min-w-0">
            <h3 className="text-sm sm:text-base font-bold truncate">
              {b.id ? 'Modifier la fiche d’absence' : 'Nouvelle fiche d’absence'}
            </h3>
            <p className="text-[10px] sm:text-xs text-slate-300">
              Droits et motifs de la FICHE D’ABSENCE — congé 30 j/an (90 j au maximum), permission 10 j/an
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex sm:hidden bg-slate-700/60 rounded-lg p-0.5">
              <button onClick={() => setOnglet('saisie')} className={`px-2 py-1 rounded-md text-[11px] font-bold ${onglet === 'saisie' ? 'bg-white text-slate-900' : 'text-slate-200'}`}>
                <PenLine className="w-3.5 h-3.5 inline" /> Saisie
              </button>
              <button onClick={() => setOnglet('apercu')} className={`px-2 py-1 rounded-md text-[11px] font-bold ${onglet === 'apercu' ? 'bg-white text-slate-900' : 'text-slate-200'}`}>
                <Eye className="w-3.5 h-3.5 inline" /> Aperçu
              </button>
            </div>
            <button onClick={onClose} className="p-1.5 rounded hover:bg-white/10" aria-label="Fermer"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto thin-scrollbar p-3 sm:p-4 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
          {/* ----------------------------- Le formulaire ----------------------------- */}
          <div className={`space-y-3 ${onglet === 'apercu' ? 'hidden lg:block' : ''}`}>
            <div>
              <label className={etiquette}>Catégorie (Anton’ny fangatahana)</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {CATEGORIES_ABSENCE.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => choisirCategorie(c.code)}
                    className={`px-2 py-1.5 rounded-lg text-[11px] font-bold border transition ${
                      b.categorie === c.code
                        ? 'bg-salfa-dark text-white border-salfa-dark'
                        : 'bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {c.code === 'CONGE' ? 'Congé' : c.code === 'PERMISSION' ? 'Permission' : c.code === 'EXAMEN_MEDICAL' ? 'Examen médical' : 'Ajustement'}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                {(CATEGORIES_ABSENCE.find((c) => c.code === b.categorie) || CATEGORIES_ABSENCE[0]).aide}
              </p>
            </div>

            {motifs.length > 0 && (
              <div>
                <label className={etiquette}>Motif prévu par le règlement intérieur</label>
                <select
                  className={champ}
                  value={b.motif_code || ''}
                  onChange={(e) => choisirMotif(trouverMotif(e.target.value))}
                >
                  <option value="">— choisir un motif —</option>
                  {motifs.map((m) => (
                    <option key={m.code} value={m.code}>
                      {m.libelle} — {m.libelleFr} {m.jours > 0 ? `(${m.jours} j)` : '(sur justificatif)'}
                    </option>
                  ))}
                </select>
                {motif?.avisMedecin && (
                  <p className="text-[10px] text-amber-700 dark:text-amber-300 mt-1 flex items-start gap-1">
                    <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
                    Ce motif demande le visa du médecin chef avant validation par le gestionnaire.
                  </p>
                )}
              </div>
            )}

            <div>
              <label className={etiquette}>Salarié (Anarana &amp; Fanampin’anarana)</label>
              <input
                className={`${champ} mb-1.5`}
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Rechercher un nom, un matricule, une fonction…"
              />
              <div className="max-h-40 overflow-y-auto thin-scrollbar border border-slate-200 dark:border-slate-700 rounded-lg divide-y dark:divide-slate-700">
                {candidats.length === 0 && <div className="p-2 text-xs text-slate-500">Aucun salarié trouvé.</div>}
                {candidats.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => {
                      const sEmp = soldes[Number(e.id)];
                      const contactDef = contactsConnus?.[Number(e.id)] || '';
                      setB((prev) => ({
                        ...prev,
                        employe_id: Number(e.id),
                        service: prev.service || e.jobs || '',
                        contact: prev.contact || contactDef,
                        titre_periode:
                          !prev.id && prev.categorie === 'CONGE' && sEmp
                            ? `Titre ${sEmp.titreActif}`
                            : prev.titre_periode,
                      }));
                      setRecherche('');
                    }}
                    className={`w-full text-left px-2 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-between gap-2 ${
                      Number(b.employe_id) === Number(e.id) ? 'bg-sky-50 dark:bg-sky-900/30 font-bold' : ''
                    }`}
                  >
                    <span className="truncate">{e.nom_prenoms}</span>
                    <span className="shrink-0 text-[10px] text-slate-500 font-mono">
                      Mat. {e.numero_matricule} · {soldes[Number(e.id)] ? `Titre ${soldes[Number(e.id)].titreActif}: ${fmtJours(soldes[Number(e.id)].resteTitreActif)} j (cumul ${fmtJours(soldes[Number(e.id)].restant)} j)` : '—'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={etiquette}>Datin’ny fangatahana (demande)</label>
                <input type="date" className={champ} value={b.date_demande || ''} onChange={(e) => set('date_demande', e.target.value)} />
              </div>
              <div>
                <label className={etiquette}>Année de référence</label>
                <input type="number" className={champ} value={b.annee ?? annee} onChange={(e) => set('annee', Number(e.target.value))} />
              </div>
              {b.categorie !== 'AJUSTEMENT' && (
                <>
                  <div>
                    <label className={etiquette}>Daty handehanana — Du (1er jour)</label>
                    <input type="date" className={champ} value={b.date_debut || ''} onChange={(e) => changerDateDebut(e.target.value)} />
                  </div>
                  <div>
                    <label className={etiquette}>Au (dernier jour demandé inclus)</label>
                    <input type="date" min={b.date_debut || undefined} className={champ} value={b.date_fin || ''} onChange={(e) => changerDateFin(e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    <label className={etiquette}>Daty fiverenana miasa (prise de service — jour après la fin demandée)</label>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="date"
                        min={b.date_fin || b.date_debut || undefined}
                        className={`${champ} sm:max-w-[210px] font-mono font-bold`}
                        value={b.date_retour || ''}
                        onChange={(e) => set('date_retour', e.target.value)}
                      />
                      {repriseSuggeree && b.date_retour === repriseSuggeree && (
                        <span className="text-[10px] text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Ajustée automatiquement ({dateFr(repriseSuggeree)})
                        </span>
                      )}
                      {repriseSuggeree && b.date_retour !== repriseSuggeree && (
                        <button type="button" onClick={() => set('date_retour', repriseSuggeree)} className="text-[10px] text-salfa-teal font-bold flex items-center gap-1">
                          <CalendarClock className="w-3 h-3" /> Rétablir prise de service : {dateFr(repriseSuggeree)}
                        </button>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className={etiquette}>Ora (heure de départ)</label>
                    <input type="time" className={champ} value={b.heure_debut || ''} onChange={(e) => set('heure_debut', e.target.value)} />
                  </div>
                  <div>
                    <label className={etiquette}>Ora (heure de reprise)</label>
                    <input type="time" className={champ} value={b.heure_fin || ''} onChange={(e) => set('heure_fin', e.target.value)} />
                  </div>
                </>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className={etiquette}>Isan’ny andro (jours demandés)</label>
                <input
                  type="number" min={b.categorie === 'AJUSTEMENT' ? undefined : 0} step="0.5" className={champ}
                  value={b.jours_demandes ?? 0}
                  onChange={(e) => changerJoursDemandes(Number(e.target.value))}
                />
                {b.categorie !== 'AJUSTEMENT' && joursCalcules > 0 && Number(b.jours_demandes) !== joursCalcules && (
                  <button type="button" onClick={() => changerJoursDemandes(joursCalcules)} className="text-[10px] text-salfa-teal font-bold mt-0.5 flex items-center gap-1">
                    <CalendarClock className="w-3 h-3" /> Reprendre les {joursCalcules} jour(s)
                  </button>
                )}
              </div>
              <div>
                <label className={etiquette}>Jours retenus (validation)</label>
                <input
                  type="number" min={0} step="0.5" className={champ} placeholder="identiques"
                  value={b.jours_valides ?? ''}
                  onChange={(e) => set('jours_valides', e.target.value === '' ? null : Number(e.target.value))}
                />
              </div>
              <div>
                <label className={etiquette}>Imputation</label>
                <select className={champ} value={b.imputation || 'CONGE'} onChange={(e) => set('imputation', e.target.value as ImputationConges)}>
                  <option value="CONGE">Sur le congé</option>
                  <option value="PERMISSION">Sur la permission</option>
                  <option value="AUCUNE">Sans décompte</option>
                </select>
              </div>
            </div>

            {b.categorie === 'AJUSTEMENT' && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={etiquette}>Nature de l’ajustement</label>
                  <select className={champ} value={b.ajustement_type || 'DROIT'} onChange={(e) => set('ajustement_type', e.target.value as any)}>
                    <option value="DROIT">Droit de l’année (prorata, entrée…)</option>
                    <option value="REPORT">Report / régularisation</option>
                    <option value="OUVERTURE">Solde initial 1re année (0 à 30 j)</option>
                  </select>
                </div>
                <div>
                  <label className={etiquette}>Jours (signés)</label>
                  <input type="number" step="0.5" className={champ} value={b.jours_demandes ?? 0} onChange={(e) => set('jours_demandes', Number(e.target.value))} />
                  <p className="text-[10px] text-slate-500 mt-1">Négatif pour retirer des jours au salarié.</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={etiquette}>Service / Projet</label>
                <input className={champ} value={b.service || ''} onChange={(e) => set('service', e.target.value)} placeholder="Dispensaire, projet TB…" />
              </div>
              <div>
                <label className={etiquette}>Adiresy / n° tel ahafahana mifandray</label>
                <input className={champ} value={b.contact || ''} onChange={(e) => set('contact', e.target.value)} placeholder="Adresse ou téléphone joignable" />
              </div>
              <div>
                <label className={etiquette}>Olona hisolo (personne remplaçante)</label>
                <input className={champ} value={b.remplacant || ''} onChange={(e) => set('remplacant', e.target.value)} placeholder="Nom du collègue désigné" />
              </div>
              <div>
                <label className={etiquette}>Titre / Année ({cfg.nbAnneesCumul} dernières années)</label>
                <input
                  className={`${champ} ${titrePrescrit ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                  value={b.titre_periode || ''}
                  onChange={(e) => set('titre_periode', e.target.value)}
                  placeholder={`Titre ${solde?.titreActif || annee}`}
                />
                {b.categorie === 'CONGE' && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {anneesLoi.map((a) => {
                      const dispo = solde?.droitsParTitre?.[a];
                      const actif = b.titre_periode === `Titre ${a}`;
                      return (
                        <button
                          key={a}
                          type="button"
                          onClick={() => set('titre_periode', `Titre ${a}`)}
                          className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border transition ${
                            actif
                              ? 'bg-salfa-teal text-white border-salfa-teal'
                              : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {a}{typeof dispo === 'number' ? ` (${fmtJours(dispo)} j)` : ''}
                        </button>
                      );
                    })}
                  </div>
                )}
                {titrePrescrit && (
                  <p className="text-[10px] font-bold text-red-600 dark:text-red-300 mt-1">
                    Loi malgache : seuls les {cfg.nbAnneesCumul} derniers exercices ({anneesLoi.join(', ')}) sont cumulables ; le titre {anneeTitreSaisi} est prescrit.
                  </p>
                )}
              </div>
              <div>
                <label className={etiquette}>Justificatif (Taratasy fanamarihana)</label>
                <input className={champ} value={b.justificatif || ''} onChange={(e) => set('justificatif', e.target.value)} placeholder="Certificat médical n°, date…" />
              </div>
              <div>
                <label className={etiquette}>Situation de la fiche</label>
                <select className={champ} value={b.statut || 'SOUMIS'} onChange={(e) => set('statut', e.target.value as CongeAbsence['statut'])} disabled={b.categorie === 'AJUSTEMENT'}>
                  <option value="SOUMIS">Soumise (à viser)</option>
                  <option value="AVIS_CHF">Avis chef de service donné</option>
                  <option value="AVIS_MEDECIN">Avis médecin chef donné</option>
                  <option value="VALIDE">Validée par le gestionnaire</option>
                  <option value="REFUSE">Refusée</option>
                </select>
              </div>
            </div>

            <div>
              <label className={etiquette}>Observations</label>
              <textarea className={`${champ} h-16`} value={b.observations || ''} onChange={(e) => set('observations', e.target.value)} placeholder="Précisions pour le chef de service, le médecin, le dossier…" />
            </div>

            {/* ------------------------------ Le solde ------------------------------ */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/40 p-2.5">
              <div className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-1.5">
                Droits de {employe?.nom_prenoms || '—'} en {b.annee || annee}
              </div>
              {!solde ? (
                <p className="text-[11px] text-slate-500">Choisissez le salarié pour voir son solde.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                  <div>
                    <div className="text-[9px] uppercase text-slate-500">Titre actif ({solde.titreActif})</div>
                    <div className="font-mono font-bold text-salfa-teal dark:text-sky-300">{fmtJours(solde.resteTitreActif)} j</div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase text-slate-500">Cumul {cfg.nbAnneesCumul} ans (max {fmtJours(cfg.plafondCumulConge)})</div>
                    <div className={`font-mono font-bold ${solde.restant <= 0 ? 'text-red-600' : 'text-emerald-700 dark:text-emerald-300'}`}>{fmtJours(solde.restant)} j</div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase text-slate-500">Pris en {solde.annee}</div>
                    <div className="font-mono font-bold">{fmtJours(solde.pris)} j</div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase text-slate-500">Reste permission</div>
                    <div className={`font-mono font-bold ${solde.permRestant <= 0 ? 'text-red-600' : ''}`}>{fmtJours(solde.permRestant)} / {fmtJours(solde.permDroit)} j</div>
                  </div>
                  <div className="col-span-2 sm:col-span-4 pt-1 border-t border-slate-200 dark:border-slate-600 text-[10px] font-mono text-slate-600 dark:text-slate-300 flex flex-wrap gap-x-3 gap-y-0.5">
                    <span className="font-sans font-bold uppercase text-[9px] text-slate-500">Détail {cfg.nbAnneesCumul} dernières années :</span>
                    {anneesLoi.map((a) => (
                      <span key={a} className={a === solde.titreActif && solde.restant > 0 ? 'font-bold text-salfa-teal dark:text-sky-300' : ''}>
                        Titre {a} : {solde.annee_embauche > 0 && a < solde.annee_embauche && (solde.droitsParTitre?.[a] || 0) === 0 ? '—' : `${fmtJours(solde.droitsParTitre?.[a] || 0)} j`}
                      </span>
                    ))}
                  </div>
                  {solde.attente > 0 && (
                    <div className="col-span-2 sm:col-span-4 text-[10px] text-amber-700 dark:text-amber-300">
                      {fmtJours(solde.attente)} jour(s) déjà réservés par des demandes en attente.
                    </div>
                  )}
                </div>
              )}
              {motif && motif.jours > 0 && Number(b.jours_demandes) > motif.jours && (
                <div className="mt-1.5 text-[10px] font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1">
                  <Info className="w-3.5 h-3.5 shrink-0" />
                  Rappel Fitsipika Anatiny : le droit prévu pour « {motif.libelleDocx} » est de {motif.jours} andro.
                </div>
              )}
              {projection && (
                <div className={`mt-2 text-[11px] font-bold flex items-center gap-1.5 ${projection.apres < 0 ? 'text-red-600 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
                  {projection.apres < 0 ? <Info className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  {b.imputation === 'CONGE' && recap
                    ? `Après cette demande : ${fmtJours(recap.resteTitreApres)} j sur Titre ${recap.titreApres} (cumul ${fmtJours(projection.apres)} j)`
                    : `Après cette demande : ${fmtJours(projection.apres)} jour(s) de ${projection.libelle}`}
                  {projection.apres < 0 ? ' — solde dépassé, le reliquat négatif sera reporté sur l’année suivante.' : '.'}
                </div>
              )}
            </div>

            {erreur && <div className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-xs text-red-700 dark:text-red-300">{erreur}</div>}
          </div>

          {/* ------------------------------ L'aperçu ------------------------------ */}
          <div className={`${onglet === 'saisie' ? 'hidden lg:block' : ''}`}>
            <div className="flex items-center justify-between mb-1.5 gap-2">
              <div className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">Aperçu de la fiche — identique à la FICHE D’ABSENCE (A4)</div>
              <button
                type="button"
                onClick={() => downloadFicheAbsencePDF(apercuConge, recap)}
                className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-[11px] font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" />PDF A4
              </button>
            </div>
            <div className="bg-slate-100 dark:bg-slate-900/40 rounded-xl p-2 sm:p-3 overflow-auto thin-scrollbar max-h-[62vh]">
              <FicheAbsence conge={apercuConge} recap={recap} compact />
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50 px-3 sm:px-4 py-2.5 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0 rounded-b-2xl">
          <div className="text-[10px] text-slate-500 dark:text-slate-400 sm:mr-auto">
            Le circuit suit la fiche : demandeur → chef de service → médecin chef → gestionnaire.
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 sm:flex-none px-3 py-2 rounded-lg bg-slate-200 dark:bg-slate-600 text-sm font-semibold">Annuler</button>
            <button onClick={() => enregistrer({ imprimerApres: false, valider: false })} disabled={enCours} className="flex-1 sm:flex-none px-4 py-2 rounded-lg bg-salfa-dark hover:bg-salfa-teal text-white text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-60">
              <Save className="w-4 h-4" />{enCours ? '…' : 'Enregistrer'}
            </button>
            <button onClick={() => enregistrer({ imprimerApres: true, valider: false })} disabled={enCours} className="flex-1 sm:flex-none px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-60">
              <Printer className="w-4 h-4" />Enregistrer + imprimer
            </button>
            <button onClick={() => enregistrer({ imprimerApres: false, valider: true })} disabled={enCours || b.categorie === 'AJUSTEMENT'} className="flex-1 sm:flex-none px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-50" title="Enregistrer et valider directement (fiche déjà signée)">
              <CheckCircle2 className="w-4 h-4" />Enregistrer et valider
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/** Complète le brouillon pour que l'aperçu affiche les mêmes colonnes que la fiche enregistrée. */
function normaliserPourApercu(draft: Partial<CongeAbsence>): CongeAbsence {
  const vide: CongeAbsence = {
    id: 0, employe_id: 0, numero_matricule: 0, nom_prenoms: '', fonction: '', service: '', contact: '',
    categorie: 'CONGE', motif_code: '', motif_libelle: '', imputation: 'CONGE', annee: new Date().getFullYear(),
    date_demande: '', date_debut: '', heure_debut: '', date_fin: '', date_retour: '', heure_fin: '', jours_demandes: 0,
    jours_valides: null, remplacant: '', titre_periode: '', justificatif: '', observations: '', statut: 'SOUMIS',
    visa_chef_par: '', visa_chef_le: '', visa_medecin_par: '', visa_medecin_le: '', visa_gestionnaire_par: '',
    visa_gestionnaire_le: '', motif_refus: '', ajustement_type: '', saisie_par: '', date_saisie: '', date_modification: '',
  };
  return { ...vide, ...draft } as CongeAbsence;
}

export default FicheAbsenceModal;
