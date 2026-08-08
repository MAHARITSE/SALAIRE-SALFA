// ==============================================================================
// ONGLET 1 - SALARIÉS - SANS Ar + DARKMODE - RESPONSIVE V2
// ==============================================================================
import React, { useState, useEffect } from 'react';
import { Employe, PaieMensuelle } from '../../types';
import { fetchEmployes, fetchEmployePaies, createEmploye, updateEmploye, toggleActifEmploye } from '../../api';
import { MonetaryInput } from '../MonetaryInput';
import { Search, Plus, Edit2, UserX, UserCheck, History, X, Award, CheckCircle2, ShieldCheck, Info } from 'lucide-react';

function fmt(val: number | undefined): string {
  if (val === undefined || val === null) return '0,00';
  return val.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface EmployesTabProps { userRole?: string; onOpenAdmin?: () => void; }

export const EmployesTab: React.FC<EmployesTabProps> = ({ userRole, onOpenAdmin }) => {
  const [employes, setEmployes] = useState<Employe[]>([]);
  const [search, setSearch] = useState('');
  const [actifsOnly, setActifsOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editEmploye, setEditEmploye] = useState<Employe | null>(null);
  const [historyEmp, setHistoryEmp] = useState<Employe | null>(null);
  const [paiesHistory, setPaiesHistory] = useState<PaieMensuelle[]>([]);

  const loadData = async () => {
    setLoading(true);
    const data = await fetchEmployes(actifsOnly, search);
    setEmployes(data);
    setLoading(false);
  };
  useEffect(() => { loadData(); /* eslint-disable-next-line */ }, [actifsOnly]);

  return (
    <div className="space-y-3 sm:space-y-6 w-full max-w-full overflow-x-hidden">
      <div className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-xl p-2.5 sm:p-3 text-[11px] sm:text-xs text-salfa-dark dark:text-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
        <div className="flex items-start sm:items-center gap-2">
          <Info className="w-4 h-4 text-salfa-teal dark:text-sky-300 shrink-0 mt-0.5 sm:mt-0" />
          <span><b>Astuce :</b> Double-cliquez sur une ligne pour modifier.</span>
        </div>
        {userRole === 'Administrateur' && onOpenAdmin && (
          <button onClick={onOpenAdmin} className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-lg font-bold text-xs shrink-0 shadow w-full sm:w-auto justify-center">
            <ShieldCheck className="w-4 h-4" /><span>Admin : Formules & Colonnes</span>
          </button>
        )}
      </div>

      <div className="bg-white dark:bg-slate-800 p-3 sm:p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col gap-3 w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <form onSubmit={(e) => { e.preventDefault(); loadData(); }} className="flex items-center gap-2 flex-1 max-w-full sm:max-w-md w-full">
            <div className="relative w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Matricule, nom, fonction..." className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-salfa-teal" />
            </div>
            <button type="submit" className="bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 px-3 py-2 rounded-lg text-sm font-medium shrink-0">Filtrer</button>
          </form>
          <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
            <label className="flex items-center gap-2 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
              <input type="checkbox" checked={actifsOnly} onChange={(e) => setActifsOnly(e.target.checked)} className="rounded text-salfa-teal" />
              <span>Actifs seulement</span>
            </label>
            <button onClick={() => { setEditEmploye(null); setShowModal(true); }} className="bg-salfa-dark dark:bg-slate-700 hover:bg-salfa-teal dark:hover:bg-slate-600 text-white px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold flex items-center gap-1.5 shadow-sm shrink-0">
              <Plus className="w-4 h-4" /><span className="hidden xs:inline">Nouveau Salarié</span><span className="xs:hidden">Nouveau</span>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="block lg:hidden space-y-2 w-full">
        {loading ? <div className="bg-white dark:bg-slate-800 rounded-xl p-6 text-center text-sm text-slate-500 border dark:border-slate-700">Chargement...</div>
        : employes.length === 0 ? <div className="bg-white dark:bg-slate-800 rounded-xl p-6 text-center text-sm text-slate-500 border dark:border-slate-700">Aucun salarié trouvé.</div>
        : employes.map((emp) => {
          const isMaternite = emp.conge_maternite === 1 || emp.conge_maternite === true;
          const baseBrutNormale = Number(emp.base_aj || 0) + Number(emp.logement_transport || 0) + Number(emp.rendement || 0) + Number(emp.responsabilite_representation || 0);
          const baseBrutAffichee = isMaternite ? baseBrutNormale / 2.0 : baseBrutNormale;
          return (
            <div key={emp.id} onDoubleClick={() => { setEditEmploye(emp); setShowModal(true); }} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-salfa-dark dark:text-white text-sm">Mat {emp.numero_matricule}</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-900/30 text-salfa-teal dark:text-sky-300">{emp.categorie || '—'}</span>
                    {isMaternite && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-pink-100 dark:bg-pink-900/30 text-pink-800 dark:text-pink-300 font-bold">MATERNITÉ 50%</span>}
                    {emp.actif === 1 ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300">Actif</span> : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700">Départ</span>}
                  </div>
                  <div className="font-semibold text-slate-800 dark:text-slate-100 text-sm truncate mt-1">{emp.nom_prenoms}</div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 truncate">{emp.jobs || '—'} • {emp.date_embauche || '—'} ({emp.nombre_annees} ans)</div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => { setEditEmploye(emp); setShowModal(true); }} className="p-2 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-600 dark:text-slate-300"><Edit2 className="w-4 h-4" /></button>
                  <button onClick={async () => { setHistoryEmp(emp); setPaiesHistory(await fetchEmployePaies(emp.id)); }} className="p-2 rounded-lg bg-sky-50 dark:bg-sky-900/30 text-salfa-teal"><History className="w-4 h-4" /></button>
                  <button onClick={async () => { if (!window.confirm(`Confirmer ${emp.actif ? 'désactiver' : 'réactiver'} ${emp.nom_prenoms} ?`)) return; await toggleActifEmploye(emp.id, emp.actif === 0); loadData(); }} className={`p-2 rounded-lg ${emp.actif ? 'bg-red-50 dark:bg-red-900/20 text-red-600' : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600'}`}>{emp.actif ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2.5 text-xs">
                <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-2"><div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">BASE AJ</div><div className="font-mono font-bold text-slate-800 dark:text-slate-100">{fmt(emp.base_aj)}</div></div>
                <div className="bg-salfa-light/40 dark:bg-slate-700 rounded-lg p-2"><div className="text-[10px] text-slate-600 dark:text-slate-300 uppercase font-bold">BASE BRUT</div><div className="font-mono font-extrabold text-salfa-dark dark:text-white">{fmt(baseBrutAffichee)}</div></div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop table */}
      <div className="hidden lg:block bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden w-full">
        <div className="table-responsive thin-scrollbar max-h-[65vh] lg:max-h-[68vh]">
          <table className="w-full text-left border-collapse min-w-[1200px]">
            <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-700">
              <tr className="border-b border-slate-200 dark:border-slate-600 text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                <th className="py-3 px-3 text-center">N° Mat</th><th className="py-3 px-4">NOM ET PRENOMS</th><th className="py-3 px-3 text-center">CNaPS</th><th className="py-3 px-2 text-center">CAT</th><th className="py-3 px-4">JOBS</th><th className="py-3 px-3 text-center">Date emb</th><th className="py-3 px-2 text-center">Anc.</th><th className="py-3 px-2 text-center">Enf.</th><th className="py-3 px-3 text-right">BASE AJ</th><th className="py-3 px-3 text-right">Logt/Trsp</th><th className="py-3 px-3 text-right bg-salfa-light/50 dark:bg-slate-600 text-salfa-dark dark:text-white">BASE BRUT</th><th className="py-3 px-4">Mode / RIB</th><th className="py-3 px-3 text-center">Statut</th><th className="py-3 px-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700 text-sm">
              {loading ? <tr><td colSpan={14} className="py-8 text-center text-slate-500">Chargement...</td></tr>
              : employes.length === 0 ? <tr><td colSpan={14} className="py-8 text-center text-slate-500">Aucun salarié.</td></tr>
              : employes.map((emp) => {
                const isMaternite = emp.conge_maternite === 1 || emp.conge_maternite === true;
                const baseBrutNormale = Number(emp.base_aj || 0) + Number(emp.logement_transport || 0) + Number(emp.rendement || 0) + Number(emp.responsabilite_representation || 0);
                const baseBrutAffichee = isMaternite ? baseBrutNormale / 2.0 : baseBrutNormale;
                return (
                  <tr key={emp.id} onDoubleClick={() => { setEditEmploye(emp); setShowModal(true); }} className="hover:bg-sky-50/70 dark:hover:bg-slate-700/50 cursor-pointer transition">
                    <td className="py-3 px-3 text-center font-bold text-salfa-dark dark:text-white">{emp.numero_matricule}</td>
                    <td className="py-3 px-4 font-semibold text-slate-800 dark:text-slate-100"><div className="flex items-center gap-2"><span className="truncate max-w-[180px]">{emp.nom_prenoms}</span>{isMaternite && <span className="px-2 py-0.5 rounded-full bg-pink-100 dark:bg-pink-900/30 text-pink-800 dark:text-pink-300 text-[10px] font-extrabold uppercase">Maternité 50%</span>}</div></td>
                    <td className="py-3 px-3 text-center text-xs font-mono">{emp.numero_cnaps || '—'}</td>
                    <td className="py-3 px-2 text-center font-bold text-salfa-teal dark:text-sky-300">{emp.categorie || '—'}</td>
                    <td className="py-3 px-4 truncate max-w-[140px]">{emp.jobs || '—'}</td>
                    <td className="py-3 px-3 text-center text-xs">{emp.date_embauche || '—'}</td>
                    <td className="py-3 px-2 text-center font-semibold">{emp.nombre_annees} ans</td>
                    <td className="py-3 px-2 text-center">{emp.enfant_a_charge}</td>
                    <td className="py-3 px-3 text-right font-mono font-medium">{fmt(emp.base_aj)}</td>
                    <td className="py-3 px-3 text-right font-mono">{fmt(emp.logement_transport)}</td>
                    <td className="py-3 px-3 text-right font-mono font-extrabold bg-salfa-light/40 dark:bg-slate-700">{fmt(baseBrutAffichee)}</td>
                    <td className="py-3 px-4 text-xs"><div className="font-semibold">{emp.mode_paiement}</div><div className="font-mono text-slate-500 text-[11px] truncate max-w-[120px]">{emp.rib || 'Aucun'}</div></td>
                    <td className="py-3 px-3 text-center">{emp.actif === 1 ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300"><CheckCircle2 className="w-3 h-3" />Actif</span> : <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-200 dark:bg-slate-700">Départ</span>}</td>
                    <td className="py-3 px-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={(e) => { e.stopPropagation(); setEditEmploye(emp); setShowModal(true); }} className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-600"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={async (e) => { e.stopPropagation(); setHistoryEmp(emp); setPaiesHistory(await fetchEmployePaies(emp.id)); }} className="p-1.5 rounded hover:bg-sky-100 dark:hover:bg-slate-600 text-salfa-teal"><History className="w-4 h-4" /></button>
                        <button onClick={async (e) => { e.stopPropagation(); if (!window.confirm(`Confirmer ?`)) return; await toggleActifEmploye(emp.id, emp.actif === 0); loadData(); }} className={`p-1.5 rounded ${emp.actif ? 'hover:bg-red-100 text-red-600' : 'hover:bg-emerald-100 text-emerald-600'}`}>{emp.actif ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && <EmployeModalForm employe={editEmploye} onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); loadData(); }} />}
      {historyEmp && <EmployeHistoryModal employe={historyEmp} paies={paiesHistory} onClose={() => setHistoryEmp(null)} />}
    </div>
  );
};

interface ModalFormProps { employe: Employe | null; onClose: () => void; onSaved: () => void; }
const EmployeModalForm: React.FC<ModalFormProps> = ({ employe, onClose, onSaved }) => {
  const [form, setForm] = useState({
    numero_matricule: employe?.numero_matricule || '',
    nom_prenoms: employe?.nom_prenoms || '',
    numero_cnaps: employe?.numero_cnaps || '',
    categorie: employe?.categorie || '',
    jobs: employe?.jobs || '',
    date_embauche: employe?.date_embauche || '',
    enfant_a_charge: employe?.enfant_a_charge || 0,
    base_aj: employe?.base_aj || 0,
    logement_transport: employe?.logement_transport || 0,
    rendement: employe?.rendement || 0,
    responsabilite_representation: employe?.responsabilite_representation || 0,
    rib: employe?.rib || '',
    mode_paiement: employe?.mode_paiement || 'ESPECES',
    conge_maternite: employe ? (employe.conge_maternite === 1 || employe.conge_maternite === true) : false,
    actif: employe ? employe.actif : 1
  });
  const [saving, setSaving] = useState(false);
  const calculateAncYear = (d: string) => { if (!d) return 0; try { const y = parseInt(d.split('-')[0] || d.split('/')[2] || '0', 10); if (y > 1900 && y <= 2026) return Math.max(0, 2026 - y); } catch {} return 0; };
  const ancYears = calculateAncYear(form.date_embauche);
  const getIndice = (y: number) => { if (y < 2) return 1.00; if (y < 4) return 1.09; if (y < 6) return 1.18; if (y < 8) return 1.27; if (y < 10) return 1.36; if (y < 12) return 1.45; if (y < 14) return 1.53; if (y < 16) return 1.60; if (y < 18) return 1.65; if (y < 20) return 1.68; return 1.70; };
  const indice = getIndice(ancYears);
  const baseReval = Math.round(Number(form.base_aj || 0) * indice * 100) / 100;
  const baseBruteNormale = Number(form.base_aj || 0) + Number(form.logement_transport || 0) + Number(form.rendement || 0) + Number(form.responsabilite_representation || 0);
  const baseBrutAffichee = form.conge_maternite ? baseBruteNormale / 2.0 : baseBrutNormale;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    const dataToSend = { ...form, numero_matricule: Number(form.numero_matricule), base_aj: Number(form.base_aj), logement_transport: Number(form.logement_transport), rendement: Number(form.rendement), responsabilite_representation: Number(form.responsabilite_representation), enfant_a_charge: Number(form.enfant_a_charge), conge_maternite: form.conge_maternite ? 1 : 0 };
    let ok = false; if (employe) ok = await updateEmploye(employe.id, dataToSend); else ok = await createEmploye(dataToSend);
    setSaving(false); if (ok) onSaved(); else alert("Erreur enregistrement.");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 dark:border-slate-700 modal-mobile max-h-[95dvh] flex flex-col">
        <div className="bg-salfa-dark dark:bg-slate-900 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between text-white shrink-0">
          <h3 className="text-sm sm:text-lg font-bold truncate">{employe ? `Modifier Mat ${employe.numero_matricule}` : "Nouveau Salarié"}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10 shrink-0"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto thin-scrollbar">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {[
              { label: 'N° Matricule *', key: 'numero_matricule', type: 'number', required: true },
              { label: 'NOM ET PRENOMS *', key: 'nom_prenoms', type: 'text', required: true },
              { label: 'N° CNaPS', key: 'numero_cnaps', type: 'text' },
              { label: 'Catégorie', key: 'categorie', type: 'text' },
              { label: 'Fonction (JOBS)', key: 'jobs', type: 'text' },
              { label: 'Date embauche', key: 'date_embauche', type: 'text' },
              { label: 'Enfants à charge', key: 'enfant_a_charge', type: 'number' },
            ].map((f) => (
              <div key={f.key}><label className="block text-xs font-bold uppercase mb-1 dark:text-slate-300">{f.label}</label><input type={f.type} value={(form as any)[f.key]} onChange={(e) => setForm({ ...form, [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value })} required={!!f.required} className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm" /></div>
            ))}
            <div><label className="block text-xs font-bold uppercase mb-1 dark:text-slate-300">Mode règlement</label><select value={form.mode_paiement} onChange={(e) => setForm({ ...form, mode_paiement: e.target.value })} className="w-full rounded-lg border bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm"><option value="ESPECES">ESPECES</option><option value="VIREMENT">VIREMENT</option></select></div>
            <div><label className="block text-xs font-bold uppercase mb-1 dark:text-slate-300">BASE AJ</label><MonetaryInput value={form.base_aj} onChange={(num) => setForm({ ...form, base_aj: num })} className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm" /></div>
            <div><label className="block text-xs font-bold uppercase mb-1 dark:text-slate-300">Logt/Trsp</label><MonetaryInput value={form.logement_transport} onChange={(num) => setForm({ ...form, logement_transport: num })} className="w-full rounded-lg border bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm" /></div>
            <div><label className="block text-xs font-bold uppercase mb-1 dark:text-slate-300">Prime Rendement</label><MonetaryInput value={form.rendement} onChange={(num) => setForm({ ...form, rendement: num })} className="w-full rounded-lg border bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm" /></div>
            <div><label className="block text-xs font-bold uppercase mb-1 dark:text-slate-300">RESP REPRES</label><MonetaryInput value={form.responsabilite_representation} onChange={(num) => setForm({ ...form, responsabilite_representation: num })} className="w-full rounded-lg border bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm" /></div>
          </div>
          <div><label className="block text-xs font-bold uppercase mb-1 dark:text-slate-300">RIB</label><input type="text" value={form.rib} onChange={(e) => setForm({ ...form, rib: e.target.value })} className="w-full rounded-lg border bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm font-mono" /></div>
          <div className="p-3 sm:p-4 rounded-xl bg-pink-50 dark:bg-pink-900/20 border-2 border-pink-200 dark:border-pink-800">
            <label className="flex items-start gap-3 cursor-pointer"><input type="checkbox" checked={form.conge_maternite} onChange={(e) => setForm({ ...form, conge_maternite: e.target.checked })} className="mt-0.5 rounded text-pink-600 w-4 h-4" /><div className="text-xs"><span className="font-extrabold text-pink-900 dark:text-pink-300 block">Congé de Maternité (÷2 Base Brute)</span><span className="text-slate-600 dark:text-slate-400 block">Base brute: <b className="text-pink-800 dark:text-pink-300 font-mono">{fmt(baseBrutAffichee)}</b> au lieu de {fmt(baseBruteNormale)}</span></div></label>
          </div>
          <div className="p-3 sm:p-4 rounded-xl bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 text-xs space-y-1 dark:text-slate-300"><div className="font-bold text-salfa-teal dark:text-sky-300 flex items-center gap-1.5"><Award className="w-4 h-4" /><span>Ancienneté:</span></div><div>Ancienneté: <b>{ancYears} ans</b> | Indice: <b>x{indice.toFixed(2)}</b></div><div>Base revalorisée: <b className="text-sm">{fmt(baseReval)}</b></div></div>
          <div className="flex justify-end gap-3 pt-3 border-t dark:border-slate-700"><button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:text-slate-200 text-sm font-semibold">Annuler</button><button type="submit" disabled={saving} className="px-6 py-2 rounded-lg bg-salfa-dark dark:bg-slate-600 hover:bg-salfa-teal text-white text-sm font-bold shadow">{saving ? "..." : "Enregistrer"}</button></div>
        </form>
      </div>
    </div>
  );
};

interface HistoryModalProps { employe: Employe; paies: PaieMensuelle[]; onClose: () => void; }
const EmployeHistoryModal: React.FC<HistoryModalProps> = ({ employe, paies, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden border dark:border-slate-700 modal-mobile max-h-[95dvh] flex flex-col">
        <div className="bg-salfa-dark dark:bg-slate-900 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between text-white shrink-0"><div className="min-w-0"><h3 className="text-sm sm:text-lg font-bold truncate">Historique — Mat {employe.numero_matricule} : {employe.nom_prenoms}</h3><p className="text-xs text-slate-300 truncate">{employe.jobs} | {employe.categorie}</p></div><button onClick={onClose} className="p-1 rounded hover:bg-white/10 shrink-0 ml-2"><X className="w-5 h-5" /></button></div>
        <div className="p-3 sm:p-6 overflow-y-auto thin-scrollbar">
          {paies.length === 0 ? <div className="text-center py-8 text-slate-500 text-sm">Aucun bulletin.</div> : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:hidden">
                {paies.map((p) => (<div key={p.id} className="border dark:border-slate-700 rounded-xl p-3 bg-slate-50 dark:bg-slate-700/50"><div className="flex justify-between items-center"><span className="font-bold text-salfa-dark dark:text-white text-sm">{p.mois} {p.annee}</span><span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${p.verrouille === 1 ? 'bg-slate-200 dark:bg-slate-600' : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300'}`}>{p.verrouille === 1 ? 'Clôturé' : 'Modifiable'}</span></div><div className="grid grid-cols-2 gap-2 mt-2 text-xs dark:text-slate-300"><div>Brut: <span className="font-mono font-bold">{fmt(p.salaire_brut)}</span></div><div>NET: <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">{fmt(p.net)}</span></div><div>Avance: <span className="font-mono text-red-600">{fmt(p.avance)}</span></div><div>MED: <span className="font-mono text-red-600">{fmt(p.med)}</span></div></div></div>))}
              </div>
              <div className="hidden lg:block overflow-x-auto thin-scrollbar">
                <table className="w-full text-left border-collapse min-w-[900px]"><thead><tr className="bg-slate-50 dark:bg-slate-700 border-b dark:border-slate-600 text-xs font-bold uppercase text-slate-600 dark:text-slate-300"><th className="py-2 px-3">Période</th><th className="py-2 px-3 text-right">BASE AJ</th><th className="py-2 px-3 text-right">Brut</th><th className="py-2 px-3 text-right">CNaPS</th><th className="py-2 px-3 text-right">IRSA</th><th className="py-2 px-3 text-right">AVANCE</th><th className="py-2 px-3 text-right">MED</th><th className="py-2 px-4 text-right">NET</th><th className="py-2 px-3 text-center">Statut</th></tr></thead><tbody className="divide-y dark:divide-slate-700 text-sm dark:text-slate-200">{paies.map((p) => (<tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50"><td className="py-2 px-3 font-bold">{p.mois} {p.annee}</td><td className="py-2 px-3 text-right font-mono">{fmt(p.base_aj)}</td><td className="py-2 px-3 text-right font-mono font-semibold">{fmt(p.salaire_brut)}</td><td className="py-2 px-3 text-right font-mono text-xs">{fmt(p.cnaps)}</td><td className="py-2 px-3 text-right font-mono text-xs">{fmt(p.irsa)}</td><td className="py-2 px-3 text-right font-mono text-red-600">{fmt(p.avance)}</td><td className="py-2 px-3 text-right font-mono text-red-600">{fmt(p.med)}</td><td className="py-2 px-4 text-right font-mono font-bold text-emerald-700 dark:text-emerald-400">{fmt(p.net)}</td><td className="py-2 px-3 text-center text-xs">{p.verrouille === 1 ? <span className="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-600 font-semibold">Clôturé</span> : <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300 font-semibold">Modifiable</span>}</td></tr>))}</tbody></table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
