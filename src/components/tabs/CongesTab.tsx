// ==============================================================================
// ONGLET 5 — CONGÉS & PERMISSIONS (Fiches d'absence)
// Gestion des congés du personnel pour le comptable (gestionnaire) : saisie des
// fiches d'absence selon les motifs et les droits de la « FICHE D'ABSENCE »,
// circuit de visas (chef de service → médecin chef → gestionnaire), situation des
// droits par salarié, et état « CONTRÔLE DES CONGÉS ET PERMISSIONS » imprimable
// et exportable, tel que tenu actuellement dans le classeur de la société.
// ==============================================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { YearProps, YearSelect } from '../YearSelect';
import { UserSession } from '../../types';
import {
  fetchEmployes, fetchConges, fetchSituationConges, fetchEtatConges,
  creerConge, modifierConge, deciderConge, supprimerConge, saisirOuverturePremiereAnnee,
} from '../../api';
import {
  CongeAbsence, CongesConfig, SoldeSaisie, EtatConges, MOTIFS_ABSENCE, LIBELLES_CATEGORIE,
  LIBELLES_STATUT, StatutConges, fmtJours, actionsAutorisees, trouverMotif, aBesoinMedecin,
  joursAffiches, decomposerTitreActif, anneesSuccessives,
} from '../../local/conges';
import { loadConfig } from '../../local/config';
import { FicheAbsenceModal, BrouillonConge } from '../conges/FicheAbsenceModal';
import { FicheAbsence, RecapFiche, dateFr, periodeAbsenceFr, dateRetourFiche } from '../conges/FicheAbsence';
import { EtatCongesEcran, EtatCongesImpression, exporterEtatCongesExcel } from '../conges/EtatConges';
import { ImportCongesModal } from '../conges/ImportCongesModal';
import { downloadFicheAbsencePDF, downloadEtatCongesPDF } from '../../pdf/congesPdf';
import {
  CalendarPlus, Search, Printer, FileSpreadsheet, Upload, Info, CheckCircle2, XCircle,
  Eye, Edit2, Trash2, CalendarClock, ShieldCheck, BookOpen, RefreshCw, PenLine, FileText, X, Download,
} from 'lucide-react';

const MOIS_LISTE = ['JANVIER','FEVRIER','MARS','AVRIL','MAI','JUIN','JUILLET','AOUT','SEPTEMBRE','OCTOBRE','NOVEMBRE','DECEMBRE'];

type FiltreListe = 'A_TRAITER' | 'VALIDEES' | 'REFUSEES' | 'TOUTES';

const encadre = (v: number): string => fmtJours(v);

const COULEUR_STATUT: Record<StatutConges, string> = {
  SOUMIS: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-800',
  AVIS_CHF: 'bg-sky-100 dark:bg-sky-900/30 text-sky-800 dark:text-sky-200 border-sky-300 dark:border-sky-800',
  AVIS_MEDECIN: 'bg-violet-100 dark:bg-violet-900/30 text-violet-800 dark:text-violet-200 border-violet-300 dark:border-violet-800',
  VALIDE: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200 border-emerald-300 dark:border-emerald-800',
  REFUSE: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-300 dark:border-red-800',
};

const COULEUR_CATEGORIE: Record<string, string> = {
  CONGE: 'bg-sky-100 dark:bg-sky-900/30 text-sky-800 dark:text-sky-200',
  PERMISSION: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-200',
  EXAMEN_MEDICAL: 'bg-violet-100 dark:bg-violet-900/30 text-violet-800 dark:text-violet-200',
  AJUSTEMENT: 'bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200',
};

export const CongesTab: React.FC<YearProps & { user: UserSession }> = ({ annee, setAnnee, user }) => {
  const [vue, setVue] = useState<'suivi' | 'etat'>('suivi');
  const [employes, setEmployes] = useState<any[]>([]);
  const [soldes, setSoldes] = useState<Record<number, SoldeSaisie>>({});
  const [conges, setConges] = useState<CongeAbsence[]>([]);
  const [etat, setEtat] = useState<EtatConges | null>(null);
  const [config, setConfig] = useState<CongesConfig>(() => loadConfig().congies);
  const [recherche, setRecherche] = useState('');
  const [filtre, setFiltre] = useState<FiltreListe>('TOUTES');
  const [nbAnnees, setNbAnnees] = useState(() => loadConfig().congies.nbAnneesCumul || 3);
  const [inclureRefuses, setInclureRefuses] = useState(false);
  const anneesLoi = useMemo(() => anneesSuccessives(annee, config.nbAnneesCumul), [annee, config.nbAnneesCumul]);
  const [chargement, setChargement] = useState(true);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; texte: string } | null>(null);
  const [modal, setModal] = useState<{ ouvert: boolean; initial: BrouillonConge | null }>({ ouvert: false, initial: null });
  const [importOuvert, setImportOuvert] = useState(false);
  const [referentiel, setReferentiel] = useState(false);
  const [ficheImpr, setFicheImpr] = useState<CongeAbsence[]>([]);

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const [emps, situation, liste, etatData] = await Promise.all([
        fetchEmployes(false, recherche),
        fetchSituationConges(annee, false),
        fetchConges({ recherche, inclureRefuses: true }),
        fetchEtatConges(annee, { nbAnnees, recherche, inclureRefuses }),
      ]);
      setEmployes(emps);
      setSoldes(Object.fromEntries(situation.map((s) => [s.employe_id, s])));
      setConges(liste);
      setEtat(etatData);
      setConfig(loadConfig().congies);
    } finally {
      setChargement(false);
    }
  }, [annee, recherche, nbAnnees, inclureRefuses]);

  useEffect(() => { charger(); }, [charger]);
  useEffect(() => {
    const apres = () => setFicheImpr([]);
    window.addEventListener('afterprint', apres);
    return () => window.removeEventListener('afterprint', apres);
  }, []);

  const meta = { utilisateur: user?.username || 'comptable', role: user?.role || 'Comptable' };

  // ------------------------------------------------------------------- les listes
  const enAttente = useMemo(
    () => conges.filter((c) => c.statut === 'SOUMIS' || c.statut === 'AVIS_CHF' || c.statut === 'AVIS_MEDECIN'),
    [conges]
  );
  const listeFiltree = useMemo(() => {
    let liste = conges;
    if (filtre === 'A_TRAITER') liste = liste.filter((c) => c.statut !== 'VALIDE' && c.statut !== 'REFUSE');
    else if (filtre === 'VALIDEES') liste = liste.filter((c) => c.statut === 'VALIDE');
    else if (filtre === 'REFUSEES') liste = liste.filter((c) => c.statut === 'REFUSE');
    return liste.filter((c) => Number(c.annee) === Number(annee) || (filtre === 'A_TRAITER' && c.statut !== 'VALIDE'));
  }, [conges, filtre, annee]);

  const soldesListe = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return employes
      .map((e) => ({ employe: e, solde: soldes[Number(e.id)] }))
      .filter(({ employe, solde }) => solde && (solde.nbDemandes > 0 || Number(employe.actif) === 1))
      .filter(({ employe }) => !q || String(employe.nom_prenoms || '').toLowerCase().includes(q) || String(employe.numero_matricule || '').includes(q) || String(employe.jobs || '').toLowerCase().includes(q))
      .sort((a, b) =>
        (b.solde!.attente - a.solde!.attente) ||
        (a.solde!.restant - b.solde!.restant) ||
        (Number(a.employe.numero_matricule) || 0) - (Number(b.employe.numero_matricule) || 0)
      );
  }, [employes, soldes, recherche]);

  // --------------------------------------------------------------------- actions
  const signaler = (res: { success: boolean; message?: string; avertissement?: string }, succes: string) => {
    if (!res.success) { setMessage({ type: 'err', texte: res.message || 'Opération refusée.' }); return false; }
    const texte = [succes, res.avertissement].filter(Boolean).join(' ');
    setMessage({ type: 'ok', texte });
    return true;
  };

  const imprimerFiches = (fiches: CongeAbsence[]) => {
    setFicheImpr(fiches);
    setTimeout(() => window.print(), 120);
  };

  const contactsConnus = useMemo(() => {
    const map: Record<number, string> = {};
    for (const c of conges) {
      if (c.employe_id && c.contact && !map[c.employe_id]) {
        map[c.employe_id] = c.contact;
      }
    }
    return map;
  }, [conges]);

  const recapPourFiche = useCallback((c: CongeAbsence): RecapFiche | null => {
    const s = soldes[c.employe_id];
    if (!s) return null;
    const j = joursAffiches(c);
    const estDejaDeduit = c.statut === 'VALIDE';
    const soldeAvant = c.imputation === 'CONGE' ? (estDejaDeduit ? s.restant + j : s.restant) : s.restant;
    const soldeApres = c.imputation === 'CONGE' ? (estDejaDeduit ? s.restant : s.restant - j) : s.restant;
    const permAvant = c.imputation === 'PERMISSION' ? (estDejaDeduit ? s.permRestant + j : s.permRestant) : s.permRestant;
    const permApres = c.imputation === 'PERMISSION' ? (estDejaDeduit ? s.permRestant : s.permRestant - j) : s.permRestant;
    const decAv = decomposerTitreActif(soldeAvant, s.annee, config.joursCongeParAn, s.annee_embauche, config.nbAnneesCumul);
    const decAp = decomposerTitreActif(soldeApres, s.annee, config.joursCongeParAn, s.annee_embauche, config.nbAnneesCumul);
    return {
      annee: c.annee || s.annee,
      droitConge: s.droit,
      report: s.report,
      soldeAvant,
      soldeApres,
      permDroit: s.permDroit,
      permAvant,
      permApres,
      titreAvant: decAv.titreActif,
      resteTitreAvant: decAv.resteTitreActif,
      titreApres: decAp.titreActif,
      resteTitreApres: decAp.resteTitreActif,
    };
  }, [soldes, config.joursCongeParAn, config.nbAnneesCumul]);

  const saisirOuverture = useCallback(async (
    employeId: number,
    anneeCible: number,
    valeur: number | null
  ): Promise<boolean> => {
    const res = await saisirOuverturePremiereAnnee(employeId, anneeCible, valeur, meta);
    if (!res.success) {
      setMessage({ type: 'err', texte: res.message || 'Saisie non enregistrée.' });
      return false;
    }
    await charger();
    setMessage({
      type: 'ok',
      texte: valeur === null
        ? `Solde initial ${anneeCible} rétabli au calcul automatique.`
        : `Solde initial ${anneeCible} enregistré (${encadre(valeur)} j) et répercuté sur l’état et les bulletins.`,
    });
    return true;
  }, [meta.utilisateur, meta.role, charger]);

  const enregistrer = async (
    draft: Partial<CongeAbsence>,
    options: { imprimerApres: boolean; valider: boolean }
  ): Promise<{ success: boolean; message?: string; avertissement?: string }> => {
    const estModification = Boolean(draft.id);
    const res = estModification
      ? await modifierConge(Number(draft.id), draft, meta)
      : await creerConge(draft, meta);
    if (res.success) {
      await charger();
      if (options.imprimerApres && res.id) {
        const cree = (await fetchConges({})).find((c) => Number(c.id) === Number(res.id));
        if (cree) imprimerFiches([cree]);
      }
    }
    return res;
  };

  const decider = async (c: CongeAbsence, action: 'AVIS_CHF' | 'AVIS_MEDECIN' | 'VALIDE' | 'REFUSE' | 'REOUVRIR') => {
    let motifRefus: string | undefined;
    if (action === 'REFUSE') {
      const saisie = window.prompt('Motif du refus (report sur la fiche d’absence) :', '');
      if (saisie === null) return;
      motifRefus = saisie;
    }
    const res = await deciderConge(c.id, action, { ...meta, motif: motifRefus });
    signaler(res, {
      AVIS_CHF: 'Avis du chef de service enregistré.',
      AVIS_MEDECIN: 'Avis du médecin chef enregistré.',
      VALIDE: 'Fiche validée : les jours sont déduits du solde.',
      REFUSE: 'Fiche refusée (elle reste visible, sans décompte).',
      REOUVRIR: 'Fiche rouverte, remise dans le circuit.',
    }[action]);
    await charger();
  };

  const supprimer = async (c: CongeAbsence) => {
    if (!window.confirm(`Supprimer définitivement la fiche de ${c.nom_prenoms} (${c.motif_libelle}) ?`)) return;
    const res = await supprimerConge(c.id, meta);
    signaler(res, 'Fiche supprimée.');
    await charger();
  };

  const imprimerEtat = () => {
    if (vue !== 'etat') setVue('etat');
    setTimeout(() => window.print(), 120);
  };

  const exporterJson = () => {
    const contenu = {
      type: 'salfa-conges',
      annee,
      congies: config,
      exporte_le: new Date().toISOString(),
      conges,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(contenu, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `SALFA_FICHES_ABSENCE_${annee}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalAttente = enAttente.length;
  const depassements = Object.values(soldes).filter((s) => s.restant < 0).length;

  return (
    <div className="conges-root space-y-3 w-full max-w-full overflow-x-hidden">
      {/* ---------------------------------------------------------------- barre d'outils */}
      <div className="no-print bg-white dark:bg-slate-800 p-3 sm:p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-salfa-teal dark:text-sky-300" />
            <span className="text-[11px] sm:text-xs font-bold uppercase text-slate-700 dark:text-slate-300">Exercice :</span>
            <YearSelect annee={annee} setAnnee={setAnnee} />
          </div>
          <div className="flex bg-slate-100 dark:bg-slate-700 p-0.5 rounded-lg">
            {([['suivi', 'Suivi & visas'], ['etat', 'État de contrôle']] as const).map(([cle, label]) => (
              <button key={cle} onClick={() => setVue(cle)} className={`px-2.5 sm:px-3 py-1.5 rounded-md text-[11px] sm:text-xs font-bold whitespace-nowrap ${vue === cle ? 'bg-salfa-dark dark:bg-slate-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300'}`}>
                {label}
              </button>
            ))}
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-bold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
            <FileText className="w-3.5 h-3.5" />{conges.length} fiche(s) · {totalAttente} à traiter
          </span>
          {depassements > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-bold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
              <Info className="w-3.5 h-3.5" />{depassements} solde(s) négatif(s) en {annee}
            </span>
          )}
          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full sm:w-auto sm:ml-auto">
            <button onClick={() => setModal({ ouvert: true, initial: { annee, date_demande: new Date().toISOString().slice(0, 10) } })} className="order-1 min-h-9 flex-1 sm:flex-initial bg-salfa-dark hover:bg-salfa-teal text-white px-3 py-2 rounded-lg text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1.5 shadow">
              <CalendarPlus className="w-4 h-4" />Fiche d’absence
            </button>
            <button onClick={() => setImportOuvert(true)} className="order-3 sm:order-2 min-h-9 flex-1 sm:flex-initial bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-200 px-3 py-2 rounded-lg text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1.5">
              <Upload className="w-4 h-4" />Importer contrôle
            </button>
            <button onClick={() => etat && downloadEtatCongesPDF(etat, annee)} disabled={!etat} className="order-4 sm:order-3 min-h-9 flex-1 sm:flex-initial bg-sky-700 hover:bg-sky-800 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1.5 shadow">
              <Download className="w-4 h-4" />PDF État
            </button>
            <button onClick={imprimerEtat} className="order-5 sm:order-4 min-h-9 flex-1 sm:flex-initial bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-200 px-3 py-2 rounded-lg text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1.5">
              <Printer className="w-4 h-4" />Imprimer
            </button>
            <button onClick={() => etat && exporterEtatCongesExcel(etat, annee)} disabled={!etat} className="order-2 sm:order-5 min-h-9 flex-1 sm:flex-initial bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1.5 shadow">
              <FileSpreadsheet className="w-4 h-4" />Excel
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px] sm:max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher un matricule, un nom, une fonction, un motif…"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-salfa-teal"
            />
          </div>
          <select value={filtre} onChange={(e) => setFiltre(e.target.value as FiltreListe)} className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-2 py-2 text-xs font-bold">
            <option value="A_TRAITER">À traiter ({annee} et avant)</option>
            <option value="VALIDEES">Validées {annee}</option>
            <option value="REFUSEES">Refusées {annee}</option>
            <option value="TOUTES">Toutes {annee}</option>
          </select>
          <button onClick={() => setReferentiel((v) => !v)} className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-2.5 py-2 text-xs font-bold flex items-center gap-1.5">
            <BookOpen className="w-4 h-4" />Droits & motifs
          </button>
          <button onClick={charger} className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-2.5 py-2 text-xs font-bold flex items-center gap-1.5" title="Recharger depuis le stockage local">
            <RefreshCw className={`w-4 h-4 ${chargement ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={exporterJson} className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-2.5 py-2 text-xs font-bold flex items-center gap-1.5" title="Sauvegarde JSON des fiches d'absence">
            JSON
          </button>
          {vue === 'etat' && (
            <>
              <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                Années successives
                <select value={nbAnnees} onChange={(e) => setNbAnnees(Number(e.target.value))} className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-1.5 py-1 text-xs font-bold">
                  {Array.from({ length: Math.max(1, config.nbAnneesCumul || 3) }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n === (config.nbAnneesCumul || 3) ? `${n} dernières années — Loi malgache (${anneesLoi[0]}–${anneesLoi[anneesLoi.length - 1]})` : `${n} an${n > 1 ? 's' : ''}`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 cursor-pointer">
                <input type="checkbox" checked={inclureRefuses} onChange={(e) => setInclureRefuses(e.target.checked)} className="rounded" />
                Afficher les refus
              </label>
            </>
          )}
        </div>

        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          <b>Loi malgache (Code du Travail)</b> : <b>{encadre(config.joursCongeParAn)} jours de congé par an</b>, droit cumulable uniquement sur{' '}
          <b>les {config.nbAnneesCumul} dernières années successives ({anneesLoi.join(', ')})</b> soit un plafond de <b>{encadre(config.plafondCumulConge)} jours</b>{' '}
          (les droits antérieurs non pris sont prescrits), et <b>{encadre(config.joursPermissionParAn)} jours de permission</b> par an.
        </p>
      </div>

      {message && (
        <div role="status" className={`no-print rounded-lg border px-3 py-2 text-sm flex items-start gap-2 ${
          message.type === 'ok'
            ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
            : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
        }`}>
          {message.type === 'ok' ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 shrink-0 mt-0.5" />}
          <span className="flex-1">{message.texte}</span>
          <button onClick={() => setMessage(null)} className="p-0.5 rounded hover:bg-black/5"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {referentiel && <ReferentielAbsence config={config} onClose={() => setReferentiel(false)} />}

      {/* ------------------------------------------------------------- vue « suivi » */}
      {vue === 'suivi' && (
        <div className="no-print space-y-3">
          <section className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="px-3 sm:px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-600" />
              <h3 className="text-xs sm:text-sm font-bold uppercase text-slate-700 dark:text-slate-200">Demandes en attente de visa</h3>
              <span className="text-[11px] text-slate-500">({enAttente.length})</span>
            </div>
            {enAttente.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500">Aucune fiche en attente : toutes les demandes ont été traitées.</div>
            ) : (
              <div className="table-responsive thin-scrollbar">
                <table className="w-full text-left border-collapse text-xs">
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {enAttente.map((c) => (
                      <tr key={c.id} className="hover:bg-amber-50/40 dark:hover:bg-amber-900/10">
                        <td className="py-2 px-3 w-[220px]">
                          <div className="font-bold text-slate-800 dark:text-slate-100">{c.nom_prenoms}</div>
                          <div className="text-[10px] text-slate-500">Mat. {c.numero_matricule} · {c.fonction}</div>
                        </td>
                        <td className="py-2 px-2">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${COULEUR_CATEGORIE[c.categorie]}`}>{LIBELLES_CATEGORIE[c.categorie]}</span>
                          <div className="text-[10px] text-slate-600 dark:text-slate-300 mt-0.5">{c.motif_libelle}</div>
                        </td>
                        <td className="py-2 px-2 whitespace-nowrap">
                          <div className="font-mono text-[11px]">{c.categorie === 'AJUSTEMENT' ? dateFr(c.date_debut) : periodeAbsenceFr(c.date_debut, c.date_fin)}</div>
                          <div className="text-[10px] text-slate-500">
                            {c.categorie !== 'AJUSTEMENT' && dateRetourFiche(c) ? `Reprise : ${dateFr(dateRetourFiche(c))} · ` : ''}
                            {encadre(joursAffiches(c))} j · {c.imputation === 'CONGE' ? 'congé' : c.imputation === 'PERMISSION' ? 'permission' : 'sans décompte'}
                          </div>
                        </td>
                        <td className="py-2 px-2">
                          <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-bold ${COULEUR_STATUT[c.statut]}`}>{LIBELLES_STATUT[c.statut]}</span>
                          <div className="text-[9px] text-slate-500 mt-0.5">
                            {c.visa_chef_le ? `Chef : ${c.visa_chef_le}` : 'chef : —'} · {c.visa_medecin_le ? `Médecin : ${c.visa_medecin_le}` : 'médecin : —'}
                          </div>
                        </td>
                        <td className="py-2 px-2 text-right whitespace-nowrap">
                          <div className="flex flex-wrap gap-1 justify-end">
                            {actionsAutorisees(c.statut, trouverMotif(c.motif_code)).map((action) => (
                              <button
                                key={action}
                                onClick={() => decider(c, action)}
                                className={`px-2 py-1 rounded-md text-[10px] font-bold ${
                                  action === 'VALIDE' ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                    : action === 'REFUSE' ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 hover:bg-red-100'
                                      : action === 'REOUVRIR' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200'
                                        : 'bg-sky-100 dark:bg-sky-900/30 text-sky-800 dark:text-sky-200 hover:bg-sky-200'
                                }`}
                              >
                                {{ AVIS_CHF: 'Visa chef', AVIS_MEDECIN: 'Visa médecin', VALIDE: 'Valider', REFUSE: 'Refuser', REOUVRIR: 'Rouvrir' }[action]}
                              </button>
                            ))}
                            <button onClick={() => setModal({ ouvert: true, initial: c })} className="px-2 py-1 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200" title="Modifier la fiche">
                              <Edit2 className="w-3 h-3 inline" />
                            </button>
                            <button onClick={() => downloadFicheAbsencePDF(c, recapPourFiche(c))} className="px-2 py-1 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200" title="Télécharger la fiche d’absence en PDF">
                              <Download className="w-3 h-3 inline" />
                            </button>
                            <button onClick={() => imprimerFiches([c])} className="px-2 py-1 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200" title="Imprimer la fiche d’absence">
                              <Printer className="w-3 h-3 inline" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {enAttente.length > 1 && (
              <div className="px-3 py-2 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center gap-2">
                <button onClick={() => imprimerFiches(enAttente)} className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  <Printer className="w-3.5 h-3.5" />Imprimer les {enAttente.length} fiches à faire signer
                </button>
                <span className="text-[10px] text-slate-500">Une fiche par page, à distribuer aux chefs de service.</span>
              </div>
            )}
          </section>

          {/* --------------------------------------------------- situation des droits */}
          <section className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="px-3 sm:px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center gap-2">
              <h3 className="text-xs sm:text-sm font-bold uppercase text-slate-700 dark:text-slate-200">Situation des droits — {annee}</h3>
              <span className="text-[11px] text-slate-500">({soldesListe.length} salarié(s))</span>
              <span className="ml-auto text-[10px] text-slate-500">
                Loi malgache : {config.nbAnneesCumul} dernières années ({anneesLoi.join(' · ')}, plafond {encadre(config.plafondCumulConge)} j) · Permission : {encadre(config.joursPermissionParAn)} j/an
              </span>
            </div>
            <div className="table-responsive thin-scrollbar max-h-[46vh]">
              <table className="w-full text-left border-collapse text-[11px]">
                <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200 uppercase text-[9px]">
                  <tr>
                    <th className="px-2 py-2 text-center">Mat</th>
                    <th className="px-2 py-2">Nom &amp; fonction</th>
                    {anneesLoi.map((a) => (
                      <th key={a} className="px-2 py-2 text-right" title={`Reliquat de congé sur le Titre ${a}`}>Titre {a}</th>
                    ))}
                    <th className="px-2 py-2 text-center">Titre actif</th>
                    <th className="px-2 py-2 text-right">Reste Titre</th>
                    <th className="px-2 py-2 text-right">Pris {annee}</th>
                    <th className="px-2 py-2 text-right">Attente</th>
                    <th className="px-2 py-2 text-right">Cumul ({config.nbAnneesCumul} ans)</th>
                    <th className="px-2 py-2 text-right">Perm. prise</th>
                    <th className="px-2 py-2 text-right">Perm. reste</th>
                    <th className="px-2 py-2 text-center">Examens</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {soldesListe.map(({ employe, solde }) => (
                    <tr key={employe.id} className={solde!.restant < 0 ? 'bg-red-50/60 dark:bg-red-900/10' : ''}>
                      <td className="px-2 py-1.5 text-center font-bold text-salfa-dark dark:text-white">{employe.numero_matricule}</td>
                      <td className="px-2 py-1.5">
                        <div className="font-semibold text-slate-800 dark:text-slate-100 whitespace-normal">{employe.nom_prenoms}</div>
                        <div className="text-[9px] text-slate-500 whitespace-normal">{employe.jobs || '—'} · {Number(employe.actif) === 1 ? 'actif' : 'inactif'}</div>
                      </td>
                      {anneesLoi.map((a) => {
                        const val = solde!.droitsParTitre?.[a] ?? 0;
                        const avantEmbauche = solde!.annee_embauche > 0 && a < solde!.annee_embauche && val === 0;
                        const estTitreActif = solde!.restant > 0 && a === solde!.titreActif;
                        return (
                          <td
                            key={a}
                            className={`px-2 py-1.5 text-right font-mono ${
                              avantEmbauche
                                ? 'text-slate-300 dark:text-slate-600'
                                : estTitreActif
                                  ? 'font-extrabold text-salfa-teal dark:text-sky-300 bg-sky-50/60 dark:bg-sky-900/20'
                                  : val === 0
                                    ? 'text-slate-400'
                                    : 'font-semibold text-slate-700 dark:text-slate-200'
                            }`}
                          >
                            {avantEmbauche ? '—' : encadre(val)}
                          </td>
                        );
                      })}
                      <td className="px-2 py-1.5 text-center font-mono font-bold text-salfa-teal dark:text-sky-300">{solde!.titreActif}</td>
                      <td className="px-2 py-1.5 text-right font-mono font-extrabold text-salfa-dark dark:text-white">{encadre(solde!.resteTitreActif)} j</td>
                      <td className="px-2 py-1.5 text-right font-mono">{encadre(solde!.pris)}</td>
                      <td className="px-2 py-1.5 text-right font-mono text-amber-700 dark:text-amber-300">{solde!.attente ? encadre(solde!.attente) : '·'}</td>
                      <td className={`px-2 py-1.5 text-right font-mono font-extrabold ${solde!.restant < 0 ? 'text-red-600 dark:text-red-300' : solde!.restant === 0 ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'}`}>{encadre(solde!.restant)} j</td>
                      <td className="px-2 py-1.5 text-right font-mono">{encadre(solde!.permPris)}</td>
                      <td className={`px-2 py-1.5 text-right font-mono font-bold ${solde!.permRestant < 0 ? 'text-red-600' : ''}`}>{encadre(solde!.permRestant)}</td>
                      <td className="px-2 py-1.5 text-center font-mono text-slate-500">{solde!.examenJours ? encadre(solde!.examenJours) : '·'}</td>
                      <td className="px-2 py-1.5 text-right whitespace-nowrap">
                        <button onClick={() => setModal({ ouvert: true, initial: { employe_id: Number(employe.id), annee, date_demande: new Date().toISOString().slice(0, 10) } })} className="p-1.5 rounded-md bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-200" title="Nouvelle fiche pour ce salarié">
                          <CalendarPlus className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setRecherche(String(employe.numero_matricule))} className="p-1.5 rounded-md bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-200" title="Filtrer sur ce salarié">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {soldesListe.length === 0 && (
                    <tr><td colSpan={11 + anneesLoi.length} className="py-8 text-center text-slate-500">Aucun salarié ne correspond à la recherche.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-3 py-2 border-t border-slate-200 dark:border-slate-700 text-[10px] text-slate-500">
              Conformément au <b>Code du Travail malgache</b>, le droit au congé se cumule uniquement sur <b>les {config.nbAnneesCumul} dernières années ({anneesLoi.join(', ')})</b>,
              jusqu’au plafond de {encadre(config.plafondCumulConge)} jours ; les reliquats antérieurs non consommés sont prescrits. Consommation du titre non prescrit le plus ancien en premier.
            </div>
          </section>

          {/* ------------------------------------------------------------- les fiches */}
          <section className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="px-3 sm:px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center gap-2">
              <h3 className="text-xs sm:text-sm font-bold uppercase text-slate-700 dark:text-slate-200">Fiches d’absence — {filtre === 'A_TRAITER' ? 'à traiter' : filtre.toLowerCase()}</h3>
              <span className="text-[11px] text-slate-500">({listeFiltree.length})</span>
            </div>
            <div className="table-responsive thin-scrollbar max-h-[52vh]">
              <table className="w-full text-left border-collapse text-[11px]">
                <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200 uppercase text-[9px]">
                  <tr>
                    <th className="px-2 py-2 text-center">Mat</th>
                    <th className="px-2 py-2">Salarié</th>
                    <th className="px-2 py-2">Type / motif</th>
                    <th className="px-2 py-2">Période (Du … au …)</th>
                    <th className="px-2 py-2 text-center">Daty fiverenana miasa</th>
                    <th className="px-2 py-2 text-right">Jours</th>
                    <th className="px-2 py-2 text-center">Imputation</th>
                    <th className="px-2 py-2">Remplaçant</th>
                    <th className="px-2 py-2">Situation</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {listeFiltree.map((c) => {
                    const retour = c.categorie === 'AJUSTEMENT' ? '' : dateRetourFiche(c);
                    return (
                    <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                      <td className="px-2 py-1.5 text-center font-bold">{c.numero_matricule}</td>
                      <td className="px-2 py-1.5 font-semibold whitespace-normal">{c.nom_prenoms}</td>
                      <td className="px-2 py-1.5">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold ${COULEUR_CATEGORIE[c.categorie]}`}>{LIBELLES_CATEGORIE[c.categorie]}</span>
                        <div className="text-[10px] whitespace-normal">{c.motif_libelle}{c.justificatif ? <span className="text-slate-400"> · {c.justificatif}</span> : null}</div>
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap font-mono text-[10px]">
                        {c.categorie === 'AJUSTEMENT'
                          ? (c.date_debut ? dateFr(c.date_debut) : '—')
                          : periodeAbsenceFr(c.date_debut, c.date_fin)}
                        {c.heure_debut ? <span className="text-slate-400"> ({c.heure_debut})</span> : null}
                      </td>
                      <td className="px-2 py-1.5 text-center whitespace-nowrap font-mono text-[10px] font-bold text-salfa-teal dark:text-sky-300">
                        {retour ? dateFr(retour) : '—'}
                        {c.heure_fin ? <span className="text-slate-400 font-normal"> {c.heure_fin}</span> : null}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono font-bold">
                        {encadre(joursAffiches(c))}
                        {c.jours_valides !== null && c.jours_valides !== c.jours_demandes ? <div className="text-[9px] text-slate-500 font-normal">demandé {encadre(c.jours_demandes)}</div> : null}
                      </td>
                      <td className="px-2 py-1.5 text-center text-[10px]">{c.imputation === 'CONGE' ? 'congé' : c.imputation === 'PERMISSION' ? 'permission' : '—'}</td>
                      <td className="px-2 py-1.5 whitespace-normal text-[10px]">{c.remplacant || '·'}</td>
                      <td className="px-2 py-1.5">
                        <span className={`inline-block px-2 py-0.5 rounded-full border text-[9px] font-bold ${COULEUR_STATUT[c.statut]}`}>{LIBELLES_STATUT[c.statut]}</span>
                        {aBesoinMedecin(c) && !c.visa_medecin_le && c.statut !== 'REFUSE' && (
                          <div className="text-[9px] text-amber-700 dark:text-amber-300">visa médecin attendu</div>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right whitespace-nowrap">
                        {c.categorie !== 'AJUSTEMENT' && (
                          <>
                            <button onClick={() => downloadFicheAbsencePDF(c, recapPourFiche(c))} className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700" title="Télécharger la fiche d’absence en PDF">
                              <Download className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                            </button>
                            <button onClick={() => imprimerFiches([c])} className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700" title="Imprimer la fiche d’absence">
                              <Printer className="w-3.5 h-3.5 text-slate-500" />
                            </button>
                          </>
                        )}
                        <button onClick={() => setModal({ ouvert: true, initial: c })} className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700" title="Ouvrir et modifier la fiche">
                          <PenLine className="w-3.5 h-3.5 text-slate-500" />
                        </button>
                        <button onClick={() => supprimer(c)} className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20" title="Supprimer la fiche">
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                  {listeFiltree.length === 0 && (
                    <tr><td colSpan={10} className="py-8 text-center text-slate-500">Aucune fiche dans cette situation. <button onClick={() => setModal({ ouvert: true, initial: { annee } })} className="font-bold text-salfa-teal underline">Créer la première</button></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* ------------------------------------------------------------- vue « état » */}
      {vue === 'etat' && (
        <div className="no-print bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-2 sm:p-4">
          <div className="text-center mb-3 space-y-0.5">
            <div className="text-[11px] sm:text-sm font-extrabold uppercase text-salfa-dark dark:text-white">SALFA TANAMBAO — DISPENSAIRE TOBY BETELA TOLIARA</div>
            <div className="text-sm sm:text-lg font-extrabold text-salfa-dark dark:text-white">CONTRÔLE DES CONGÉS ET PERMISSIONS</div>
            <div className="text-xs sm:text-sm font-extrabold text-salfa-teal dark:text-sky-300 uppercase tracking-wide">
              Année {annee} · {etat?.parcours.length || 0} salarié(s) · {etat?.totaux.nbDemandes || 0} demande(s)
            </div>
            {etat && etat.annees.length > 0 && (
              <div className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400">
                Première case d’année (<b>{etat.annees[0]}</b>) modifiable directement (<b>0 à {encadre(etat.config.joursCongeParAn)} j</b> — aucun cumul des congés non pris avant cette période ; valeur &lt; {encadre(etat.config.joursCongeParAn)} j possible en cas d’avance déjà consommée).
              </div>
            )}
          </div>
          {etat && (
            <EtatCongesEcran
              etat={etat}
              onOuvrir={(id) => { const c = conges.find((x) => Number(x.id) === id); if (c) setModal({ ouvert: true, initial: c }); }}
              onSaisirOuverture={saisirOuverture}
            />
          )}
          <div className="mt-2 flex flex-wrap justify-between gap-2 text-[9px] sm:text-[10px] text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-700 pt-2">
            <span>
              Lecture du classeur : solde de congé par année (colonnes {etat?.annees.join(', ')}, 1re case plafonnée à {encadre(config.joursCongeParAn)} j et modifiable) ; à droite, jours et dates de congé, puis droit de permission, jours, date, reste et motifs.
            </span>
            <span>Édité le {new Date().toLocaleDateString('fr-FR')} — CLINIQUE SALFA TANAMBAO · Gestion des Congés & Permissions</span>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ modales */}
      {modal.ouvert && (
        <div className="no-print">
          <FicheAbsenceModal
            initial={modal.initial}
            employes={employes}
            soldes={soldes}
            contactsConnus={contactsConnus}
            config={config}
            annee={annee}
            utilisateur={meta}
            onClose={() => setModal({ ouvert: false, initial: null })}
            onEnregistrer={enregistrer}
          />
        </div>
      )}
      {importOuvert && (
        <div className="no-print">
          <ImportCongesModal
            employes={employes}
            onClose={() => setImportOuvert(false)}
            onTermine={(texte) => { setImportOuvert(false); setMessage({ type: 'ok', texte }); charger(); }}
          />
        </div>
      )}

      {/* --------------------------------------------------- documents d'impression */}
      {etat && <EtatCongesImpression etat={etat} annee={annee} />}
      {ficheImpr.length > 0 && (
        <div className="fiche-print">
          {ficheImpr.map((c) => (
            <FicheAbsence key={c.id} conge={c} recap={recapPourFiche(c)} />
          ))}
        </div>
      )}
    </div>
  );
};

// ------------------------------------------------------------------------------
// Rappell du référentiel de la fiche d'absence (droits et motifs)
// ------------------------------------------------------------------------------
const ReferentielAbsence: React.FC<{ config: CongesConfig; onClose: () => void }> = ({ config, onClose }) => (
  <section className="no-print bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
    <div className="px-3 sm:px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
      <BookOpen className="w-4 h-4 text-salfa-teal" />
      <h3 className="text-xs sm:text-sm font-bold uppercase text-slate-700 dark:text-slate-200">Ce que prévoit la fiche d’absence</h3>
      <button onClick={onClose} className="ml-auto p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700"><X className="w-4 h-4 text-slate-500" /></button>
    </div>
    <div className="p-3 grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="table-responsive thin-scrollbar max-h-[40vh]">
        <table className="w-full text-left border-collapse text-[11px]">
          <thead className="sticky top-0 bg-slate-100 dark:bg-slate-700 uppercase text-[9px] text-slate-600 dark:text-slate-200">
            <tr>
              <th className="px-2 py-1.5">Catégorie</th>
              <th className="px-2 py-1.5">Anton’ny fangatahana (fiche)</th>
              <th className="px-2 py-1.5">Lecture</th>
              <th className="px-2 py-1.5 text-right">Jours prévus</th>
              <th className="px-2 py-1.5 text-center">Visa médecin</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {MOTIFS_ABSENCE.map((m) => (
              <tr key={m.code}>
                <td className="px-2 py-1"><span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold ${COULEUR_CATEGORIE[m.categorie]}`}>{LIBELLES_CATEGORIE[m.categorie]}</span></td>
                <td className="px-2 py-1 font-mono text-[10px] whitespace-normal">{m.libelleDocx}</td>
                <td className="px-2 py-1 whitespace-normal">{m.libelleFr}</td>
                <td className="px-2 py-1 text-right font-mono font-bold">{m.jours > 0 ? `${String(m.jours).padStart(2, '0')} andro` : '—'}</td>
                <td className="px-2 py-1 text-center">{m.avisMedecin ? '✔' : '·'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-2 text-[11px]">
        <div className="rounded-lg bg-slate-50 dark:bg-slate-700/40 border border-slate-200 dark:border-slate-700 p-2.5">
          <div className="font-bold uppercase text-[10px] text-slate-500 mb-1">Droits annuels appliqués</div>
          <ul className="space-y-1 list-disc pl-4">
            <li>Congé : <b>{encadre(config.joursCongeParAn)} jours par an</b>, cumulable uniquement sur <b>les {config.nbAnneesCumul} dernières années successives</b> soit un plafond de <b>{encadre(config.plafondCumulConge)} jours</b> (« 30 andro isan-taona ary tsy mihoatra ny 90 andro » — Code du Travail malgache, prescription au-delà de {config.nbAnneesCumul} ans).</li>
            <li>Permission : <b>{encadre(config.joursPermissionParAn)} jours par an</b> pour les événements 1* à 5*.</li>
            <li>Examen médical : consultation, dentaire, pré-natale sur « Taratasy fanamarihana avy @ dokotera », sans décompte.</li>
            <li>Période demandée incluse (<i>Du … au …</i>) et <b>Daty fiverenana miasa</b> ajustée automatiquement au lendemain de la fin demandée ({config.exclureDimanche ? 'dimanche non décompté' : 'dimanche décompté'}{config.exclureSamedi ? ', samedi non décompté' : ''}{config.joursFeries ? `, ${config.joursFeries.trim().split(/[\s,;]+/).length} jour(s) férié(s)` : ''}).</li>
          </ul>
        </div>
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2.5">
          <div className="font-bold uppercase text-[10px] text-slate-500 mb-1">Circuit de la fiche</div>
          <div className="flex flex-wrap items-center gap-1 text-[10px] font-bold">
            {['Ny mpangataka', 'Chef de Service', 'Médecin Chef', 'Gestionnaire'].map((etape, i, all) => (
              <React.Fragment key={etape}>
                <span className={`px-2 py-1 rounded ${i === 3 ? 'bg-salfa-dark text-white' : 'bg-slate-100 dark:bg-slate-700'}`}>{etape}</span>
                {i < all.length - 1 && <span className="text-slate-400">→</span>}
              </React.Fragment>
            ))}
          </div>
          <p className="text-[10px] text-slate-500 mt-1.5">
            Le gestionnaire (comptable) valide : les jours sont alors déduits du solde. Un motif d’hospitalisation ou un examen médical demande d’abord le visa du médecin chef.
            Les droits et le barème sont modifiables par l’administrateur (Administration → Congés & permissions).
          </p>
        </div>
      </div>
    </div>
  </section>
);

export default CongesTab;
