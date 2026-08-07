// ONGLET 2 - SAISIE - SANS Ar + DARKMODE
import React, { useState, useEffect } from 'react';
import { PaieMensuelle, TotauxMois } from '../../types';
import { fetchPaiesMois, initMoisPaie, savePaieSaisie, cloturerMois, deverrouillerMois } from '../../api';
import { MonetaryInput, formatSpace } from '../MonetaryInput';
import { Calendar, Lock, Unlock, RefreshCw, Save, ShieldCheck, CheckCircle } from 'lucide-react';

function fmt(val: number | undefined): string {
  if (val === undefined || val === null) return '0,00';
  return formatSpace(val) + ',00';
}

interface SaisieTabProps { userRole: string; }

export const SaisieTab: React.FC<SaisieTabProps> = ({ userRole }) => {
  const [mois, setMois] = useState('JANVIER');
  const [annee, setAnnee] = useState(2026);
  const [paies, setPaies] = useState<PaieMensuelle[]>([]);
  const [verrouille, setVerrouille] = useState(false);
  const [totaux, setTotaux] = useState<TotauxMois>({});
  const [loading, setLoading] = useState(true);
  const [selectedPaie, setSelectedPaie] = useState<PaieMensuelle | null>(null);
  const [avanceInput, setAvanceInput] = useState<number>(0);
  const [medInput, setMedInput] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [showAccessoiresModal, setShowAccessoiresModal] = useState(false);
  const moisListe = ["JANVIER","FEVRIER","MARS","AVRIL","MAI","JUIN","JUILLET","AOUT","SEPTEMBRE","OCTOBRE","NOVEMBRE","DECEMBRE"];

  const loadData = async () => {
    setLoading(true);
    const d = await fetchPaiesMois(annee, mois);
    setPaies(d.employes || []); setVerrouille(d.verrouille || false); setTotaux(d.totaux || {}); setLoading(false);
    if (selectedPaie) {
      const up = (d.employes || []).find((p) => p.id === selectedPaie.id);
      if (up) { setSelectedPaie(up); setAvanceInput(Number(up.avance || 0)); setMedInput(Number(up.med || 0)); } else setSelectedPaie(null);
    }
  };
  useEffect(() => { loadData(); /* eslint-disable-next-line */ }, [mois, annee]);

  const handleSelectRow = (p: PaieMensuelle) => { setSelectedPaie(p); setAvanceInput(Number(p.avance || 0)); setMedInput(Number(p.med || 0)); };
  const handleInitMois = async () => {
    if (!window.confirm(`Ouvrir et initialiser ${mois} ${annee} ? AVANCE et MED remis à 0.`)) return;
    const res = await initMoisPaie(annee, mois); if (res.success) { alert(`${res.initializedCount} bulletin(s) initialisé(s).`); loadData(); }
  };
  const handleSaveSaisie = async (e?: React.FormEvent) => {
    if (e) e.preventDefault(); if (!selectedPaie) return; if (verrouille) { alert("Mois clôturé."); return; }
    setSaving(true); const res = await savePaieSaisie(selectedPaie.id, Number(avanceInput || 0), Number(medInput || 0)); setSaving(false);
    if (res.success) loadData(); else alert("Erreur sauvegarde.");
  };
  const handleCloturer = async () => { if (!window.confirm(`Clôturer ${mois} ${annee} ?`)) return; await cloturerMois(annee, mois); loadData(); };
  const handleDeverrouiller = async () => {
    if (userRole !== 'Administrateur') { alert("Admin seulement."); return; }
    if (!window.confirm(`Déverrouiller ${mois} ${annee} ?`)) return; await deverrouillerMois(annee, mois, userRole); loadData();
  };

  return (
    <div className="space-y-3 sm:space-y-6 w-full max-w-full overflow-x-hidden">
      <div className="bg-white dark:bg-slate-800 p-3 sm:p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col gap-3 w-full">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-salfa-teal dark:text-sky-300" /><span className="text-[11px] sm:text-xs font-bold uppercase text-slate-700 dark:text-slate-300 hidden xs:inline">Période :</span><select value={mois} onChange={(e) => setMois(e.target.value)} className="rounded-lg border dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-bold">{moisListe.map((m) => <option key={m} value={m}>{m}</option>)}</select><select value={annee} onChange={(e) => setAnnee(Number(e.target.value))} className="rounded-lg border dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-bold"><option value={2025}>2025</option><option value={2026}>2026</option><option value={2027}>2027</option></select></div>
          <button onClick={handleInitMois} disabled={verrouille} className="bg-sky-100 dark:bg-sky-900/30 hover:bg-sky-200 dark:hover:bg-sky-800 text-salfa-teal dark:text-sky-300 disabled:opacity-50 px-2.5 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold flex items-center gap-1.5"><RefreshCw className="w-3.5 h-3.5" /><span className="hidden xs:inline">Ouvrir / Initialiser</span><span className="xs:hidden">Init</span></button>
          {verrouille ? <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-bold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800"><Lock className="w-3.5 h-3.5" />CLÔTURÉ</span> : <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-bold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"><Unlock className="w-3.5 h-3.5" />OUVERT</span>}
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
          {!verrouille ? <button onClick={handleCloturer} className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow"><CheckCircle className="w-4 h-4" /><span>Clôturer / Valider</span></button>
          : userRole === 'Administrateur' && <button onClick={handleDeverrouiller} className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow"><ShieldCheck className="w-4 h-4" /><span>Déverrouiller (Admin)</span></button>}
        </div>
      </div>

      <div className="block lg:hidden space-y-2">
        {loading ? <div className="bg-white dark:bg-slate-800 rounded-xl p-4 text-center text-sm text-slate-500 border dark:border-slate-700">Chargement...</div>
        : paies.length === 0 ? <div className="bg-white dark:bg-slate-800 rounded-xl p-4 text-center text-sm text-slate-500 border dark:border-slate-700">Aucun bulletin. Initialisez le mois.</div>
        : paies.map((p) => {
          const isSel = selectedPaie?.id === p.id;
          return (<button key={p.id} onClick={() => handleSelectRow(p)} className={`w-full text-left bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-700 p-3 shadow-sm ${isSel ? 'border-salfa-teal ring-2 ring-salfa-teal/20 bg-sky-50 dark:bg-slate-700' : ''}`}><div className="flex justify-between items-start gap-2"><div className="min-w-0"><div className="flex items-center gap-2"><span className="font-bold text-salfa-dark dark:text-white text-sm">Mat {p.numero_matricule}</span><span className="text-[10px] font-bold text-salfa-teal dark:text-sky-300">{p.categorie || '—'}</span></div><div className="font-semibold text-sm truncate dark:text-slate-100">{p.nom_prenoms}</div><div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{p.jobs || '—'}</div></div><div className="text-right shrink-0"><div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">NET À PAYER</div><div className="font-mono font-bold text-emerald-700 dark:text-emerald-400 text-sm">{fmt(p.net)}</div></div></div><div className="grid grid-cols-4 gap-1.5 mt-2.5"><div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-1.5 text-center"><div className="text-[9px] text-slate-500 dark:text-slate-400">BRUT</div><div className="font-mono text-[11px] font-bold dark:text-slate-200">{fmt(p.brut)}</div></div><div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-1.5 text-center"><div className="text-[9px] text-red-600">AVANCE</div><div className="font-mono text-[11px] font-bold text-red-700 dark:text-red-300">{fmt(p.avance)}</div></div><div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-1.5 text-center"><div className="text-[9px] text-red-600">MED</div><div className="font-mono text-[11px] font-bold text-red-700 dark:text-red-300">{fmt(p.med)}</div></div><div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-1.5 text-center"><div className="text-[9px] text-emerald-700 dark:text-emerald-300">NET base</div><div className="font-mono text-[11px] font-bold dark:text-slate-200">{fmt(p.salaire_net)}</div></div></div></button>);
        })}
      </div>

      <div className="hidden lg:block bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden w-full">
        <div className="table-responsive thin-scrollbar max-h-[48vh]">
          <table className="w-full text-left border-collapse min-w-[1300px]"><thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-700"><tr className="border-b border-slate-200 dark:border-slate-600 text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase"><th className="py-3 px-3 text-center">N° Mat</th><th className="py-3 px-4">NOM</th><th className="py-3 px-2 text-center">CAT</th><th className="py-3 px-3">JOBS</th><th className="py-3 px-3 text-right">Brut</th><th className="py-3 px-3 text-right">CNaPS</th><th className="py-3 px-3 text-right">IRSA</th><th className="py-3 px-3 text-right">Net base</th><th className="py-3 px-3 text-right">Accessoir</th><th className="py-3 px-3 text-right">BRUT</th><th className="py-3 px-3 text-right text-red-600 dark:text-red-400">AVANCE</th><th className="py-3 px-3 text-right text-red-600 dark:text-red-400">MED</th><th className="py-3 px-4 text-right bg-salfa-light/60 dark:bg-slate-600 font-bold text-salfa-dark dark:text-white">NET À PAYER</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-700 text-sm dark:text-slate-200">{loading ? <tr><td colSpan={13} className="py-8 text-center text-slate-500">Chargement...</td></tr> : paies.length === 0 ? <tr><td colSpan={13} className="py-8 text-center text-slate-500">Aucun bulletin. Initialisez.</td></tr> : paies.map((p) => { const isSelected = selectedPaie?.id === p.id; return (<tr key={p.id} onClick={() => handleSelectRow(p)} className={`cursor-pointer ${isSelected ? 'bg-sky-100/80 dark:bg-slate-700 font-semibold' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}><td className="py-2.5 px-3 text-center font-bold text-salfa-dark dark:text-white">{p.numero_matricule}</td><td className="py-2.5 px-4 font-medium truncate max-w-[160px]">{p.nom_prenoms}</td><td className="py-2.5 px-2 text-center text-xs font-bold text-salfa-teal dark:text-sky-300">{p.categorie || '—'}</td><td className="py-2.5 px-3 text-xs truncate max-w-[120px]">{p.jobs || '—'}</td><td className="py-2.5 px-3 text-right font-mono">{fmt(p.salaire_brut)}</td><td className="py-2.5 px-3 text-right font-mono text-xs">{fmt(p.cnaps)}</td><td className="py-2.5 px-3 text-right font-mono text-xs">{fmt(p.irsa)}</td><td className="py-2.5 px-3 text-right font-mono">{fmt(p.salaire_net)}</td><td className="py-2.5 px-3 text-right font-mono">{fmt(p.accessoir)}</td><td className="py-2.5 px-3 text-right font-mono font-bold">{fmt(p.brut)}</td><td className="py-2.5 px-3 text-right font-mono font-semibold text-red-600 dark:text-red-300 bg-red-50/40 dark:bg-red-900/10">{fmt(p.avance)}</td><td className="py-2.5 px-3 text-right font-mono font-semibold text-red-600 dark:text-red-300 bg-red-50/40 dark:bg-red-900/10">{fmt(p.med)}</td><td className="py-2.5 px-4 text-right font-mono font-bold text-emerald-700 dark:text-emerald-400 bg-salfa-light/60 dark:bg-slate-700/60">{fmt(p.net)}</td></tr>); })}</tbody></table>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-3 sm:p-5 w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 border-b dark:border-slate-700 pb-3 gap-2"><div className="min-w-0"><h3 className="text-xs sm:text-sm font-bold text-salfa-dark dark:text-white uppercase">Saisie Rapide AVANCE & MED</h3><p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 truncate">{selectedPaie ? `Mat ${selectedPaie.numero_matricule} — ${selectedPaie.nom_prenoms}` : "Sélectionnez une ligne."}</p></div>{selectedPaie && !verrouille && <button onClick={() => setShowAccessoiresModal(true)} className="text-[11px] sm:text-xs font-semibold text-salfa-teal dark:text-sky-300 hover:underline">+ Accessoires</button>}</div>
        <form onSubmit={handleSaveSaisie} className="flex flex-col sm:flex-row sm:items-end gap-3"><div className="flex-1 min-w-0"><label className="block text-[11px] sm:text-xs font-bold uppercase mb-1 dark:text-slate-300">AVANCE</label><MonetaryInput disabled={!selectedPaie || verrouille} value={avanceInput} onChange={(num) => setAvanceInput(num)} className="w-full rounded-lg border dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm font-mono font-bold" /></div><div className="flex-1 min-w-0"><label className="block text-[11px] sm:text-xs font-bold uppercase mb-1">MED</label><MonetaryInput disabled={!selectedPaie || verrouille} value={medInput} onChange={(num) => setMedInput(num)} className="w-full rounded-lg border dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm font-mono font-bold" /></div><div className="w-full sm:w-auto"><button type="submit" disabled={!selectedPaie || verrouille || saving} className="w-full sm:w-auto bg-salfa-dark dark:bg-slate-600 hover:bg-salfa-teal dark:hover:bg-slate-500 disabled:opacity-50 text-white font-bold px-6 py-2.5 rounded-lg text-sm shadow flex items-center justify-center gap-2"><Save className="w-4 h-4" /><span>{saving ? "Calcul..." : "Enregistrer"}</span></button></div></form>
      </div>

      <div className="bg-salfa-dark dark:bg-slate-800 text-white p-3 sm:p-4 rounded-xl shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs font-semibold border dark:border-slate-700"><div className="text-[11px] sm:text-xs">Totaux {mois} {annee} : <span className="text-sky-300 font-bold">{totaux.count_employes || 0} salariés</span></div><div className="flex flex-wrap gap-2 sm:gap-4 font-mono text-[11px] sm:text-xs w-full sm:w-auto"><div>BRUT : <span className="font-bold">{fmt(totaux.total_brut)}</span></div><div>AVANCE : <span className="text-red-300 font-bold">{fmt(totaux.total_avance)}</span></div><div>MED : <span className="text-red-300 font-bold">{fmt(totaux.total_med)}</span></div><div className="bg-salfa-teal dark:bg-slate-600 px-2.5 sm:px-3 py-1 rounded w-full sm:w-auto text-center">NET À PAYER : <span className="font-bold">{fmt(totaux.total_net)}</span></div></div></div>

      {showAccessoiresModal && selectedPaie && <AccessoiresModalForm paie={selectedPaie} onClose={() => setShowAccessoiresModal(false)} onSaved={() => { setShowAccessoiresModal(false); loadData(); }} />}
    </div>
  );
};

interface AccModalProps { paie: PaieMensuelle; onClose: () => void; onSaved: () => void; }
const AccessoiresModalForm: React.FC<AccModalProps> = ({ paie, onClose, onSaved }) => {
  const [form, setForm] = useState({ augmentation_divers: paie.augmentation_divers || 0, prime_de_garde: paie.prime_de_garde || 0, anciennete2: paie.anciennete2 || 0, risque: paie.risque || 0, repr_rec: paie.repr_rec || 0 });
  const handleSave = async (e: React.FormEvent) => { e.preventDefault(); await savePaieSaisie(paie.id, paie.avance, paie.med, form); onSaved(); };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 backdrop-blur-sm p-2 sm:p-4"><div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border dark:border-slate-700 modal-mobile max-h-[90dvh] flex flex-col"><div className="bg-salfa-dark dark:bg-slate-900 px-4 sm:px-6 py-3 text-white shrink-0"><h3 className="text-sm sm:text-lg font-bold">Accessoires — Mat {paie.numero_matricule}</h3><p className="text-xs text-slate-300 truncate">{paie.nom_prenoms}</p></div><form onSubmit={handleSave} className="p-4 space-y-3 overflow-y-auto thin-scrollbar">{Object.entries({ augmentation_divers: 'AUGMENTATION DIVERS', prime_de_garde: 'Prime de garde', anciennete2: 'Prime Ancienneté', risque: 'Prime RISQUE', repr_rec: 'Repr° réc°' }).map(([k, l]) => (<div key={k}><label className="block text-xs font-bold uppercase mb-1 dark:text-slate-300">{l}</label><input type="number" value={(form as any)[k]} onChange={(e) => setForm({ ...form, [k]: Number(e.target.value) })} className="w-full rounded-lg border dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm font-mono" /></div>))}<div className="flex justify-end gap-3 pt-3 border-t dark:border-slate-700"><button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 dark:text-slate-200 text-sm font-semibold">Annuler</button><button type="submit" className="px-6 py-2 rounded-lg bg-salfa-dark dark:bg-slate-600 text-white text-sm font-bold shadow">Appliquer</button></div></form></div></div>
  );
};
