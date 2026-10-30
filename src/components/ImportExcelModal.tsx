// ==============================================================================
// MODALE D'IMPORT EXCEL INTELLIGENT — ANCIENS & NOUVEAUX CLASSEURS SALFA
// Analyse automatiquement les feuilles, les périodes, les en-têtes anciens ou
// incomplets, le contenu des cellules et la cohérence des formules de paie, puis
// permet de vérifier et réaffecter chaque champ à sa place avant l'importation.
// ==============================================================================
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Upload, FileSpreadsheet, X, CheckCircle2, AlertTriangle, Users, CalendarDays,
  Loader2, Replace, GitMerge, Info, Sparkles, SlidersHorizontal, Eye, Layers,
  RotateCcw, Archive, CopyCheck, ShieldAlert,
} from 'lucide-react';
import {
  analyserClasseurDetaille,
  AnalyseDetailleeResult,
  CHAMPS_SALFA,
  ChampSalfa,
  FeuilleAnalyse,
  MOIS_FR,
  SheetOverride,
  TypeFeuille,
  detectAnneeFichier,
} from '../local/importExcel';
import {
  importerClasseur,
  ImportRapport,
  ImportOptions,
  fetchEmployes,
  fetchPeriodes,
} from '../api';

interface Props {
  onClose: () => void;
  onImported?: (rapport: ImportRapport) => void;
  anneeDefaut?: number;
}

type OngletAnalyse = 'champs' | 'feuilles' | 'apercu';

const fmt = (n: number | null | undefined): string => {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

const ANNEES_LISTE = (() => {
  const max = new Date().getFullYear() + 5;
  const list: number[] = [];
  for (let y = max; y >= 1995; y--) list.push(y);
  return list;
})();

const GROUPES_SELECT = (() => {
  const map = new Map<string, typeof CHAMPS_SALFA>();
  for (const ch of CHAMPS_SALFA) {
    if (ch.key === 'ignore') continue;
    const arr = map.get(ch.groupeLabel) || [];
    arr.push(ch);
    map.set(ch.groupeLabel, arr);
  }
  return Array.from(map.entries());
})();

const RUBRIQUES_CLES: { key: ChampSalfa; court: string }[] = [
  { key: 'numero_matricule', court: 'N° Mat' },
  { key: 'nom_prenoms', court: 'Nom & Prénoms' },
  { key: 'categorie', court: 'CAT' },
  { key: 'jobs', court: 'Fonction' },
  { key: 'base_aj', court: 'Base' },
  { key: 'logt_trsp', court: 'Logt/Trsp' },
  { key: 'rendement', court: 'Rendement' },
  { key: 'resp_repres', court: 'Resp.' },
  { key: 'salaire_brut', court: 'Sal. Brut' },
  { key: 'cnaps', court: 'CNaPS 1%' },
  { key: 'irsa', court: 'IRSA' },
  { key: 'salaire_net', court: 'Sal. Net' },
  { key: 'augmentation_divers', court: 'Augm.' },
  { key: 'prime_de_garde', court: 'Garde' },
  { key: 'anciennete2', court: 'Prime Anc.' },
  { key: 'risque', court: 'Risque' },
  { key: 'repr_rec', court: 'Repr°' },
  { key: 'accessoir', court: 'Accessoires' },
  { key: 'brut', court: 'BRUT' },
  { key: 'avance', court: 'AVANCE' },
  { key: 'med', court: 'MED' },
  { key: 'net', court: 'NET' },
  { key: 'rib', court: 'RIB' },
];

export const ImportExcelModal: React.FC<Props> = ({
  onClose,
  onImported,
  anneeDefaut = new Date().getFullYear(),
}) => {
  const [rawBuffer, setRawBuffer] = useState<ArrayBuffer | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [overrides, setOverrides] = useState<Record<string, SheetOverride>>({});
  const [employesExistants, setEmployesExistants] = useState<{ numero_matricule: number; nom_prenoms: string }[]>([]);
  const [maxAnneeStore, setMaxAnneeStore] = useState<number>(anneeDefaut);

  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [rapport, setRapport] = useState<ImportRapport | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [annee, setAnnee] = useState(anneeDefaut);
  const [mode, setMode] = useState<'fusion' | 'remplacement'>('fusion');
  const [importPaies, setImportPaies] = useState(true);
  const [ecraserPaies, setEcraserPaies] = useState(true);
  const [mettreAJourFiches, setMettreAJourFiches] = useState(true);
  const [nouveauxCommeInactifs, setNouveauxCommeInactifs] = useState(false);

  const [onglet, setOnglet] = useState<OngletAnalyse>('champs');
  const [feuilleSelectionnee, setFeuilleSelectionnee] = useState<string>('');
  const [filtrePeriode, setFiltrePeriode] = useState<string>('TOUTES');
  const [vueApercu, setVueApercu] = useState<'paies' | 'employes'>('paies');
  const [rechercheApercu, setRechercheApercu] = useState<string>('');
  const [copieMessage, setCopieMessage] = useState<string>('');

  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    Promise.all([fetchEmployes(false, ''), fetchPeriodes()])
      .then(([emps, per]) => {
        setEmployesExistants(
          (emps || []).map((e) => ({
            numero_matricule: Number(e.numero_matricule),
            nom_prenoms: String(e.nom_prenoms || ''),
          }))
        );
        if (per && per.length > 0) {
          const maxY = Math.max(...per.map((p) => Number(p.annee)));
          if (Number.isFinite(maxY)) setMaxAnneeStore(maxY);
        }
      })
      .catch(() => {});
  }, []);

  // Analyse réactive instantanée dès qu'on ajuste l'année, une feuille ou un champ
  const analyse: AnalyseDetailleeResult | null = useMemo(() => {
    if (!rawBuffer || !fileName) return null;
    try {
      return analyserClasseurDetaille(rawBuffer, fileName, {
        anneeDefaut: annee,
        overrides,
        employesExistants,
      });
    } catch (e: any) {
      console.error(e);
      return null;
    }
  }, [rawBuffer, fileName, annee, overrides, employesExistants]);

  const chargerFichier = async (file: File) => {
    setErreur(null);
    setRapport(null);
    setCopieMessage('');
    setLoading(true);
    try {
      const buf = await file.arrayBuffer();
      const anneeDuNom = detectAnneeFichier(file.name);
      const anneeInitiale = anneeDuNom || annee;
      if (anneeDuNom) setAnnee(anneeDuNom);

      // Test initial pour sélectionner intelligemment la première feuille pertinente
      const test = analyserClasseurDetaille(buf, file.name, {
        anneeDefaut: anneeInitiale,
        employesExistants,
      });

      const anneesDetectees = test.periodes.map((p) => p.annee);
      const maxAnneeFichier = anneesDetectees.length ? Math.max(...anneesDetectees) : anneeInitiale;
      const estArchiveAncienne = maxAnneeFichier < maxAnneeStore;
      setMettreAJourFiches(!estArchiveAncienne);
      setNouveauxCommeInactifs(estArchiveAncienne);

      const premiereEtat =
        test.feuillesDetail.find((f) => f.incluse && f.type === 'etat') ||
        test.feuillesDetail.find((f) => f.incluse) ||
        test.feuillesDetail.find((f) => f.colonnesDetail.length > 0) ||
        test.feuillesDetail[0];

      setOverrides({});
      setRawBuffer(buf);
      setFileName(file.name);
      setFeuilleSelectionnee(premiereEtat?.nom || '');
      setFiltrePeriode('TOUTES');
      setVueApercu(test.paies.length > 0 ? 'paies' : 'employes');
      setOnglet('champs');

      if (!test.employes.length && !test.paies.length) {
        setErreur(
          "Aucune feuille n'a pu être mappée automatiquement : utilisez les onglets « Feuilles & Périodes » et « Analyse des champs » ci-dessous pour activer la feuille et placer chaque colonne."
        );
      }
    } catch (e: any) {
      console.error(e);
      setErreur(`Impossible de lire le fichier : ${e?.message || e}`);
      setRawBuffer(null);
    } finally {
      setLoading(false);
    }
  };

  const onFiles = (files: FileList | null) => {
    if (!files || !files.length) return;
    chargerFichier(files[0]);
  };

  const majFeuilleOverride = (nomFeuille: string, patch: Partial<SheetOverride>) => {
    setCopieMessage('');
    setErreur(null);
    setOverrides((prev) => {
      const cur = prev[nomFeuille] || {};
      return { ...prev, [nomFeuille]: { ...cur, ...patch } };
    });
  };

  const majColonneOverride = (nomFeuille: string, colIdx: number, champ: ChampSalfa) => {
    setCopieMessage('');
    setErreur(null);
    setOverrides((prev) => {
      const cur = prev[nomFeuille] || {};
      const cols = { ...(cur.colonnes || {}) };
      // Libérer toute autre colonne qui avait reçu manuellement ce même champ
      if (champ !== 'ignore') {
        for (const [k, v] of Object.entries(cols)) {
          if (Number(k) !== colIdx && v === champ) delete cols[Number(k)];
        }
      }
      cols[colIdx] = champ;
      return { ...prev, [nomFeuille]: { ...cur, colonnes: cols } };
    });
  };

  const appliquerMappageAuxAutresFeuilles = (source: FeuilleAnalyse) => {
    if (!analyse) return;
    // Associe l'intitulé d'en-tête normalisé (ou à défaut l'index de colonne) au champ retenu
    const parTitre = new Map<string, ChampSalfa>();
    for (const c of source.colonnesDetail) {
      const t = c.enteteBrut.trim().toUpperCase();
      if (t) parTitre.set(t, c.champRetenu);
    }
    let nbFeuillesMaj = 0;
    setOverrides((prev) => {
      const next = { ...prev };
      for (const f of analyse.feuillesDetail) {
        if (f.nom === source.nom || !f.incluse || f.type !== source.type) continue;
        const cols: Record<number, ChampSalfa> = { ...(next[f.nom]?.colonnes || {}) };
        let touched = false;
        for (const col of f.colonnesDetail) {
          const t = col.enteteBrut.trim().toUpperCase();
          if (t && parTitre.has(t)) {
            const target = parTitre.get(t)!;
            if (col.champRetenu !== target) {
              cols[col.index] = target;
              touched = true;
            }
          } else if (!t && source.colonnesDetail[col.index] && !source.colonnesDetail[col.index].enteteBrut.trim()) {
            const target = source.colonnesDetail[col.index].champRetenu;
            if (col.champRetenu !== target) {
              cols[col.index] = target;
              touched = true;
            }
          }
        }
        if (touched) {
          next[f.nom] = { ...(next[f.nom] || {}), colonnes: cols };
          nbFeuillesMaj++;
        }
      }
      return next;
    });
    setCopieMessage(
      nbFeuillesMaj > 0
        ? `Placement des champs reproduit sur ${nbFeuillesMaj} autre(s) feuille(s).`
        : 'Toutes les autres feuilles actives utilisent déjà ce même placement.'
    );
  };

  const appliquerAnneePartout = (nouvelleAnnee: number) => {
    setAnnee(nouvelleAnnee);
    if (!analyse) return;
    setOverrides((prev) => {
      const next = { ...prev };
      for (const f of analyse.feuillesDetail) {
        if (f.incluse && f.type === 'etat') {
          next[f.nom] = { ...(next[f.nom] || {}), annee: nouvelleAnnee };
        }
      }
      return next;
    });
    setCopieMessage(`Année ${nouvelleAnnee} appliquée à toutes les feuilles d'état actives.`);
  };

  const lancerImport = async () => {
    if (!analyse) return;
    setImporting(true);
    setErreur(null);
    const opts: ImportOptions = {
      mode,
      importPaies,
      ecraserPaies,
      mettreAJourFiches: mode === 'remplacement' ? true : mettreAJourFiches,
      nouveauxCommeInactifs: mode === 'remplacement' ? false : nouveauxCommeInactifs,
    };
    try {
      const res = await importerClasseur(analyse, opts);
      setRapport(res);
      if (onImported) onImported(res);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Import non confirmé.');
    } finally {
      setImporting(false);
    }
  };

  const feuilleCourante: FeuilleAnalyse | undefined = useMemo(() => {
    if (!analyse) return undefined;
    return (
      analyse.feuillesDetail.find((f) => f.nom === feuilleSelectionnee) ||
      analyse.feuillesDetail.find((f) => f.incluse) ||
      analyse.feuillesDetail[0]
    );
  }, [analyse, feuilleSelectionnee]);

  const nbEmployes = analyse?.employes.length || 0;
  const nbPaies = analyse?.paies.length || 0;
  const feuillesActives = analyse?.feuillesDetail.filter((f) => f.incluse).length || 0;
  const aDesOverrides = Object.keys(overrides).length > 0;

  const estArchiveDetectee = useMemo(() => {
    if (!analyse || !analyse.periodes.length) return annee < maxAnneeStore;
    return Math.max(...analyse.periodes.map((p) => p.annee)) < maxAnneeStore;
  }, [analyse, annee, maxAnneeStore]);

  const paiesApercu = useMemo(() => {
    if (!analyse) return [];
    const q = rechercheApercu.trim().toLowerCase();
    return analyse.paies.filter((p) => {
      if (filtrePeriode !== 'TOUTES' && `${p.mois} ${p.annee}` !== filtrePeriode) return false;
      if (!q) return true;
      return (
        String(p.numero_matricule).includes(q) ||
        p.nom_prenoms.toLowerCase().includes(q) ||
        (p.jobs || '').toLowerCase().includes(q) ||
        (p.categorie || '').toLowerCase().includes(q)
      );
    });
  }, [analyse, filtrePeriode, rechercheApercu]);

  const employesApercu = useMemo(() => {
    if (!analyse) return [];
    const q = rechercheApercu.trim().toLowerCase();
    return analyse.employes.filter((e) => {
      if (!q) return true;
      return (
        String(e.numero_matricule).includes(q) ||
        e.nom_prenoms.toLowerCase().includes(q) ||
        (e.jobs || '').toLowerCase().includes(q) ||
        (e.categorie || '').toLowerCase().includes(q)
      );
    });
  }, [analyse, rechercheApercu]);

  const coherencePct = useMemo(() => {
    const g = analyse?.coherenceGlobale;
    if (!g || g.lignes === 0) return null;
    return Math.round((g.netOk / g.lignes) * 100);
  }, [analyse]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[95dvh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-700 modal-mobile">
        {/* En-tête */}
        <div className="bg-salfa-dark dark:bg-slate-900 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between text-white shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-300 shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-lg font-bold truncate">
                Assistant d'analyse & import Excel (anciens et nouveaux classeurs)
              </h3>
              <p className="text-[10px] sm:text-xs text-slate-300 truncate">
                Analyse intelligente des colonnes, vérification des formules et placement de chaque champ avant import (.xls, .xlsx, .xlsm, .xlsb, .csv)
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 shrink-0" aria-label="Fermer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 sm:p-5 space-y-4 overflow-y-auto thin-scrollbar flex-1">
          {/* Zone de dépôt (compacte une fois le fichier chargé) */}
          {!rapport && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); onFiles(e.dataTransfer.files); }}
              onClick={() => inputRef.current?.click()}
              className={`cursor-pointer rounded-2xl border-2 border-dashed transition ${
                analyse ? 'p-3 sm:p-4' : 'p-6 sm:p-8'
              } text-center ${
                dragOver
                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                  : 'border-slate-300 dark:border-slate-600 hover:border-emerald-400 hover:bg-slate-50 dark:hover:bg-slate-700/40'
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xlsm,.xls,.xlsb,.csv"
                className="hidden"
                onChange={(e) => onFiles(e.target.files)}
              />
              {loading ? (
                <div className="flex items-center justify-center gap-2 text-slate-600 dark:text-slate-300 py-2">
                  <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
                  <span className="text-sm font-semibold">Analyse intelligente des feuilles et des colonnes…</span>
                </div>
              ) : analyse ? (
                <div className="flex flex-wrap items-center justify-between gap-2 text-left">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileSpreadsheet className="w-6 h-6 text-emerald-600 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                        {analyse.fichier}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {analyse.feuillesDetail.length} feuille(s) analysée(s) • Cliquez ici pour charger un autre fichier Excel (.xls, .xlsx, .xlsm, .xlsb, .csv)
                      </div>
                    </div>
                  </div>
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    Changer de fichier
                  </span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="w-8 h-8 text-emerald-600" />
                  <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    Déposez votre classeur de salaire Excel (ancien ou récent)
                  </div>
                  <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 max-w-xl">
                    Formats pris en charge : <b>.xls</b>, <b>.xlsx</b>, <b>.xlsm</b>, <b>.xlsb</b>, <b>.csv</b>. L'assistant analyse d'abord les en-têtes, les valeurs et les formules pour placer chaque champ à sa place avant toute écriture.
                  </div>
                </div>
              )}
            </div>
          )}

          {erreur && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-[11px] sm:text-xs text-red-800 dark:text-red-300">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{erreur}</span>
            </div>
          )}

          {/* Analyse interactive avant import */}
          {analyse && !rapport && (
            <>
              {/* Cartes de synthèse + diagnostic global */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <Stat label="Salariés reconnus" value={String(nbEmployes)} icon={<Users className="w-4 h-4 text-sky-600" />} />
                <Stat label="Bulletins prêts" value={String(nbPaies)} icon={<FileSpreadsheet className="w-4 h-4 text-emerald-600" />} />
                <Stat label="Périodes" value={String(analyse.periodes.length)} icon={<CalendarDays className="w-4 h-4 text-indigo-600" />} />
                <Stat label="Feuilles retenues" value={`${feuillesActives} / ${analyse.feuillesDetail.length}`} icon={<Layers className="w-4 h-4 text-amber-600" />} />
                <Stat
                  label="Formules vérifiées"
                  value={coherencePct !== null ? `${coherencePct}%` : 'Personnel'}
                  sub={
                    analyse.coherenceGlobale.lignes > 0
                      ? `${analyse.coherenceGlobale.netOk}/${analyse.coherenceGlobale.lignes} nets cohérents`
                      : 'Fiches salariés'
                  }
                  icon={<Sparkles className="w-4 h-4 text-emerald-600" />}
                />
              </div>

              {/* Bandeau archive ancienne détectée */}
              {estArchiveDetectee && mode === 'fusion' && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 text-xs text-sky-900 dark:text-sky-200">
                  <div className="flex items-start gap-2">
                    <Archive className="w-4 h-4 text-sky-600 dark:text-sky-300 shrink-0 mt-0.5" />
                    <span>
                      <b>Ancien exercice détecté :</b> le mode <b>Archive historique</b> est activé pour importer tous les bulletins anciens à leur période exacte <b>sans écraser les salaires de base {maxAnneeStore}</b> des salariés actuels.
                    </span>
                  </div>
                </div>
              )}

              {copieMessage && (
                <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    {copieMessage}
                  </span>
                  <button type="button" onClick={() => setCopieMessage('')} className="text-emerald-700 hover:underline">OK</button>
                </div>
              )}

              {/* Navigation des 3 étapes d'analyse avant import */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-700 pb-2">
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setOnglet('champs')}
                    className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
                      onglet === 'champs'
                        ? 'bg-salfa-dark dark:bg-slate-700 text-white shadow-sm'
                        : 'bg-slate-100 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                    }`}
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span>1. Analyse des champs (chaque champ à sa place)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setOnglet('feuilles')}
                    className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
                      onglet === 'feuilles'
                        ? 'bg-salfa-dark dark:bg-slate-700 text-white shadow-sm'
                        : 'bg-slate-100 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>2. Feuilles & Périodes ({feuillesActives})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setOnglet('apercu')}
                    className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
                      onglet === 'apercu'
                        ? 'bg-salfa-dark dark:bg-slate-700 text-white shadow-sm'
                        : 'bg-slate-100 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>3. Aperçu avant import ({nbPaies || nbEmployes})</span>
                  </button>
                </div>

                {aDesOverrides && (
                  <button
                    type="button"
                    onClick={() => { setOverrides({}); setCopieMessage('Analyse automatique d’origine restaurée.'); }}
                    className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 hover:underline flex items-center gap-1"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Réinitialiser les ajustements manuels
                  </button>
                )}
              </div>

              {/* ==================== ONGLET 1 : ANALYSE ET PLACEMENT DES CHAMPS ==================== */}
              {onglet === 'champs' && feuilleCourante && (
                <div className="space-y-3">
                  <div className="bg-slate-50 dark:bg-slate-700/40 rounded-xl p-3 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-bold text-slate-700 dark:text-slate-200">Feuille inspectée :</span>
                      <select
                        value={feuilleCourante.nom}
                        onChange={(e) => setFeuilleSelectionnee(e.target.value)}
                        className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-2.5 py-1.5 text-xs font-bold"
                      >
                        {analyse.feuillesDetail.map((f) => (
                          <option key={f.nom} value={f.nom}>
                            {f.nom} {f.incluse ? `(${f.type === 'etat' ? f.periode || 'État' : 'Personnel'} · ${f.nbLignes} lig.)` : '(Ignorée)'}
                          </option>
                        ))}
                      </select>

                      {feuilleCourante.lignesTotalesBrutes > 0 && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-500 dark:text-slate-400">Ligne des titres :</span>
                          <select
                            value={Math.max(1, feuilleCourante.ligneEntete)}
                            onChange={(e) =>
                              majFeuilleOverride(feuilleCourante.nom, { ligneEntete: Number(e.target.value) })
                            }
                            className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-2 py-1 text-xs font-mono font-bold"
                          >
                            {Array.from(
                              { length: Math.min(20, Math.max(1, feuilleCourante.lignesTotalesBrutes)) },
                              (_, i) => i + 1
                            ).map((r) => (
                              <option key={r} value={r}>Ligne {r}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {!feuilleCourante.incluse && feuilleCourante.lignesTotalesBrutes > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            majFeuilleOverride(feuilleCourante.nom, {
                              incluse: true,
                              type: 'etat',
                              mois: feuilleCourante.moisRetenu || 'JANVIER',
                              annee: feuilleCourante.anneeRetenue || annee,
                            })
                          }
                          className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold"
                        >
                          Activer cette feuille pour l'import
                        </button>
                      )}
                      {feuilleCourante.incluse && feuillesActives > 1 && (
                        <button
                          type="button"
                          onClick={() => appliquerMappageAuxAutresFeuilles(feuilleCourante)}
                          className="px-3 py-1.5 rounded-lg bg-sky-100 dark:bg-sky-900/40 hover:bg-sky-200 text-salfa-teal dark:text-sky-300 text-xs font-bold flex items-center gap-1.5"
                        >
                          <CopyCheck className="w-3.5 h-3.5" />
                          Appliquer ce placement aux autres feuilles
                        </button>
                      )}
                    </div>
                  </div>

                  {/* État récapitulatif des rubriques SALFA placées */}
                  <div className="flex flex-wrap gap-1.5">
                    {RUBRIQUES_CLES.map((r) => {
                      const col = feuilleCourante.colonnesDetail.find((c) => c.champRetenu === r.key);
                      return (
                        <span
                          key={r.key}
                          title={col ? `Colonne ${col.lettre} (${col.enteteBrut || 'sans titre'})` : 'Absent de la feuille (calculé ou 0)'}
                          className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                            col
                              ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                              : 'bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-dashed border-slate-300 dark:border-slate-700'
                          }`}
                        >
                          {col ? `✓ ${r.court} (${col.lettre})` : `${r.court}`}
                        </span>
                      );
                    })}
                  </div>

                  {/* Alertes de cohérence éventuelles sur la feuille */}
                  {feuilleCourante.coherence && feuilleCourante.coherence.alertes.length > 0 && (
                    <div className="space-y-1">
                      {feuilleCourante.coherence.alertes.map((al, i) => (
                        <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300">
                          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                          <span>{al}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Tableau de correspondance colonne Excel -> champ SALFA */}
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <div className="max-h-72 overflow-y-auto thin-scrollbar">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-700 text-[11px] uppercase text-slate-600 dark:text-slate-300">
                          <tr>
                            <th className="py-2.5 px-3 w-14 text-center">Col.</th>
                            <th className="py-2.5 px-3">En-tête lu dans Excel</th>
                            <th className="py-2.5 px-3">Exemples de valeurs</th>
                            <th className="py-2.5 px-3">Diagnostic d'analyse</th>
                            <th className="py-2.5 px-3 w-64">Champ SALFA attribué</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                          {feuilleCourante.colonnesDetail.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="py-6 text-center text-slate-500">
                                Aucune colonne détectée sur cette feuille. Essayez de modifier la « Ligne des titres ».
                              </td>
                            </tr>
                          ) : (
                            feuilleCourante.colonnesDetail.map((col) => {
                              const ignoree = col.champRetenu === 'ignore';
                              return (
                                <tr
                                  key={col.index}
                                  className={
                                    ignoree
                                      ? 'bg-slate-50/60 dark:bg-slate-800/40 text-slate-400 dark:text-slate-500'
                                      : 'hover:bg-sky-50/40 dark:hover:bg-slate-700/40'
                                  }
                                >
                                  <td className="py-2 px-3 text-center font-mono font-bold text-slate-700 dark:text-slate-200">
                                    {col.lettre}
                                  </td>
                                  <td className="py-2 px-3 font-semibold text-slate-800 dark:text-slate-100">
                                    {col.enteteBrut ? (
                                      col.enteteBrut
                                    ) : (
                                      <span className="italic text-amber-600 dark:text-amber-400">(Sans titre)</span>
                                    )}
                                  </td>
                                  <td className="py-2 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-300 max-w-[220px] truncate" title={col.exemples.join(' · ')}>
                                    {col.exemples.length ? col.exemples.join(' · ') : '—'}
                                  </td>
                                  <td className="py-2 px-3">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span
                                        className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 ${
                                          col.confiance === 'haute'
                                            ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300'
                                            : col.confiance === 'moyenne'
                                            ? 'bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-300'
                                            : col.confiance === 'manuel'
                                            ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300'
                                            : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                                        }`}
                                      >
                                        {col.confiance === 'haute'
                                          ? 'Auto · Sûr'
                                          : col.confiance === 'moyenne'
                                          ? 'Déduit contenu'
                                          : col.confiance === 'manuel'
                                          ? 'Manuel'
                                          : 'Ignoré'}
                                      </span>
                                      <span className="text-[11px] text-slate-500 dark:text-slate-400">{col.raison}</span>
                                    </div>
                                  </td>
                                  <td className="py-1.5 px-3">
                                    <select
                                      aria-label={`Champ SALFA pour la colonne ${col.lettre}`}
                                      value={col.champRetenu}
                                      onChange={(e) =>
                                        majColonneOverride(
                                          feuilleCourante.nom,
                                          col.index,
                                          e.target.value as ChampSalfa
                                        )
                                      }
                                      className={`w-full rounded-lg border px-2 py-1.5 text-xs font-bold ${
                                        ignoree
                                          ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500'
                                          : 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-slate-700 text-slate-900 dark:text-white'
                                      }`}
                                    >
                                      <option value="ignore">— Ignorer cette colonne —</option>
                                      {GROUPES_SELECT.map(([grp, items]) => (
                                        <optgroup key={grp} label={grp}>
                                          {items.map((it) => (
                                            <option key={it.key} value={it.key}>
                                              {it.label}
                                            </option>
                                          ))}
                                        </optgroup>
                                      ))}
                                    </select>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* ==================== ONGLET 2 : FEUILLES & PÉRIODES ==================== */}
              {onglet === 'feuilles' && (
                <div className="space-y-3">
                  <div className="bg-slate-50 dark:bg-slate-700/40 rounded-xl p-3 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-700 dark:text-slate-200">Année par défaut du classeur :</span>
                      <select
                        value={annee}
                        onChange={(e) => setAnnee(Number(e.target.value))}
                        className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-2.5 py-1.5 text-xs font-bold"
                      >
                        {ANNEES_LISTE.map((y) => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => appliquerAnneePartout(annee)}
                        className="px-2.5 py-1.5 rounded-lg bg-sky-100 dark:bg-sky-900/40 hover:bg-sky-200 text-salfa-teal dark:text-sky-300 font-bold"
                      >
                        Forcer {annee} sur tous les états actifs
                      </button>
                    </div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Cochez ou décochez librement les feuilles à importer et vérifiez leur période (mois / année).
                    </span>
                  </div>

                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <div className="max-h-72 overflow-y-auto thin-scrollbar divide-y divide-slate-100 dark:divide-slate-700">
                      {analyse.feuillesDetail.map((f) => (
                        <div key={f.nom} className="px-3 py-2.5 text-xs flex flex-wrap items-center gap-2">
                          <input
                            type="checkbox"
                            checked={f.incluse}
                            disabled={f.lignesTotalesBrutes === 0}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              majFeuilleOverride(f.nom, {
                                incluse: checked,
                                type: checked ? (f.typeDetecte === 'ignore' ? 'etat' : f.typeDetecte) : 'ignore',
                                mois: checked && !f.moisRetenu ? 'JANVIER' : f.moisRetenu,
                                annee: f.anneeRetenue || annee,
                              });
                            }}
                            className="rounded text-emerald-600"
                          />
                          <span className="font-bold text-slate-800 dark:text-slate-100 min-w-[130px] truncate">
                            {f.nom}
                          </span>

                          <select
                            value={f.incluse ? f.type : 'ignore'}
                            disabled={f.lignesTotalesBrutes === 0}
                            onChange={(e) => {
                              const t = e.target.value as TypeFeuille;
                              majFeuilleOverride(f.nom, {
                                incluse: t !== 'ignore',
                                type: t,
                                mois: t === 'etat' && !f.moisRetenu ? 'JANVIER' : f.moisRetenu,
                              });
                            }}
                            className={`rounded-lg border px-2 py-1 text-[11px] font-bold ${
                              f.type === 'etat'
                                ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300'
                                : f.type === 'personnel'
                                ? 'border-sky-300 bg-sky-50 dark:bg-sky-900/30 text-sky-800 dark:text-sky-300'
                                : 'border-slate-200 dark:border-slate-600 bg-slate-100 dark:bg-slate-700 text-slate-500'
                            }`}
                          >
                            <option value="etat">État de paie mensuel</option>
                            <option value="personnel">Liste du personnel</option>
                            <option value="ignore">Ignorer</option>
                          </select>

                          {f.incluse && f.type === 'etat' && (
                            <div className="flex items-center gap-1.5">
                              <select
                                value={f.moisRetenu || ''}
                                onChange={(e) =>
                                  majFeuilleOverride(f.nom, { mois: e.target.value || null })
                                }
                                className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-2 py-1 text-[11px] font-bold"
                              >
                                <option value="">— Mois (colonne) —</option>
                                {MOIS_FR.map((m) => (
                                  <option key={m} value={m}>{m}</option>
                                ))}
                              </select>
                              <select
                                value={f.anneeRetenue || annee}
                                onChange={(e) =>
                                  majFeuilleOverride(f.nom, { annee: Number(e.target.value) })
                                }
                                className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-2 py-1 text-[11px] font-mono font-bold"
                              >
                                {ANNEES_LISTE.map((y) => (
                                  <option key={y} value={y}>{y}</option>
                                ))}
                              </select>
                            </div>
                          )}

                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            {f.incluse ? `${f.nbLignes} salarié(s)` : f.message || 'Ignorée'}
                          </span>

                          {f.coherence && f.coherence.lignesVerifiees > 0 && (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
                              {f.coherence.netOk}/{f.coherence.lignesVerifiees} nets OK
                            </span>
                          )}

                          {f.colonnesDetail.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setFeuilleSelectionnee(f.nom);
                                setOnglet('champs');
                              }}
                              className="ml-auto text-[11px] font-bold text-salfa-teal dark:text-sky-300 hover:underline"
                            >
                              Vérifier les champs →
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ==================== ONGLET 3 : APERÇU DES DONNÉES PLACÉES ==================== */}
              {onglet === 'apercu' && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="inline-flex rounded-lg bg-slate-100 dark:bg-slate-700 p-0.5">
                        <button
                          type="button"
                          onClick={() => setVueApercu('paies')}
                          className={`px-2.5 py-1 rounded-md font-bold ${
                            vueApercu === 'paies' ? 'bg-white dark:bg-slate-600 shadow-sm' : 'text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          Bulletins ({nbPaies})
                        </button>
                        <button
                          type="button"
                          onClick={() => setVueApercu('employes')}
                          className={`px-2.5 py-1 rounded-md font-bold ${
                            vueApercu === 'employes' ? 'bg-white dark:bg-slate-600 shadow-sm' : 'text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          Fiches salariés ({nbEmployes})
                        </button>
                      </div>

                      {vueApercu === 'paies' && analyse.periodes.length > 0 && (
                        <select
                          value={filtrePeriode}
                          onChange={(e) => setFiltrePeriode(e.target.value)}
                          className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-2.5 py-1.5 text-xs font-bold"
                        >
                          <option value="TOUTES">Toutes les périodes ({nbPaies})</option>
                          {analyse.periodes.map((p) => (
                            <option key={`${p.mois} ${p.annee}`} value={`${p.mois} ${p.annee}`}>
                              {p.mois} {p.annee} ({p.nb})
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    <input
                      type="text"
                      value={rechercheApercu}
                      onChange={(e) => setRechercheApercu(e.target.value)}
                      placeholder="Filtrer par matricule, nom, fonction…"
                      className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-1.5 text-xs w-full sm:w-64"
                    />
                  </div>

                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <div className="max-h-64 overflow-auto thin-scrollbar">
                      {vueApercu === 'paies' ? (
                        <table className="w-full text-left border-collapse text-[11px] min-w-[1250px]">
                          <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-700 uppercase text-slate-600 dark:text-slate-300">
                            <tr>
                              <th className="py-2 px-2">Période</th>
                              <th className="py-2 px-2 text-center">Mat</th>
                              <th className="py-2 px-2">Nom et Prénoms</th>
                              <th className="py-2 px-2 text-center">CAT</th>
                              <th className="py-2 px-2">Fonction</th>
                              <th className="py-2 px-2 text-right normal-case">Base</th>
                              <th className="py-2 px-2 text-right">Sal. Brut</th>
                              <th className="py-2 px-2 text-right">CNaPS</th>
                              <th className="py-2 px-2 text-right">IRSA</th>
                              <th className="py-2 px-2 text-right">Sal. Net</th>
                              <th className="py-2 px-2 text-right">Prime Anc.</th>
                              <th className="py-2 px-2 text-right">Access.</th>
                              <th className="py-2 px-2 text-right font-bold">BRUT</th>
                              <th className="py-2 px-2 text-right text-amber-700 dark:text-amber-300">AVANCE</th>
                              <th className="py-2 px-2 text-right text-rose-700 dark:text-rose-300">MED</th>
                              <th className="py-2 px-2 text-right font-extrabold text-emerald-700 dark:text-emerald-300">NET</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-700 font-mono">
                            {paiesApercu.slice(0, 120).map((p) => (
                              <tr key={`${p.annee}-${p.mois}-${p.numero_matricule}`} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                                <td className="py-1.5 px-2 font-sans font-bold whitespace-nowrap">{p.mois} {p.annee}</td>
                                <td className="py-1.5 px-2 text-center font-bold">{p.numero_matricule}</td>
                                <td className="py-1.5 px-2 font-sans font-semibold truncate max-w-[170px]">{p.nom_prenoms}</td>
                                <td className="py-1.5 px-2 text-center font-sans">{p.categorie || '—'}</td>
                                <td className="py-1.5 px-2 font-sans truncate max-w-[120px]">{p.jobs || '—'}</td>
                                <td className="py-1.5 px-2 text-right">{fmt(p.base_aj)}</td>
                                <td className="py-1.5 px-2 text-right">{fmt(p.salaire_brut)}</td>
                                <td className="py-1.5 px-2 text-right">{fmt(p.cnaps)}</td>
                                <td className="py-1.5 px-2 text-right">{fmt(p.irsa)}</td>
                                <td className="py-1.5 px-2 text-right">{fmt(p.salaire_net)}</td>
                                <td className="py-1.5 px-2 text-right">{fmt(p.anciennete2)}</td>
                                <td className="py-1.5 px-2 text-right">{fmt(p.accessoir)}</td>
                                <td className="py-1.5 px-2 text-right font-bold">{fmt(p.brut)}</td>
                                <td className="py-1.5 px-2 text-right text-amber-700 dark:text-amber-300">{fmt(p.avance)}</td>
                                <td className="py-1.5 px-2 text-right text-rose-700 dark:text-rose-300">{fmt(p.med)}</td>
                                <td className="py-1.5 px-2 text-right font-extrabold text-emerald-700 dark:text-emerald-300">{fmt(p.net)}</td>
                              </tr>
                            ))}
                            {paiesApercu.length === 0 && (
                              <tr>
                                <td colSpan={16} className="py-6 text-center font-sans text-slate-500">
                                  Aucun bulletin à prévisualiser.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      ) : (
                        <table className="w-full text-left border-collapse text-[11px] min-w-[900px]">
                          <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-700 uppercase text-slate-600 dark:text-slate-300">
                            <tr>
                              <th className="py-2 px-2 text-center">Mat</th>
                              <th className="py-2 px-2">Nom et Prénoms</th>
                              <th className="py-2 px-2">N° CNaPS</th>
                              <th className="py-2 px-2 text-center">CAT</th>
                              <th className="py-2 px-2">Fonction (JOBS)</th>
                              <th className="py-2 px-2">Embauche</th>
                              <th className="py-2 px-2 text-center">Ans</th>
                              <th className="py-2 px-2 text-right normal-case">Base</th>
                              <th className="py-2 px-2 text-right">Logt/Trsp</th>
                              <th className="py-2 px-2 text-right">Rend.</th>
                              <th className="py-2 px-2 text-right">Resp.</th>
                              <th className="py-2 px-2">Mode / RIB</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-700 font-mono">
                            {employesApercu.map((e) => (
                              <tr key={e.numero_matricule} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                                <td className="py-1.5 px-2 text-center font-bold">{e.numero_matricule}</td>
                                <td className="py-1.5 px-2 font-sans font-semibold">{e.nom_prenoms}</td>
                                <td className="py-1.5 px-2">{e.numero_cnaps || '—'}</td>
                                <td className="py-1.5 px-2 text-center font-sans">{e.categorie || '—'}</td>
                                <td className="py-1.5 px-2 font-sans">{e.jobs || '—'}</td>
                                <td className="py-1.5 px-2">{e.date_embauche || '—'}</td>
                                <td className="py-1.5 px-2 text-center">{e.nombre_annees}</td>
                                <td className="py-1.5 px-2 text-right">{fmt(e.base_aj)}</td>
                                <td className="py-1.5 px-2 text-right">{fmt(e.logement_transport)}</td>
                                <td className="py-1.5 px-2 text-right">{fmt(e.rendement)}</td>
                                <td className="py-1.5 px-2 text-right">{fmt(e.responsabilite_representation)}</td>
                                <td className="py-1.5 px-2 text-[10px]">{e.rib || e.mode_paiement}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Options d'écriture dans la base */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-slate-700">
                <div className="space-y-2">
                  <div className="text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300">Mode d'import</div>
                  <label className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer text-xs ${mode === 'fusion' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'border-slate-200 dark:border-slate-600'}`}>
                    <input type="radio" checked={mode === 'fusion'} onChange={() => setMode('fusion')} className="mt-0.5" />
                    <span>
                      <b className="flex items-center gap-1"><GitMerge className="w-3.5 h-3.5" />Fusionner avec les données existantes (recommandé)</b>
                      <span className="text-slate-500 dark:text-slate-400">Idéal pour importer d'anciens exercices (2022, 2023, 2024, 2025…) sans perdre les données actuelles.</span>
                    </span>
                  </label>
                  <label className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer text-xs ${mode === 'remplacement' ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : 'border-slate-200 dark:border-slate-600'}`}>
                    <input type="radio" checked={mode === 'remplacement'} onChange={() => setMode('remplacement')} className="mt-0.5" />
                    <span>
                      <b className="flex items-center gap-1"><Replace className="w-3.5 h-3.5" />Remplacer tout</b>
                      <span className="text-slate-500 dark:text-slate-400">Efface les salariés et les paies non clôturés puis recharge uniquement ce classeur.</span>
                    </span>
                  </label>
                </div>

                <div className="space-y-2">
                  <div className="text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300">Paramètres fins</div>
                  <label className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 dark:border-slate-600 text-xs cursor-pointer">
                    <input type="checkbox" checked={importPaies} onChange={(e) => setImportPaies(e.target.checked)} />
                    <span>Importer les états de paie mensuels ({nbPaies} bulletin(s))</span>
                  </label>
                  <label className={`flex items-center gap-2 p-2 rounded-lg border text-xs ${importPaies ? 'border-slate-200 dark:border-slate-600 cursor-pointer' : 'border-slate-100 dark:border-slate-700 opacity-50'}`}>
                    <input type="checkbox" disabled={!importPaies} checked={ecraserPaies} onChange={(e) => setEcraserPaies(e.target.checked)} />
                    <span>Mettre à jour les bulletins déjà présents de la même période (hors mois clôturés)</span>
                  </label>
                  {mode === 'fusion' && (
                    <>
                      <label className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 dark:border-slate-600 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!mettreAJourFiches}
                          onChange={(e) => {
                            const archive = e.target.checked;
                            setMettreAJourFiches(!archive);
                            setNouveauxCommeInactifs(archive);
                          }}
                        />
                        <span>
                          <b>Mode archive historique :</b> ne pas écraser le salaire de base actuel des fiches existantes
                        </span>
                      </label>
                    </>
                  )}
                </div>
              </div>

              {analyse.avertissements.length > 0 && (
                <div className="space-y-1">
                  {analyse.avertissements.map((a, i) => (
                    <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-300">
                      <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{a}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Rapport final après confirmation */}
          {rapport && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-sm font-bold">
                <CheckCircle2 className="w-5 h-5 shrink-0" /> Importation confirmée et enregistrée
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Stat label="Salariés ajoutés" value={String(rapport.employesAjoutes)} />
                <Stat label="Fiches complétées" value={String(rapport.employesMisAJour)} />
                <Stat label="Bulletins ajoutés" value={String(rapport.paiesAjoutees)} />
                <Stat label="Bulletins mis à jour" value={String(rapport.paiesMisesAJour)} />
              </div>
              {rapport.periodes.length > 0 && (
                <div className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-300">
                  <b>Périodes importées :</b>{' '}
                  {rapport.periodes
                    .sort((a, b) => a.annee - b.annee || MOIS_FR.indexOf(a.mois) - MOIS_FR.indexOf(b.mois))
                    .map((p) => `${p.mois} ${p.annee}`)
                    .join(' • ')}
                </div>
              )}
              {rapport.periodesVerrouilleesIgnorees && rapport.periodesVerrouilleesIgnorees.length > 0 && (
                <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300">
                  Période(s) clôturée(s) préservée(s) sans modification : {rapport.periodesVerrouilleesIgnorees.join(', ')}.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Pied de modale */}
        <div className="px-4 sm:px-6 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-2 shrink-0">
          {!rapport ? (
            <>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {analyse
                  ? `Prêt à importer : ${nbEmployes} salarié(s)${importPaies ? ` et ${nbPaies} bulletin(s) sur ${analyse.periodes.length} période(s)` : ''}.`
                  : 'Chargez un classeur pour analyser ses champs avant l’import.'}
              </div>
              <div className="flex gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-sm font-semibold"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={lancerImport}
                  disabled={!analyse || importing || (nbEmployes === 0 && nbPaies === 0)}
                  className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-sm font-bold shadow flex items-center justify-center gap-2"
                >
                  {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {importing ? 'Import en cours…' : `Valider le placement & Importer`}
                </button>
              </div>
            </>
          ) : (
            <div className="w-full flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2 rounded-lg bg-salfa-dark dark:bg-slate-600 hover:bg-salfa-teal text-white text-sm font-bold shadow"
              >
                Terminer
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string; sub?: string; icon?: React.ReactNode }> = ({
  label,
  value,
  sub,
  icon,
}) => (
  <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/40 px-3 py-2">
    <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">
      {icon}
      <span className="truncate">{label}</span>
    </div>
    <div className="text-base sm:text-lg font-extrabold text-slate-800 dark:text-white font-mono">{value}</div>
    {sub && <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{sub}</div>}
  </div>
);

export default ImportExcelModal;
