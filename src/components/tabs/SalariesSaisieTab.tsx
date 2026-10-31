import { SortableHeader, useTableSort } from '../SortableHeader';
import { dateSortValue } from '../../local/tableSort';
import { changementAncienneteDuMois, moisToIndex } from '../../local/calcul';
import { AncienneteBadge, AncienneteLegende } from '../AncienneteRepere';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Employe, PaieMensuelle, UserSession } from '../../types';
import {
  fetchEmployes,
  fetchEmployePaies,
  fetchPaiesMois,
  initMoisPaie,
  savePaieSaisie,
  savePaieReglement,
  cloturerMois,
  deverrouillerMois,
  fetchPeriodes,
  fetchSuiteChronologiquePaie,
  fetchDoublonsEmployes,
  getDerniereSauvegardeSql,
  ResultatSauvegardeSql,
  SuiteChronologiquePaie,
  GroupeDoublonEmploye,
  ResultatFusionEmployes,
} from '../../api';
import { triggerSqlDownload } from '../../local/sqlBackup';
import { correspondRecherche, normaliserRecherche } from '../../local/recherche';
import {
  Plus,
  Search,
  Edit3,
  History,
  X,
  Calendar,
  Lock,
  Unlock,
  RefreshCw,
  PlusCircle,
  Save,
  Check,
  Baby,
  ListChecks,
  Printer,
  Download,
  ChevronDown,
  FileSpreadsheet,
  Files,
  GitMerge,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react';
import { YearProps, YearSelect } from '../YearSelect';
import { SaisieLotModal } from '../SaisieLotModal';
import { EmployeModalForm } from '../EmployeModalForm';
import { FusionEmployesModal } from '../FusionEmployesModal';

const MOIS_LISTE = ['JANVIER', 'FEVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN', 'JUILLET', 'AOUT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DECEMBRE'];

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const fmt = (val: number | undefined | null) =>
  val === undefined || val === null
    ? '0,00'
    : Number(val).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatInputDisplay = (val: number): string => {
  if (!val) return '';
  return Number(val)
    .toLocaleString('fr-FR', { maximumFractionDigits: 2 })
    .replace(/\u202f/g, ' ');
};

const parseInputNumber = (raw: string): number => {
  const cleaned = raw.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return 0;
  const n = Number(cleaned);
  return isNaN(n) ? 0 : Math.max(0, Math.round(n * 100) / 100);
};

function formatDateCourt(raw: unknown) {
  const s = String(raw ?? '').trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : s || '—';
}

function fmtJoursCourt(val: number | undefined | null): string {
  const v = Number(val ?? 0);
  if (!Number.isFinite(v)) return '0';
  return (Math.round(v * 100) / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
}

// ------------------------------------------------------------------------------
// Colonnes de l'État de paie mensuel (colonnes du classeur Excel + Congés)
// ------------------------------------------------------------------------------
type Align = 'left' | 'center' | 'right';
type EditableColKey = 'avance' | 'med' | 'virement' | 'especes';

type Column = {
  key: string;
  label: string;
  group: number;
  align: Align;
  money?: boolean;
  days?: boolean;
  sum?: boolean;
  editable?: EditableColKey;
  rawValue: (p: PaieMensuelle) => number | string;
};

const ETAT_GROUPS = [
  { label: 'IDENTIFICATION DU SALARIÉ', span: 8, bg: 'bg-slate-800' },
  { label: 'SALAIRE DE BASE', span: 4, bg: 'bg-sky-900' },
  { label: 'COTISATIONS & IMPÔT', span: 6, bg: 'bg-indigo-900' },
  { label: 'ACCESSOIRES', span: 7, bg: 'bg-teal-900' },
  { label: 'RETENUES & RÈGLEMENT (AVANCE · MED · VIREMENT · ESPÈCES ÉDITABLES)', span: 6, bg: 'bg-emerald-900' },
  { label: 'CONGÉS', span: 2, bg: 'bg-violet-900' },
];

const ETAT_COLUMNS: Column[] = [
  // 0 — Identification (8)
  { key: 'mat', label: 'MAT', group: 0, align: 'center', rawValue: (p) => num(p.numero_matricule) },
  { key: 'nom', label: 'NOM ET PRÉNOMS', group: 0, align: 'left', rawValue: (p) => p.nom_prenoms || '' },
  { key: 'cnaps', label: 'N° CNAPS', group: 0, align: 'center', rawValue: (p) => p.numero_cnaps || '' },
  { key: 'cat', label: 'CAT', group: 0, align: 'center', rawValue: (p) => p.categorie || '' },
  { key: 'job', label: 'FONCTION (JOB)', group: 0, align: 'left', rawValue: (p) => p.jobs || '' },
  { key: 'dateEmb', label: 'DATE EMB.', group: 0, align: 'center', rawValue: (p) => formatDateCourt(p.date_embauche) },
  { key: 'annees', label: 'ANNÉE', group: 0, align: 'center', rawValue: (p) => num(p.nombre_annees) },
  { key: 'enfants', label: 'ENF.', group: 0, align: 'center', rawValue: (p) => num(p.enfant_a_charge) },

  // 1 — Salaire de base (4)
  { key: 'base_aj', label: 'Base', group: 1, align: 'right', money: true, sum: true, rawValue: (p) => num(p.base_aj) },
  { key: 'logt_trsp', label: 'LOGT/TRSP', group: 1, align: 'right', money: true, sum: true, rawValue: (p) => num(p.logt_trsp) },
  { key: 'rendement', label: 'RENDEMENT', group: 1, align: 'right', money: true, sum: true, rawValue: (p) => num(p.rendement) },
  { key: 'resp_repres', label: 'RESP/REPRES', group: 1, align: 'right', money: true, sum: true, rawValue: (p) => num(p.resp_repres) },

  // 2 — Cotisations & impôt (6)
  { key: 'salaire_brut', label: 'SALAIRE BRUT', group: 2, align: 'right', money: true, sum: true, rawValue: (p) => num(p.salaire_brut) },
  { key: 'cnaps_sal', label: 'CNaPS', group: 2, align: 'right', money: true, sum: true, rawValue: (p) => num(p.cnaps) },
  { key: 'patronal', label: 'PATRONAL', group: 2, align: 'right', money: true, sum: true, rawValue: (p) => num(p.patronal) },
  { key: 'imposable', label: 'SAL. IMPOSABLE', group: 2, align: 'right', money: true, sum: true, rawValue: (p) => num(p.salaire_imposable) },
  { key: 'irsa', label: 'IRSA', group: 2, align: 'right', money: true, sum: true, rawValue: (p) => num(p.irsa) },
  { key: 'salaire_net', label: 'SALAIRE NET', group: 2, align: 'right', money: true, sum: true, rawValue: (p) => num(p.salaire_net) },

  // 3 — Accessoires (7)
  { key: 'augmentation_divers', label: 'AUGM. DIVERS', group: 3, align: 'right', money: true, sum: true, rawValue: (p) => num(p.augmentation_divers) },
  { key: 'prime_de_garde', label: 'PRIME GARDE', group: 3, align: 'right', money: true, sum: true, rawValue: (p) => num(p.prime_de_garde) },
  { key: 'anciennete2', label: 'ANC 2', group: 3, align: 'right', money: true, sum: true, rawValue: (p) => num(p.anciennete2) },
  { key: 'risque', label: 'RISQUE', group: 3, align: 'right', money: true, sum: true, rawValue: (p) => num(p.risque) },
  { key: 'repr_rec', label: 'REPR/REC', group: 3, align: 'right', money: true, sum: true, rawValue: (p) => num(p.repr_rec) },
  { key: 'accessoir', label: 'ACCESSOIR', group: 3, align: 'right', money: true, sum: true, rawValue: (p) => num(p.accessoir) },
  { key: 'brut', label: 'BRUT', group: 3, align: 'right', money: true, sum: true, rawValue: (p) => num(p.brut) },

  // 4 — Retenues & règlement (6)
  { key: 'avance', label: 'AVANCE', group: 4, align: 'right', money: true, sum: true, editable: 'avance', rawValue: (p) => num(p.avance) },
  { key: 'med', label: 'MED', group: 4, align: 'right', money: true, sum: true, editable: 'med', rawValue: (p) => num(p.med) },
  { key: 'net', label: 'NET À PAYER', group: 4, align: 'right', money: true, sum: true, rawValue: (p) => num(p.net) },
  { key: 'virement', label: 'VIREMENT', group: 4, align: 'right', money: true, sum: true, editable: 'virement', rawValue: (p) => num(p.virement) },
  { key: 'especes', label: 'ESPÈCES', group: 4, align: 'right', money: true, sum: true, editable: 'especes', rawValue: (p) => num(p.especes) },
  { key: 'rib', label: 'RIB', group: 4, align: 'left', rawValue: (p) => p.rib || '' },

  // 5 — Congés (alimentés automatiquement par Congés & Permissions) (2)
  { key: 'conge_pris', label: 'CONGÉ PRIS', group: 5, align: 'right', days: true, sum: true, rawValue: (p) => num(p.conge_pris_mois) },
  { key: 'conge_restant', label: 'CONGÉ RESTANT', group: 5, align: 'right', days: true, sum: true, rawValue: (p) => num(p.conge_restant) },
];

// Découpage en 2 pages A4 paysage pour l'impression papier de l'État de paie
const PRINT_PAGES: { title: string; columns: Column[]; widths: number[] }[] = [
  {
    title: 'Identification, salaire de base et charges (CNaPS / IRSA)',
    columns: ETAT_COLUMNS.slice(0, 18),
    widths: [2.5, 13.5, 4.8, 2.5, 10.2, 5.0, 2.5, 2.5, 5.8, 5.5, 5.5, 5.5, 6.2, 5.2, 5.5, 6.0, 5.3, 6.0],
  },
  {
    title: 'Accessoires, retenues, règlement et congés',
    columns: [ETAT_COLUMNS[0], ETAT_COLUMNS[1], ...ETAT_COLUMNS.slice(18)],
    widths: [2.6, 13.8, 5.0, 5.0, 4.6, 4.6, 4.6, 5.3, 5.8, 5.3, 5.0, 6.0, 5.8, 5.8, 12.0, 4.2, 4.6],
  },
];

function cellValue(row: PaieMensuelle, col: Column): string {
  const raw = col.rawValue(row);
  if (col.money) return fmt(Number(raw || 0));
  if (col.days) {
    const v = Number(raw || 0);
    if (col.key === 'conge_pris' && v === 0) return '—';
    return `${fmtJoursCourt(v)} j`;
  }
  return raw === '' ? '—' : String(raw);
}

function calcTotals(lignes: PaieMensuelle[]): Record<string, number> {
  return ETAT_COLUMNS.reduce<Record<string, number>>((acc, col) => {
    if (col.sum) acc[col.key] = lignes.reduce((s, r) => s + Number(col.rawValue(r) || 0), 0);
    return acc;
  }, {});
}

// ------------------------------------------------------------------------------
// Composant de saisie monétaire (modales)
// ------------------------------------------------------------------------------
// Cellule d'édition rapide en ligne (AVANCE, MED, VIREMENT, ESPÈCES)
// ------------------------------------------------------------------------------
interface InlineMoneyInputProps {
  value: number;
  disabled?: boolean;
  onCommit: (num: number) => Promise<void> | void;
  tone?: 'red' | 'amber' | 'sky' | 'emerald';
  colKey?: EditableColKey;
  rowIndex?: number;
  compact?: boolean;
}

const InlineMoneyInput: React.FC<InlineMoneyInputProps> = ({
  value,
  disabled,
  onCommit,
  tone = 'red',
  colKey,
  rowIndex,
  compact = false,
}) => {
  const [text, setText] = useState<string>(() => (value ? formatInputDisplay(value) : '0'));
  const [focused, setFocused] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (!focused) setText(value ? formatInputDisplay(value) : '0');
  }, [value, focused]);

  const commit = async () => {
    const n = parseInputNumber(text);
    setText(n ? formatInputDisplay(n) : '0');
    if (Math.abs(n - Number(value || 0)) > 0.004) {
      await onCommit(n);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 900);
    }
  };

  const toneClasses: Record<'red' | 'amber' | 'sky' | 'emerald', string> = {
    red: 'border-red-300 dark:border-red-700/70 focus:border-red-500 text-red-700 dark:text-red-300 bg-red-50/50 dark:bg-red-950/30',
    amber: 'border-amber-300 dark:border-amber-700/70 focus:border-amber-500 text-amber-800 dark:text-amber-300 bg-amber-50/50 dark:bg-amber-950/30',
    sky: 'border-sky-300 dark:border-sky-700/70 focus:border-sky-500 text-sky-900 dark:text-sky-200 bg-sky-50/60 dark:bg-sky-950/30',
    emerald: 'border-emerald-300 dark:border-emerald-700/70 focus:border-emerald-500 text-emerald-900 dark:text-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/30',
  };

  if (disabled) {
    return (
      <span className="font-mono text-xs text-slate-600 dark:text-slate-300">
        {fmt(value)}
      </span>
    );
  }

  return (
    <div className="relative inline-flex items-center justify-end w-full">
      <input
        type="text"
        inputMode="decimal"
        data-saisie-col={colKey}
        data-saisie-row={rowIndex}
        value={text}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onFocus={(e) => {
          setFocused(true);
          setText(value ? String(Math.round(value * 100) / 100).replace('.', ',') : '');
          setTimeout(() => e.target.select(), 0);
        }}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const currentInput = e.target as HTMLInputElement;
            currentInput.blur();
            if (colKey !== undefined && rowIndex !== undefined) {
              setTimeout(() => {
                const next = document.querySelector<HTMLInputElement>(
                  `input[data-saisie-col="${colKey}"][data-saisie-row="${rowIndex + 1}"]`
                );
                if (next) {
                  next.focus();
                  next.select();
                }
              }, 30);
            }
          } else if (e.key === 'Escape') {
            setText(value ? formatInputDisplay(value) : '0');
            (e.target as HTMLInputElement).blur();
          }
        }}
        onChange={(e) => setText(e.target.value)}
        className={`${compact ? 'w-24 px-1.5 py-0.5 text-[11px]' : 'w-28 px-2 py-1 text-xs'} rounded-md border text-right font-mono font-bold outline-none focus:ring-2 focus:ring-salfa-sky/50 transition ${toneClasses[tone]}`}
      />
      {savedFlash && (
        <span className="absolute -right-2 -top-2 bg-emerald-500 text-white rounded-full p-0.5 shadow">
          <Check className="w-2.5 h-2.5" />
        </span>
      )}
    </div>
  );
};

// ------------------------------------------------------------------------------
// Composant Principal : Onglet unifié Salariés, Saisie & État de Paie Mensuel
// ------------------------------------------------------------------------------
interface Props extends YearProps {
  currentUser?: UserSession | null;
  userRole?: string;
  refreshKey?: number;
  importedMois?: string | null;
}

type EtatMoisImprimable = {
  mois: string;
  annee: number;
  lignes: PaieMensuelle[];
  totals: Record<string, number>;
};

export const SalariesSaisieTab: React.FC<Props> = ({
  currentUser,
  userRole,
  annee,
  setAnnee,
  refreshKey,
  importedMois,
}) => {
  const effectiveRole = currentUser?.role || userRole || 'Administrateur';
  const [mois, setMois] = useState<string>(() => importedMois || MOIS_LISTE[new Date().getMonth()]);

  useEffect(() => {
    if (importedMois && MOIS_LISTE.includes(importedMois)) {
      setMois(importedMois);
    }
  }, [importedMois]);

  // Données employés + paies du mois
  const [employes, setEmployes] = useState<Employe[]>([]);
  const [paies, setPaies] = useState<PaieMensuelle[]>([]);
  const [selectedPaieId, setSelectedPaieId] = useState<number | null>(null);
  const [verrouille, setVerrouille] = useState<boolean>(false);
  const [clotureBackupBanner, setClotureBackupBanner] = useState<ResultatSauvegardeSql | null>(null);

  useEffect(() => {
    setSelectedPaieId(null);
  }, [annee, mois]);
  const [fusionBanner, setFusionBanner] = useState<ResultatFusionEmployes | null>(null);
  const [chronoAlert, setChronoAlert] = useState<string | null>(null);
  const [periodes, setPeriodes] = useState<{ annee: number; mois: string; nb: number }[]>([]);
  const [suiteChrono, setSuiteChrono] = useState<SuiteChronologiquePaie | null>(null);
  const [doublonsGroupes, setDoublonsGroupes] = useState<GroupeDoublonEmploye[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [search, setSearch] = useState<string>('');

  // Impression de l'État : état actif seul ou tous les états de l'année
  const [openPrintMenu, setOpenPrintMenu] = useState<boolean>(false);
  const [etatsImpression, setEtatsImpression] = useState<EtatMoisImprimable[] | null>(null);
  const printMenuRef = useRef<HTMLDivElement | null>(null);

  // Modales
  const [showEmpModal, setShowEmpModal] = useState<boolean>(false);
  const [editingEmploye, setEditingEmploye] = useState<Employe | null>(null);
  const [accModalPaie, setAccModalPaie] = useState<PaieMensuelle | null>(null);
  const [historyModal, setHistoryModal] = useState<{ employe: Employe; paies: PaieMensuelle[] } | null>(null);
  const [showLotModal, setShowLotModal] = useState<boolean>(false);
  const [showFusionModal, setShowFusionModal] = useState<boolean>(false);
  const [fusionInitialEmpId, setFusionInitialEmpId] = useState<number | null>(null);

  useEffect(() => {
    if (!openPrintMenu) return;
    const close = (e: MouseEvent) => {
      if (printMenuRef.current && !printMenuRef.current.contains(e.target as Node)) {
        setOpenPrintMenu(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [openPrintMenu]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setChronoAlert(null);
    const [emps, paiesData, per, suite, dbl] = await Promise.all([
      fetchEmployes(false),
      fetchPaiesMois(annee, mois),
      fetchPeriodes(),
      fetchSuiteChronologiquePaie(annee, mois),
      fetchDoublonsEmployes(),
    ]);
    setEmployes(emps);
    setPaies(paiesData.employes || []);
    setVerrouille(paiesData.verrouille || false);
    setPeriodes(per);
    setSuiteChrono(suite);
    setDoublonsGroupes(dbl);
    setLoading(false);
  }, [annee, mois]);

  useEffect(() => {
    loadAll();
  }, [loadAll, refreshKey]);

  const empById = new Map<number, Employe>(employes.map((e) => [Number(e.id), e]));
  const categoriesExistantes = Array.from(
    new Set(
      [...employes.map((e) => e.categorie), ...paies.map((p) => p.categorie)]
        .map((c) => String(c || '').trim())
        .filter(Boolean)
    )
  );
  const idsEnDoublon = new Set<number>(
    doublonsGroupes.flatMap((g) => [
      Number(g.cibleSuggeree.employe.id),
      ...g.doublons.map((d) => Number(d.employe.id)),
    ])
  );
  const nbDoublons = doublonsGroupes.reduce((acc, g) => acc + g.doublons.length, 0);

  const handleInitMois = async () => {
    setActionLoading(true);
    setChronoAlert(null);
    const res = await initMoisPaie(annee, mois);
    if (res.success) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('salfa-annees-updated'));
      }
      await loadAll();
    } else {
      setChronoAlert(res.message || "Erreur lors de l'initialisation du mois.");
    }
    setActionLoading(false);
  };

  const handleAjouterSalariesManquants = async () => {
    setActionLoading(true);
    setChronoAlert(null);
    const res = await initMoisPaie(annee, mois, { inclureTousActifs: true });
    if (res.success) {
      await loadAll();
    } else {
      setChronoAlert(res.message || "Erreur lors de l'ajout des salariés manquants.");
    }
    setActionLoading(false);
  };

  const handleOuvrirProchainMoisChrono = async () => {
    const prochain = suiteChrono?.prochainMoisChronologique;
    if (!prochain) {
      await handleInitMois();
      return;
    }
    setActionLoading(true);
    setChronoAlert(null);
    const res = await initMoisPaie(prochain.annee, prochain.mois);
    if (res.success) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('salfa-annees-updated'));
      }
      const memePeriode = prochain.annee === annee && prochain.mois === mois;
      setAnnee(prochain.annee);
      setMois(prochain.mois);
      if (memePeriode) {
        await loadAll();
      }
    } else {
      setChronoAlert(res.message || "Erreur lors de l'ouverture du mois suivant.");
    }
    setActionLoading(false);
  };

  // Enregistrement rapide d'une cellule AVANCE ou MED
  const handleInlineSave = async (paie: PaieMensuelle, newAvance: number, newMed: number) => {
    const res = await savePaieSaisie(paie.id, newAvance, newMed);
    if (res.success && res.updated) {
      setPaies((prev) => prev.map((p) => (p.id === paie.id ? res.updated! : p)));
    } else if (!res.success) {
      alert('Erreur lors de la sauvegarde.');
    }
  };

  // Enregistrement direct d'une cellule VIREMENT ou ESPÈCES (répartition automatique du complément sur NET)
  const handleInlineReglement = async (paie: PaieMensuelle, champ: 'virement' | 'especes', montant: number) => {
    const res = await savePaieReglement(paie.id, champ, montant);
    if (res.success && res.updated) {
      setPaies((prev) => prev.map((p) => (p.id === paie.id ? res.updated! : p)));
    } else if (!res.success) {
      alert('Erreur lors de la sauvegarde du règlement.');
    }
  };

  const handleCloturer = async () => {
    if (
      !window.confirm(
        `Clôturer et verrouiller définitivement la paie / caisse de ${mois} ${annee} ?\n\nUne sauvegarde SQL relationnelle complète (.sql) sera forcée et téléchargée automatiquement.`
      )
    )
      return;
    setActionLoading(true);
    try {
      const ok = await cloturerMois(annee, mois);
      if (ok) {
        const bkp = getDerniereSauvegardeSql();
        if (bkp) setClotureBackupBanner(bkp);
        await loadAll();
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeverrouiller = async () => {
    if (!window.confirm(`Déverrouiller ${mois} ${annee} pour autoriser des modifications ?`)) return;
    setActionLoading(true);
    const ok = await deverrouillerMois(annee, mois, effectiveRole);
    if (ok) await loadAll();
    setActionLoading(false);
  };

  const handleViewHistory = async (emp: Employe) => {
    const hist = await fetchEmployePaies(emp.id);
    setHistoryModal({ employe: emp, paies: hist });
  };

  // Filtrage recherche
  const q = normaliserRecherche(search);
  const filteredRows = paies.filter((p) =>
    correspondRecherche(q, p.numero_matricule, p.nom_prenoms, p.jobs, p.categorie)
  );

  const tableSort = useTableSort(filteredRows, Object.fromEntries(ETAT_COLUMNS.map(c => [c.key,
    c.key === 'dateEmb' ? (p: PaieMensuelle) => dateSortValue(p.date_embauche) : c.rawValue,
  ])));
  const rows = tableSort.rows;
  const nbAnniversaires = rows.filter(p => changementAncienneteDuMois(p.date_embauche, annee, mois)).length;

  // Salariés actifs qui n'ont pas encore de ligne de paie ce mois-ci
  const paieEmpIds = new Set(paies.map((p) => p.employe_id));
  const missingCount = employes.filter((e) => e.actif === 1 && !paieEmpIds.has(e.id)).length;

  // Totaux de l'état affiché
  const etatTotals = calcTotals(rows);

  // Export Excel de l'état de paie actif (identique au classeur Excel)
  const exportExcelEtat = () => {
    const groupRow: string[] = [];
    ETAT_GROUPS.forEach((g) => {
      groupRow.push(g.label);
      for (let i = 1; i < g.span; i++) groupRow.push('');
    });
    const headerRow = ETAT_COLUMNS.map((c) => c.label);
    const dataRows = rows.map((r) =>
      ETAT_COLUMNS.map((c) => (c.money || c.sum ? Number(c.rawValue(r) || 0) : c.rawValue(r)))
    );
    const totalRow = ETAT_COLUMNS.map((c, idx) =>
      idx === 0 ? '' : idx === 1 ? 'TOTAUX' : c.sum ? Math.round((etatTotals[c.key] || 0) * 100) / 100 : ''
    );
    const ws = XLSX.utils.aoa_to_sheet([groupRow, headerRow, ...dataRows, totalRow]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${mois}_${annee}`.slice(0, 31));
    XLSX.writeFile(wb, `ETAT_PAIE_SALFA_${mois}_${annee}.xlsx`);
  };

  // Impression : uniquement l'état actif OU tous les états initialisés de l'année
  const periodesAnnee = periodes
    .filter((p) => p.annee === annee && p.nb > 0)
    .sort((a, b) => MOIS_LISTE.indexOf(a.mois) - MOIS_LISTE.indexOf(b.mois));

  const anneesPeriodes = Array.from(new Set(periodes.map((p) => Number(p.annee)).filter((y) => Number.isFinite(y))));
  const nbParMoisAnnee = new Map<string, number>();
  for (const p of periodes) {
    if (Number(p.annee) === Number(annee)) {
      nbParMoisAnnee.set(String(p.mois).toUpperCase(), p.nb);
    }
  }

  const lancerImpressionEtat = async (scope: 'actif' | 'tous') => {
    setOpenPrintMenu(false);
    if (scope === 'actif') {
      setEtatsImpression([{ mois, annee, lignes: rows, totals: etatTotals }]);
      setTimeout(() => window.print(), 60);
      return;
    }
    setActionLoading(true);
    try {
      const cibles = periodesAnnee.length > 0 ? periodesAnnee.map((p) => p.mois) : [mois];
      const chargements = await Promise.all(cibles.map((m) => fetchPaiesMois(annee, m)));
      const liste: EtatMoisImprimable[] = [];
      cibles.forEach((m, i) => {
        const lignesMois = (chargements[i].employes || []).filter((p) =>
          correspondRecherche(q, p.numero_matricule, p.nom_prenoms, p.jobs, p.categorie)
        );
        if (lignesMois.length > 0) {
          liste.push({ mois: m, annee, lignes: lignesMois, totals: calcTotals(lignesMois) });
        }
      });
      setEtatsImpression(liste.length > 0 ? liste : [{ mois, annee, lignes: rows, totals: etatTotals }]);
      setTimeout(() => window.print(), 80);
    } finally {
      setActionLoading(false);
    }
  };

  const etatsPourImpression: EtatMoisImprimable[] =
    etatsImpression && etatsImpression.length > 0
      ? etatsImpression
      : [{ mois, annee, lignes: rows, totals: etatTotals }];

  return (
    <div className="etat-page-root space-y-3 sm:space-y-4 w-full">
      {/* BARRE D'OUTILS PRINCIPALE : PÉRIODE + SAISIE EN LOT + IMPRESSION (ACTIF / TOUS) + EXPORT EXCEL + CLÔTURE */}
      <div className="no-print bg-white dark:bg-slate-800 rounded-xl p-3 sm:p-4 shadow-sm border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2 sm:gap-3">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-salfa-dark dark:text-sky-300 font-bold text-xs sm:text-sm">
            <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-salfa-teal shrink-0" />
            <span>Période :</span>
          </div>
          <select
            aria-label="Mois de paie"
            value={mois}
            onChange={(e) => {
              setEtatsImpression(null);
              setMois(e.target.value);
            }}
            className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-bold text-salfa-dark focus:ring-2 focus:ring-salfa-sky outline-none"
          >
            {MOIS_LISTE.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <YearSelect
            annee={annee}
            anneesDisponibles={anneesPeriodes}
            setAnnee={(y) => {
              setEtatsImpression(null);
              setAnnee(y);
            }}
          />
          {verrouille ? (
            <span className="inline-flex items-center gap-1 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 text-xs font-bold px-2.5 py-1 rounded-full">
              <Lock className="w-3.5 h-3.5" />CLÔTURÉ
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300 text-xs font-bold px-2.5 py-1 rounded-full">
              <Unlock className="w-3.5 h-3.5" />OUVERT
            </span>
          )}
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
            {rows.length} salarié{rows.length > 1 ? 's' : ''}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
          {!verrouille && paies.length > 0 && (
            <button
              type="button"
              onClick={() => setShowLotModal(true)}
              className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 sm:py-2 rounded-lg text-xs font-bold shadow-sm transition"
              title="Saisir rapidement en lot les Avances ou les Médicaments"
            >
              <ListChecks className="w-3.5 h-3.5" />
              <span>Saisie en lot</span>
            </button>
          )}

          {!verrouille && missingCount > 0 && paies.length > 0 && (
            <button
              type="button"
              onClick={handleAjouterSalariesManquants}
              disabled={actionLoading}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 sm:py-2 rounded-lg text-xs font-bold shadow-sm animate-pulse"
              title="Ajouter les salariés actifs qui n'ont pas encore de bulletin sur ce mois"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>+{missingCount} salarié{missingCount > 1 ? 's' : ''} sans bulletin</span>
            </button>
          )}

          {paies.length > 0 && suiteChrono?.prochainMoisChronologique ? (
            <button
              type="button"
              onClick={handleOuvrirProchainMoisChrono}
              disabled={actionLoading}
              className="flex items-center gap-1.5 bg-sky-100 dark:bg-sky-900/30 hover:bg-sky-200 dark:hover:bg-sky-900/50 text-salfa-teal dark:text-sky-300 px-3 py-1.5 sm:py-2 rounded-lg text-xs font-bold"
              title={`Suite chronologique : ouvrir et initialiser ${suiteChrono.prochainMoisChronologique.mois} ${suiteChrono.prochainMoisChronologique.annee}`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${actionLoading ? 'animate-spin' : ''}`} />
              <span>
                Ouvrir {suiteChrono.prochainMoisChronologique.mois}{' '}
                {suiteChrono.prochainMoisChronologique.annee}
              </span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : !verrouille ? (
            <button
              type="button"
              onClick={
                suiteChrono && !suiteChrono.peutOuvrirCible
                  ? handleOuvrirProchainMoisChrono
                  : handleInitMois
              }
              disabled={actionLoading}
              className="flex items-center gap-1.5 bg-sky-100 dark:bg-sky-900/30 hover:bg-sky-200 dark:hover:bg-sky-900/50 text-salfa-teal dark:text-sky-300 px-3 py-1.5 sm:py-2 rounded-lg text-xs font-bold"
              title={
                suiteChrono && !suiteChrono.peutOuvrirCible && suiteChrono.prochainMoisChronologique
                  ? `Suite chronologique : ouvrir d'abord ${suiteChrono.prochainMoisChronologique.mois} ${suiteChrono.prochainMoisChronologique.annee}`
                  : 'Ouvrir et initialiser ce mois dans la suite chronologique de l’état'
              }
            >
              <RefreshCw className={`w-3.5 h-3.5 ${actionLoading ? 'animate-spin' : ''}`} />
              <span>
                {suiteChrono && !suiteChrono.peutOuvrirCible && suiteChrono.prochainMoisChronologique
                  ? `Ouvrir ${suiteChrono.prochainMoisChronologique.mois} ${suiteChrono.prochainMoisChronologique.annee}`
                  : 'Ouvrir / Initialiser'}
              </span>
            </button>
          ) : null}

          {/* Bouton Imprimer État avec choix : État actif seul OU Tous les états */}
          <div ref={printMenuRef} className="relative">
            <button
              type="button"
              disabled={rows.length === 0 || actionLoading}
              onClick={() => setOpenPrintMenu((v) => !v)}
              className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 px-3 py-1.5 sm:py-2 rounded-lg text-xs font-bold text-slate-800 dark:text-slate-100"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimer</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {openPrintMenu && (
              <div className="absolute right-0 mt-1.5 w-72 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl py-1 z-40">
                <button
                  type="button"
                  onClick={() => lancerImpressionEtat('actif')}
                  className="w-full px-3.5 py-2.5 text-left text-xs font-semibold hover:bg-sky-50 dark:hover:bg-slate-700 flex items-center gap-2.5"
                >
                  <FileSpreadsheet className="w-4 h-4 text-salfa-teal shrink-0" />
                  <div>
                    <div>Imprimer uniquement l'état actif</div>
                    <div className="text-[10px] font-normal text-slate-400">
                      {mois} {annee} ({rows.length} salarié{rows.length > 1 ? 's' : ''} · 2 pages A4)
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => lancerImpressionEtat('tous')}
                  className="w-full px-3.5 py-2.5 text-left text-xs font-semibold hover:bg-sky-50 dark:hover:bg-slate-700 flex items-center gap-2.5 border-t border-slate-100 dark:border-slate-700"
                >
                  <Files className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div>
                    <div>Imprimer tous les états ({periodesAnnee.length || 1} mois)</div>
                    <div className="text-[10px] font-normal text-slate-400">
                      Tous les mois initialisés de l'année {annee}
                    </div>
                  </div>
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            disabled={rows.length === 0}
            onClick={exportExcelEtat}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-3 py-1.5 sm:py-2 rounded-lg text-xs font-bold shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exporter Excel</span>
          </button>

          {!verrouille ? (
            <button
              type="button"
              onClick={handleCloturer}
              disabled={paies.length === 0 || actionLoading}
              className="flex items-center gap-1.5 bg-salfa-dark hover:bg-slate-800 disabled:opacity-40 text-white px-3 py-1.5 sm:py-2 rounded-lg text-xs font-bold shadow-sm"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Clôturer / Valider</span>
            </button>
          ) : (
            effectiveRole === 'Administrateur' && (
              <button
                type="button"
                onClick={handleDeverrouiller}
                disabled={actionLoading}
                className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 sm:py-2 rounded-lg text-xs font-bold shadow-sm"
              >
                <Unlock className="w-3.5 h-3.5" />
                <span>Déverrouiller (Admin)</span>
              </button>
            )
          )}
        </div>
      </div>

      {clotureBackupBanner && (
        <div
          role="status"
          className="no-print bg-emerald-50 dark:bg-emerald-900/25 border border-emerald-300 dark:border-emerald-700 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-2.5 text-xs sm:text-sm text-emerald-900 dark:text-emerald-200"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="font-semibold">
              Clôture validée ({mois} {annee}) — Sauvegarde SQL forcée générée :{' '}
              <code className="font-mono font-bold">{clotureBackupBanner.filename}</code>
              {clotureBackupBanner.server_saved ? ' (archivée aussi sur le serveur WAMP)' : ''}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => triggerSqlDownload(clotureBackupBanner.filename, clotureBackupBanner.sql)}
              className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition"
            >
              Re-télécharger .sql
            </button>
            <button
              type="button"
              onClick={() => setClotureBackupBanner(null)}
              aria-label="Fermer la notification"
              className="p-1 rounded hover:bg-emerald-200/50 dark:hover:bg-emerald-800/40"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ALERTE SUITE CHRONOLOGIQUE */}
      {chronoAlert && (
        <div className="no-print bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900 dark:text-amber-200">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{chronoAlert}</span>
          </div>
          <div className="flex items-center gap-2">
            {suiteChrono?.prochainMoisChronologique && (
              <button
                type="button"
                onClick={handleOuvrirProchainMoisChrono}
                className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-sm transition"
              >
                Ouvrir {suiteChrono.prochainMoisChronologique.mois}{' '}
                {suiteChrono.prochainMoisChronologique.annee}
              </button>
            )}
            <button
              type="button"
              onClick={() => setChronoAlert(null)}
              aria-label="Fermer l'alerte"
              className="p-1 rounded hover:bg-amber-200/50 dark:hover:bg-amber-800/40"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* BANNIÈRE RÉSULTAT DE FUSION */}
      {fusionBanner && (
        <div className="no-print bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-900 dark:text-emerald-200">
          <div className="flex items-center gap-2 font-semibold">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              <b>{fusionBanner.message}</b> — {fusionBanner.paiesTransferees} bulletin(s) rattaché(s),{' '}
              {fusionBanner.paiesDoublonsSupprimees} doublon(s) retiré(s), {fusionBanner.congesTransferes}{' '}
              congé(s) rattaché(s).
            </span>
          </div>
          <button
            type="button"
            onClick={() => setFusionBanner(null)}
            aria-label="Fermer la notification de fusion"
            className="p-1 rounded hover:bg-emerald-200/50 dark:hover:bg-emerald-800/40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* BARRE DE RECHERCHE + FUSION DOUBLONS + NOUVEAU SALARIÉ */}
      <div className="no-print bg-white dark:bg-slate-800 rounded-xl p-3 sm:p-4 shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Rechercher par matricule, nom, fonction, catégorie..."
            autoCapitalize="characters"
            value={search}
            onChange={(e) => setSearch(e.target.value.toLocaleUpperCase('fr-FR'))}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white text-sm uppercase focus:ring-2 focus:ring-salfa-sky outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setFusionInitialEmpId(null);
              setShowFusionModal(true);
            }}
            className={`flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg font-bold text-xs sm:text-sm shadow-sm transition ${
              nbDoublons > 0
                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                : 'bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200'
            }`}
            title="Fusionner deux fiches salariés (ex. doublon de matricule) en conservant tout l'historique"
          >
            <GitMerge className="w-4 h-4" />
            <span>Fusionner salariés</span>
            {nbDoublons > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-white text-amber-800 text-[10px] font-extrabold">
                {nbDoublons} doublon{nbDoublons > 1 ? 's' : ''}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setEditingEmploye(null);
              setShowEmpModal(true);
            }}
            className="flex items-center justify-center gap-2 bg-salfa-dark hover:bg-salfa-teal text-white px-4 py-2 rounded-lg font-bold text-xs sm:text-sm shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>Nouveau Salarié</span>
          </button>
        </div>
      </div>

      <AncienneteLegende count={nbAnniversaires} />

      {/* ÉTAT COMPLET EXCEL (32 COLONNES) */}
      <div className="no-print block bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="overflow-auto max-h-[70vh] thin-scrollbar">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 z-20">
                <tr className="text-white text-[10px] font-extrabold uppercase tracking-wider">
                  {ETAT_GROUPS.map((g) => (
                    <th key={g.label} colSpan={g.span} className={`${g.bg} py-1.5 px-2 text-center border-r border-white/20`}>
                      {g.label}
                    </th>
                  ))}
                  <th className="bg-slate-900 py-1.5 px-2 text-center">FICHE &amp; ACC.</th>
                </tr>
                <tr className="bg-slate-100 dark:bg-slate-700 border-b border-slate-300 dark:border-slate-600 text-[10px] font-bold uppercase text-slate-700 dark:text-slate-200">
                  {ETAT_COLUMNS.map((c, idx) => {
                    const highlightCls =
                      c.key === 'avance'
                        ? 'bg-red-100/90 dark:bg-red-950/60 text-red-900 dark:text-red-200'
                        : c.key === 'med'
                        ? 'bg-amber-100/90 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200'
                        : c.key === 'virement'
                        ? 'bg-sky-100/90 dark:bg-sky-950/60 text-sky-900 dark:text-sky-200'
                        : c.key === 'especes'
                        ? 'bg-emerald-100/90 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200'
                        : c.key === 'net'
                        ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300'
                        : c.key === 'conge_pris' || c.key === 'conge_restant'
                        ? 'bg-violet-100/90 dark:bg-violet-950/60 text-violet-900 dark:text-violet-200'
                        : '';
                    return (
                      <SortableHeader
                        column={c.key} sort={tableSort}
                        key={c.key}
                        className={`py-2 px-2 whitespace-nowrap border-r border-slate-200 dark:border-slate-600 text-${c.align} ${
                          c.key === 'base_aj' ? 'normal-case' : ''
                        } ${
                          idx === 0
                            ? 'sticky left-0 z-30 bg-slate-100 dark:bg-slate-700 w-12'
                            : idx === 1
                            ? 'sticky left-12 z-30 bg-slate-100 dark:bg-slate-700 min-w-[200px]'
                            : highlightCls
                        }`}
                      >
                        {c.label}
                        {c.editable && !verrouille ? ' ✎' : ''}
                      </SortableHeader>
                    );
                  })}
                  <th className="py-2 px-2 text-center whitespace-nowrap bg-slate-100 dark:bg-slate-700">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {loading ? (
                  <tr>
                    <td colSpan={ETAT_COLUMNS.length + 1} className="p-8 text-center text-slate-400">
                      Chargement de l'état de paie…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={ETAT_COLUMNS.length + 1} className="p-8 text-center">
                      <EmptyState
                        search={search}
                        mois={mois}
                        annee={annee}
                        verrouille={verrouille}
                        suiteChrono={suiteChrono}
                        onInit={handleInitMois}
                        onInitProchainChrono={handleOuvrirProchainMoisChrono}
                      />
                    </td>
                  </tr>
                ) : (
                  rows.map((p, rowIdx) => {
                    const emp = empById.get(Number(p.employe_id));
                    const mat = Number(p.conge_maternite) === 1;
                    const anniversaire = changementAncienneteDuMois(p.date_embauche, annee, mois);
                    const isSelected = selectedPaieId === p.id;
                    const hasSelection = selectedPaieId !== null;
                    const selectedBorder = isSelected
                      ? 'border-y-2 border-y-amber-500 dark:border-y-amber-400'
                      : '';
                    const stickyBg = isSelected
                      ? 'bg-amber-200 dark:bg-amber-800 shadow-[2px_0_8px_-2px_rgba(217,119,6,0.45)]'
                      : mat
                      ? 'bg-pink-50 dark:bg-pink-950/60 group-hover:bg-pink-100 dark:group-hover:bg-pink-900/50'
                      : 'bg-white dark:bg-slate-800 group-hover:bg-sky-50 dark:group-hover:bg-slate-700';

                    return (
                      <tr
                        key={p.id}
                        data-anciennete={anniversaire ? 'true' : undefined}
                        aria-selected={isSelected}
                        data-selected={isSelected ? 'true' : undefined}
                        onClick={() => setSelectedPaieId((prev) => (prev === p.id ? null : p.id))}
                        onDoubleClick={() => {
                          if (emp) {
                            setEditingEmploye(emp);
                            setShowEmpModal(true);
                          }
                        }}
                        title="Cliquez pour mettre en évidence la ligne · Double-cliquez pour modifier la fiche du salarié"
                        className={`cursor-pointer transition-all group ${
                          isSelected
                            ? 'bg-amber-100/95 dark:bg-amber-900/55 shadow-md relative z-[5] font-semibold'
                            : mat
                            ? `bg-pink-50/90 dark:bg-pink-950/35 hover:bg-pink-100/90 dark:hover:bg-pink-900/45 border-l-4 border-l-pink-500 ${hasSelection ? 'opacity-80 hover:opacity-100' : ''}`
                            : `hover:bg-sky-50/60 dark:hover:bg-slate-700/50 ${hasSelection ? 'opacity-80 hover:opacity-100' : ''}`
                        }`}
                      >
                        {ETAT_COLUMNS.map((c, idx) => {
                          if (c.editable === 'avance') {
                            return (
                              <td
                                key={c.key}
                                className={`py-1 px-1.5 border-r border-slate-100 dark:border-slate-700 ${
                                  isSelected ? 'bg-amber-100/95 dark:bg-amber-900/55' : 'bg-red-50/25 dark:bg-red-950/15'
                                } ${selectedBorder}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedPaieId(p.id);
                                }}
                              >
                                <InlineMoneyInput
                                  compact
                                  value={Number(p.avance || 0)}
                                  disabled={verrouille}
                                  tone="red"
                                  colKey="avance"
                                  rowIndex={rowIdx}
                                  onCommit={(n) => handleInlineSave(p, n, Number(p.med || 0))}
                                />
                              </td>
                            );
                          }
                          if (c.editable === 'med') {
                            return (
                              <td
                                key={c.key}
                                className={`py-1 px-1.5 border-r border-slate-100 dark:border-slate-700 ${
                                  isSelected ? 'bg-amber-100/95 dark:bg-amber-900/55' : 'bg-amber-50/25 dark:bg-amber-950/15'
                                } ${selectedBorder}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedPaieId(p.id);
                                }}
                              >
                                <InlineMoneyInput
                                  compact
                                  value={Number(p.med || 0)}
                                  disabled={verrouille}
                                  tone="amber"
                                  colKey="med"
                                  rowIndex={rowIdx}
                                  onCommit={(n) => handleInlineSave(p, Number(p.avance || 0), n)}
                                />
                              </td>
                            );
                          }
                          if (c.editable === 'virement') {
                            return (
                              <td
                                key={c.key}
                                className={`py-1 px-1.5 border-r border-slate-100 dark:border-slate-700 ${
                                  isSelected ? 'bg-amber-100/95 dark:bg-amber-900/55' : 'bg-sky-50/30 dark:bg-sky-950/15'
                                } ${selectedBorder}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedPaieId(p.id);
                                }}
                              >
                                <InlineMoneyInput
                                  compact
                                  value={Number(p.virement || 0)}
                                  disabled={verrouille}
                                  tone="sky"
                                  colKey="virement"
                                  rowIndex={rowIdx}
                                  onCommit={(n) => handleInlineReglement(p, 'virement', n)}
                                />
                              </td>
                            );
                          }
                          if (c.editable === 'especes') {
                            return (
                              <td
                                key={c.key}
                                className={`py-1 px-1.5 border-r border-slate-100 dark:border-slate-700 ${
                                  isSelected ? 'bg-amber-100/95 dark:bg-amber-900/55' : 'bg-emerald-50/30 dark:bg-emerald-950/15'
                                } ${selectedBorder}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedPaieId(p.id);
                                }}
                              >
                                <InlineMoneyInput
                                  compact
                                  value={Number(p.especes || 0)}
                                  disabled={verrouille}
                                  tone="emerald"
                                  colKey="especes"
                                  rowIndex={rowIdx}
                                  onCommit={(n) => handleInlineReglement(p, 'especes', n)}
                                />
                              </td>
                            );
                          }

                          const congeTitle =
                            c.key === 'conge_restant' && p.conge_titre_actif
                              ? `Titre ${p.conge_titre_actif} : ${fmtJoursCourt(p.conge_reste_titre)} j · Cumul restant : ${fmtJoursCourt(p.conge_restant)} j · Permission restante : ${fmtJoursCourt(p.permission_restante)} j`
                              : undefined;

                          return (
                            <td
                              key={c.key}
                              title={congeTitle}
                              className={`py-1.5 px-2 whitespace-nowrap border-r border-slate-100 dark:border-slate-700 text-${c.align} ${
                                c.money || c.days ? 'font-mono' : ''
                              } ${
                                idx === 0
                                  ? `sticky left-0 z-10 ${stickyBg} font-bold ${
                                      isSelected
                                        ? 'text-amber-950 dark:text-amber-100 border-l-4 border-l-amber-600 dark:border-l-amber-400'
                                        : 'text-salfa-dark dark:text-sky-300'
                                    } w-12`
                                  : idx === 1
                                  ? `sticky left-12 z-10 ${stickyBg} ${
                                      isSelected
                                        ? 'font-extrabold text-amber-950 dark:text-amber-50'
                                        : 'font-semibold text-slate-900 dark:text-white'
                                    } min-w-[200px]`
                                  : ''
                              } ${
                                c.key === 'net'
                                  ? isSelected
                                    ? 'font-extrabold text-emerald-800 dark:text-emerald-300 bg-emerald-200/70 dark:bg-emerald-900/45'
                                    : 'font-extrabold text-emerald-700 dark:text-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/20'
                                  : c.key === 'conge_restant'
                                  ? isSelected
                                    ? 'font-bold text-violet-900 dark:text-violet-200 bg-amber-100/95 dark:bg-amber-900/55'
                                    : 'font-bold text-violet-700 dark:text-violet-300 bg-violet-50/40 dark:bg-violet-950/15'
                                  : c.key === 'conge_pris' && Number(p.conge_pris_mois || 0) > 0
                                  ? isSelected
                                    ? 'font-bold text-violet-900 dark:text-violet-200 bg-amber-100/95 dark:bg-amber-900/55'
                                    : 'font-bold text-violet-800 dark:text-violet-200 bg-violet-50/40 dark:bg-violet-950/15'
                                  : isSelected && idx > 1
                                  ? 'bg-amber-100/95 dark:bg-amber-900/55 text-slate-950 dark:text-amber-50 font-bold'
                                  : ''
                              } ${selectedBorder}`}
                            >
                              {idx === 1 ? (
                                <div className="flex items-center gap-1.5">
                                  <span>{cellValue(p, c)}</span>
                                  {anniversaire && <AncienneteBadge changement={anniversaire} />}
                                  {mat && (
                                    <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full bg-pink-600 text-white font-extrabold">
                                      <Baby className="w-2.5 h-2.5" />MAT
                                    </span>
                                  )}
                                  {emp && idsEnDoublon.has(Number(emp.id)) && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedPaieId(p.id);
                                        setFusionInitialEmpId(emp.id);
                                        setShowFusionModal(true);
                                      }}
                                      title="Doublon détecté — cliquez pour fusionner cette fiche salarié"
                                      className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500 hover:bg-amber-600 text-white font-extrabold transition"
                                    >
                                      <GitMerge className="w-2.5 h-2.5" />
                                      DOUBLON
                                    </button>
                                  )}
                                </div>
                              ) : (
                                cellValue(p, c)
                              )}
                            </td>
                          );
                        })}

                        <td
                          className={`py-1 px-2 whitespace-nowrap text-center ${
                            isSelected ? 'bg-amber-100/95 dark:bg-amber-900/55' : ''
                          } ${selectedBorder}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedPaieId(p.id);
                          }}
                        >
                          <div className="inline-flex items-center gap-1">
                            {!verrouille && (
                              <button
                                onClick={() => setAccModalPaie(p)}
                                className="px-1.5 py-0.5 rounded bg-sky-50 dark:bg-sky-900/30 hover:bg-sky-100 text-salfa-teal dark:text-sky-300 text-[10px] font-bold"
                                title="Modifier les accessoires (primes) du mois"
                              >
                                +Acc.
                              </button>
                            )}
                            {emp && (
                              <>
                                <button
                                  onClick={() => handleViewHistory(emp)}
                                  className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300"
                                  title="Historique des paies"
                                >
                                  <History className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingEmploye(emp);
                                    setShowEmpModal(true);
                                  }}
                                  className="p-1 rounded hover:bg-amber-50 dark:hover:bg-amber-900/30 text-amber-600 dark:text-amber-400"
                                  title="Modifier la fiche salarié (informations / mise en inactif)"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => {
                                    setFusionInitialEmpId(emp.id);
                                    setShowFusionModal(true);
                                  }}
                                  className={`p-1 rounded transition ${
                                    idsEnDoublon.has(Number(emp.id))
                                      ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 hover:bg-amber-200'
                                      : 'hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-500 dark:text-slate-400'
                                  }`}
                                  title="Fusionner ce salarié avec une autre fiche (doublon)"
                                >
                                  <GitMerge className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot className="sticky bottom-0 z-20 bg-salfa-dark text-white font-bold text-xs">
                  <tr>
                    {ETAT_COLUMNS.map((c, idx) => (
                      <td
                        key={c.key}
                        className={`py-2.5 px-2 whitespace-nowrap border-r border-white/15 text-${c.align} ${
                          c.money || c.days ? 'font-mono' : ''
                        } ${idx === 0 ? 'sticky left-0 z-30 bg-salfa-dark' : idx === 1 ? 'sticky left-12 z-30 bg-salfa-dark' : ''}`}
                      >
                        {idx === 0
                          ? ''
                          : idx === 1
                          ? `TOTAUX (${rows.length})`
                          : c.sum
                          ? c.days
                            ? `${fmtJoursCourt(etatTotals[c.key])} j`
                            : fmt(etatTotals[c.key])
                          : ''}
                      </td>
                    ))}
                    <td className="py-2.5 px-2 bg-salfa-dark" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

      {/* ACCÈS RAPIDE AUX 12 MOIS DE L'ANNÉE (SANS L'ANNÉE — FILTRÉ PAR RAPPORT À L'ANNÉE DE « PÉRIODE : ») */}
      <div className="no-print bg-white dark:bg-slate-800 rounded-xl p-2.5 sm:p-3 border border-slate-200 dark:border-slate-700 flex items-center gap-2 overflow-x-auto thin-scrollbar">
        <span className="text-[11px] font-bold uppercase text-slate-400 shrink-0 pl-1">Mois initialisés :</span>
        <div className="flex items-center gap-1.5">
          {MOIS_LISTE.map((m) => {
            const nb = nbParMoisAnnee.get(m) || 0;
            const active = m === mois;
            const initialise = nb > 0;
            return (
              <button
                key={m}
                type="button"
                title={
                  initialise
                    ? `${m} ${annee} — ${nb} bulletin(s) initialisé(s)`
                    : `${m} ${annee} — non initialisé`
                }
                onClick={() => {
                  setEtatsImpression(null);
                  setMois(m);
                }}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition ${
                  active
                    ? 'bg-salfa-dark text-white shadow-sm'
                    : initialise
                      ? 'bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200'
                      : 'bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-700/70 text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-slate-700'
                }`}
              >
                <span>{m}</span>
                {initialise && (
                  <span className={`text-[10px] ${active ? 'text-sky-200' : 'text-slate-400'}`}>({nb})</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* FEUILLES D'IMPRESSION PAPIER (A4 PAYSAGE : 2 PAGES PAR MOIS, UN SEUL OU TOUS LES MOIS) */}
      <EtatImpression etats={etatsPourImpression} />

      {/* MODALES */}
      {showLotModal && (
        <SaisieLotModal
          mois={mois}
          annee={annee}
          paies={paies}
          employes={employes}
          onClose={() => setShowLotModal(false)}
          onSaved={async () => {
            setShowLotModal(false);
            await loadAll();
          }}
        />
      )}

      {showEmpModal && (
        <EmployeModalForm
          key={editingEmploye ? `emp-${editingEmploye.id}` : 'emp-new'}
          employe={editingEmploye}
          periodeActive={{ annee, mois }}
          categoriesExistantes={categoriesExistantes}
          onClose={() => setShowEmpModal(false)}
          onSaved={async () => {
            const wasCreate = !editingEmploye;
            setShowEmpModal(false);
            if (wasCreate && !verrouille && paies.length > 0) {
              await initMoisPaie(annee, mois);
            }
            await loadAll();
          }}
        />
      )}

      {showFusionModal && (
        <FusionEmployesModal
          employes={employes}
          initialEmployeId={fusionInitialEmpId}
          onClose={() => {
            setShowFusionModal(false);
            setFusionInitialEmpId(null);
          }}
          onMerged={async (res) => {
            setShowFusionModal(false);
            setFusionInitialEmpId(null);
            setFusionBanner(res);
            await loadAll();
          }}
        />
      )}

      {accModalPaie && (
        <AccessoiresModalForm
          paie={accModalPaie}
          onClose={() => setAccModalPaie(null)}
          onSaved={() => {
            setAccModalPaie(null);
            loadAll();
          }}
        />
      )}

      {historyModal && (
        <EmployeHistoryModal
          employe={historyModal.employe}
          paies={historyModal.paies}
          onClose={() => setHistoryModal(null)}
        />
      )}
    </div>
  );
};

// ------------------------------------------------------------------------------
// Impression papier de l'État de paie (un seul mois actif OU tous les mois)
// ------------------------------------------------------------------------------
const EtatImpression: React.FC<{ etats: EtatMoisImprimable[] }> = ({ etats }) => (
  <div className="etat-print">
    {etats.flatMap((etat) => {
      const n = Math.max(etat.lignes.length + 1, 1);
      const rowMm = Math.min(4.2, Math.max(1.8, Number((176 / n).toFixed(2))));
      const fontPt = Math.min(6, Math.max(3.8, Number((rowMm * 1.45).toFixed(1))));
      const style = {
        '--etat-row-height': `${rowMm}mm`,
        '--etat-font-size': `${fontPt}pt`,
      } as React.CSSProperties;

      return PRINT_PAGES.map((page, pageIndex) => (
        <section key={`${etat.annee}-${etat.mois}-${page.title}`} className="etat-print-page" style={style}>
          <div className="etat-print-heading">
            <strong>SALFA TOLIARA — ÉTAT DE PAIE MENSUEL : {etat.mois} {etat.annee}</strong>
            <span>Page {pageIndex + 1}/2 — {page.title} ({etat.lignes.length} salariés)</span>
          </div>
          <table className="etat-print-table">
            <colgroup>
              {page.widths.map((w, i) => (
                <col key={i} style={{ width: `${w}%` }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {page.columns.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {etat.lignes.map((r) => (
                <tr key={r.id}>
                  {page.columns.map((c) => (
                    <td
                      key={c.key}
                      style={{
                        textAlign: c.align,
                        overflow: c.money ? 'visible' : 'hidden',
                        textOverflow: c.money ? 'clip' : 'ellipsis',
                      }}
                    >
                      {cellValue(r, c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                {page.columns.map((c, idx) => (
                  <td key={c.key} style={{ textAlign: c.align }}>
                    {idx === 0
                      ? ''
                      : idx === 1
                      ? 'TOTAUX'
                      : c.sum
                      ? c.days
                        ? `${fmtJoursCourt(etat.totals[c.key])} j`
                        : fmt(etat.totals[c.key])
                      : ''}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </section>
      ));
    })}
  </div>
);

// ------------------------------------------------------------------------------
// État vide : mois non initialisé (respect strict de la suite chronologique)
// ------------------------------------------------------------------------------
const EmptyState: React.FC<{
  search: string;
  mois: string;
  annee: number;
  verrouille: boolean;
  suiteChrono: SuiteChronologiquePaie | null;
  onInit: () => void;
  onInitProchainChrono: () => void;
}> = ({ search, mois, annee, verrouille, suiteChrono, onInit, onInitProchainChrono }) => {
  const horsSuite = Boolean(suiteChrono && !suiteChrono.peutOuvrirCible);
  const prochain = suiteChrono?.prochainMoisChronologique;
  const precedent = suiteChrono?.moisPrecedentCible;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-6 text-center border dark:border-slate-700 space-y-3">
      {search ? (
        <div className="text-sm text-slate-500">Aucun salarié ne correspond à la recherche.</div>
      ) : horsSuite ? (
        <div className="max-w-xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 text-xs font-extrabold">
            <AlertTriangle className="w-3.5 h-3.5" />
            Suite chronologique obligatoire
          </div>
          <div className="text-sm text-slate-700 dark:text-slate-200">
            Aucun bulletin pour <b>{mois} {annee}</b>. Le mois précédent{' '}
            {precedent ? (
              <b>
                ({precedent.mois} {precedent.annee})
              </b>
            ) : null}{' '}
            n&apos;est pas encore ouvert.
          </div>
          {suiteChrono?.dernierMoisEtat && prochain && (
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Dernier état initialisé :{' '}
              <b>
                {suiteChrono.dernierMoisEtat.mois} {suiteChrono.dernierMoisEtat.annee}
              </b>{' '}
              → prochain mois chronologique à ouvrir :{' '}
              <b>
                {prochain.mois} {prochain.annee}
              </b>
            </div>
          )}
          {prochain && (
            <button
              type="button"
              onClick={onInitProchainChrono}
              className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-sm transition"
            >
              <RefreshCw className="w-4 h-4" />
              <span>
                Aller à &amp; Ouvrir {prochain.mois} {prochain.annee}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="text-sm text-slate-600 dark:text-slate-300">
            Aucun bulletin pour <b>{mois} {annee}</b>.
          </div>
          {precedent?.initialise && (
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Suite chronologique directe de l&apos;état de{' '}
              <b>
                {precedent.mois} {precedent.annee}
              </b>
              .
            </div>
          )}
          {!verrouille && (
            <button
              type="button"
              onClick={onInit}
              className="inline-flex items-center gap-2 bg-sky-100 dark:bg-sky-900/30 hover:bg-sky-200 text-salfa-teal dark:text-sky-300 px-4 py-2 rounded-lg text-xs font-bold"
            >
              <RefreshCw className="w-4 h-4" />
              Ouvrir / Initialiser le mois ({mois} {annee})
            </button>
          )}
        </>
      )}
    </div>
  );
};

// ------------------------------------------------------------------------------
// MODALE - HISTORIQUE DES PAIES D'UN SALARIÉ
// ------------------------------------------------------------------------------
interface HistoryModalProps { employe: Employe; paies: PaieMensuelle[]; onClose: () => void; }

const EmployeHistoryModal: React.FC<HistoryModalProps> = ({ employe, paies, onClose }) => {
  const historySort = useTableSort(paies, {
    periode: p => p.annee * 12 + moisToIndex(p.mois),
    ...Object.fromEntries(['base_aj', 'salaire_brut', 'cnaps', 'irsa', 'avance', 'med', 'net', 'virement', 'especes', 'conge_pris_mois', 'conge_restant', 'verrouille'].map(key => [key, (p: PaieMensuelle) => Number(p[key as keyof PaieMensuelle] || 0)])),
  });

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
                {historySort.rows.map((p) => (<div key={p.id} className="border dark:border-slate-700 rounded-xl p-3 bg-slate-50 dark:bg-slate-700/50"><div className="flex justify-between items-center"><span className="font-bold text-salfa-dark dark:text-white text-sm">{p.mois} {p.annee}</span><span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${p.verrouille === 1 ? 'bg-slate-200 dark:bg-slate-600' : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300'}`}>{p.verrouille === 1 ? 'Clôturé' : 'Modifiable'}</span></div><div className="grid grid-cols-2 gap-2 mt-2 text-xs dark:text-slate-300"><div>Brut: <span className="font-mono font-bold">{fmt(p.salaire_brut)}</span></div><div>NET: <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">{fmt(p.net)}</span></div><div>Avance: <span className="font-mono text-red-600">{fmt(p.avance)}</span></div><div>Congé restant: <span className="font-mono font-bold text-violet-700 dark:text-violet-300">{fmtJoursCourt(p.conge_restant)} j</span></div></div></div>))}
              </div>
              <div className="hidden lg:block overflow-x-auto thin-scrollbar">
                <table className="w-full text-left border-collapse min-w-[960px]"><thead><tr className="bg-slate-50 dark:bg-slate-700 border-b dark:border-slate-600 text-xs font-bold uppercase text-slate-600 dark:text-slate-300"><SortableHeader column="periode" sort={historySort} className="py-2 px-3">Période</SortableHeader><SortableHeader column="base_aj" sort={historySort} className="py-2 px-3 text-right normal-case">Base</SortableHeader><SortableHeader column="salaire_brut" sort={historySort} className="py-2 px-3 text-right">Brut</SortableHeader><SortableHeader column="cnaps" sort={historySort} className="py-2 px-3 text-right">CNaPS</SortableHeader><SortableHeader column="irsa" sort={historySort} className="py-2 px-3 text-right">IRSA</SortableHeader><SortableHeader column="avance" sort={historySort} className="py-2 px-3 text-right">AVANCE</SortableHeader><SortableHeader column="med" sort={historySort} className="py-2 px-3 text-right">MED</SortableHeader><SortableHeader column="net" sort={historySort} className="py-2 px-4 text-right">NET</SortableHeader><SortableHeader column="virement" sort={historySort} className="py-2 px-3 text-right">VIREMENT</SortableHeader><SortableHeader column="especes" sort={historySort} className="py-2 px-3 text-right">ESPÈCES</SortableHeader><SortableHeader column="conge_pris_mois" sort={historySort} className="py-2 px-3 text-right">Congé pris</SortableHeader><SortableHeader column="conge_restant" sort={historySort} className="py-2 px-3 text-right">Congé restant</SortableHeader><SortableHeader column="verrouille" sort={historySort} className="py-2 px-3 text-center">Statut</SortableHeader></tr></thead><tbody className="divide-y dark:divide-slate-700 text-sm dark:text-slate-200">{historySort.rows.map((p) => (<tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50"><td className="py-2 px-3 font-bold">{p.mois} {p.annee}</td><td className="py-2 px-3 text-right font-mono">{fmt(p.base_aj)}</td><td className="py-2 px-3 text-right font-mono font-semibold">{fmt(p.salaire_brut)}</td><td className="py-2 px-3 text-right font-mono text-xs">{fmt(p.cnaps)}</td><td className="py-2 px-3 text-right font-mono text-xs">{fmt(p.irsa)}</td><td className="py-2 px-3 text-right font-mono text-red-600">{fmt(p.avance)}</td><td className="py-2 px-3 text-right font-mono text-red-600">{fmt(p.med)}</td><td className="py-2 px-4 text-right font-mono font-bold text-emerald-700 dark:text-emerald-400">{fmt(p.net)}</td><td className="py-2 px-3 text-right font-mono text-sky-700 dark:text-sky-300">{fmt(p.virement)}</td><td className="py-2 px-3 text-right font-mono text-emerald-700 dark:text-emerald-300">{fmt(p.especes)}</td><td className="py-2 px-3 text-right font-mono text-violet-700 dark:text-violet-300">{Number(p.conge_pris_mois || 0) ? `${fmtJoursCourt(p.conge_pris_mois)} j` : '—'}</td><td className="py-2 px-3 text-right font-mono font-bold text-violet-700 dark:text-violet-300">{fmtJoursCourt(p.conge_restant)} j</td><td className="py-2 px-3 text-center text-xs">{p.verrouille === 1 ? <span className="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-600 font-semibold">Clôturé</span> : <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300 font-semibold">Modifiable</span>}</td></tr>))}</tbody></table>
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
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-salfa-dark dark:bg-slate-600 text-white text-sm font-bold shadow flex items-center gap-2"><Save className="w-4 h-4" />{saving ? '...' : 'Appliquer'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SalariesSaisieTab;
