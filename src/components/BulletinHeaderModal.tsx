import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { WAMP } from '../runtime';
import { remoteSaveSetting } from '../wampClient';
import { BulletinHeaderConfig, defaultBulletinHeader, loadBulletinHeader, readHeaderImage, renderPersonalisedHeader, saveBulletinHeader } from '../bulletin/header';

const LABELS = ['Nom principal', 'Traduction / sous-titre', 'Service de santé', 'Traduction du service', 'Établissement et coordonnées', 'NIF et STAT', 'E-mail'];
const inputClass = 'w-full rounded-lg border dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm';

export const BulletinHeaderModal: React.FC<{ onClose: () => void; onSaved: (config: BulletinHeaderConfig) => void }> = ({ onClose, onSaved }) => {
  const [draft, setDraft] = useState<BulletinHeaderConfig>(loadBulletinHeader);
  const [preview, setPreview] = useState('');
  const [preparing, setPreparing] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let active = true;
    setPreparing(true);
    const result = draft.mode === 'image' ? Promise.resolve(draft.fullImage) : renderPersonalisedHeader(draft.lines, draft.logoLeft, draft.logoRight);
    result.then(image => { if (active) { setPreview(image); setPreparing(false); } }).catch(() => {
      if (active) { setPreview(''); setPreparing(false); setError('Impossible de préparer cet entête. Vérifiez les images choisies.'); }
    });
    return () => { active = false; };
  }, [draft.mode, draft.fullImage, draft.lines, draft.logoLeft, draft.logoRight]);

  const upload = async (e: React.ChangeEvent<HTMLInputElement>, field: 'fullImage' | 'logoLeft' | 'logoRight') => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(''); setUploading(true);
    try {
      const data = await readHeaderImage(file);
      setDraft(old => ({ ...old, [field]: data }));
    } catch (err) { setError(err instanceof Error ? err.message : 'Image illisible.'); }
    finally { setUploading(false); }
  };
  const save = async () => {
    if (!preview || preparing || uploading) return;
    setPreparing(true); setError('');
    let image: string;
    try {
      // Recréer le rendu à partir du brouillon au clic, même après une modification rapide.
      image = draft.mode === 'image' ? draft.fullImage : await renderPersonalisedHeader(draft.lines, draft.logoLeft, draft.logoRight);
    } catch {
      setError('Impossible de préparer cet entête. Vérifiez les images choisies.'); setPreparing(false); return;
    }
    const next = { ...draft, image };
    try { if (WAMP) await remoteSaveSetting('header', next); else saveBulletinHeader(next); onSaved(next); }
    catch (e) { setError(WAMP ? (e instanceof Error ? e.message : 'Enregistrement serveur impossible.') : 'Enregistrement impossible : espace de stockage insuffisant ou navigateur en mode privé. Essayez des images plus légères.'); setPreparing(false); }
  };
  return <div className="fixed inset-0 z-50 bg-black/50 p-3 flex items-center justify-center no-print" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-labelledby="bulletin-header-title" className="w-full max-w-3xl max-h-[95vh] overflow-y-auto rounded-xl bg-white dark:bg-slate-800 shadow-xl p-4 sm:p-6 space-y-4">
      <div className="flex justify-between items-start gap-3"><div><h2 id="bulletin-header-title" className="text-lg font-bold">Modifier l’entête des bulletins</h2><p className="text-sm text-slate-500 dark:text-slate-300">Le réglage s’applique à tous les bulletins, y compris les PDF en lot. {WAMP ? 'Il est conservé sur le serveur.' : 'Il est conservé dans ce navigateur.'}</p></div><button type="button" aria-label="Fermer" onClick={onClose} className="p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-700"><X className="w-5 h-5" /></button></div>
      <fieldset><legend className="text-sm font-bold mb-2">Mode d’entête</legend><div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="radio" name="mode-entete" checked={draft.mode === 'image'} onChange={() => setDraft(old => ({ ...old, mode: 'image' }))} /> Image complète</label>
        <label className="flex items-center gap-2"><input type="radio" name="mode-entete" checked={draft.mode === 'personnalise'} onChange={() => setDraft(old => ({ ...old, mode: 'personnalise' }))} /> Textes et logos personnalisés</label>
      </div></fieldset>
      {draft.mode === 'image' ? <div className="space-y-2"><label className="block text-sm font-bold" htmlFor="header-image">Remplacer l’image complète</label><input id="header-image" type="file" accept="image/png,image/jpeg" onChange={e => upload(e, 'fullImage')} className="block w-full text-sm" /><p className="text-xs text-slate-500">PNG ou JPEG, 1 Mo maximum. Une image horizontale est recommandée.</p></div> : <div className="space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">{(['logoLeft', 'logoRight'] as const).map((field, i) => <div key={field}><label className="block text-sm font-bold mb-1" htmlFor={field}>Logo {i === 0 ? 'gauche' : 'droit'}</label><input id={field} type="file" accept="image/png,image/jpeg" onChange={e => upload(e, field)} className="block w-full text-sm" /><button type="button" onClick={() => setDraft(old => ({ ...old, [field]: '' }))} className="text-xs underline text-slate-600 dark:text-slate-300 mt-1">Retirer ce logo</button></div>)}</div>
        <p className="text-xs text-slate-500">Logos PNG ou JPEG, 1 Mo maximum par fichier.</p>
        <div className="grid sm:grid-cols-2 gap-3">{draft.lines.map((line, i) => <label key={i} className="block text-sm"><span className="font-bold block mb-1">{LABELS[i]}</span><input className={inputClass} value={line} maxLength={160} onChange={e => { const text = e.target.value; setDraft(old => ({ ...old, lines: old.lines.map((v, n) => n === i ? text : v) })); }} /></label>)}</div>
      </div>}
      <div><p className="text-sm font-bold mb-2">Aperçu de l’entête</p><div className="bg-white border rounded p-2 flex justify-center min-h-20">{preview && <img src={preview} alt="Aperçu de l’entête" className="max-w-full max-h-32 object-contain" />}</div></div>
      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
      <div className="flex flex-wrap justify-between gap-2"><button type="button" onClick={() => { setDraft(defaultBulletinHeader()); setError(''); }} className="px-3 py-2 text-sm rounded-lg border dark:border-slate-600">Restaurer l’entête fourni</button><div className="flex gap-2"><button type="button" onClick={onClose} className="px-3 py-2 text-sm rounded-lg border dark:border-slate-600">Annuler</button><button type="button" onClick={save} disabled={preparing || uploading || !preview} className="px-4 py-2 text-sm rounded-lg bg-salfa-dark text-white font-bold disabled:opacity-50">Enregistrer</button></div></div>
    </div>
  </div>;
};
