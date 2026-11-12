// ==============================================================================
// IMPORT D'UN « CONTRÔLE DES CONGÉS ET PERMISSIONS » EXISTANT
// Le comptable reprend l'historique tenu dans Excel : le lecteur retrouve les
// colonnes du document (solde par année, jours demandés, dates, motifs) et
// rattache chaque ligne à un salarié de l'application par le nom.
// ==============================================================================
import React, { useState } from 'react';
import { X, Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { importerConges, AnalyseControleConges, CongeImportLigne } from '../../api';
import { lireFichierControle } from '../../local/importConges';
import { fmtJours, LIBELLES_CATEGORIE } from '../../local/conges';
import { dateFr } from './FicheAbsence';

interface ImportCongesModalProps {
  employes: any[];
  onClose: () => void;
  onTermine: (message: string) => void;
}

export const ImportCongesModal: React.FC<ImportCongesModalProps> = ({ employes, onClose, onTermine }) => {
  const [nom, setNom] = useState('');
  const [analyse, setAnalyse] = useState<AnalyseControleConges | null>(null);
  const [feuillesChoisies, setFeuillesChoisies] = useState<Record<string, boolean>>({});
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState('');
  const [mode, setMode] = useState<'fusion' | 'remplacement'>('fusion');
  const [ajuster, setAjuster] = useState(false);

  const lire = async (file: File | null | undefined) => {
    if (!file) return;
    setErreur('');
    setEnCours(true);
    setNom(file.name);
    try {
      const resultat = await lireFichierControle(file, employes);
      setAnalyse(resultat);
      const selection: Record<string, boolean> = {};
      for (const f of resultat.feuilles) {
        if (f.reconnue) selection[f.nom] = !f.archiveProbable;
      }
      setFeuillesChoisies(selection);
      if (!resultat.lignes.length) {
        setErreur('Aucune demande lisible dans ce document. Vérifiez que la feuille contient les en-têtes du contrôle (NOM ET PRENOMS, FONCTION, Jours demandés, Date, MOTIFS).');
      }
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Lecture impossible.');
      setAnalyse(null);
    } finally {
      setEnCours(false);
    }
  };

  const lignesSelectionnees = analyse
    ? analyse.lignes.filter((l) => feuillesChoisies[l.feuille] !== false)
    : [];
  const rattachees = lignesSelectionnees.filter((l) => l.employe_id !== null);
  const orphelines = lignesSelectionnees.filter((l) => l.employe_id === null);

  const importer = async () => {
    if (!analyse) return;
    setEnCours(true);
    setErreur('');
    try {
      const rapport = await importerConges(rattachees, { mode, ajusterSoldes: ajuster });
      if (!rapport.importees) {
        setErreur(rapport.messages[0] || "Aucune fiche n'a été importée.");
      } else {
        onTermine(
          `${rapport.importees} fiche(s) d’absence reprise(s)` +
          (rapport.ajustements ? `, ${rapport.ajustements} ajustement(s) de droit` : '') +
          (rapport.ignores ? `, ${rapport.ignores} ligne(s) déjà présente(s) ou ignorée(s)` : '') +
          (orphelines.length ? `, ${orphelines.length} ligne(s) sans salarié correspondant` : '') +
          '. Vérifiez les soldes avant toute décision.'
        );
      }
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Import impossible.');
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto">
      <div className="caisse-card bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl border border-slate-200 dark:border-slate-700 max-h-[94dvh] flex flex-col">
        <div className="bg-salfa-dark dark:bg-slate-900 px-4 py-3 flex items-center justify-between text-white shrink-0 rounded-t-2xl">
          <div>
            <h3 className="text-sm sm:text-base font-bold">Reprendre un contrôle des congés (Excel)</h3>
            <p className="text-[10px] sm:text-xs text-slate-300">
              Formats acceptés directement : .xlsb · .xlsx · .xls · .csv (ex. CONTROL DE CONGE SALFA)
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-white/10" aria-label="Fermer"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-3 sm:p-4 space-y-3 overflow-y-auto thin-scrollbar flex-1">
          <label className="block border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-6 text-center cursor-pointer hover:border-salfa-teal transition">
            <FileSpreadsheet className="w-8 h-8 mx-auto text-salfa-teal mb-2" />
            <div className="text-sm font-bold">{nom || 'Choisir ou déposer le fichier de contrôle'}</div>
            <div className="text-[11px] text-slate-500 mt-1">.xlsb · .xlsx · .xls · .csv — lecture 100 % locale, aucune donnée n’est envoyée</div>
            <input
              type="file"
              accept=".xlsb,.xlsx,.xls,.csv,application/vnd.ms-excel.sheet.binary.macroEnabled.12,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => lire(e.target.files?.[0])}
              onDrop={(e) => { e.preventDefault(); lire(e.dataTransfer.files?.[0]); }}
              onDragOver={(e) => e.preventDefault()}
            />
          </label>

          {enCours && <div className="text-xs text-slate-500">Lecture du classeur…</div>}
          {erreur && (
            <div className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-900 dark:text-amber-200 flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" /><span>{erreur}</span>
            </div>
          )}

          {analyse && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <Statistique label="Feuilles lues" valeur={String(analyse.feuilles.length)} />
                <Statistique label="Demandes retenues" valeur={String(lignesSelectionnees.length)} accent />
                <Statistique label="Rattachées à un salarié" valeur={String(rattachees.length)} />
                <Statistique label="Hors personnel actuel" valeur={String(orphelines.length)} danger={orphelines.length > 0} />
              </div>

              <div className="space-y-1.5">
                {analyse.feuilles.map((f) => (
                  <label key={f.nom} className={`text-[11px] flex items-start gap-2 rounded-lg bg-slate-50 dark:bg-slate-700/40 px-2.5 py-1.5 ${f.reconnue ? 'cursor-pointer' : 'opacity-70'}`}>
                    {f.reconnue ? (
                      <input
                        type="checkbox"
                        checked={feuillesChoisies[f.nom] !== false}
                        onChange={(e) => setFeuillesChoisies((prev) => ({ ...prev, [f.nom]: e.target.checked }))}
                        className="mt-0.5 rounded"
                      />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" />
                    )}
                    <span className="font-bold">{f.nom}</span>
                    <span className="text-slate-500 dark:text-slate-400">{f.message}</span>
                    {f.annees.length > 0 && <span className="ml-auto font-mono text-slate-500">{f.annees.join(' · ')}</span>}
                  </label>
                ))}
              </div>

              {analyse.avertissements.length > 0 && (
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/40 p-2.5 text-[11px] space-y-1">
                  <div className="font-bold uppercase text-[10px] text-slate-500 flex items-center gap-1"><Info className="w-3.5 h-3.5" />À contrôler</div>
                  {analyse.avertissements.map((a, i) => <div key={i}>• {a}</div>)}
                </div>
              )}

              <div className="max-h-56 overflow-auto thin-scrollbar border border-slate-200 dark:border-slate-700 rounded-lg">
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200 uppercase text-[9px]">
                    <tr>
                      <th className="text-left px-2 py-1.5">Salarié</th>
                      <th className="text-left px-2 py-1.5">Rattachement</th>
                      <th className="text-left px-2 py-1.5">Type</th>
                      <th className="text-right px-2 py-1.5">Jours</th>
                      <th className="text-center px-2 py-1.5">Départ</th>
                      <th className="text-left px-2 py-1.5">Motif du contrôle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y dark:divide-slate-700">
                    {lignesSelectionnees.slice(0, 200).map((l: CongeImportLigne, i) => (
                      <tr key={i} className={l.employe_id === null ? 'bg-amber-50/60 dark:bg-amber-900/10' : ''}>
                        <td className="px-2 py-1 font-semibold whitespace-normal">{l.nom}</td>
                        <td className="px-2 py-1">{l.employe_id !== null ? <span className="text-emerald-700 dark:text-emerald-300 font-bold">Mat. {l.numero_matricule}</span> : <span className="text-amber-700 dark:text-amber-300">non trouvé</span>}</td>
                        <td className="px-2 py-1">{LIBELLES_CATEGORIE[l.categorie]}</td>
                        <td className="px-2 py-1 text-right font-mono">{fmtJours(l.jours)}</td>
                        <td className="px-2 py-1 text-center font-mono">{l.date_debut ? dateFr(l.date_debut) : ''}</td>
                        <td className="px-2 py-1 whitespace-normal text-slate-600 dark:text-slate-300">{l.motif}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {lignesSelectionnees.length > 200 && (
                  <div className="text-[10px] text-slate-500 px-2 py-1.5">… {lignesSelectionnees.length - 200} autres lignes non affichées, toutes importées.</div>
                )}
              </div>

              <div className="grid sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Mode d’import</label>
                  <select value={mode} onChange={(e) => setMode(e.target.value as any)} className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-2 py-1.5 text-xs font-bold">
                    <option value="fusion">Fusionner (ajoute ce qui manque)</option>
                    <option value="remplacement">Remplacer toutes les fiches d’absence</option>
                  </select>
                </div>
                <label className="flex items-start gap-2 text-[11px] mt-4 sm:mt-0 cursor-pointer">
                  <input type="checkbox" checked={ajuster} onChange={(e) => setAjuster(e.target.checked)} className="mt-0.5 rounded" />
                  <span>
                    <b>Aligner les soldes</b> : crée des ajustements de droit pour reprendre le solde porté par le fichier (report, entrée en cours d’année).
                  </span>
                </label>
              </div>
            </>
          )}
        </div>

        <div className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50 px-3 sm:px-4 py-2.5 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0 rounded-b-2xl">
          <div className="text-[10px] text-slate-500 sm:mr-auto">
            Les lignes importées sont marquées « validées » : elles proviennent d’un document déjà signé.
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 sm:flex-none px-3 py-2 rounded-lg bg-slate-200 dark:bg-slate-600 text-sm font-semibold">Annuler</button>
            <button
              onClick={importer}
              disabled={!analyse || !rattachees.length || enCours}
              className="flex-1 sm:flex-none px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold flex items-center justify-center gap-1.5"
            >
              <Upload className="w-4 h-4" />Importer {rattachees.length ? `${rattachees.length} ligne(s)` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const Statistique: React.FC<{ label: string; valeur: string; accent?: boolean; danger?: boolean }> = ({ label, valeur, accent, danger }) => (
  <div className={`rounded-lg border px-2 py-1.5 ${
    danger
      ? 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20'
      : accent
        ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20'
        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/40'
  }`}>
    <div className="text-[9px] uppercase font-bold text-slate-500 dark:text-slate-400">{label}</div>
    <div className="font-mono font-extrabold text-sm text-slate-800 dark:text-white">{valeur}</div>
  </div>
);

export default ImportCongesModal;
