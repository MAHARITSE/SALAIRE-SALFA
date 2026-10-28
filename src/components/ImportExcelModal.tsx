// ==============================================================================
// MODALE D'IMPORT EXCEL — PERSONNEL + ÉTATS DE PAIE
// L'utilisateur dépose son classeur .xlsm / .xlsx, l'application analyse les
// feuilles, affiche un aperçu puis importe les salariés et les bulletins.
// ==============================================================================
import React, { useRef, useState } from 'react';
import {
  Upload, FileSpreadsheet, X, CheckCircle2, AlertTriangle, Users, CalendarDays,
  Loader2, Replace, GitMerge, Info,
} from 'lucide-react';
import { lireFichierExcel, ImportWorkbookResult, MOIS_FR } from '../local/importExcel';
import { importerClasseur, ImportRapport, ImportOptions } from '../api';

interface Props {
  onClose: () => void;
  onImported?: (rapport: ImportRapport) => void;
  anneeDefaut?: number;
}

export const ImportExcelModal: React.FC<Props> = ({ onClose, onImported, anneeDefaut = 2026 }) => {
  const [analyse, setAnalyse] = useState<ImportWorkbookResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [rapport, setRapport] = useState<ImportRapport | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [annee, setAnnee] = useState(anneeDefaut);
  const [mode, setMode] = useState<'fusion' | 'remplacement'>('fusion');
  const [importPaies, setImportPaies] = useState(true);
  const [ecraserPaies, setEcraserPaies] = useState(true);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const analyser = async (file: File) => {
    setErreur(null);
    setRapport(null);
    setLoading(true);
    try {
      const res = await lireFichierExcel(file, annee);
      if (!res.employes.length && !res.paies.length) {
        setErreur(
          "Aucune donnée exploitable trouvée. Le classeur doit contenir une liste du personnel (colonnes MATRICULE / NOM ET PRENOMS) ou des états de paie mensuels."
        );
      }
      setAnalyse(res);
    } catch (e: any) {
      console.error(e);
      setErreur(`Impossible de lire le fichier : ${e?.message || e}`);
      setAnalyse(null);
    } finally {
      setLoading(false);
    }
  };

  const onFiles = (files: FileList | null) => {
    if (!files || !files.length) return;
    analyser(files[0]);
  };

  const lancerImport = async () => {
    if (!analyse) return;
    setImporting(true);
    const opts: ImportOptions = { mode, importPaies, ecraserPaies };
    const res = await importerClasseur(analyse, opts);
    setImporting(false);
    setRapport(res);
    if (onImported) onImported(res);
  };

  const nbEmployes = analyse?.employes.length || 0;
  const nbPaies = analyse?.paies.length || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95dvh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-700 modal-mobile">
        {/* En-tête */}
        <div className="bg-salfa-dark dark:bg-slate-900 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between text-white shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <FileSpreadsheet className="w-5 h-5 text-emerald-400 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm sm:text-lg font-bold truncate">Importer le classeur Excel</h3>
              <p className="text-[10px] sm:text-xs text-slate-300 truncate">
                SALAIRE_SALFA_….xlsm — personnel + états de paie mensuels
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10 shrink-0"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-3 sm:p-6 space-y-4 overflow-y-auto thin-scrollbar">
          {/* Dépôt de fichier */}
          {!rapport && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); onFiles(e.dataTransfer.files); }}
              onClick={() => inputRef.current?.click()}
              className={`cursor-pointer rounded-2xl border-2 border-dashed p-6 sm:p-8 text-center transition ${
                dragOver
                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                  : 'border-slate-300 dark:border-slate-600 hover:border-emerald-400 hover:bg-slate-50 dark:hover:bg-slate-700/40'
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xlsm,.xls,.csv"
                className="hidden"
                onChange={(e) => onFiles(e.target.files)}
              />
              {loading ? (
                <div className="flex flex-col items-center gap-2 text-slate-600 dark:text-slate-300">
                  <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
                  <span className="text-sm font-semibold">Analyse du classeur…</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="w-8 h-8 text-emerald-600" />
                  <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    Déposez votre fichier Excel ici
                  </div>
                  <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                    ou cliquez pour choisir un fichier (.xlsm, .xlsx, .xls, .csv)
                  </div>
                  {analyse && (
                    <div className="text-[11px] text-emerald-700 dark:text-emerald-300 font-semibold mt-1">
                      Fichier chargé : {analyse.fichier}
                    </div>
                  )}
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

          {/* Options */}
          {!rapport && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <div className="text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300">Mode d'import</div>
                <label className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer text-xs ${mode === 'fusion' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'border-slate-200 dark:border-slate-600'}`}>
                  <input type="radio" checked={mode === 'fusion'} onChange={() => setMode('fusion')} className="mt-0.5" />
                  <span>
                    <b className="flex items-center gap-1"><GitMerge className="w-3.5 h-3.5" />Fusionner (recommandé)</b>
                    <span className="text-slate-500 dark:text-slate-400">Ajoute les nouveaux salariés et complète les fiches existantes sans rien supprimer.</span>
                  </span>
                </label>
                <label className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer text-xs ${mode === 'remplacement' ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : 'border-slate-200 dark:border-slate-600'}`}>
                  <input type="radio" checked={mode === 'remplacement'} onChange={() => setMode('remplacement')} className="mt-0.5" />
                  <span>
                    <b className="flex items-center gap-1"><Replace className="w-3.5 h-3.5" />Remplacer tout</b>
                    <span className="text-slate-500 dark:text-slate-400">Efface le personnel et les paies enregistrés puis recharge tout depuis le fichier.</span>
                  </span>
                </label>
              </div>

              <div className="space-y-2">
                <div className="text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300">Options</div>
                <label className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 dark:border-slate-600 text-xs cursor-pointer">
                  <input type="checkbox" checked={importPaies} onChange={(e) => setImportPaies(e.target.checked)} />
                  <span>Importer les états de paie mensuels (AVANCE / MED / net…)</span>
                </label>
                <label className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs ${importPaies ? 'border-slate-200 dark:border-slate-600 cursor-pointer' : 'border-slate-100 dark:border-slate-700 opacity-50'}`}>
                  <input type="checkbox" disabled={!importPaies} checked={ecraserPaies} onChange={(e) => setEcraserPaies(e.target.checked)} />
                  <span>Écraser les bulletins déjà existants de la même période</span>
                </label>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-600 dark:text-slate-300">Année par défaut :</span>
                  <select value={annee} onChange={(e) => setAnnee(Number(e.target.value))} className="rounded-lg border dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-2 py-1 text-xs font-bold">
                    {[anneeDefaut - 2, anneeDefaut - 1, anneeDefaut, anneeDefaut + 1].map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Aperçu de l'analyse */}
          {analyse && !rapport && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Stat label="Salariés détectés" value={String(nbEmployes)} icon={<Users className="w-4 h-4" />} />
                <Stat label="Bulletins détectés" value={String(nbPaies)} icon={<FileSpreadsheet className="w-4 h-4" />} />
                <Stat label="Périodes" value={String(analyse.periodes.length)} icon={<CalendarDays className="w-4 h-4" />} />
                <Stat label="Feuilles lues" value={String(analyse.feuilles.filter((f) => f.type !== 'ignore').length)} icon={<CheckCircle2 className="w-4 h-4" />} />
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="bg-slate-50 dark:bg-slate-700/60 px-3 py-2 text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300">
                  Feuilles du classeur
                </div>
                <div className="max-h-44 overflow-y-auto thin-scrollbar divide-y divide-slate-100 dark:divide-slate-700">
                  {analyse.feuilles.map((f) => (
                    <div key={f.nom} className="px-3 py-2 text-[11px] sm:text-xs flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded font-bold uppercase text-[9px] shrink-0 ${
                        f.type === 'personnel' ? 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300'
                        : f.type === 'etat' ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                      }`}>
                        {f.type === 'personnel' ? 'Personnel' : f.type === 'etat' ? 'État' : 'Ignorée'}
                      </span>
                      <span className="font-semibold truncate text-slate-800 dark:text-slate-100">{f.nom}</span>
                      {f.periode && <span className="text-emerald-700 dark:text-emerald-300 font-mono shrink-0">{f.periode}</span>}
                      <span className="ml-auto text-slate-500 dark:text-slate-400 shrink-0">{f.nbLignes} ligne(s)</span>
                    </div>
                  ))}
                </div>
              </div>

              {analyse.periodes.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {analyse.periodes.map((p) => (
                    <span key={`${p.mois}-${p.annee}`} className="text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                      {p.mois} {p.annee} · {p.nb}
                    </span>
                  ))}
                </div>
              )}

              {analyse.avertissements.length > 0 && (
                <div className="space-y-1">
                  {analyse.avertissements.map((a, i) => (
                    <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-300">
                      <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" /><span>{a}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Rapport final */}
          {rapport && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-sm font-bold">
                <CheckCircle2 className="w-5 h-5 shrink-0" /> Import terminé
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Stat label="Salariés ajoutés" value={String(rapport.employesAjoutes)} />
                <Stat label="Fiches mises à jour" value={String(rapport.employesMisAJour)} />
                <Stat label="Bulletins ajoutés" value={String(rapport.paiesAjoutees)} />
                <Stat label="Bulletins mis à jour" value={String(rapport.paiesMisesAJour)} />
              </div>
              {rapport.periodes.length > 0 && (
                <div className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-300">
                  Périodes importées :{' '}
                  {rapport.periodes
                    .sort((a, b) => a.annee - b.annee || MOIS_FR.indexOf(a.mois) - MOIS_FR.indexOf(b.mois))
                    .map((p) => `${p.mois} ${p.annee}`)
                    .join(' • ')}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Pied */}
        <div className="px-4 sm:px-6 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 flex flex-col sm:flex-row justify-end gap-2 shrink-0">
          {!rapport ? (
            <>
              <button onClick={onClose} className="px-4 py-2 rounded-lg bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-sm font-semibold">
                Annuler
              </button>
              <button
                onClick={lancerImport}
                disabled={!analyse || importing || (nbEmployes === 0 && nbPaies === 0)}
                className="px-6 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-sm font-bold shadow flex items-center justify-center gap-2"
              >
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {importing ? 'Import en cours…' : `Importer (${nbEmployes} salarié(s))`}
              </button>
            </>
          ) : (
            <button onClick={onClose} className="px-6 py-2 rounded-lg bg-salfa-dark dark:bg-slate-600 hover:bg-salfa-teal text-white text-sm font-bold shadow">
              Terminer
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string; icon?: React.ReactNode }> = ({ label, value, icon }) => (
  <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/40 px-3 py-2">
    <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">
      {icon}<span className="truncate">{label}</span>
    </div>
    <div className="text-lg font-extrabold text-slate-800 dark:text-white font-mono">{value}</div>
  </div>
);

export default ImportExcelModal;
