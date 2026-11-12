import React, { useEffect, useRef, useState } from 'react';
import { Database, Download, Loader2, RotateCcw, X } from 'lucide-react';
import { exporterSauvegardeSql, fetchHistoriqueSauvegardesSql, restaurerSauvegardeSql, telechargerSauvegardeSqlServeur } from '../api';
import { triggerSqlDownload, type EntreeHistoriqueSql, type ResultatSauvegardeSql } from '../local/sqlBackup';
import { WAMP } from '../runtime';

const bouton = 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50 dark:border-slate-600';

export function SauvegardeSqlModal({ onClose }: { onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [historique, setHistorique] = useState<EntreeHistoriqueSql[]>([]);
  const [dernier, setDernier] = useState<ResultatSauvegardeSql | null>(null);
  const [fichier, setFichier] = useState<File | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [accord, setAccord] = useState(false);
  const [restaure, setRestaure] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let actif = true;
    fetchHistoriqueSauvegardesSql().then(rows => { if (actif) setHistorique(rows); }).catch(() => { if (actif) setError('Historique indisponible. Vous pouvez réessayer une sauvegarde.'); });
    const ancien = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    return () => { actif = false; ancien?.focus(); };
  }, []);
  useEffect(() => {
    const clavier = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy && !restaure) onClose();
      if (e.key !== 'Tab') return;
      const elements = panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [href]');
      if (!elements?.length) { e.preventDefault(); return; }
      const premier = elements[0], dernier = elements[elements.length - 1];
      if (e.shiftKey && (document.activeElement === premier || document.activeElement === panel.current)) { e.preventDefault(); dernier.focus(); }
      else if (!e.shiftKey && (document.activeElement === dernier || document.activeElement === panel.current)) { e.preventDefault(); premier.focus(); }
    };
    document.addEventListener('keydown', clavier);
    return () => document.removeEventListener('keydown', clavier);
  }, [busy, restaure, onClose]);

  async function sauvegarder() {
    setBusy(true); setError(''); setMessage('');
    try {
      const res = await exporterSauvegardeSql({ type: 'MANUELLE', motif: 'Sauvegarde complète depuis Administration' });
      if (!res.success) throw new Error(res.message || 'La sauvegarde a échoué.');
      setDernier(res);
      setMessage(res.downloaded ? `Sauvegarde téléchargée : ${res.filename}` : 'Sauvegarde générée. Cliquez sur « Télécharger à nouveau » pour enregistrer le fichier.');
      try { setHistorique(await fetchHistoriqueSauvegardesSql()); } catch { /* Le fichier reste disponible. */ }
    } catch (err: any) { setError(err?.message || 'Sauvegarde impossible.'); }
    finally { setBusy(false); }
  }
  async function restaurer() {
    if (!WAMP || !fichier || !accord || confirmation !== 'RESTAURER') return;
    setBusy(true); setError(''); setMessage('');
    try {
      if (!fichier.name.toLowerCase().endsWith('.sql') || fichier.size > 10000000 || fichier.size === 0) throw new Error('Choisissez un fichier .sql SALFA non vide, de 10 Mo maximum.');
      const result = await restaurerSauvegardeSql(await fichier.text(), confirmation);
      if (!result.success) throw new Error(result.message || 'Restauration refusée.');
      setRestaure(true);
      setMessage(`${result.message} Sauvegarde de sécurité : ${result.backup}. Rechargez maintenant l’application.`);
    } catch (err: any) { setError(err?.message || 'Restauration impossible.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 no-print">
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="sql-title" aria-busy={busy} className="w-full max-w-2xl max-h-[90dvh] overflow-y-auto rounded-xl bg-white p-5 text-slate-800 shadow-2xl dark:bg-slate-900 dark:text-slate-100">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="sql-title" className="flex items-center gap-2 text-lg font-bold"><Database className="h-5 w-5 shrink-0" />Sauvegarde et restauration SQL</h2>
          <button type="button" disabled={busy || restaure} onClick={onClose} aria-label="Fermer" className="rounded-lg p-2 disabled:opacity-40"><X size={20} /></button>
        </div>
        {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">{error}</p>}
        {message && <p role="status" className="mb-4 break-words rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">{message}</p>}
        {restaure ? <button type="button" className={bouton} onClick={() => window.location.reload()}>Recharger l’application</button> : <>
          <section className="space-y-3 border-b border-slate-200 pb-4 dark:border-slate-700">
            <h3 className="font-bold">Sauvegarde complète</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Exportez les salariés, paies, congés, paramètres et en-têtes dans un fichier SQL. Conservez-le dans un emplacement privé : il contient des données personnelles.</p>
            <button type="button" onClick={sauvegarder} disabled={busy} className={`${bouton} bg-brand-700 text-white`}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}Télécharger la sauvegarde SQL
            </button>
            {dernier && <button type="button" className={`${bouton} ml-2`} disabled={busy} onClick={() => {
              if (!triggerSqlDownload(dernier.filename, dernier.sql)) setError('Téléchargement bloqué par le navigateur.');
            }}>Télécharger à nouveau</button>}
          </section>
          <section className="space-y-3 border-b border-slate-200 py-4 dark:border-slate-700">
            <h3 className="font-bold">Restauration SQL</h3>
            {!WAMP ? <p className="text-sm text-slate-500 dark:text-slate-400">La restauration SQL s’effectue dans la version finale WAMP, sur MySQL. La démonstration locale permet uniquement de générer une sauvegarde SQL complète à transférer vers WAMP.</p> : <>
              <p className="text-sm text-amber-800 dark:text-amber-300">La restauration remplace toutes les données de paie et de congés, y compris les périodes clôturées, ainsi que les paramètres et en-têtes. Les comptes et mots de passe actuels sont conservés. Une sauvegarde de sécurité est créée sur le serveur avant toute modification. Utilisez uniquement une sauvegarde complète SALFA et prévenez les autres utilisateurs.</p>
              <label className="block text-sm font-semibold" htmlFor="sql-file">Fichier de sauvegarde SQL (10 Mo maximum)</label>
              <input id="sql-file" type="file" accept=".sql" disabled={busy} className="block w-full text-sm" onChange={e => { setFichier(e.target.files?.[0] || null); setAccord(false); setConfirmation(''); setError(''); }} />
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={accord} disabled={busy} onChange={e => setAccord(e.target.checked)} />Je confirme le remplacement des données actuelles par cette sauvegarde.</label>
              <label htmlFor="sql-confirmation" className="block text-sm">Saisissez RESTAURER pour confirmer</label>
              <input id="sql-confirmation" value={confirmation} disabled={busy} onChange={e => setConfirmation(e.target.value)} autoComplete="off" className="w-full rounded-lg border border-slate-300 bg-white p-2 dark:border-slate-600 dark:bg-slate-800" />
              <button type="button" className={`${bouton} text-red-700 dark:text-red-300`} disabled={busy || !fichier || !accord || confirmation !== 'RESTAURER'} onClick={restaurer}><RotateCcw size={16} />Restaurer la sauvegarde SQL</button>
            </>}
          </section>
          <section className="space-y-2 pt-4">
            <h3 className="font-bold">Dernières sauvegardes</h3>
            {!historique.length && <p className="text-sm text-slate-500">Aucune sauvegarde répertoriée.</p>}
            <ul className="space-y-2">{historique.slice(0, 10).map(entry => <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="min-w-0 break-all">{entry.filename}<br /><span className="text-slate-500">{entry.created_at}</span></span>
              {WAMP && entry.server_saved && <button type="button" disabled={busy} className={bouton} aria-label={`Télécharger ${entry.filename}`} onClick={async () => {
                setBusy(true); setError('');
                try { const r = await telechargerSauvegardeSqlServeur(entry.filename); if (!r.success) throw new Error(r.message || 'Téléchargement impossible.'); }
                catch (err: any) { setError(err?.message || 'Téléchargement impossible.'); }
                finally { setBusy(false); }
              }}><Download size={16} />Télécharger</button>}
            </li>)}</ul>
          </section>
        </>}
      </div>
    </div>
  );
}
