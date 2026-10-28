// ==============================================================================
// ONGLET 1 FUSIONNÉ - SALARIÉS & FICHES + SAISIE MENSUELLE (AVANCE / MED)
// Vue unique intégrée : la période en haut, chaque ligne = un salarié avec les
// infos de sa fiche ET la saisie directe AVANCE / MED dans le tableau.
// ==============================================================================
import React, { useState, useEffect } from 'react';
import { Employe, PaieMensuelle, TotauxMois } from '../../types';
import {
  fetchPaiesMois,
  initMoisPaie,
  savePaieSaisie,
  cloturerMois,
  deverrouillerMois,
  fetchEmployes,
  fetchEmployePaies,
  createEmploye,
  updateEmploye,
  toggleActifEmploye,
  initPaieEmploye,
} from '../../api';
import { MonetaryInput, formatSpace } from '../MonetaryInput';
import { downloadPayrollBookletPDF } from '../../pdf/bulletinsPdf';
import { ImportExcelModal } from '../ImportExcelModal';
import {
  Calendar, Lock, Unlock, RefreshCw, ShieldCheck, CheckCircle, CheckCircle2,
  Search, Plus, Edit2, UserX, UserCheck, History, X, Award, Info, Save,
  HeartHandshake, Upload, FileSpreadsheet, CalendarPlus,
} from 'lucide-react';

function fmt(val: number | undefined | null): string {
  if (val === undefined || val === null) return '0,00';
  return val.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const MOIS_LISTE = [
  'JANVIER', 'FEVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN',
  'JUILLET', 'AOUT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DECEMBRE',
];

// ------------------------------------------------------------------------------
// Cellule de saisie monétaire INLINE (validation avec Entrée ou clic hors champ)
// ------------------------------------------------------------------------------
interface InlineMoneyInputProps {
  value: number;
  disabled?: boolean;
  saving?: boolean;
  onCommit: (val: number) => void;
  className?: string;
}

const InlineMoneyInput: React.FC<InlineMoneyInputProps> = ({
  value,
  disabled = false,
  saving = false,
  onCommit,
  className = '',
}) => {
  const [focused, setFocused] = useState(false);
  const [txt, setTxt] = useState<string>(formatSpace(value || 0));

  // Resynchronise l'affichage quand la valeur sauvegardée change (hors édition)
  useEffect(() => {
    if (!focused) setTxt(formatSpace(value || 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focused]);

  const parseNum = (s: string): number => {
    const raw = s.replace(/\D/g, '');
    return raw ? parseInt(raw, 10) : 0;
  };

  const commit = () => {
    const num = parseNum(txt);
    if (num !== Number(value || 0)) {
      onCommit(num);
    } else {
      setTxt(formatSpace(value || 0));
    }
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      disabled={disabled}
      value={txt}
      onFocus={() => setFocused(true)}
      onChange={(e) => setTxt(formatSpace(parseNum(e.target.value)))}
      onBlur={() => { setFocused(false); commit(); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        } else if (e.key === 'Escape') {
          setTxt(formatSpace(value || 0));
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
        }
      }}
      className={`font-mono font-bold text-right transition ${saving ? 'opacity-50 animate-pulse' : ''} ${className}`}
    />
  );
};

interface SalariesSaisieTabProps {
  userRole?: string;
  onOpenAdmin?: () => void;
}

export const SalariesSaisieTab: React.FC<SalariesSaisieTabProps> = ({ userRole, onOpenAdmin }) => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const [mois, setMois] = useState(MOIS_LISTE[now.getMonth()]);
  const [annee, setAnnee] = useState(currentYear);
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1];

  const [paies, setPaies] = useState<PaieMensuelle[]>([]);
  const [employesById, setEmployesById] = useState<Record<number, Employe>>({});
  const [verrouille, setVerrouille] = useState(false);
  const [totaux, setTotaux] = useState<TotauxMois>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [savingId, setSavingId] = useState<number | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editEmploye, setEditEmploye] = useState<Employe | null>(null);
  const [historyEmp, setHistoryEmp] = useState<Employe | null>(null);
  const [paiesHistory, setPaiesHistory] = useState<PaieMensuelle[]>([]);
  const [accessoiresPaie, setAccessoiresPaie] = useState<PaieMensuelle | null>(null);
  const [showImport, setShowImport] = useState(false);

  const loadData = async () => {
    setLoading(true);
    const [d, emps] = await Promise.all([fetchPaiesMois(annee, mois), fetchEmployes(false, '')]);
    const map: Record<number, Employe> = {};
    for (const e of emps) map[Number(e.id)] = e;
    setEmployesById(map);
    setPaies(d.employes || []);
    setVerrouille(d.verrouille || false);
    setTotaux(d.totaux || {});
    setLoading(false);
  };
  useEffect(() => { loadData(); /* eslint-disable-next-line */ }, [mois, annee]);

  // ------------------------------------------------------------------ helpers
  const getEmployeForPaie = (p: PaieMensuelle): Employe =>
    employesById[Number(p.employe_id)] || {
      id: p.employe_id,
      numero_matricule: p.numero_matricule,
      nom_prenoms: p.nom_prenoms,
      numero_cnaps: p.numero_cnaps || '',
      categorie: p.categorie || '',
      jobs: p.jobs || '',
      date_embauche: p.date_embauche || '',
      nombre_annees: p.nombre_annees || 0,
      enfant_a_charge: p.enfant_a_charge || 0,
      base_aj: p.base_aj || 0,
      logement_transport: p.logt_trsp || 0,
      rendement: p.rendement || 0,
      responsabilite_representation: p.resp_repres || 0,
    rib: p.rib || '',
    mode_paiement: 'ESPECES',
    actif: 1,
    conge_maternite: p.conge_maternite || 0,
    date_debut_maternite: p.date_debut_maternite || '',
  };

  const isActif = (p: PaieMensuelle): boolean => {
    const emp = employesById[Number(p.employe_id)];
    return emp ? Number(emp.actif) === 1 : true;
  };

  const actifs = Object.values(employesById).filter((e) => Number(e.actif) === 1);
  const paieEmpIds = new Set(paies.map((p) => Number(p.employe_id)));
  const missingCount = actifs.filter((e) => !paieEmpIds.has(Number(e.id))).length;

  // Salariés actifs qui n'ont PAS encore de bulletin pour la période affichée
  const sansBulletin = actifs
    .filter((e) => !paieEmpIds.has(Number(e.id)))
    .filter((e) => {
      const s = search.trim().toLowerCase();
      return (
        !s ||
        String(e.nom_prenoms || '').toLowerCase().includes(s) ||
        String(e.jobs || '').toLowerCase().includes(s) ||
        String(e.categorie || '').toLowerCase().includes(s) ||
        String(e.numero_matricule || '').includes(s)
      );
    })
    .sort((a, b) => Number(a.numero_matricule) - Number(b.numero_matricule));

  const handleCreerBulletin = async (employeId: number, nom: string) => {
    if (verrouille) return;
    const res = await initPaieEmploye(employeId, annee, mois);
    if (res.created) {
      await loadData();
    } else {
      alert(`Le bulletin de ${nom} existe déjà pour ${mois} ${annee}.`);
      await loadData();
    }
  };

  const q = search.trim().toLowerCase();
  const rows = paies.filter(
    (p) =>
      !q ||
      String(p.nom_prenoms || '').toLowerCase().includes(q) ||
      String(p.jobs || '').toLowerCase().includes(q) ||
      String(p.categorie || '').toLowerCase().includes(q) ||
      String(p.numero_matricule || '').includes(q)
  );

  // ----------------------------------------------------------------- actions
  const handleInitMois = async () => {
    if (verrouille) return;
    if (!window.confirm(`Ouvrir et initialiser ${mois} ${annee} ? Les bulletins manquants des salariés actifs seront créés (AVANCE et MED à 0).`)) return;
    const res = await initMoisPaie(annee, mois);
    if (res.success) {
      alert(`${res.initializedCount} bulletin(s) initialisé(s).`);
      loadData();
    }
  };

  const handleCommit = async (p: PaieMensuelle, field: 'avance' | 'med', num: number) => {
    if (verrouille || savingId === p.id) return;
    const av = field === 'avance' ? num : Number(p.avance || 0);
    const me = field === 'med' ? num : Number(p.med || 0);
    setSavingId(p.id);
    const res = await savePaieSaisie(p.id, av, me);
    setSavingId(null);
    if (res.success) await loadData();
    else alert('Erreur sauvegarde.');
  };

  const handleCloturer = async () => {
    if (!window.confirm(`Clôturer ${mois} ${annee} ?

Un fichier PDF unique contenant tous les états, avec sa page de couverture, sera téléchargé.`)) return;
    const success = await cloturerMois(annee, mois);
    if (!success) {
      alert('La clôture a échoué. Aucun état PDF n’a été exporté.');
      return;
    }
    // Recharger les valeurs définitives avant de produire l'archive imprimable.
    const data = await fetchPaiesMois(annee, mois);
    const etats = data.employes || [];
    if (etats.length === 0) {
      alert('Période clôturée, mais aucun bulletin n’est disponible à exporter.');
    } else {
      downloadPayrollBookletPDF(etats, mois, annee);
    }
    await loadData();
  };

  const handleDeverrouiller = async () => {
    if (userRole !== 'Administrateur') {
      alert('Admin seulement.');
      return;
    }
    if (!window.confirm(`Déverrouiller ${mois} ${annee} ?`)) return;
    await deverrouillerMois(annee, mois, userRole);
    loadData();
  };

  const openFiche = (p: PaieMensuelle) => {
    setEditEmploye(getEmployeForPaie(p));
    setShowModal(true);
  };

  const openHistory = async (p: PaieMensuelle) => {
    setHistoryEmp(getEmployeForPaie(p));
    setPaiesHistory(await fetchEmployePaies(Number(p.employe_id)));
  };

  const handleToggleActif = async (p: PaieMensuelle) => {
    const emp = getEmployeForPaie(p);
    if (!window.confirm(`Confirmer ${Number(emp.actif) === 1 ? 'désactiver' : 'réactiver'} ${emp.nom_prenoms} ?`)) return;
    await toggleActifEmploye(Number(emp.id), Number(emp.actif) === 0);
    loadData();
  };

  const isMaternite = (p: PaieMensuelle) =>
    p.conge_maternite === 1 || (p.conge_maternite as any) === true;

  const badges = (p: PaieMensuelle) => {
    return (
      <>
        {isMaternite(p) && (
          <span title="Congé de maternité (3 mois, base brute à 50%)" className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full bg-pink-100 dark:bg-pink-900/40 text-pink-800 dark:text-pink-200 font-bold uppercase shrink-0 ring-1 ring-pink-300 dark:ring-pink-700">
            <HeartHandshake className="w-2.5 h-2.5" />Maternité · 3 mois
          </span>
        )}
        {!isActif(p) && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold uppercase shrink-0">Départ</span>
        )}
      </>
    );
  };

  // ------------------------------------------------------------------- rendu
  return (
    <div className="space-y-3 sm:space-y-6 w-full max-w-full overflow-x-hidden">
      {/* Astuce + bouton admin */}
      <div className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-xl p-2.5 sm:p-3 text-[11px] sm:text-xs text-salfa-dark dark:text-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
        <div className="flex items-start sm:items-center gap-2">
          <Info className="w-4 h-4 text-salfa-teal dark:text-sky-300 shrink-0 mt-0.5 sm:mt-0" />
          <span>
            <b>Astuce :</b> saisissez <b>AVANCE</b> et <b>MED</b> directement dans le tableau (touche <b>Entrée</b> ou clic hors du champ pour valider). Double-cliquez sur une ligne pour ouvrir la fiche du salarié.
          </span>
        </div>
        {userRole === 'Administrateur' && onOpenAdmin && (
          <button onClick={onOpenAdmin} className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-lg font-bold text-xs shrink-0 shadow w-full sm:w-auto justify-center">
            <ShieldCheck className="w-4 h-4" /><span>Admin : Formules, IRSA & Colonnes</span>
          </button>
        )}
      </div>

      {/* Barre période + clôture */}
      <div className="bg-white dark:bg-slate-800 p-3 sm:p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col gap-3 w-full">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-salfa-teal dark:text-sky-300" />
            <span className="text-[11px] sm:text-xs font-bold uppercase text-slate-700 dark:text-slate-300 hidden xs:inline">Période :</span>
            <select value={mois} onChange={(e) => setMois(e.target.value)} className="rounded-lg border dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-bold">
              {MOIS_LISTE.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <select value={annee} onChange={(e) => setAnnee(Number(e.target.value))} className="rounded-lg border dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-bold">
              {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <button onClick={handleInitMois} disabled={verrouille} className="bg-sky-100 dark:bg-sky-900/30 hover:bg-sky-200 dark:hover:bg-sky-800 text-salfa-teal dark:text-sky-300 disabled:opacity-50 px-2.5 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /><span className="hidden xs:inline">Ouvrir / Initialiser</span><span className="xs:hidden">Init</span>
          </button>
          {verrouille
            ? <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-bold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800"><Lock className="w-3.5 h-3.5" />CLÔTURÉ</span>
            : <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-bold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"><Unlock className="w-3.5 h-3.5" />OUVERT</span>}
          {missingCount > 0 && paies.length > 0 && (
            <button onClick={handleInitMois} disabled={verrouille} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700 hover:bg-amber-200 dark:hover:bg-amber-800/50 disabled:opacity-50">
              <Info className="w-3.5 h-3.5" />{missingCount} actif(s) sans bulletin — initialiser
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
          {!verrouille
            ? <button onClick={handleCloturer} className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow"><CheckCircle className="w-4 h-4" /><span>Clôturer / Valider</span></button>
            : userRole === 'Administrateur' && <button onClick={handleDeverrouiller} className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow"><ShieldCheck className="w-4 h-4" /><span>Déverrouiller (Admin)</span></button>}
        </div>
      </div>

      {/* Barre recherche + nouveau salarié */}
      <div className="bg-white dark:bg-slate-800 p-3 sm:p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full">
        <div className="relative flex-1 max-w-full sm:max-w-md w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Matricule, nom, fonction..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-salfa-teal"
          />
        </div>
        <div className="flex flex-col sm:flex-row gap-2 shrink-0 w-full sm:w-auto">
          <button onClick={() => setShowImport(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 shadow-sm w-full sm:w-auto">
            <Upload className="w-4 h-4" /><span>Importer Excel</span>
          </button>
          <button onClick={() => { setEditEmploye(null); setShowModal(true); }} className="bg-salfa-dark dark:bg-slate-700 hover:bg-salfa-teal dark:hover:bg-slate-600 text-white px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 shadow-sm w-full sm:w-auto">
            <Plus className="w-4 h-4" /><span>Nouveau Salarié</span>
          </button>
        </div>
      </div>

      {/* ------------------------- VERSION MOBILE : cartes ------------------------- */}
      <div className="block lg:hidden space-y-2 w-full">
        {loading ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 text-center text-sm text-slate-500 border dark:border-slate-700">Chargement...</div>
        ) : rows.length === 0 && sansBulletin.length === 0 ? (
          <EmptyState search={q} mois={mois} annee={annee} verrouille={verrouille} onInit={handleInitMois} />
        ) : rows.map((p) => (
          <div key={p.id} onDoubleClick={() => openFiche(p)} className={`rounded-xl border p-3 shadow-sm w-full ${isMaternite(p) ? 'bg-pink-50 dark:bg-pink-950/30 border-pink-300 dark:border-pink-800 ring-1 ring-pink-200 dark:ring-pink-900' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-salfa-dark dark:text-white text-sm">Mat {p.numero_matricule}</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-900/30 text-salfa-teal dark:text-sky-300">{p.categorie || '—'}</span>
                  {badges(p)}
                </div>
                <div className="font-semibold text-slate-800 dark:text-slate-100 text-sm truncate mt-1">{p.nom_prenoms}</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{p.jobs || '—'}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">NET À PAYER</div>
                <div className="font-mono font-extrabold text-emerald-700 dark:text-emerald-400 text-sm">{fmt(p.net)}</div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-1.5 mt-2.5">
              <div className={`rounded-lg p-1.5 text-center ${isMaternite(p) ? 'bg-white/70 dark:bg-slate-800/60' : 'bg-slate-50 dark:bg-slate-700/50'}`}><div className="text-[9px] text-slate-500 dark:text-slate-400 uppercase">Brut</div><div className="font-mono text-[11px] font-bold dark:text-slate-200">{fmt(p.brut)}</div></div>
              <div className={`rounded-lg p-1.5 text-center ${isMaternite(p) ? 'bg-white/70 dark:bg-slate-800/60' : 'bg-slate-50 dark:bg-slate-700/50'}`}><div className="text-[9px] text-slate-500 dark:text-slate-400 uppercase">Net base</div><div className="font-mono text-[11px] font-bold dark:text-slate-200">{fmt(p.salaire_net)}</div></div>
              <div className={`rounded-lg p-1.5 text-center ${isMaternite(p) ? 'bg-white/70 dark:bg-slate-800/60' : 'bg-slate-50 dark:bg-slate-700/50'}`}><div className="text-[9px] text-slate-500 dark:text-slate-400 uppercase">Access.</div><div className="font-mono text-[11px] font-bold dark:text-slate-200">{fmt(p.accessoir)}</div></div>
              <div className={`rounded-lg p-1.5 text-center ${isMaternite(p) ? 'bg-white/70 dark:bg-slate-800/60' : 'bg-slate-50 dark:bg-slate-700/50'}`}><div className="text-[9px] text-slate-500 dark:text-slate-400 uppercase">Base AJ</div><div className="font-mono text-[11px] font-bold dark:text-slate-200">{fmt(p.base_aj)}</div></div>
            </div>

            {/* Saisie directe AVANCE / MED */}
            <div className="grid grid-cols-2 gap-1.5 mt-2">
              <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-1.5 border border-red-100 dark:border-red-900/40">
                <div className="text-[9px] font-bold text-red-600 dark:text-red-300 uppercase mb-1">AVANCE</div>
                <InlineMoneyInput
                  value={Number(p.avance || 0)}
                  disabled={verrouille}
                  saving={savingId === p.id}
                  onCommit={(n) => handleCommit(p, 'avance', n)}
                  className="w-full bg-white dark:bg-slate-700 border border-red-200 dark:border-red-800 rounded-md px-2 py-1.5 text-xs text-red-700 dark:text-red-200 disabled:opacity-60"
                />
              </div>
              <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-1.5 border border-red-100 dark:border-red-900/40">
                <div className="text-[9px] font-bold text-red-600 dark:text-red-300 uppercase mb-1">MED</div>
                <InlineMoneyInput
                  value={Number(p.med || 0)}
                  disabled={verrouille}
                  saving={savingId === p.id}
                  onCommit={(n) => handleCommit(p, 'med', n)}
                  className="w-full bg-white dark:bg-slate-700 border border-red-200 dark:border-red-800 rounded-md px-2 py-1.5 text-xs text-red-700 dark:text-red-200 disabled:opacity-60"
                />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-1.5 mt-2">
              <button onClick={() => openFiche(p)} className="flex items-center justify-center gap-1 px-1 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-[10px] font-bold"><Edit2 className="w-3.5 h-3.5" />Fiche</button>
              <button onClick={() => !verrouille && setAccessoiresPaie(p)} disabled={verrouille} className="flex items-center justify-center gap-1 px-1 py-2 rounded-lg bg-sky-50 dark:bg-sky-900/30 hover:bg-sky-100 text-salfa-teal dark:text-sky-300 text-[10px] font-bold disabled:opacity-50"><Plus className="w-3.5 h-3.5" />Access.</button>
              <button onClick={() => openHistory(p)} className="flex items-center justify-center gap-1 px-1 py-2 rounded-lg bg-sky-50 dark:bg-sky-900/30 hover:bg-sky-100 text-salfa-teal dark:text-sky-300 text-[10px] font-bold"><History className="w-3.5 h-3.5" />Histor.</button>
              <button onClick={() => handleToggleActif(p)} className={`flex items-center justify-center gap-1 px-1 py-2 rounded-lg text-[10px] font-bold ${isActif(p) ? 'bg-red-50 dark:bg-red-900/20 hover:bg-red-100 text-red-600 dark:text-red-300' : 'bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 text-emerald-600 dark:text-emerald-300'}`}>{isActif(p) ? <><UserX className="w-3.5 h-3.5" />Désact.</> : <><UserCheck className="w-3.5 h-3.5" />Réact.</>}</button>
            </div>
          </div>
        ))}

        {/* Salariés actifs n'ayant pas encore de bulletin pour la période */}
        {sansBulletin.map((e) => (
          <div key={`sans-${e.id}`} className="rounded-xl border border-dashed border-amber-300 dark:border-amber-700 bg-amber-50/60 dark:bg-amber-900/10 p-3 shadow-sm w-full">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-salfa-dark dark:text-white text-sm">Mat {e.numero_matricule}</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-900/30 text-salfa-teal dark:text-sky-300">{e.categorie || '—'}</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-200 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 font-bold uppercase">Sans bulletin</span>
                </div>
                <div className="font-semibold text-slate-800 dark:text-slate-100 text-sm truncate mt-1">{e.nom_prenoms}</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{e.jobs || '—'}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">BASE AJ</div>
                <div className="font-mono font-bold text-slate-700 dark:text-slate-200 text-sm">{fmt(e.base_aj)}</div>
              </div>
            </div>
            <button
              onClick={() => handleCreerBulletin(Number(e.id), e.nom_prenoms)}
              disabled={verrouille}
              className="mt-2 w-full flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-[11px] font-bold"
            >
              <CalendarPlus className="w-3.5 h-3.5" />Créer le bulletin {mois} {annee}
            </button>
          </div>
        ))}
      </div>

      {/* ------------------------- VERSION DESKTOP : table ------------------------- */}
      <div className="hidden lg:block bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden w-full">
        <div className="table-responsive thin-scrollbar max-h-[62vh] lg:max-h-[64vh]">
          <table className="w-full text-left border-collapse min-w-[1580px]">
            <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-700">
              <tr className="border-b border-slate-200 dark:border-slate-600 text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                <th className="py-3 px-3 text-center">N° Mat</th>
                <th className="py-3 px-4">Nom et Prénoms</th>
                <th className="py-3 px-2 text-center">CAT</th>
                <th className="py-3 px-3">Jobs</th>
                <th className="py-3 px-3">Mode / RIB</th>
                <th className="py-3 px-3 text-right">Brut</th>
                <th className="py-3 px-3 text-right">CNaPS</th>
                <th className="py-3 px-3 text-right">IRSA</th>
                <th className="py-3 px-3 text-right">Net base</th>
                <th className="py-3 px-3 text-right">Access.</th>
                <th className="py-3 px-3 text-right font-bold">BRUT</th>
                <th className="py-3 px-3 text-right text-red-600 dark:text-red-400">AVANCE ✎</th>
                <th className="py-3 px-3 text-right text-red-600 dark:text-red-400">MED ✎</th>
                <th className="py-3 px-4 text-right bg-salfa-light/60 dark:bg-slate-600 font-bold text-salfa-dark dark:text-white">NET À PAYER</th>
                <th className="py-3 px-2 text-center">Statut</th>
                <th className="py-3 px-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700 text-sm dark:text-slate-200">
              {loading ? (
                <tr><td colSpan={16} className="py-8 text-center text-slate-500">Chargement...</td></tr>
              ) : rows.length === 0 && sansBulletin.length === 0 ? (
                <tr>
                  <td colSpan={16} className="py-8 text-center text-slate-500">
                    {q ? 'Aucun salarié ne correspond à la recherche.' : `Aucun bulletin pour ${mois} ${annee}. Cliquez sur « Ouvrir / Initialiser » pour générer les bulletins des salariés actifs.`}
                  </td>
                </tr>
              ) : rows.map((p) => (
                <tr key={p.id} onDoubleClick={() => openFiche(p)} className={`cursor-pointer transition ${isMaternite(p) ? 'bg-pink-50/80 dark:bg-pink-950/20 hover:bg-pink-100/80 dark:hover:bg-pink-900/30 border-l-4 border-l-pink-400 dark:border-l-pink-600' : 'hover:bg-sky-50/70 dark:hover:bg-slate-700/50'}`}>
                  <td className="py-2.5 px-3 text-center font-bold text-salfa-dark dark:text-white">{p.numero_matricule}</td>
                  <td className="py-2.5 px-4 font-semibold text-slate-800 dark:text-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="truncate max-w-[180px]">{p.nom_prenoms}</span>
                      {badges(p)}
                    </div>
                  </td>
                  <td className="py-2.5 px-2 text-center text-xs font-bold text-salfa-teal dark:text-sky-300">{p.categorie || '—'}</td>
                  <td className="py-2.5 px-3 text-xs truncate max-w-[120px]">{p.jobs || '—'}</td>
                  <td className="py-2.5 px-3 text-xs">
                    <div className="font-semibold">{getEmployeForPaie(p).mode_paiement || '—'}</div>
                    <div className="font-mono text-slate-500 dark:text-slate-400 text-[11px] truncate max-w-[110px]">{p.rib || 'Aucun'}</div>
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono">{fmt(p.salaire_brut)}</td>
                  <td className="py-2.5 px-3 text-right font-mono text-xs">{fmt(p.cnaps)}</td>
                  <td className="py-2.5 px-3 text-right font-mono text-xs">{fmt(p.irsa)}</td>
                  <td className="py-2.5 px-3 text-right font-mono">{fmt(p.salaire_net)}</td>
                  <td className="py-2.5 px-3 text-right font-mono">{fmt(p.accessoir)}</td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold">{fmt(p.brut)}</td>
                  <td className="py-1.5 px-2 bg-red-50/40 dark:bg-red-900/10" onDoubleClick={(e) => e.stopPropagation()}>
                    <InlineMoneyInput
                      value={Number(p.avance || 0)}
                      disabled={verrouille}
                      saving={savingId === p.id}
                      onCommit={(n) => handleCommit(p, 'avance', n)}
                      className="w-28 rounded-md border border-red-200 dark:border-red-800 bg-white dark:bg-slate-700 px-2 py-1.5 text-xs text-red-700 dark:text-red-200 focus:outline-none focus:ring-2 focus:ring-red-400 disabled:opacity-60 disabled:bg-transparent disabled:border-transparent"
                    />
                  </td>
                  <td className="py-1.5 px-2 bg-red-50/40 dark:bg-red-900/10" onDoubleClick={(e) => e.stopPropagation()}>
                    <InlineMoneyInput
                      value={Number(p.med || 0)}
                      disabled={verrouille}
                      saving={savingId === p.id}
                      onCommit={(n) => handleCommit(p, 'med', n)}
                      className="w-28 rounded-md border border-red-200 dark:border-red-800 bg-white dark:bg-slate-700 px-2 py-1.5 text-xs text-red-700 dark:text-red-200 focus:outline-none focus:ring-2 focus:ring-red-400 disabled:opacity-60 disabled:bg-transparent disabled:border-transparent"
                    />
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono font-bold text-emerald-700 dark:text-emerald-400 bg-salfa-light/60 dark:bg-slate-700/60">{fmt(p.net)}</td>
                  <td className="py-2.5 px-2 text-center">
                    {isActif(p)
                      ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300"><CheckCircle2 className="w-3 h-3" />Actif</span>
                      : <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">Départ</span>}
                  </td>
                  <td className="py-2.5 px-3 text-center" onDoubleClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1">
                      <button title="Modifier la fiche" onClick={(e) => { e.stopPropagation(); openFiche(p); }} className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300"><Edit2 className="w-4 h-4" /></button>
                      <button title="Accessoires (primes)" onClick={(e) => { e.stopPropagation(); if (!verrouille) setAccessoiresPaie(p); }} disabled={verrouille} className="px-1.5 py-1.5 rounded hover:bg-sky-100 dark:hover:bg-slate-600 text-salfa-teal dark:text-sky-300 text-[10px] font-extrabold disabled:opacity-40">+Acc.</button>
                      <button title="Historique des paies" onClick={async (e) => { e.stopPropagation(); await openHistory(p); }} className="p-1.5 rounded hover:bg-sky-100 dark:hover:bg-slate-600 text-salfa-teal dark:text-sky-300"><History className="w-4 h-4" /></button>
                      <button title={isActif(p) ? 'Désactiver' : 'Réactiver'} onClick={async (e) => { e.stopPropagation(); await handleToggleActif(p); }} className={`p-1.5 rounded ${isActif(p) ? 'hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400' : 'hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'}`}>{isActif(p) ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}</button>
                    </div>
                  </td>
                </tr>
              ))}
              {/* Salariés actifs sans bulletin pour la période affichée */}
              {!loading && sansBulletin.map((e) => (
                <tr key={`sans-${e.id}`} className="bg-amber-50/50 dark:bg-amber-900/10 border-l-4 border-l-amber-400 dark:border-l-amber-600">
                  <td className="py-2.5 px-3 text-center font-bold text-salfa-dark dark:text-white">{e.numero_matricule}</td>
                  <td className="py-2.5 px-4 font-semibold text-slate-800 dark:text-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="truncate max-w-[180px]">{e.nom_prenoms}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-200 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 font-bold uppercase shrink-0">Sans bulletin</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-2 text-center text-xs font-bold text-salfa-teal dark:text-sky-300">{e.categorie || '—'}</td>
                  <td className="py-2.5 px-3 text-xs truncate max-w-[120px]">{e.jobs || '—'}</td>
                  <td className="py-2.5 px-3 text-xs">
                    <div className="font-semibold">{e.mode_paiement || '—'}</div>
                    <div className="font-mono text-slate-500 dark:text-slate-400 text-[11px] truncate max-w-[110px]">{e.rib || 'Aucun'}</div>
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono">{fmt(e.base_aj)}</td>
                  <td colSpan={10} className="py-2.5 px-3 text-center text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                    Aucun bulletin pour {mois} {annee} — cliquez sur « Créer » pour générer sa paie
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <button
                      onClick={() => handleCreerBulletin(Number(e.id), e.nom_prenoms)}
                      disabled={verrouille}
                      title={`Créer le bulletin de ${mois} ${annee}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-[10px] font-bold whitespace-nowrap"
                    >
                      <CalendarPlus className="w-3.5 h-3.5" />Créer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Totaux */}
      <div className="bg-salfa-dark dark:bg-slate-800 text-white p-3 sm:p-4 rounded-xl shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs font-semibold border dark:border-slate-700">
        <div className="text-[11px] sm:text-xs">Totaux {mois} {annee} : <span className="text-sky-300 font-bold">{totaux.count_employes || 0} salariés</span></div>
        <div className="flex flex-wrap gap-2 sm:gap-4 font-mono text-[11px] sm:text-xs w-full sm:w-auto">
          <div>BRUT : <span className="font-bold">{fmt(totaux.total_brut)}</span></div>
          <div>AVANCE : <span className="text-red-300 font-bold">{fmt(totaux.total_avance)}</span></div>
          <div>MED : <span className="text-red-300 font-bold">{fmt(totaux.total_med)}</span></div>
          <div className="bg-salfa-teal dark:bg-slate-600 px-2.5 sm:px-3 py-1 rounded w-full sm:w-auto text-center">NET À PAYER : <span className="font-bold">{fmt(totaux.total_net)}</span></div>
        </div>
      </div>

      {/* Modales */}
      {showModal && (
        <EmployeModalForm
          employe={editEmploye}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); loadData(); }}
        />
      )}
      {historyEmp && <EmployeHistoryModal employe={historyEmp} paies={paiesHistory} onClose={() => setHistoryEmp(null)} />}
      {accessoiresPaie && (
        <AccessoiresModalForm
          paie={accessoiresPaie}
          onClose={() => setAccessoiresPaie(null)}
          onSaved={() => { setAccessoiresPaie(null); loadData(); }}
        />
      )}
      {showImport && (
        <ImportExcelModal
          anneeDefaut={annee}
          onClose={() => { setShowImport(false); loadData(); }}
          onImported={(rap) => {
            // Se positionner sur la dernière période présente dans le classeur
            const derniere = rap.periodes[rap.periodes.length - 1];
            if (derniere) {
              setAnnee(derniere.annee);
              setMois(derniere.mois);
            }
          }}
        />
      )}
    </div>
  );
};

// ------------------------------------------------------------------------------
// État vide (mobile) : mois non initialisé
// ------------------------------------------------------------------------------
const EmptyState: React.FC<{ search: string; mois: string; annee: number; verrouille: boolean; onInit: () => void }> = ({ search, mois, annee, verrouille, onInit }) => (
  <div className="bg-white dark:bg-slate-800 rounded-xl p-6 text-center border dark:border-slate-700 space-y-3">
    {search ? (
      <div className="text-sm text-slate-500">Aucun salarié ne correspond à la recherche.</div>
    ) : (
      <>
        <div className="text-sm text-slate-600 dark:text-slate-300">Aucun bulletin pour <b>{mois} {annee}</b>.</div>
        {!verrouille && (
          <button onClick={onInit} className="inline-flex items-center gap-2 bg-sky-100 dark:bg-sky-900/30 hover:bg-sky-200 text-salfa-teal dark:text-sky-300 px-4 py-2 rounded-lg text-xs font-bold">
            <RefreshCw className="w-4 h-4" />Ouvrir / Initialiser le mois
          </button>
        )}
      </>
    )}
  </div>
);

// ------------------------------------------------------------------------------
// MODALE - FICHE SALARIÉ (création / modification)
// ------------------------------------------------------------------------------
interface ModalFormProps { employe: Employe | null; onClose: () => void; onSaved: () => void; }

const EmployeModalForm: React.FC<ModalFormProps> = ({ employe, onClose, onSaved }) => {
  const [form, setForm] = useState({
    numero_matricule: employe?.numero_matricule || '',
    nom_prenoms: employe?.nom_prenoms || '',
    numero_cnaps: employe?.numero_cnaps || '',
    categorie: employe?.categorie || '',
    jobs: employe?.jobs || '',
    date_embauche: employe?.date_embauche || '',
    enfant_a_charge: employe?.enfant_a_charge || 0,
    base_aj: employe?.base_aj || 0,
    logement_transport: employe?.logement_transport || 0,
    rendement: employe?.rendement || 0,
    responsabilite_representation: employe?.responsabilite_representation || 0,
    rib: employe?.rib || '',
    mode_paiement: employe?.mode_paiement || 'ESPECES',
    conge_maternite: employe ? (employe.conge_maternite === 1 || employe.conge_maternite === true) : false,
    date_debut_maternite: employe?.date_debut_maternite || '',
    actif: employe ? employe.actif : 1,
  });
  const [saving, setSaving] = useState(false);
  const calculateAncYear = (d: string) => { if (!d) return 0; try { const y = parseInt(d.split('-')[0] || d.split('/')[2] || '0', 10); if (y > 1900 && y <= 2026) return Math.max(0, 2026 - y); } catch { /* ignore */ } return 0; };
  const ancYears = calculateAncYear(form.date_embauche);
  const getIndice = (y: number) => { if (y < 2) return 1.00; if (y < 4) return 1.09; if (y < 6) return 1.18; if (y < 8) return 1.27; if (y < 10) return 1.36; if (y < 12) return 1.45; if (y < 14) return 1.53; if (y < 16) return 1.60; if (y < 18) return 1.65; if (y < 20) return 1.68; return 1.70; };
  const indice = getIndice(ancYears);
  const baseReval = Math.round(Number(form.base_aj || 0) * indice * 100) / 100;
  const baseBruteNormale = Number(form.base_aj || 0) + Number(form.logement_transport || 0) + Number(form.rendement || 0) + Number(form.responsabilite_representation || 0);
  const baseBrutAffichee = form.conge_maternite ? baseBruteNormale / 2.0 : baseBruteNormale;

  // Période de 3 mois couverte par le congé maternité
  const MOIS_LIB = ['JANVIER','FEVRIER','MARS','AVRIL','MAI','JUIN','JUILLET','AOUT','SEPTEMBRE','OCTOBRE','NOVEMBRE','DECEMBRE'];
  const periodeMaternite = (() => {
    if (!form.conge_maternite || !form.date_debut_maternite) return null;
    const parts = String(form.date_debut_maternite).split('-');
    if (parts.length < 2) return null;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    if (!y || m < 0) return null;
    const debut = MOIS_LIB[m] + ' ' + y;
    const finIdx = y * 12 + m + 2;
    const fin = MOIS_LIB[finIdx % 12] + ' ' + Math.floor(finIdx / 12);
    return { debut, fin };
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const dataToSend = {
      ...form,
      numero_matricule: Number(form.numero_matricule),
      base_aj: Number(form.base_aj),
      logement_transport: Number(form.logement_transport),
      rendement: Number(form.rendement),
      responsabilite_representation: Number(form.responsabilite_representation),
      enfant_a_charge: Number(form.enfant_a_charge),
      conge_maternite: form.conge_maternite ? 1 : 0,
    };
    let ok = false;
    if (employe) ok = await updateEmploye(employe.id, dataToSend);
    else ok = await createEmploye(dataToSend);
    setSaving(false);
    if (ok) onSaved();
    else alert('Erreur enregistrement.');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 dark:border-slate-700 modal-mobile max-h-[95dvh] flex flex-col">
        <div className="bg-salfa-dark dark:bg-slate-900 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between text-white shrink-0">
          <h3 className="text-sm sm:text-lg font-bold truncate">{employe ? `Modifier Mat ${employe.numero_matricule}` : 'Nouveau Salarié'}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10 shrink-0"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto thin-scrollbar">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {[
              { label: 'N° Matricule *', key: 'numero_matricule', type: 'number', required: true },
              { label: 'NOM ET PRENOMS *', key: 'nom_prenoms', type: 'text', required: true },
              { label: 'N° CNaPS', key: 'numero_cnaps', type: 'text' },
              { label: 'Catégorie', key: 'categorie', type: 'text' },
              { label: 'Fonction (JOBS)', key: 'jobs', type: 'text' },
              { label: 'Date embauche', key: 'date_embauche', type: 'text' },
              { label: 'Enfants à charge', key: 'enfant_a_charge', type: 'number' },
            ].map((f) => (
              <div key={f.key}>
                <label className="block text-xs font-bold uppercase mb-1 dark:text-slate-300">{f.label}</label>
                <input type={f.type} value={(form as any)[f.key]} onChange={(e) => setForm({ ...form, [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value })} required={!!f.required} className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm" />
              </div>
            ))}
            <div><label className="block text-xs font-bold uppercase mb-1 dark:text-slate-300">Mode règlement</label><select value={form.mode_paiement} onChange={(e) => setForm({ ...form, mode_paiement: e.target.value })} className="w-full rounded-lg border bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm"><option value="ESPECES">ESPECES</option><option value="VIREMENT">VIREMENT</option></select></div>
            <div><label className="block text-xs font-bold uppercase mb-1 dark:text-slate-300">BASE AJ</label><MonetaryInput value={form.base_aj} onChange={(num) => setForm({ ...form, base_aj: num })} className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm" /></div>
            <div><label className="block text-xs font-bold uppercase mb-1 dark:text-slate-300">Logt/Trsp</label><MonetaryInput value={form.logement_transport} onChange={(num) => setForm({ ...form, logement_transport: num })} className="w-full rounded-lg border bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm" /></div>
            <div><label className="block text-xs font-bold uppercase mb-1 dark:text-slate-300">Prime Rendement</label><MonetaryInput value={form.rendement} onChange={(num) => setForm({ ...form, rendement: num })} className="w-full rounded-lg border bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm" /></div>
            <div><label className="block text-xs font-bold uppercase mb-1 dark:text-slate-300">RESP REPRES</label><MonetaryInput value={form.responsabilite_representation} onChange={(num) => setForm({ ...form, responsabilite_representation: num })} className="w-full rounded-lg border bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm" /></div>
          </div>
          <div><label className="block text-xs font-bold uppercase mb-1 dark:text-slate-300">RIB</label><input type="text" value={form.rib} onChange={(e) => setForm({ ...form, rib: e.target.value })} className="w-full rounded-lg border bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm font-mono" /></div>
          <div className="p-3 sm:p-4 rounded-xl bg-pink-50 dark:bg-pink-900/20 border-2 border-pink-200 dark:border-pink-800 space-y-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.conge_maternite}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setForm({
                    ...form,
                    conge_maternite: checked,
                    date_debut_maternite: checked ? (form.date_debut_maternite || new Date().toISOString().slice(0, 10)) : '',
                  });
                }}
                className="mt-0.5 rounded text-pink-600 w-4 h-4"
              />
              <div className="text-xs">
                <span className="font-extrabold text-pink-900 dark:text-pink-300 block">Congé de Maternité (3 mois — base brute à 50%)</span>
                <span className="text-slate-600 dark:text-slate-400 block">
                  La personne est <b>mise en évidence</b> et sa base brute passe à <b className="text-pink-800 dark:text-pink-300 font-mono">{fmt(baseBrutAffichee)}</b> au lieu de {fmt(baseBruteNormale)} pendant la durée du congé.
                </span>
              </div>
            </label>
            {form.conge_maternite && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-7">
                <div>
                  <label className="block text-[11px] font-bold uppercase mb-1 text-pink-900 dark:text-pink-300">Date de début du congé</label>
                  <input
                    type="date"
                    value={form.date_debut_maternite}
                    onChange={(e) => setForm({ ...form, date_debut_maternite: e.target.value })}
                    className="w-full rounded-lg border border-pink-300 dark:border-pink-700 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex items-end">
                  <div className="w-full rounded-lg bg-white/70 dark:bg-slate-800/60 border border-pink-200 dark:border-pink-800 px-3 py-2 text-[11px] text-pink-900 dark:text-pink-200">
                    <b>Durée :</b> 3 mois (mois du début inclus).
                    {periodeMaternite && (
                      <div className="mt-0.5 font-mono">Période : <b>{periodeMaternite.debut}</b> → <b>{periodeMaternite.fin}</b></div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="p-3 sm:p-4 rounded-xl bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 text-xs space-y-1 dark:text-slate-300">
            <div className="font-bold text-salfa-teal dark:text-sky-300 flex items-center gap-1.5"><Award className="w-4 h-4" /><span>Ancienneté:</span></div>
            <div>Ancienneté: <b>{ancYears} ans</b> | Indice: <b>x{indice.toFixed(2)}</b></div>
            <div>Base revalorisée: <b className="text-sm">{fmt(baseReval)}</b></div>
          </div>
          {!employe && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-300">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Après l'enregistrement, cliquez sur <b>« Ouvrir / Initialiser »</b> pour générer le bulletin de ce salarié pour le mois affiché.</span>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-3 border-t dark:border-slate-700">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:text-slate-200 text-sm font-semibold">Annuler</button>
            <button type="submit" disabled={saving} className="px-6 py-2 rounded-lg bg-salfa-dark dark:bg-slate-600 hover:bg-salfa-teal text-white text-sm font-bold shadow">{saving ? '...' : 'Enregistrer'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------------------
// MODALE - HISTORIQUE DES PAIES D'UN SALARIÉ
// ------------------------------------------------------------------------------
interface HistoryModalProps { employe: Employe; paies: PaieMensuelle[]; onClose: () => void; }

const EmployeHistoryModal: React.FC<HistoryModalProps> = ({ employe, paies, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden border dark:border-slate-700 modal-mobile max-h-[95dvh] flex flex-col">
        <div className="bg-salfa-dark dark:bg-slate-900 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between text-white shrink-0">
          <div className="min-w-0">
            <h3 className="text-sm sm:text-lg font-bold truncate">Historique — Mat {employe.numero_matricule} : {employe.nom_prenoms}</h3>
            <p className="text-xs text-slate-300 truncate">{employe.jobs} | {employe.categorie}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10 shrink-0 ml-2"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-3 sm:p-6 overflow-y-auto thin-scrollbar">
          {paies.length === 0 ? <div className="text-center py-8 text-slate-500 text-sm">Aucun bulletin.</div> : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:hidden">
                {paies.map((p) => (<div key={p.id} className="border dark:border-slate-700 rounded-xl p-3 bg-slate-50 dark:bg-slate-700/50"><div className="flex justify-between items-center"><span className="font-bold text-salfa-dark dark:text-white text-sm">{p.mois} {p.annee}</span><span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${p.verrouille === 1 ? 'bg-slate-200 dark:bg-slate-600' : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300'}`}>{p.verrouille === 1 ? 'Clôturé' : 'Modifiable'}</span></div><div className="grid grid-cols-2 gap-2 mt-2 text-xs dark:text-slate-300"><div>Brut: <span className="font-mono font-bold">{fmt(p.salaire_brut)}</span></div><div>NET: <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">{fmt(p.net)}</span></div><div>Avance: <span className="font-mono text-red-600">{fmt(p.avance)}</span></div><div>MED: <span className="font-mono text-red-600">{fmt(p.med)}</span></div></div></div>))}
              </div>
              <div className="hidden lg:block overflow-x-auto thin-scrollbar">
                <table className="w-full text-left border-collapse min-w-[900px]"><thead><tr className="bg-slate-50 dark:bg-slate-700 border-b dark:border-slate-600 text-xs font-bold uppercase text-slate-600 dark:text-slate-300"><th className="py-2 px-3">Période</th><th className="py-2 px-3 text-right">BASE AJ</th><th className="py-2 px-3 text-right">Brut</th><th className="py-2 px-3 text-right">CNaPS</th><th className="py-2 px-3 text-right">IRSA</th><th className="py-2 px-3 text-right">AVANCE</th><th className="py-2 px-3 text-right">MED</th><th className="py-2 px-4 text-right">NET</th><th className="py-2 px-3 text-center">Statut</th></tr></thead><tbody className="divide-y dark:divide-slate-700 text-sm dark:text-slate-200">{paies.map((p) => (<tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50"><td className="py-2 px-3 font-bold">{p.mois} {p.annee}</td><td className="py-2 px-3 text-right font-mono">{fmt(p.base_aj)}</td><td className="py-2 px-3 text-right font-mono font-semibold">{fmt(p.salaire_brut)}</td><td className="py-2 px-3 text-right font-mono text-xs">{fmt(p.cnaps)}</td><td className="py-2 px-3 text-right font-mono text-xs">{fmt(p.irsa)}</td><td className="py-2 px-3 text-right font-mono text-red-600">{fmt(p.avance)}</td><td className="py-2 px-3 text-right font-mono text-red-600">{fmt(p.med)}</td><td className="py-2 px-4 text-right font-mono font-bold text-emerald-700 dark:text-emerald-400">{fmt(p.net)}</td><td className="py-2 px-3 text-center text-xs">{p.verrouille === 1 ? <span className="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-600 font-semibold">Clôturé</span> : <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300 font-semibold">Modifiable</span>}</td></tr>))}</tbody></table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------------------
// MODALE - ACCESSOIRES (primes) DU MOIS POUR UN SALARIÉ
// ------------------------------------------------------------------------------
interface AccModalProps { paie: PaieMensuelle; onClose: () => void; onSaved: () => void; }

const AccessoiresModalForm: React.FC<AccModalProps> = ({ paie, onClose, onSaved }) => {
  const [form, setForm] = useState({
    augmentation_divers: paie.augmentation_divers || 0,
    prime_de_garde: paie.prime_de_garde || 0,
    anciennete2: paie.anciennete2 || 0,
    risque: paie.risque || 0,
    repr_rec: paie.repr_rec || 0,
  });
  const [saving, setSaving] = useState(false);
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const res = await savePaieSaisie(paie.id, Number(paie.avance || 0), Number(paie.med || 0), form);
    setSaving(false);
    if (res.success) onSaved();
    else alert('Erreur sauvegarde.');
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 backdrop-blur-sm p-2 sm:p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border dark:border-slate-700 modal-mobile max-h-[90dvh] flex flex-col">
        <div className="bg-salfa-dark dark:bg-slate-900 px-4 sm:px-6 py-3 text-white shrink-0 flex items-center justify-between">
          <div className="min-w-0">
            <h3 className="text-sm sm:text-lg font-bold">Accessoires — Mat {paie.numero_matricule}</h3>
            <p className="text-xs text-slate-300 truncate">{paie.nom_prenoms}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10 shrink-0 ml-2"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSave} className="p-4 space-y-3 overflow-y-auto thin-scrollbar">
          {Object.entries({ augmentation_divers: 'AUGMENTATION DIVERS', prime_de_garde: 'Prime de garde', anciennete2: 'Prime Ancienneté', risque: 'Prime RISQUE', repr_rec: 'Repr° réc°' }).map(([k, l]) => (
            <div key={k}>
              <label className="block text-xs font-bold uppercase mb-1 dark:text-slate-300">{l}</label>
              <input type="number" value={(form as any)[k]} onChange={(e) => setForm({ ...form, [k]: Number(e.target.value) })} className="w-full rounded-lg border dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm font-mono" />
            </div>
          ))}
          <div className="flex justify-end gap-3 pt-3 border-t dark:border-slate-700">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 dark:text-slate-200 text-sm font-semibold">Annuler</button>
            <button type="submit" disabled={saving} className="px-6 py-2 rounded-lg bg-salfa-dark dark:bg-slate-600 text-white text-sm font-bold shadow flex items-center gap-2"><Save className="w-4 h-4" />{saving ? '...' : 'Appliquer'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SalariesSaisieTab;
