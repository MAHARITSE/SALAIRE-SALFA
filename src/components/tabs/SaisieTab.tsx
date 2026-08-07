// ==============================================================================
// COMPOSANT REACT : ONGLET 2 - SAISIE MENSUELLE (AVANCE & MED) - SALFA
// ==============================================================================
import React, { useState, useEffect } from 'react';
import { PaieMensuelle, TotauxMois } from '../../types';
import {
  fetchPaiesMois, initMoisPaie, savePaieSaisie, cloturerMois, deverrouillerMois
} from '../../api';
import { MonetaryInput, formatSpace } from '../MonetaryInput';
import {
  Calendar, Lock, Unlock, RefreshCw, Save, AlertTriangle, ShieldCheck, CheckCircle
} from 'lucide-react';

function formatAr(val: number | undefined): string {
  if (val === undefined || val === null) return '0,00 Ar';
  return formatSpace(val) + ',00 Ar';
}

interface SaisieTabProps {
  userRole: string;
}

export const SaisieTab: React.FC<SaisieTabProps> = ({ userRole }) => {
  const [mois, setMois] = useState('JANVIER');
  const [annee, setAnnee] = useState(2026);
  const [paies, setPaies] = useState<PaieMensuelle[]>([]);
  const [verrouille, setVerrouille] = useState(false);
  const [totaux, setTotaux] = useState<TotauxMois>({});
  const [loading, setLoading] = useState(true);

  // Saisie en direct sur le salarié sélectionné
  const [selectedPaie, setSelectedPaie] = useState<PaieMensuelle | null>(null);
  const [avanceInput, setAvanceInput] = useState<number>(0);
  const [medInput, setMedInput] = useState<number>(0);
  const [saving, setSaving] = useState(false);

  // Modal accessoires optionnel
  const [showAccessoiresModal, setShowAccessoiresModal] = useState(false);

  const moisListe = [
    "JANVIER", "FEVRIER", "MARS", "AVRIL", "MAI", "JUIN",
    "JUILLET", "AOUT", "SEPTEMBRE", "OCTOBRE", "NOVEMBRE", "DECEMBRE"
  ];

  const loadData = async () => {
    setLoading(true);
    const d = await fetchPaiesMois(annee, mois);
    setPaies(d.employes || []);
    setVerrouille(d.verrouille || false);
    setTotaux(d.totaux || {});
    setLoading(false);
    
    // Mettre à jour la sélection si existante
    if (selectedPaie) {
      const up = (d.employes || []).find((p) => p.id === selectedPaie.id);
      if (up) {
        setSelectedPaie(up);
        setAvanceInput(Number(up.avance || 0));
        setMedInput(Number(up.med || 0));
      } else {
        setSelectedPaie(null);
      }
    }
  };

  useEffect(() => {
    loadData();
  }, [mois, annee]);

  const handleSelectRow = (p: PaieMensuelle) => {
    setSelectedPaie(p);
    setAvanceInput(Number(p.avance || 0));
    setMedInput(Number(p.med || 0));
  };

  const handleInitMois = async () => {
    if (!window.confirm(`Ouvrir et initialiser la période ${mois} ${annee} ?\n\nTous les salariés actifs seront automatiquement reconduits avec leurs champs fixes et ancienneté revalorisée. AVANCE et MED seront remis à 0,00 Ar.`)) {
      return;
    }
    const res = await initMoisPaie(annee, mois);
    if (res.success) {
      alert(`${res.initializedCount} bulletin(s) initialisé(s) pour ${mois} ${annee}.`);
      loadData();
    }
  };

  const handleSaveSaisie = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedPaie) return;
    if (verrouille) {
      alert("Ce mois est clôturé et verrouillé.");
      return;
    }
    setSaving(true);
    const av = Number(avanceInput || 0);
    const md = Number(medInput || 0);
    const res = await savePaieSaisie(selectedPaie.id, av, md);
    setSaving(false);
    if (res.success) {
      loadData();
    } else {
      alert("Erreur lors de la sauvegarde.");
    }
  };

  const handleCloturer = async () => {
    if (!window.confirm(`Confirmer la clôture et validation définitive de la paie pour ${mois} ${annee} ?\n\nPlus aucune modification d'avance ou de médicament ne sera possible sans déverrouillage.`)) {
      return;
    }
    await cloturerMois(annee, mois);
    loadData();
  };

  const handleDeverrouiller = async () => {
    if (userRole !== 'Administrateur') {
      alert("Action réservée au compte Administrateur.");
      return;
    }
    if (!window.confirm(`Déverrouiller le mois ${mois} ${annee} pour autoriser des modifications ?`)) {
      return;
    }
    await deverrouillerMois(annee, mois, userRole);
    loadData();
  };

  return (
    <div className="space-y-6">
      
      {/* Barre d'outils supérieure */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-salfa-teal" />
            <span className="text-xs font-bold uppercase text-slate-700">Période :</span>
            <select
              value={mois}
              onChange={(e) => setMois(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-bold text-salfa-dark focus:ring-2 focus:ring-salfa-teal"
            >
              {moisListe.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <select
              value={annee}
              onChange={(e) => setAnnee(Number(e.target.value))}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-bold text-salfa-dark focus:ring-2 focus:ring-salfa-teal"
            >
              <option value={2025}>2025</option>
              <option value={2026}>2026</option>
              <option value={2027}>2027</option>
            </select>
          </div>

          <button
            onClick={handleInitMois}
            disabled={verrouille}
            className="bg-sky-100 hover:bg-sky-200 text-salfa-teal disabled:opacity-50 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Ouvrir / Initialiser</span>
          </button>

          {/* Badge statut mois */}
          {verrouille ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200">
              <Lock className="w-3.5 h-3.5" />
              CLÔTURÉ / VALIDÉ (Verrouillé)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
              <Unlock className="w-3.5 h-3.5" />
              MODIFIABLE (Mois Ouvert)
            </span>
          )}
        </div>

        {/* Boutons validation */}
        <div className="flex items-center gap-3">
          {!verrouille ? (
            <button
              onClick={handleCloturer}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow transition"
            >
              <CheckCircle className="w-4 h-4" />
              <span>Clôturer / Valider le mois</span>
            </button>
          ) : (
            userRole === 'Administrateur' && (
              <button
                onClick={handleDeverrouiller}
                className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow transition"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Déverrouiller (Admin)</span>
              </button>
            )
          )}
        </div>

      </div>

      {/* Tableau des bulletins */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto max-h-[50vh]">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase">
                <th className="py-3 px-3 text-center">N° Mat</th>
                <th className="py-3 px-4">NOM ET PRENOMS</th>
                <th className="py-3 px-2 text-center">CAT</th>
                <th className="py-3 px-3">JOBS</th>
                <th className="py-3 px-3 text-right">Salaire Brut</th>
                <th className="py-3 px-3 text-right">CNaPS</th>
                <th className="py-3 px-3 text-right">IRSA</th>
                <th className="py-3 px-3 text-right">Net base</th>
                <th className="py-3 px-3 text-right">Accessoir</th>
                <th className="py-3 px-3 text-right">BRUT</th>
                <th className="py-3 px-3 text-right text-red-600">AVANCE (Saisi)</th>
                <th className="py-3 px-3 text-right text-red-600">MED (Saisi)</th>
                <th className="py-3 px-4 text-right bg-salfa-light/60 font-bold text-salfa-dark">NET À PAYER</th>
                <th className="py-3 px-3 text-right">Virement</th>
                <th className="py-3 px-3 text-right">Espèces</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={15} className="py-8 text-center text-slate-500">
                    Chargement des bulletins mensuels...
                  </td>
                </tr>
              ) : paies.length === 0 ? (
                <tr>
                  <td colSpan={15} className="py-8 text-center text-slate-500">
                    Aucun bulletin de paie pour {mois} {annee}. Cliquez sur <strong>Ouvrir / Initialiser le mois</strong>.
                  </td>
                </tr>
              ) : (
                paies.map((p) => {
                  const isSelected = selectedPaie?.id === p.id;
                  return (
                    <tr
                      key={p.id}
                      onClick={() => handleSelectRow(p)}
                      className={`cursor-pointer transition ${
                        isSelected
                          ? 'bg-sky-100/80 font-semibold'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-2.5 px-3 text-center font-bold text-salfa-dark">
                        {p.numero_matricule}
                      </td>
                      <td className="py-2.5 px-4 font-medium text-slate-800">
                        {p.nom_prenoms}
                      </td>
                      <td className="py-2.5 px-2 text-center text-xs font-bold text-salfa-teal">
                        {p.categorie || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-xs text-slate-600">
                        {p.jobs || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                        {formatAr(p.salaire_brut)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs text-slate-600">
                        {formatAr(p.cnaps)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs text-slate-600">
                        {formatAr(p.irsa)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                        {formatAr(p.salaire_net)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                        {formatAr(p.accessoir)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-salfa-dark">
                        {formatAr(p.brut)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-red-600 bg-red-50/40">
                        {formatAr(p.avance)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-red-600 bg-red-50/40">
                        {formatAr(p.med)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-emerald-700 bg-salfa-light/60">
                        {formatAr(p.net)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs text-slate-600">
                        {formatAr(p.virement || 0)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs text-slate-600">
                        {formatAr(p.especes || 0)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Panneau de saisie rapide (bas) */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4 border-b border-slate-200 pb-3">
          <div>
            <h3 className="text-sm font-bold text-salfa-dark uppercase tracking-wide">
              Saisie Rapide AVANCE & MED — Recalcul en temps réel
            </h3>
            <p className="text-xs text-slate-500">
              {selectedPaie
                ? `Salarié sélectionné : Mat ${selectedPaie.numero_matricule} — ${selectedPaie.nom_prenoms} (${selectedPaie.jobs})`
                : "Cliquez sur une ligne du tableau pour modifier ses avances et frais médicaux."}
            </p>
          </div>
          {selectedPaie && !verrouille && (
            <button
              onClick={() => setShowAccessoiresModal(true)}
              className="text-xs font-semibold text-salfa-teal hover:underline"
            >
              + Modifier les accessoires (optionnel)
            </button>
          )}
        </div>

        <form onSubmit={handleSaveSaisie} className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              AVANCE sur salaire / Prêt personnel (Ar)
            </label>
            <MonetaryInput
              disabled={!selectedPaie || verrouille}
              value={avanceInput}
              onChange={(num) => setAvanceInput(num)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono font-bold focus:ring-2 focus:ring-salfa-teal disabled:bg-slate-100"
            />
          </div>

          <div className="flex-1">
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              MED / Médicaments & Pharmacie (Ar)
            </label>
            <MonetaryInput
              disabled={!selectedPaie || verrouille}
              value={medInput}
              onChange={(num) => setMedInput(num)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono font-bold focus:ring-2 focus:ring-salfa-teal disabled:bg-slate-100"
            />
          </div>

          <div className="sm:pt-5">
            <button
              type="submit"
              disabled={!selectedPaie || verrouille || saving}
              className="w-full sm:w-auto bg-salfa-dark hover:bg-salfa-teal disabled:opacity-50 text-white font-bold px-6 py-2 rounded-lg text-sm shadow transition flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? "Calcul..." : "Enregistrer et Recalculer"}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Footer récapitulatif */}
      <div className="bg-salfa-dark text-white p-4 rounded-xl shadow-md flex flex-wrap items-center justify-between gap-4 text-xs font-semibold">
        <div>
          Totaux {mois} {annee} : <span className="text-sky-300 font-bold">{totaux.count_employes || 0} salariés</span>
        </div>
        <div className="flex flex-wrap gap-4 font-mono">
          <div>
            BRUT : <span className="text-white font-bold">{formatAr(totaux.total_brut)}</span>
          </div>
          <div>
            AVANCE : <span className="text-red-300 font-bold">{formatAr(totaux.total_avance)}</span>
          </div>
          <div>
            MED : <span className="text-red-300 font-bold">{formatAr(totaux.total_med)}</span>
          </div>
          <div className="bg-salfa-teal px-3 py-1 rounded text-white">
            NET À PAYER : <span className="font-bold">{formatAr(totaux.total_net)}</span>
          </div>
        </div>
      </div>

      {/* Modal Accessoires optionnel */}
      {showAccessoiresModal && selectedPaie && (
        <AccessoiresModalForm
          paie={selectedPaie}
          onClose={() => setShowAccessoiresModal(false)}
          onSaved={() => {
            setShowAccessoiresModal(false);
            loadData();
          }}
        />
      )}

    </div>
  );
};

// ------------------------------------------------------------------------------
// SOUS-COMPOSANT : MODAL ACCESSOIRES (OPTIONNEL)
// ------------------------------------------------------------------------------
interface AccModalProps {
  paie: PaieMensuelle;
  onClose: () => void;
  onSaved: () => void;
}

const AccessoiresModalForm: React.FC<AccModalProps> = ({ paie, onClose, onSaved }) => {
  const [form, setForm] = useState({
    augmentation_divers: paie.augmentation_divers || 0,
    prime_de_garde: paie.prime_de_garde || 0,
    anciennete2: paie.anciennete2 || 0,
    risque: paie.risque || 0,
    repr_rec: paie.repr_rec || 0
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await savePaieSaisie(paie.id, paie.avance, paie.med, form);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
        <div className="bg-salfa-dark px-6 py-4 text-white">
          <h3 className="text-lg font-bold">Modifier les Accessoires — Mat {paie.numero_matricule}</h3>
          <p className="text-xs text-slate-300">{paie.nom_prenoms}</p>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">AUGMENTATION DIVERS (Ar)</label>
            <input
              type="number"
              value={form.augmentation_divers}
              onChange={(e) => setForm({ ...form, augmentation_divers: Number(e.target.value) })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Prime de garde (Ar)</label>
            <input
              type="number"
              value={form.prime_de_garde}
              onChange={(e) => setForm({ ...form, prime_de_garde: Number(e.target.value) })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Prime d'Ancienneté / Majoration (Ar)</label>
            <input
              type="number"
              value={form.anciennete2}
              onChange={(e) => setForm({ ...form, anciennete2: Number(e.target.value) })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Prime de RISQUE (Ar)</label>
            <input
              type="number"
              value={form.risque}
              onChange={(e) => setForm({ ...form, risque: Number(e.target.value) })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Repr° réc° (Ar)</label>
            <input
              type="number"
              value={form.repr_rec}
              onChange={(e) => setForm({ ...form, repr_rec: Number(e.target.value) })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold">
              Annuler
            </button>
            <button type="submit" className="px-6 py-2 rounded-lg bg-salfa-dark hover:bg-salfa-teal text-white text-sm font-bold shadow">
              Appliquer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
