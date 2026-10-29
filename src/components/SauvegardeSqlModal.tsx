// ==============================================================================
// MODALE « SAUVEGARDE SQL » — SOUS-MENU ADMINISTRATION
// Export manuel (.sql 100 % relationnel, zéro JSON) et consultation du journal
// des sauvegardes SQL automatiques déclenchées à chaque validation de clôture.
// ==============================================================================
import React, { useCallback, useEffect, useState } from 'react';
import {
  exporterSauvegardeSql,
  fetchHistoriqueSauvegardesSql,
  telechargerSauvegardeSqlServeur,
  getDerniereSauvegardeSql,
  EntreeHistoriqueSql,
} from '../api';
import { triggerSqlDownload } from '../local/sqlBackup';
import { WAMP } from '../runtime';
import {
  X,
  Database,
  Download,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Clock,
  Lock,
  CalendarCheck2,
  HardDriveDownload,
  RefreshCw,
} from 'lucide-react';

interface Props {
  onClose: () => void;
}

function fmtTaille(bytes: number): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}

export const SauvegardeSqlModal: React.FC<Props> = ({ onClose }) => {
  const [historique, setHistorique] = useState<EntreeHistoriqueSql[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportingType, setExportingType] = useState<'MANUELLE' | 'CONGES' | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const charger = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchHistoriqueSauvegardesSql();
      setHistorique(list);
    } catch (e: any) {
      setFeedback({ type: 'err', text: e?.message || 'Lecture du journal des sauvegardes impossible.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  const lancerExport = async (type: 'MANUELLE' | 'CONGES') => {
    setExportingType(type);
    setFeedback(null);
    try {
      const res = await exporterSauvegardeSql({
        type,
        motif:
          type === 'CONGES'
            ? 'Sauvegarde SQL Congés & Permissions (Administration)'
            : 'Sauvegarde SQL complète (Administration)',
        telecharger: true,
      });
      await charger();
      setFeedback({
        type: 'ok',
        text: `Sauvegarde SQL générée et téléchargée : ${res.filename} (${fmtTaille(res.size)})${
          res.server_saved ? ' — copie archivée sur le serveur WAMP.' : '.'
        }`,
      });
    } catch (e: any) {
      setFeedback({ type: 'err', text: e?.message || 'Échec de la génération SQL.' });
    } finally {
      setExportingType(null);
    }
  };

  const retelecharger = async (item: EntreeHistoriqueSql) => {
    const derniere = getDerniereSauvegardeSql();
    if (derniere && derniere.filename === item.filename && derniere.sql) {
      triggerSqlDownload(derniere.filename, derniere.sql);
      setFeedback({ type: 'ok', text: `Fichier ${item.filename} téléchargé.` });
      return;
    }
    if (WAMP && item.server_saved) {
      const r = await telechargerSauvegardeSqlServeur(item.filename);
      if (r.success) {
        setFeedback({ type: 'ok', text: `Archive serveur ${item.filename} téléchargée.` });
        return;
      }
      setFeedback({ type: 'err', text: r.message || 'Téléchargement impossible.' });
      return;
    }
    // Régénérer immédiatement une sauvegarde fraîche si l'archive locale n'est plus en mémoire
    await lancerExport(item.type === 'CONGES' ? 'CONGES' : 'MANUELLE');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden border border-slate-200 dark:border-slate-700 max-h-[94dvh] flex flex-col">
        {/* Entête */}
        <div className="bg-salfa-dark dark:bg-slate-900 px-4 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between text-white shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <Database className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-400 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm sm:text-lg font-bold truncate">Administration — Sauvegarde SQL</h3>
              <p className="text-[11px] sm:text-xs text-slate-300 truncate">
                Export MySQL / MariaDB 100 % relationnel (colonnes et lignes séparées, aucun JSON)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="p-1.5 rounded-lg hover:bg-white/10 text-white shrink-0 ml-2"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenu */}
        <div className="p-4 sm:p-6 overflow-y-auto thin-scrollbar flex-1 space-y-5">
          {/* Règle de sauvegarde automatique sur clôture */}
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-3.5 flex items-start gap-3">
            <Lock className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-xs text-emerald-900 dark:text-emerald-200 space-y-1">
              <div className="font-extrabold uppercase tracking-wide flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" />
                Sauvegarde SQL automatique forcée à chaque clôture
              </div>
              <p className="text-[11px] sm:text-xs leading-relaxed">
                À chaque validation / clôture mensuelle (<b>Clôturer / Valider</b>), une sauvegarde SQL relationnelle complète (<code>.sql</code>) est{' '}
                <b>automatiquement générée et téléchargée</b>{WAMP ? ' (et archivée sur le disque du serveur WAMP)' : ''}, incluant les utilisateurs par défaut (<code>admin</code> / <code>comptable</code>), les salariés, les bulletins verrouillés et les congés.
              </p>
            </div>
          </div>

          {feedback && (
            <div
              role="status"
              className={`rounded-xl border px-3.5 py-2.5 text-xs sm:text-sm flex items-center gap-2.5 ${
                feedback.type === 'ok'
                  ? 'bg-emerald-50 dark:bg-emerald-900/25 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200'
                  : 'bg-red-50 dark:bg-red-900/25 border-red-300 dark:border-red-700 text-red-700 dark:text-red-200'
              }`}
            >
              {feedback.type === 'ok' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span className="flex-1 font-medium">{feedback.text}</span>
            </div>
          )}

          {/* Actions d'export SQL immédiat */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="rounded-xl border-2 border-sky-200 dark:border-sky-800 bg-sky-50/60 dark:bg-sky-900/20 p-4 flex flex-col justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-salfa-dark dark:text-white font-extrabold text-sm">
                  <HardDriveDownload className="w-4 h-4 text-salfa-teal dark:text-sky-400 shrink-0" />
                  <span>Sauvegarde SQL complète (.sql)</span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  Exporte les <b>10 tables relationnelles MySQL</b> : utilisateurs (<code>admin</code>, <code>comptable</code>…), salariés, bulletins de paie, clôtures, congés, barèmes IRSA/ancienneté, configuration et icône.
                </p>
              </div>
              <button
                type="button"
                onClick={() => lancerExport('MANUELLE')}
                disabled={exportingType !== null}
                className="w-full py-2.5 px-4 rounded-xl bg-salfa-dark hover:bg-salfa-teal text-white text-xs sm:text-sm font-bold shadow flex items-center justify-center gap-2 transition disabled:opacity-60"
              >
                <Download className="w-4 h-4 shrink-0" />
                <span>{exportingType === 'MANUELLE' ? 'Génération SQL en cours…' : 'Télécharger la sauvegarde SQL (.sql)'}</span>
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30 p-4 flex flex-col justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-slate-800 dark:text-white font-extrabold text-sm">
                  <CalendarCheck2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span>Sauvegarde SQL Congés (.sql)</span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  Exporte uniquement <code>salfa_conges</code> + <code>salfa_employes</code> + <code>salfa_users</code> (sans écraser les bulletins <code>salfa_paies</code> déjà enregistrés dans MySQL).
                </p>
              </div>
              <button
                type="button"
                onClick={() => lancerExport('CONGES')}
                disabled={exportingType !== null}
                className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold shadow flex items-center justify-center gap-2 transition disabled:opacity-60"
              >
                <Download className="w-4 h-4 shrink-0" />
                <span>{exportingType === 'CONGES' ? 'Génération en cours…' : 'Exporter SQL Congés uniquement'}</span>
              </button>
            </div>
          </div>

          {/* Journal des sauvegardes */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800">
            <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-extrabold uppercase text-slate-700 dark:text-slate-200">
                <Clock className="w-4 h-4 text-salfa-teal dark:text-sky-400" />
                <span>Journal des sauvegardes SQL récentes ({historique.length})</span>
              </div>
              <button
                type="button"
                onClick={charger}
                title="Actualiser la liste"
                className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {historique.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                Aucune sauvegarde SQL enregistrée pour le moment. Une sauvegarde sera créée automatiquement dès la prochaine validation de clôture ou via les boutons ci-dessus.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-700 max-h-64 overflow-y-auto thin-scrollbar">
                {historique.map((item) => (
                  <div
                    key={item.id || item.filename}
                    className="px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50 dark:hover:bg-slate-700/40"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                            item.type === 'CLOTURE'
                              ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300'
                              : item.type === 'CONGES'
                                ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-300'
                                : 'bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-300'
                          }`}
                        >
                          {item.type === 'CLOTURE' ? 'Clôture auto' : item.type === 'CONGES' ? 'Congés' : 'Manuelle'}
                        </span>
                        <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                          {item.filename}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {item.created_at} · {item.motif} · {fmtTaille(item.size)}
                        {item.server_saved ? ' · Archivé sur serveur WAMP' : ''}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => retelecharger(item)}
                      className="self-start sm:self-center shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 hover:border-salfa-teal text-xs font-bold text-slate-700 dark:text-slate-200 hover:text-salfa-teal transition"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>.sql</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Pied */}
        <div className="bg-slate-50 dark:bg-slate-700/50 border-t border-slate-200 dark:border-slate-700 px-4 sm:px-6 py-3 flex items-center justify-between gap-3 shrink-0">
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            Importable directement dans phpMyAdmin / MySQL (<code>salfa_paie</code>).
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-bold"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
