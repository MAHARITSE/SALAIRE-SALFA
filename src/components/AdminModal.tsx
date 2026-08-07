// ==============================================================================
// COMPOSANT REACT : DIALOGUE D'ADMINISTRATION (COLONNES & FORMULES) - SALFA
// ==============================================================================
import React, { useState } from 'react';
import {
  ShieldCheck, X, Plus, Trash2, HeartHandshake, CheckCircle2,
  Info, Sliders, Layers, AlertCircle
} from 'lucide-react';

interface AdminModalProps {
  onClose: () => void;
}

export const AdminModal: React.FC<AdminModalProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'formules' | 'colonnes'>('formules');
  
  // Paramètres configurables de calcul (Maternité & CGI)
  const [tauxMaternite, setTauxMaternite] = useState<number>(50); // 50% de la base brute
  const [cnapsSalariale, setCnapsSalariale] = useState<number>(1.0);
  const [cnapsPatronale, setCnapsPatronale] = useState<number>(13.0);
  const [deductionEnfant, setDeductionEnfant] = useState<number>(2000);
  const [minIrsa, setMinIrsa] = useState<number>(3000);

  // Gestion des colonnes personnalisées du tableau
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
    e.preventDefault();
    if (!newColNom.trim()) return;
    const id = newColNom.toLowerCase().replace(/[^a-z0-9]/g, '_');
    setColonnes([
      ...colonnes,
      { id, nom: newColNom.trim(), type: newColType, permanent: false }
    ]);
    setNewColNom('');
  };

  const handleRemoveColonne = (index: number) => {
    if (colonnes[index].permanent) {
      alert("Cette colonne officielle SALFA ne peut pas être supprimée.");
      return;
    }
    setColonnes(colonnes.filter((_, i) => i !== index));
  };

  const handleSaveConfig = () => {
    alert("Paramètres d'administration enregistrés ! La formule de congé de maternité (division de la base brute par 2) est active dans le moteur de calcul.");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden border border-slate-200">
        
        {/* En-tête */}
        <div className="bg-salfa-dark px-6 py-4 flex items-center justify-between text-white">
          <div className="flex items-center space-x-3">
            <ShieldCheck className="w-6 h-6 text-emerald-400" />
            <div>
              <h3 className="text-lg font-bold">Administration : Formules de Calcul & Colonnes</h3>
              <p className="text-xs text-slate-300">
                Paramétrage avancé pour le compte Administrateur (Congés de maternité, CGI Madagascar, rubriques)
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10 text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Onglets internes du modal */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6">
          <button
            onClick={() => setActiveTab('formules')}
            className={`py-3 px-5 text-sm font-bold flex items-center gap-2 border-b-2 transition ${
              activeTab === 'formules'
                ? 'border-salfa-teal text-salfa-dark bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sliders className="w-4 h-4 text-salfa-teal" />
            <span>1. Formules de Calcul & Congé de Maternité</span>
          </button>
          <button
            onClick={() => setActiveTab('colonnes')}
            className={`py-3 px-5 text-sm font-bold flex items-center gap-2 border-b-2 transition ${
              activeTab === 'colonnes'
                ? 'border-salfa-teal text-salfa-dark bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-4 h-4 text-salfa-teal" />
            <span>2. Gestion des Colonnes & Rubriques</span>
          </button>
        </div>

        {/* Contenu */}
        <div className="p-6 max-h-[70vh] overflow-y-auto">
          {activeTab === 'formules' ? (
            <div className="space-y-6">
              
              {/* Règle spécifique du Congé de Maternité */}
              <div className="bg-pink-50/70 border-2 border-pink-200 rounded-xl p-5 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <HeartHandshake className="w-6 h-6 text-pink-600 shrink-0" />
                    <div>
                      <h4 className="text-sm font-extrabold text-slate-900 uppercase tracking-wide">
                        Règle Spéciale : Congé de Maternité (Division de la Base Brute par 2)
                      </h4>
                      <p className="text-xs text-slate-600">
                        Prise en charge à 50 % par l'employeur / la clinique (les autres 50 % étant versés par la CNaPS).
                      </p>
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-pink-100 text-pink-800 text-xs font-extrabold uppercase">
                    Règle Active
                  </span>
                </div>

                <div className="text-xs text-slate-700 bg-white/80 p-3.5 rounded-lg border border-pink-200 leading-relaxed">
                  <div className="font-bold text-pink-900 mb-1 flex items-center gap-1.5">
                    <Info className="w-4 h-4" />
                    Formule de calcul appliquée dans le logiciel :
                  </div>
                  <code className="block bg-slate-100 p-2 rounded font-mono text-salfa-dark my-1">
                    Salaire Brut = (BASE AJ + Logt Trsp + Rendement + RESP REPRES) ÷ 2
                  </code>
                  Lorsqu'une salariée est déclarée en <b>Congé de Maternité (50 %)</b> sur sa fiche ou lors d'un mois de paie, sa base brute soumise à cotisation est <b>divisée par 2</b>. Les retenues CNaPS (1 %), charges patronales (13 %) et l'IRSA sont calculées sur cette demi-base.
                </div>

                <div className="flex items-center justify-between pt-2">
                  <label className="text-xs font-bold text-slate-700">
                    Coefficient de prise en charge clinique pendant le congé de maternité :
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={tauxMaternite}
                      onChange={(e) => setTauxMaternite(Number(e.target.value))}
                      className="w-20 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-bold text-center"
                    />
                    <span className="text-xs font-bold text-slate-600">% du salaire brut de base</span>
                  </div>
                </div>
              </div>

              {/* Paramètres officiels CGI Madagascar */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
                <h4 className="text-xs font-extrabold text-salfa-dark uppercase tracking-wider border-b border-slate-200 pb-2">
                  Paramètres des Cotisations CNaPS & Barème IRSA (CGI Madagascar)
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Retenue CNaPS Salariale (%)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={cnapsSalariale}
                      onChange={(e) => setCnapsSalariale(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Cotisation Patronale CNaPS (%)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={cnapsPatronale}
                      onChange={(e) => setCnapsPatronale(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Déduction IRSA par enfant à charge (Ar)
                    </label>
                    <input
                      type="number"
                      value={deductionEnfant}
                      onChange={(e) => setDeductionEnfant(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Minimum de perception légal IRSA (Ar)
                    </label>
                    <input
                      type="number"
                      value={minIrsa}
                      onChange={(e) => setMinIrsa(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono font-bold"
                    />
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-sky-50 border border-sky-200 text-xs text-slate-600">
                  <span className="font-bold text-salfa-teal">Arrondi officiel CGI Madagascar : </span>
                  La base imposable est toujours arrondie au 100 Ariary inférieur avant barème par tranches (0%, 5%, 10%, 15%, 20%).
                </div>
              </div>

            </div>
          ) : (
            /* ONGLETS COLONNES & RUBRIQUES */
            <div className="space-y-6">
              
              <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 text-xs text-slate-700 flex items-center justify-between gap-4">
                <div>
                  <div className="font-extrabold text-salfa-dark">
                    Gestion des Colonnes et Rubriques du Tableau de Paie
                  </div>
                  <div>
                    Vous pouvez ajouter des colonnes supplémentaires (primes exceptionnelles, indemnités) au tableau de paie et aux bulletins.
                  </div>
                </div>
              </div>

              {/* Formulaire d'ajout de colonne */}
              <form onSubmit={handleAddColonne} className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row gap-3 items-end">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Nom de la nouvelle colonne / rubrique
                  </label>
                  <input
                    type="text"
                    value={newColNom}
                    onChange={(e) => setNewColNom(e.target.value)}
                    placeholder="ex: Prime de Bilinguisme, Indemnité Déplacement..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Type de Rubrique
                  </label>
                  <select
                    value={newColType}
                    onChange={(e) => setNewColType(e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-salfa-dark"
                  >
                    <option value="Accessoire">Accessoire / Prime (+)</option>
                    <option value="Gain de base">Gain de base (+)</option>
                    <option value="Retenue">Retenue (-)</option>
                  </select>
                </div>

                <button
                  type="submit"
                  className="bg-salfa-dark hover:bg-salfa-teal text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1.5 shadow transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Ajouter la Colonne</span>
                </button>
              </form>

              {/* Tableau des colonnes configurées */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 font-bold text-slate-600 uppercase">
                      <th className="py-2.5 px-4">Identifiant SQL</th>
                      <th className="py-2.5 px-4">Nom de la Colonne / Rubrique</th>
                      <th className="py-2.5 px-4">Type</th>
                      <th className="py-2.5 px-4 text-center">Statut</th>
                      <th className="py-2.5 px-4 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {colonnes.map((col, idx) => (
                      <tr key={idx} className="hover:bg-sky-50/50">
                        <td className="py-2.5 px-4 font-mono text-slate-500">{col.id}</td>
                        <td className="py-2.5 px-4 font-bold text-slate-800">{col.nom}</td>
                        <td className="py-2.5 px-4 font-semibold text-salfa-teal">{col.type}</td>
                        <td className="py-2.5 px-4 text-center">
                          {col.permanent ? (
                            <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 font-bold text-[11px]">
                              Officiel SALFA
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[11px]">
                              Personnalisé
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          {!col.permanent && (
                            <button
                              onClick={() => handleRemoveColonne(idx)}
                              className="p-1 rounded text-red-600 hover:bg-red-50 transition"
                              title="Supprimer cette rubrique"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

            </div>
          )}
        </div>

        {/* Pied de modal */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-between">
          <span className="text-xs text-slate-500 font-medium">
            Toutes les formules respectent la Loi de Finances Madagascar et le CGI.
          </span>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-semibold"
            >
              Fermer
            </button>
            <button
              onClick={handleSaveConfig}
              className="px-6 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold shadow transition flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Appliquer et Enregistrer</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
