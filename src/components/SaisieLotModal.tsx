import React, { useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, ClipboardList, Plus, Search, Trash2, X } from 'lucide-react';
import { enregistrerSaisieLot, SaisieLot } from '../api';
import { Employe, PaieMensuelle } from '../types';

interface Props {
  annee: number;
  mois: string;
  paies: PaieMensuelle[];
  employes: Employe[];
  onClose: () => void;
  onSaved: (count: number) => void;
}
interface Draft extends SaisieLot { nom: string; matricule: number }
const fmt = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

// Un champ vide signifie « ne pas modifier » ; zéro est une valeur explicite.
function parseMontant(text: string): number | undefined | null {
  const value = text.trim().replace(/\s/g, '');
  if (!value) return undefined;
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value)) return null;
  const num = Number(value.replace(',', '.'));
  return Number.isFinite(num) && num <= Number.MAX_SAFE_INTEGER / 100 ? num : null;
}

export const SaisieLotModal: React.FC<Props> = ({ annee, mois, paies, employes, onClose, onSaved }) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [selected, setSelected] = useState<PaieMensuelle | null>(null);
  const [avance, setAvance] = useState('');
  const [med, setMed] = useState('');
  const [lignes, setLignes] = useState<Draft[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const avanceRef = useRef<HTMLInputElement>(null);

  const candidats = useMemo(() => {
    const result = paies.map(p => ({ id: p.employe_id, mat: p.numero_matricule, nom: p.nom_prenoms, jobs: p.jobs, paie: p }));
    const ids = new Set(result.map(e => Number(e.id)));
    for (const e of employes) {
      if (Number(e.actif) === 1 && !ids.has(Number(e.id))) result.push({ id: e.id, mat: e.numero_matricule, nom: e.nom_prenoms, jobs: e.jobs, paie: null as any });
    }
    return result.sort((a, b) => Number(a.mat) - Number(b.mat));
  }, [paies, employes]);
  const searchTerm = normalize(query);
  const matches = searchTerm ? candidats.filter(e => normalize(`${e.mat} ${e.nom} ${e.jobs || ''}`).includes(searchTerm)).slice(0, 30) : [];

  const choisir = (p: PaieMensuelle) => {
    setSelected(p); setQuery(`${p.numero_matricule} — ${p.nom_prenoms}`); setOpen(false); setError('');
    const existing = lignes.find(l => l.paieId === p.id);
    setAvance(existing?.avance === undefined ? '' : String(existing.avance));
    setMed(existing?.med === undefined ? '' : String(existing.med));
    requestAnimationFrame(() => avanceRef.current?.focus());
  };
  const close = () => {
    if (saving) return;
    if ((lignes.length || avance.trim() || med.trim()) && !window.confirm('Fermer sans enregistrer les saisies en attente ?')) return;
    onClose();
  };
  const ajouter = (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    if (!selected) { setError('Choisissez un salarié dans la liste.'); searchRef.current?.focus(); return; }
    const a = parseMontant(avance), m = parseMontant(med);
    if (a === null || m === null) { setError('Saisissez un montant positif avec au maximum deux décimales.'); return; }
    if (a === undefined && m === undefined) { setError('Saisissez une avance ou un montant médicament.'); return; }
    const draft: Draft = { paieId: selected.id, nom: selected.nom_prenoms, matricule: selected.numero_matricule, avanceInitiale: Number(selected.avance || 0), medInitial: Number(selected.med || 0), avance: a, med: m };
    setLignes(prev => {
      const idx = prev.findIndex(l => l.paieId === draft.paieId);
      if (idx < 0) return [...prev, draft];
      return prev.map((l, i) => i === idx ? draft : l);
    });
    setSelected(null); setQuery(''); setAvance(''); setMed(''); setOpen(false);
    requestAnimationFrame(() => searchRef.current?.focus());
  };
  const enregistrer = async () => {
    if (!lignes.length || saving) return;
    if (selected || avance.trim() || med.trim()) { setError('Ajoutez la saisie en cours à la liste avant d’enregistrer.'); return; }
    setSaving(true); setError('');
    try {
      const result = await enregistrerSaisieLot(annee, mois, lignes);
      if (!result.success) { setError(result.message || "L'enregistrement a échoué."); return; }
      onSaved(result.count || 0);
    } catch { setError("L'enregistrement a échoué. Aucune confirmation de sauvegarde reçue."); }
    finally { setSaving(false); }
  };

  return <div className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-2 sm:p-5" role="presentation">
    <div role="dialog" aria-modal="true" aria-labelledby="saisie-lot-title" className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-5xl max-h-[95dvh] flex flex-col overflow-hidden border dark:border-slate-600">
      <div className="bg-salfa-dark text-white px-4 sm:px-5 py-3 flex items-center justify-between gap-3">
        <div><h2 id="saisie-lot-title" className="font-bold text-base flex items-center gap-2"><ClipboardList className="w-5 h-5" />Saisie en lot — avances et médicaments</h2><p className="text-xs text-slate-200 mt-1">Période : {mois} {annee}</p></div>
        <button type="button" onClick={close} disabled={saving} aria-label="Fermer" className="p-2 rounded hover:bg-white/10"><X className="w-5 h-5" /></button>
      </div>
      <div className="p-3 sm:p-5 overflow-y-auto space-y-4">
        <p className="text-xs text-slate-600 dark:text-slate-300">Recherchez un salarié, saisissez une avance et/ou un médicament, puis ajoutez-le à la liste. Vous pouvez les saisir séparément. Les montants <b>remplacent</b> les valeurs existantes ; laissez un champ vide pour le conserver. Saisissez 0 pour l'effacer.</p>
        <form onSubmit={ajouter} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_150px_150px_auto] gap-2 items-end">
          <div className="relative" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false); }}>
            <label htmlFor="lot-search" className="block text-xs font-bold mb-1">Salarié — nom ou matricule</label>
            <div className="relative"><Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" /><input id="lot-search" ref={searchRef} autoFocus role="combobox" aria-expanded={open} aria-controls="lot-options" aria-autocomplete="list" aria-activedescendant={open && matches[highlight]?.paie ? `lot-option-${matches[highlight].paie.id}` : undefined} value={query} onFocus={() => { if (!selected && searchTerm) setOpen(true); }} onChange={e => { const text = e.target.value; setQuery(text); setSelected(null); setAvance(''); setMed(''); setHighlight(0); setOpen(Boolean(normalize(text))); }} onKeyDown={e => {
              if (e.key === 'ArrowDown' && open && matches.length) { e.preventDefault(); setHighlight(i => Math.min(i + 1, matches.length - 1)); }
              else if (e.key === 'ArrowUp' && open) { e.preventDefault(); setHighlight(i => Math.max(0, i - 1)); }
              else if (e.key === 'Escape' && open) { e.preventDefault(); setOpen(false); }
              else if (e.key === 'Enter' && open) { e.preventDefault(); const match = matches[highlight]; if (match?.paie) choisir(match.paie); }
            }} placeholder="Rechercher un salarié..." className="w-full pl-9 pr-2 py-2 rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-salfa-teal" /></div>
            {open && <div id="lot-options" role="listbox" className="absolute z-20 w-full mt-1 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg shadow-xl max-h-52 overflow-y-auto">
              {matches.length === 0 ? <div className="p-3 text-xs text-slate-500">Aucun salarié trouvé.</div> : matches.map((c, i) => <button type="button" role="option" aria-selected={i === highlight} aria-disabled={!c.paie} id={c.paie ? `lot-option-${c.paie.id}` : undefined} key={`${c.id}-${c.mat}`} onMouseEnter={() => setHighlight(i)} onClick={() => c.paie && choisir(c.paie)} className={`w-full text-left px-3 py-2 text-xs border-b dark:border-slate-600 ${i === highlight ? 'bg-sky-50 dark:bg-slate-600' : ''} ${!c.paie ? 'text-slate-400' : ''}`}><b>{c.mat} — {c.nom}</b><span className="block text-[11px]">{c.paie ? (c.jobs || 'Salarié') : 'Sans bulletin : créez son bulletin pour cette période'}</span></button>)}
            </div>}
          </div>
          <div><label htmlFor="lot-avance" className="block text-xs font-bold mb-1">Avance (Ar)</label><input id="lot-avance" ref={avanceRef} inputMode="decimal" value={avance} onChange={e => setAvance(e.target.value)} placeholder={selected ? fmt(Number(selected.avance || 0)) : 'Inchangé'} className="w-full py-2 px-2 rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-700 text-sm text-right font-mono" /></div>
          <div><label htmlFor="lot-med" className="block text-xs font-bold mb-1">Médicament (Ar)</label><input id="lot-med" inputMode="decimal" value={med} onChange={e => setMed(e.target.value)} placeholder={selected ? fmt(Number(selected.med || 0)) : 'Inchangé'} className="w-full py-2 px-2 rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-700 text-sm text-right font-mono" /></div>
          <button type="submit" className="bg-salfa-teal hover:bg-sky-800 text-white rounded-md px-4 py-2 text-sm font-bold flex items-center justify-center gap-1"><Plus className="w-4 h-4" />Ajouter</button>
        </form>
        {selected && <div className="text-xs text-slate-500 dark:text-slate-300">Valeurs actuelles de {selected.nom_prenoms} : avance {fmt(Number(selected.avance || 0))} Ar · médicament {fmt(Number(selected.med || 0))} Ar</div>}
        {error && <div role="alert" className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 rounded-lg p-2 text-xs flex gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}
        <div className="border dark:border-slate-600 rounded-lg overflow-x-auto">
          <table className="w-full min-w-[570px] text-sm"><thead className="bg-slate-100 dark:bg-slate-700 text-xs"><tr><th className="text-left p-2">Salarié</th><th className="text-right p-2">Nouvelle avance</th><th className="text-right p-2">Nouveau médicament</th><th className="p-2">Actions</th></tr></thead>
            <tbody>{lignes.length === 0 ? <tr><td colSpan={4} className="text-center p-6 text-slate-500 text-xs">Aucune saisie ajoutée.</td></tr> : lignes.map(l => <tr key={l.paieId} className="border-t dark:border-slate-600"><td className="p-2"><b>{l.matricule}</b> — {l.nom}</td><td className="p-2 text-right font-mono">{l.avance === undefined ? 'Inchangé' : `${fmt(l.avance)} Ar`}</td><td className="p-2 text-right font-mono">{l.med === undefined ? 'Inchangé' : `${fmt(l.med)} Ar`}</td><td className="p-2 whitespace-nowrap text-center"><button type="button" className="text-sky-700 dark:text-sky-300 text-xs underline mr-3" onClick={() => { const p = paies.find(x => x.id === l.paieId); if (p) choisir(p); }}>Modifier</button><button type="button" aria-label={`Retirer ${l.nom}`} className="text-red-600" onClick={() => { setLignes(prev => prev.filter(x => x.paieId !== l.paieId)); if (selected?.id === l.paieId) { setSelected(null); setQuery(''); setAvance(''); setMed(''); } }}><Trash2 className="w-4 h-4 inline" /></button></td></tr>)}</tbody>
            <tfoot className="bg-emerald-50 dark:bg-emerald-900/20 border-t dark:border-slate-600 font-bold text-xs"><tr><td className="p-2">Total des montants saisis · {lignes.length} salarié(s)</td><td className="p-2 text-right">{fmt(lignes.reduce((s, l) => s + (l.avance ?? 0), 0))} Ar</td><td className="p-2 text-right">{fmt(lignes.reduce((s, l) => s + (l.med ?? 0), 0))} Ar</td><td /></tr></tfoot>
          </table>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">Seuls les bulletins existants de cette période peuvent être modifiés. Les montants ne sont enregistrés qu'après validation du lot.</p>
      </div>
      <div className="border-t dark:border-slate-600 p-3 flex justify-end gap-2 bg-slate-50 dark:bg-slate-900/40"><button type="button" onClick={close} disabled={saving} className="px-4 py-2 rounded-lg border dark:border-slate-600 text-sm">Annuler</button><button type="button" onClick={enregistrer} disabled={saving || !lignes.length} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" />{saving ? 'Enregistrement…' : 'Enregistrer le lot'}</button></div>
    </div>
  </div>;
};
