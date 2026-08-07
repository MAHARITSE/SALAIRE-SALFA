// ==============================================================================
// COMPOSANT REACT : ONGLET 1 - SALARIÉS & FICHES - SALFA TANAMBAO
// ==============================================================================
import React, { useState, useEffect } from 'react';
import { Employe, PaieMensuelle } from '../../types';
import {
  fetchEmployes, fetchEmployePaies, createEmploye, updateEmploye, toggleActifEmploye
} from '../../api';
import { MonetaryInput } from '../MonetaryInput';
import {
  Search, Plus, Edit2, UserX, UserCheck, History, X,
  Building, CreditCard, Award, HeartHandshake, CheckCircle2, ShieldCheck, Info
} from 'lucide-react';

function formatAr(val: number | undefined): string {
  if (val === undefined || val === null) return '0,00 Ar';
  return val.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' Ar';
}

interface EmployesTabProps {
  userRole?: string;
  onOpenAdmin?: () => void;
}

export const EmployesTab: React.FC<EmployesTabProps> = ({ userRole, onOpenAdmin }) => {
  const [employes, setEmployes] = useState<Employe[]>([]);
  const [search, setSearch] = useState('');
  const [actifsOnly, setActifsOnly] = useState(true);
  const [loading, setLoading] = useState(true);

  // Modals
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

  useEffect(() => {
    loadData();
  }, [actifsOnly]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadData();
  };

  const openNewModal = () => {
    setEditEmploye(null);
    setShowModal(true);
  };

  const openEditModal = (emp: Employe) => {
    setEditEmploye(emp);
    setShowModal(true);
  };

  const handleToggleActif = async (emp: Employe) => {
    const actionTxt = emp.actif ? "désactiver (déclarer le départ de)" : "réactiver";
    if (!window.confirm(`Confirmer la volonté de ${actionTxt} le salarié : ${emp.nom_prenoms} ?\n\nL'historique dans les mois passés restera intégralement conservé.`)) {
      return;
    }
    await toggleActifEmploye(emp.id, emp.actif === 0);
    loadData();
  };

  const openHistory = async (emp: Employe) => {
    setHistoryEmp(emp);
    const h = await fetchEmployePaies(emp.id);
    setPaiesHistory(h);
  };

  return (
    <div className="space-y-6">
      
      {/* Barre d'astuce double-clic */}
      <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 text-xs text-salfa-dark flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-salfa-teal shrink-0" />
          <span>
            <b>Astuce :</b> Double-cliquez sur n'importe quelle ligne du tableau pour modifier la fiche du salarié. La colonne <b>BASE BRUT</b> (Salaire Brut Soumis à Cotisation) est affichée.
          </span>
        </div>
        {userRole === 'Administrateur' && onOpenAdmin && (
          <button
            onClick={onOpenAdmin}
            className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-lg font-bold text-xs shrink-0 shadow transition"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Admin : Formules & Colonnes</span>
          </button>
        )}
      </div>

      {/* Barre d'outils supérieure */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={handleSearchChange}
              placeholder="Rechercher matricule, nom, fonction, catégorie..."
              className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-salfa-teal"
            />
          </div>
          <button
            type="submit"
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-lg text-sm font-medium transition"
          >
            Filtrer
          </button>
        </form>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={actifsOnly}
              onChange={(e) => setActifsOnly(e.target.checked)}
              className="rounded text-salfa-teal focus:ring-salfa-teal"
            />
            <span>Salariés actifs seulement</span>
          </label>

          <button
            onClick={openNewModal}
            className="bg-salfa-dark hover:bg-salfa-teal text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>Nouveau Salarié</span>
          </button>
        </div>

      </div>

      {/* Tableau du personnel (avec double clic et colonne BASE BRUT) */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-3 text-center">N° Mat</th>
                <th className="py-3 px-4">NOM ET PRENOMS</th>
                <th className="py-3 px-3 text-center">CNaPS</th>
                <th className="py-3 px-2 text-center">CAT</th>
                <th className="py-3 px-4">JOBS (Fonction)</th>
                <th className="py-3 px-3 text-center">Date emb</th>
                <th className="py-3 px-2 text-center">Anc.</th>
                <th className="py-3 px-2 text-center">Enf.</th>
                <th className="py-3 px-3 text-right">BASE AJ</th>
                <th className="py-3 px-3 text-right">Logt/Trsp</th>
                <th className="py-3 px-3 text-right bg-salfa-light/50 text-salfa-dark font-extrabold">BASE BRUT</th>
                <th className="py-3 px-4">Mode / RIB</th>
                <th className="py-3 px-3 text-center">Statut</th>
                <th className="py-3 px-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={14} className="py-8 text-center text-slate-500">
                    Chargement des salariés...
                  </td>
                </tr>
              ) : employes.length === 0 ? (
                <tr>
                  <td colSpan={14} className="py-8 text-center text-slate-500">
                    Aucun salarié ne correspond aux critères de recherche.
                  </td>
                </tr>
              ) : (
                employes.map((emp) => {
                  const isMaternite = emp.conge_maternite === 1 || emp.conge_maternite === true;
                  const baseBrutNormale = Number(emp.base_aj || 0) + Number(emp.logement_transport || 0) + Number(emp.rendement || 0) + Number(emp.responsabilite_representation || 0);
                  const baseBrutAffichee = isMaternite ? baseBrutNormale / 2.0 : baseBrutNormale;

                  return (
                    <tr
                      key={emp.id}
                      onDoubleClick={() => openEditModal(emp)}
                      className="hover:bg-sky-50/70 cursor-pointer transition"
                      title="Double-cliquez pour modifier cette fiche"
                    >
                      <td className="py-3 px-3 text-center font-bold text-salfa-dark">
                        {emp.numero_matricule}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-800">
                        <div className="flex items-center gap-2">
                          <span>{emp.nom_prenoms}</span>
                          {isMaternite && (
                            <span className="px-2 py-0.5 rounded-full bg-pink-100 text-pink-800 text-[10px] font-extrabold uppercase">
                              Maternité 50%
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center text-xs text-slate-600 font-mono">
                        {emp.numero_cnaps || '—'}
                      </td>
                      <td className="py-3 px-2 text-center font-bold text-salfa-teal">
                        {emp.categorie || '—'}
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        {emp.jobs || '—'}
                      </td>
                      <td className="py-3 px-3 text-center text-xs text-slate-600">
                        {emp.date_embauche || '—'}
                      </td>
                      <td className="py-3 px-2 text-center font-semibold">
                        {emp.nombre_annees} ans
                      </td>
                      <td className="py-3 px-2 text-center">
                        {emp.enfant_a_charge}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-medium text-slate-800">
                        {formatAr(emp.base_aj)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-600">
                        {formatAr(emp.logement_transport)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-extrabold text-salfa-dark bg-salfa-light/40">
                        {formatAr(baseBrutAffichee)}
                      </td>
                      <td className="py-3 px-4 text-xs">
                        <div className="font-semibold">{emp.mode_paiement}</div>
                        <div className="font-mono text-slate-500 text-[11px] truncate max-w-[120px]" title={emp.rib}>
                          {emp.rib || 'Aucun'}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        {emp.actif === 1 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                            <CheckCircle2 className="w-3 h-3" />
                            Actif
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-200 text-slate-600">
                            Départ
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); openEditModal(emp); }}
                            className="p-1.5 rounded hover:bg-slate-200 text-slate-600 transition"
                            title="Modifier la fiche salarié"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); openHistory(emp); }}
                            className="p-1.5 rounded hover:bg-sky-100 text-salfa-teal transition"
                            title="Consulter l'historique de paie"
                          >
                            <History className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleToggleActif(emp); }}
                            className={`p-1.5 rounded transition ${
                              emp.actif ? 'hover:bg-red-100 text-red-600' : 'hover:bg-emerald-100 text-emerald-600'
                            }`}
                            title={emp.actif ? "Désactiver / Déclarer le départ" : "Réactiver le salarié"}
                          >
                            {emp.actif ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Formulaire Salarié */}
      {showModal && (
        <EmployeModalForm
          employe={editEmploye}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            loadData();
          }}
        />
      )}

      {/* Modal Historique Paie Salarié */}
      {historyEmp && (
        <EmployeHistoryModal
          employe={historyEmp}
          paies={paiesHistory}
          onClose={() => setHistoryEmp(null)}
        />
      )}

    </div>
  );
};

// ------------------------------------------------------------------------------
// SOUS-COMPOSANT : MODAL FORMULAIRE SALARIÉ (AVEC CONGÉ DE MATERNITÉ)
// ------------------------------------------------------------------------------
interface ModalFormProps {
  employe: Employe | null;
  onClose: () => void;
  onSaved: () => void;
}

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

  const calculateAncYear = (d: string) => {
    if (!d) return 0;
    try {
      const y = parseInt(d.split('-')[0] || d.split('/')[2] || '0', 10);
      if (y > 1900 && y <= 2026) return max(0, 2026 - y);
    } catch {
      //
    }
    return 0;
  };
  function max(a: number, b: number) { return a > b ? a : b; }

  const ancYears = calculateAncYear(form.date_embauche);
  const getIndice = (y: number) => {
    if (y < 2) return 1.00;
    if (y < 4) return 1.09;
    if (y < 6) return 1.18;
    if (y < 8) return 1.27;
    if (y < 10) return 1.36;
    if (y < 12) return 1.45;
    if (y < 14) return 1.53;
    if (y < 16) return 1.60;
    if (y < 18) return 1.65;
    if (y < 20) return 1.68;
    return 1.70;
  };
  const indice = getIndice(ancYears);
  const baseReval = Math.round(Number(form.base_aj || 0) * indice * 100) / 100;

  const baseBruteNormale = Number(form.base_aj || 0) + Number(form.logement_transport || 0) + Number(form.rendement || 0) + Number(form.responsabilite_representation || 0);
  const baseBrutAffichee = form.conge_maternite ? baseBruteNormale / 2.0 : baseBruteNormale;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const dataToSend = {
      ...form,
      numero_matricule: Number(form.numero_matricule),
      base_aj: Number(form.base_aj),
      logement_transport: Number(form.logement_transport),
      rendement: Number(form.rendement),
      responsabilite_representation: Number(form.responsabilite_representation),
      enfant_a_charge: Number(form.enfant_a_charge),
      conge_maternite: form.conge_maternite ? 1 : 0
    };
    let ok = false;
    if (employe) {
      ok = await updateEmploye(employe.id, dataToSend);
    } else {
      ok = await createEmploye(dataToSend);
    }
    setSaving(false);
    if (ok) {
      onSaved();
    } else {
      alert("Erreur lors de l'enregistrement de la fiche salarié.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200">
        
        <div className="bg-salfa-dark px-6 py-4 flex items-center justify-between text-white">
          <h3 className="text-lg font-bold">
            {employe ? `Modifier la fiche Mat ${employe.numero_matricule}` : "Nouveau Salarié — SALFA TANAMBAO"}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">N° Matricule *</label>
              <input
                type="number"
                value={form.numero_matricule}
                onChange={(e) => setForm({ ...form, numero_matricule: e.target.value })}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-salfa-teal"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">NOM ET PRENOMS *</label>
              <input
                type="text"
                value={form.nom_prenoms}
                onChange={(e) => setForm({ ...form, nom_prenoms: e.target.value })}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-salfa-teal"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">N° CNaPS</label>
              <input
                type="text"
                value={form.numero_cnaps}
                onChange={(e) => setForm({ ...form, numero_cnaps: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-salfa-teal"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Catégorie (CAT)</label>
              <input
                type="text"
                value={form.categorie}
                onChange={(e) => setForm({ ...form, categorie: e.target.value })}
                placeholder="ex: 4B, HC, 3A..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-salfa-teal"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Fonction (JOBS)</label>
              <input
                type="text"
                value={form.jobs}
                onChange={(e) => setForm({ ...form, jobs: e.target.value })}
                placeholder="ex: Médecin, Tech Laborantin..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-salfa-teal"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Date d'embauche (YYYY-MM-DD)</label>
              <input
                type="text"
                value={form.date_embauche}
                onChange={(e) => setForm({ ...form, date_embauche: e.target.value })}
                placeholder="2025-01-20"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-salfa-teal"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Enfants à charge</label>
              <input
                type="number"
                value={form.enfant_a_charge}
                onChange={(e) => setForm({ ...form, enfant_a_charge: Number(e.target.value) })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-salfa-teal"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Mode de règlement</label>
              <select
                value={form.mode_paiement}
                onChange={(e) => setForm({ ...form, mode_paiement: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-salfa-teal"
              >
                <option value="ESPECES">ESPECES</option>
                <option value="VIREMENT">VIREMENT</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">BASE AJ (Ar)</label>
              <MonetaryInput
                value={form.base_aj}
                onChange={(num) => setForm({ ...form, base_aj: num })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-salfa-teal"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Indemnité Logt/Trsp (Ar)</label>
              <MonetaryInput
                value={form.logement_transport}
                onChange={(num) => setForm({ ...form, logement_transport: num })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-salfa-teal"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Prime Rendement (Ar)</label>
              <MonetaryInput
                value={form.rendement}
                onChange={(num) => setForm({ ...form, rendement: num })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-salfa-teal"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">RESP REPRES (Ar)</label>
              <MonetaryInput
                value={form.responsabilite_representation}
                onChange={(num) => setForm({ ...form, responsabilite_representation: num })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-salfa-teal"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">RIB Bancaire (si Virement)</label>
            <input
              type="text"
              value={form.rib}
              onChange={(e) => setForm({ ...form, rib: e.target.value })}
              placeholder="00009 06000 23305970005 85"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-salfa-teal"
            />
          </div>

          {/* Règle Congé de Maternité */}
          <div className="p-4 rounded-xl bg-pink-50 border-2 border-pink-200">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.conge_maternite}
                onChange={(e) => setForm({ ...form, conge_maternite: e.target.checked })}
                className="mt-0.5 rounded text-pink-600 focus:ring-pink-500 w-4 h-4"
              />
              <div>
                <span className="text-sm font-extrabold text-pink-900 block">
                  Congé de Maternité en cours (Division de la Base Brute par 2 - 50 %)
                </span>
                <span className="text-xs text-slate-600 block mt-0.5">
                  La base brute soumise à cotisation sera automatiquement divisée par 2 :{' '}
                  <span className="font-mono font-extrabold text-pink-800">{formatAr(baseBrutAffichee)}</span> (au lieu de {formatAr(baseBruteNormale)}).
                </span>
              </div>
            </label>
          </div>

          {/* Encadré d'information ancienneté en direct */}
          <div className="p-4 rounded-xl bg-sky-50 border border-sky-200 text-xs text-salfa-dark space-y-1">
            <div className="font-bold text-salfa-teal flex items-center gap-1.5">
              <Award className="w-4 h-4" />
              <span>Calcul d'ancienneté SALFA TANAMBAO (en direct) :</span>
            </div>
            <div>
              Ancienneté 2026 : <span className="font-semibold">{ancYears} an(s)</span> | Indice barème : <span className="font-semibold">x{indice.toFixed(2)}</span>
            </div>
            <div>
              Base revalorisée estimée : <span className="font-bold text-sm text-salfa-dark">{formatAr(baseReval)}</span>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 rounded-lg bg-salfa-dark hover:bg-salfa-teal text-white text-sm font-bold shadow transition"
            >
              {saving ? "Enregistrement..." : "Enregistrer la fiche"}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------------------
// SOUS-COMPOSANT : MODAL HISTORIQUE DE PAIE INDIVIDUEL
// ------------------------------------------------------------------------------
interface HistoryModalProps {
  employe: Employe;
  paies: PaieMensuelle[];
  onClose: () => void;
}

const EmployeHistoryModal: React.FC<HistoryModalProps> = ({ employe, paies, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full overflow-hidden border border-slate-200">
        
        <div className="bg-salfa-dark px-6 py-4 flex items-center justify-between text-white">
          <div>
            <h3 className="text-lg font-bold">
              Historique de Paie — Mat {employe.numero_matricule} : {employe.nom_prenoms}
            </h3>
            <p className="text-xs text-slate-300">
              Fonction : {employe.jobs} | Catégorie : {employe.categorie}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 max-h-[75vh] overflow-y-auto">
          {paies.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              Aucun bulletin de paie enregistré pour ce salarié en 2026.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase">
                    <th className="py-3 px-3">Période</th>
                    <th className="py-3 px-3 text-right">BASE AJ</th>
                    <th className="py-3 px-3 text-right">Salaire Brut</th>
                    <th className="py-3 px-3 text-right">CNaPS</th>
                    <th className="py-3 px-3 text-right">IRSA</th>
                    <th className="py-3 px-3 text-right">Accessoires</th>
                    <th className="py-3 px-3 text-right">AVANCE</th>
                    <th className="py-3 px-3 text-right">MED</th>
                    <th className="py-3 px-4 text-right">NET À PAYER</th>
                    <th className="py-3 px-3 text-center">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {paies.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="py-3 px-3 font-bold text-salfa-dark">
                        {p.mois} {p.annee}
                      </td>
                      <td className="py-3 px-3 text-right font-mono">{formatAr(p.base_aj)}</td>
                      <td className="py-3 px-3 text-right font-mono font-semibold">{formatAr(p.salaire_brut)}</td>
                      <td className="py-3 px-3 text-right font-mono text-xs">{formatAr(p.cnaps)}</td>
                      <td className="py-3 px-3 text-right font-mono text-xs">{formatAr(p.irsa)}</td>
                      <td className="py-3 px-3 text-right font-mono">{formatAr(p.accessoir)}</td>
                      <td className="py-3 px-3 text-right font-mono text-red-600">{formatAr(p.avance)}</td>
                      <td className="py-3 px-3 text-right font-mono text-red-600">{formatAr(p.med)}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">{formatAr(p.net)}</td>
                      <td className="py-3 px-3 text-center text-xs">
                        {p.verrouille === 1 ? (
                          <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 font-semibold">Clôturé</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">Modifiable</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
