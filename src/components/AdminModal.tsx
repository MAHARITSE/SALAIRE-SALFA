// ADMIN MODAL - SANS Ar + DARKMODE
import React, { useState } from 'react';
import { ShieldCheck, X, Plus, Trash2, HeartHandshake, CheckCircle2, Info, Sliders, Layers } from 'lucide-react';

interface AdminModalProps { onClose: () => void; }

export const AdminModal: React.FC<AdminModalProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'formules' | 'colonnes'>('formules');
  const [tauxMaternite, setTauxMaternite] = useState<number>(50);
  const [cnapsSalariale, setCnapsSalariale] = useState<number>(1.0);
  const [cnapsPatronale, setCnapsPatronale] = useState<number>(13.0);
  const [deductionEnfant, setDeductionEnfant] = useState<number>(2000);
  const [minIrsa, setMinIrsa] = useState<number>(3000);
  const [colonnes, setColonnes] = useState([
    { id: 'base_aj', nom: 'BASE AJ (Salaire de base)', type: 'Gain de base', permanent: true },
    { id: 'logt_trsp', nom: 'Indemnité Logement & Transport', type: 'Gain de base', permanent: true },
    { id: 'rendement', nom: 'Prime de Rendement', type: 'Gain de base', permanent: true },
    { id: 'resp_repres', nom: 'RESP REPRES', type: 'Gain de base', permanent: true },
    { id: 'augmentation_divers', nom: 'AUGMENTATION DIVERS', type: 'Accessoire', permanent: false },
    { id: 'prime_de_garde', nom: 'Prime de garde', type: 'Accessoire', permanent: false },
    { id: 'anciennete2', nom: "Prime d'Ancienneté / Majoration", type: 'Accessoire', permanent: false },
    { id: 'risque', nom: 'Prime de RISQUE', type: 'Accessoire', permanent: false },
    { id: 'repr_rec', nom: 'Repr° réc° (Représentation)', type: 'Accessoire', permanent: false },
    { id: 'avance', nom: 'AVANCE sur salaire / Prêt', type: 'Retenue', permanent: false },
    { id: 'med', nom: 'MED / Pharmacie & Médicaments', type: 'Retenue', permanent: false },
  ]);
  const [newColNom, setNewColNom] = useState('');
  const [newColType, setNewColType] = useState('Accessoire');

  const handleAddColonne = (e: React.FormEvent) => {
    e.preventDefault(); if (!newColNom.trim()) return;
    const id = newColNom.toLowerCase().replace(/[^a-z0-9]/g, '_');
    setColonnes([...colonnes, { id, nom: newColNom.trim(), type: newColType, permanent: false }]);
    setNewColNom('');
  };
  const handleRemoveColonne = (index: number) => {
    if (colonnes[index].permanent) { alert("Colonne officielle."); return; }
    setColonnes(colonnes.filter((_, i) => i !== index));
  };
  const handleSaveConfig = () => { alert("Paramètres enregistrés !"); onClose(); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden border border-slate-200 dark:border-slate-700 modal-mobile max-h-[95dvh] flex flex-col">
        <div className="bg-salfa-dark dark:bg-slate-900 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between text-white shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0"><ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-400 shrink-0" /><div className="min-w-0"><h3 className="text-sm sm:text-lg font-bold truncate">Admin : Formules & Colonnes</h3><p className="text-[10px] sm:text-xs text-slate-300 hidden sm:block">Paramétrage avancé Administrateur</p></div></div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-white/10 text-white shrink-0 ml-2"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50 px-2 sm:px-6 overflow-x-auto no-scrollbar shrink-0">
          <button onClick={() => setActiveTab('formules')} className={`py-2.5 sm:py-3 px-3 sm:px-5 text-xs sm:text-sm font-bold flex items-center gap-1.5 border-b-2 whitespace-nowrap shrink-0 ${activeTab === 'formules' ? 'border-salfa-teal dark:border-sky-400 text-salfa-dark dark:text-white bg-white dark:bg-slate-800' : 'border-transparent text-slate-600 dark:text-slate-300'}`}><Sliders className="w-4 h-4 text-salfa-teal dark:text-sky-300" /><span className="hidden xs:inline">1. Formules & Maternité</span><span className="xs:hidden">Formules</span></button>
          <button onClick={() => setActiveTab('colonnes')} className={`py-2.5 sm:py-3 px-3 sm:px-5 text-xs sm:text-sm font-bold flex items-center gap-1.5 border-b-2 whitespace-nowrap shrink-0 ${activeTab === 'colonnes' ? 'border-salfa-teal dark:border-sky-400 text-salfa-dark dark:text-white bg-white dark:bg-slate-800' : 'border-transparent text-slate-600 dark:text-slate-300'}`}><Layers className="w-4 h-4 text-salfa-teal dark:text-sky-300" /><span className="hidden xs:inline">2. Colonnes & Rubriques</span><span className="xs:hidden">Colonnes</span></button>
        </div>

        <div className="p-3 sm:p-6 overflow-y-auto thin-scrollbar flex-1">
          {activeTab === 'formules' ? (
            <div className="space-y-4 sm:space-y-6">
              <div className="bg-pink-50/70 dark:bg-pink-900/20 border-2 border-pink-200 dark:border-pink-800 rounded-xl p-3 sm:p-5 space-y-3">
                <div className="flex items-start justify-between gap-2"><div className="flex items-start gap-2"><HeartHandshake className="w-5 h-5 sm:w-6 sm:h-6 text-pink-600 dark:text-pink-400 shrink-0 mt-0.5" /><div><h4 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white uppercase">Congé de Maternité (÷2 Base Brute)</h4><p className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-400 hidden sm:block">50% par l'employeur.</p></div></div><span className="px-2 sm:px-3 py-1 rounded-full bg-pink-100 dark:bg-pink-900/40 text-pink-800 dark:text-pink-300 text-[10px] sm:text-xs font-extrabold uppercase shrink-0">Active</span></div>
                <div className="text-[11px] sm:text-xs text-slate-700 dark:text-slate-300 bg-white/80 dark:bg-slate-800/80 p-3 rounded-lg border border-pink-200 dark:border-pink-800"><div className="font-bold text-pink-900 dark:text-pink-300 mb-1 flex items-center gap-1.5"><Info className="w-4 h-4" />Formule :</div><code className="block bg-slate-100 dark:bg-slate-700 p-2 rounded font-mono text-salfa-dark dark:text-slate-200 text-[11px] sm:text-xs overflow-x-auto">Salaire Brut = (BASE AJ + Logt Trsp + Rendement + RESP) ÷ 2</code></div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1"><label className="text-[11px] sm:text-xs font-bold dark:text-slate-300">Coefficient maternité :</label><div className="flex items-center gap-2"><input type="number" value={tauxMaternite} onChange={(e) => setTauxMaternite(Number(e.target.value))} className="w-20 rounded-lg border dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-1.5 text-sm font-bold text-center" /><span className="text-xs font-bold text-slate-600 dark:text-slate-400">%</span></div></div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-700/30 border border-slate-200 dark:border-slate-700 rounded-xl p-3 sm:p-5 space-y-4">
                <h4 className="text-[11px] sm:text-xs font-extrabold text-salfa-dark dark:text-white uppercase tracking-wider border-b dark:border-slate-600 pb-2">CNaPS & IRSA (CGI Madagascar)</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div><label className="block text-[11px] sm:text-xs font-bold mb-1 dark:text-slate-300">CNaPS Salariale (%)</label><input type="number" step="0.1" value={cnapsSalariale} onChange={(e) => setCnapsSalariale(Number(e.target.value))} className="w-full rounded-lg border dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm font-mono font-bold" /></div>
                  <div><label className="block text-[11px] sm:text-xs font-bold mb-1 dark:text-slate-300">CNaPS Patronale (%)</label><input type="number" step="0.1" value={cnapsPatronale} onChange={(e) => setCnapsPatronale(Number(e.target.value))} className="w-full rounded-lg border dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm font-mono font-bold" /></div>
                  <div><label className="block text-[11px] sm:text-xs font-bold mb-1 dark:text-slate-300">Déduction IRSA / enfant</label><input type="number" value={deductionEnfant} onChange={(e) => setDeductionEnfant(Number(e.target.value))} className="w-full rounded-lg border dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm font-mono font-bold" /></div>
                  <div><label className="block text-[11px] sm:text-xs font-bold mb-1 dark:text-slate-300">Minimum IRSA</label><input type="number" value={minIrsa} onChange={(e) => setMinIrsa(Number(e.target.value))} className="w-full rounded-lg border dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm font-mono font-bold" /></div>
                </div>
                <div className="p-3 rounded-lg bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 text-[11px] sm:text-xs text-slate-600 dark:text-slate-400"><span className="font-bold text-salfa-teal dark:text-sky-300">Arrondi CGI :</span> base imposable arrondie à 100 inférieur.</div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 sm:space-y-6">
              <div className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-xl p-3 sm:p-4 text-[11px] sm:text-xs dark:text-slate-300"><div className="font-extrabold text-salfa-dark dark:text-white">Gestion des Colonnes et Rubriques</div><div>Ajoutez des primes exceptionnelles, indemnités.</div></div>
              <form onSubmit={handleAddColonne} className="bg-slate-50 dark:bg-slate-700/30 border dark:border-slate-700 rounded-xl p-3 sm:p-4 flex flex-col gap-3"><div className="flex flex-col sm:flex-row gap-3"><div className="flex-1"><label className="block text-[11px] font-bold uppercase mb-1 dark:text-slate-300">Nom nouvelle colonne</label><input type="text" value={newColNom} onChange={(e) => setNewColNom(e.target.value)} placeholder="ex: Prime Bilinguisme..." className="w-full rounded-lg border dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm" /></div><div className="w-full sm:w-auto"><label className="block text-[11px] font-bold uppercase mb-1 dark:text-slate-300">Type</label><select value={newColType} onChange={(e) => setNewColType(e.target.value)} className="w-full rounded-lg border dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm font-bold"><option value="Accessoire">Accessoire (+)</option><option value="Gain de base">Gain de base (+)</option><option value="Retenue">Retenue (-)</option></select></div></div><button type="submit" className="w-full sm:w-auto bg-salfa-dark dark:bg-slate-600 hover:bg-salfa-teal text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-1.5 shadow"><Plus className="w-4 h-4" /><span>Ajouter la Colonne</span></button></form>
              <div className="block sm:hidden space-y-2">{colonnes.map((col, idx) => (<div key={idx} className="border dark:border-slate-700 rounded-xl p-3 bg-white dark:bg-slate-700 flex justify-between items-center gap-2"><div className="min-w-0"><div className="font-bold text-sm truncate dark:text-white">{col.nom}</div><div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">{col.id} • {col.type}</div></div><div className="flex items-center gap-2 shrink-0">{col.permanent ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-600 font-bold">Officiel</span> : <><span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300 font-bold">Perso</span><button onClick={() => handleRemoveColonne(idx)} className="p-1.5 rounded bg-red-50 dark:bg-red-900/20 text-red-600"><Trash2 className="w-4 h-4" /></button></>}</div></div>))}</div>
              <div className="hidden sm:block border dark:border-slate-700 rounded-xl overflow-hidden"><div className="overflow-x-auto thin-scrollbar"><table className="w-full text-left border-collapse text-xs min-w-[600px] dark:text-slate-200"><thead><tr className="bg-slate-100 dark:bg-slate-700 border-b dark:border-slate-600 font-bold uppercase text-slate-600 dark:text-slate-300"><th className="py-2.5 px-4">ID SQL</th><th className="py-2.5 px-4">Nom Colonne</th><th className="py-2.5 px-4">Type</th><th className="py-2.5 px-4 text-center">Statut</th><th className="py-2.5 px-4 text-center">Action</th></tr></thead><tbody className="divide-y dark:divide-slate-700">{colonnes.map((col, idx) => (<tr key={idx} className="hover:bg-sky-50/50 dark:hover:bg-slate-600/50"><td className="py-2.5 px-4 font-mono text-slate-500 dark:text-slate-400">{col.id}</td><td className="py-2.5 px-4 font-bold">{col.nom}</td><td className="py-2.5 px-4 font-semibold text-salfa-teal dark:text-sky-300">{col.type}</td><td className="py-2.5 px-4 text-center">{col.permanent ? <span className="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-600 font-bold text-[11px]">Officiel</span> : <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300 font-bold text-[11px]">Personnalisé</span>}</td><td className="py-2.5 px-4 text-center">{!col.permanent && <button onClick={() => handleRemoveColonne(idx)} className="p-1 rounded text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="w-4 h-4" /></button>}</td></tr>))}</tbody></table></div></div>
            </div>
          )}
        </div>

        <div className="bg-slate-50 dark:bg-slate-700/50 border-t dark:border-slate-700 px-3 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-3 shrink-0"><span className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 hidden sm:block">Conforme Loi de Finances Madagascar.</span><div className="flex gap-2 sm:gap-3 w-full sm:w-auto"><button onClick={onClose} className="flex-1 sm:flex-initial px-4 py-2.5 sm:py-2 rounded-lg bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-700 dark:text-slate-200 text-sm font-semibold">Fermer</button><button onClick={handleSaveConfig} className="flex-1 sm:flex-initial px-4 sm:px-6 py-2.5 sm:py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold shadow flex items-center justify-center gap-2"><CheckCircle2 className="w-4 h-4" /><span>Appliquer</span></button></div></div>
      </div>
    </div>
  );
};
