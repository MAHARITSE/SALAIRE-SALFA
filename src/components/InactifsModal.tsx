// ==============================================================================
// MODALE ADMINISTRATION — LISTE DES PERSONNES INACTIVES & DATE DE MISE EN INACTIF
// Accessible depuis le sous-menu Administration (rôle Administrateur).
// ==============================================================================
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Employe } from '../types';
import { fetchEmployes, toggleActifEmploye, updateEmploye } from '../api';
import { EmployeModalForm } from './EmployeModalForm';
import { correspondRecherche, normaliserRecherche } from '../local/recherche';
import { X, UserX, Search, UserCheck, Edit3, CalendarX2 } from 'lucide-react';

interface InactifsModalProps {
  onClose: () => void;
  onChanged: () => void;
}

function formatDateFr(raw: string | undefined): string {
  const s = String(raw ?? '').trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : s || 'Non renseignée';
}

export const InactifsModal: React.FC<InactifsModalProps> = ({ onClose, onChanged }) => {
  const [inactifs, setInactifs] = useState<Employe[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingEmploye, setEditingEmploye] = useState<Employe | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const charger = useCallback(async () => {
    setLoading(true);
    try {
      const tous = await fetchEmployes(false);
      const liste = (tous || [])
        .filter((e) => Number(e.actif) !== 1)
        .sort(
          (a, b) =>
            String(b.date_inactif || '').localeCompare(String(a.date_inactif || '')) ||
            Number(a.numero_matricule) - Number(b.numero_matricule)
        );
      setInactifs(liste);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  const filtres = useMemo(() => {
    const q = normaliserRecherche(search);
    if (!q) return inactifs;
    return inactifs.filter((e) =>
      correspondRecherche(q, e.numero_matricule, e.nom_prenoms, e.jobs, e.categorie, e.date_inactif)
    );
  }, [inactifs, search]);

  const handleReactiver = async (emp: Employe) => {
    if (!window.confirm(`Réactiver ${emp.nom_prenoms} (Mat ${emp.numero_matricule}) ?`)) return;
    setBusyId(emp.id);
    const ok = await toggleActifEmploye(emp.id, true);
    setBusyId(null);
    if (ok) {
      await charger();
      onChanged();
    } else {
      alert('Impossible de réactiver ce salarié.');
    }
  };

  const handleChangeDateInactif = async (emp: Employe, nouvelleDate: string) => {
    if (!nouvelleDate) return;
    setBusyId(emp.id);
    const ok = await updateEmploye(emp.id, { ...emp, actif: 0, date_inactif: nouvelleDate });
    setBusyId(null);
    if (ok) {
      await charger();
      onChanged();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden border border-slate-200 dark:border-slate-700 max-h-[92dvh] flex flex-col">
        {/* En-tête */}
        <div className="bg-salfa-dark dark:bg-slate-900 px-4 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between text-white shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-red-500/20 text-red-300 shrink-0">
              <UserX className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-lg font-bold truncate">
                Liste des personnes inactives ({inactifs.length})
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-300 truncate">
                Salariés désactivés et date de mise en inactif
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 shrink-0"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barre de recherche */}
        <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 shrink-0">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              autoCapitalize="characters"
              value={search}
              onChange={(e) => setSearch(e.target.value.toLocaleUpperCase('fr-FR'))}
              placeholder="Rechercher par matricule, nom, fonction ou date..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white text-xs sm:text-sm uppercase focus:ring-2 focus:ring-salfa-sky outline-none"
            />
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
            Pour rendre un salarié actif en inactif : ouvrez sa fiche (double-clic ou bouton <b>Modifier</b>).
          </div>
        </div>

        {/* Tableau des personnes inactives */}
        <div className="p-3 sm:p-5 overflow-y-auto thin-scrollbar flex-1">
          {loading ? (
            <div className="py-12 text-center text-sm text-slate-400">Chargement…</div>
          ) : filtres.length === 0 ? (
            <div className="py-12 text-center space-y-1">
              <UserCheck className="w-8 h-8 text-emerald-500 mx-auto mb-1" />
              <div className="text-sm font-bold text-slate-700 dark:text-slate-200">
                {search ? 'Aucune personne inactive ne correspond à la recherche.' : 'Aucune personne inactive enregistrée.'}
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto thin-scrollbar rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600 text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300">
                    <th className="py-2.5 px-3 text-center">Mat.</th>
                    <th className="py-2.5 px-3">Nom et Prénoms</th>
                    <th className="py-2.5 px-3">Fonction / Cat.</th>
                    <th className="py-2.5 px-3 text-center">Date embauche</th>
                    <th className="py-2.5 px-3 text-center">Date de mise en inactif</th>
                    <th className="py-2.5 px-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {filtres.map((emp) => (
                    <tr key={emp.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/40 transition">
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-salfa-dark dark:text-sky-300">
                        {emp.numero_matricule}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-900 dark:text-white">{emp.nom_prenoms}</div>
                        {emp.numero_cnaps && (
                          <div className="text-[11px] text-slate-400 font-mono">CNaPS : {emp.numero_cnaps}</div>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="text-slate-700 dark:text-slate-200">{emp.jobs || '—'}</div>
                        <div className="text-[11px] text-slate-400">Cat. {emp.categorie || '—'}</div>
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono text-xs text-slate-600 dark:text-slate-300">
                        {formatDateFr(emp.date_embauche)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="inline-flex flex-col items-center gap-1">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200 font-mono font-bold text-xs border border-red-200 dark:border-red-800">
                            <CalendarX2 className="w-3.5 h-3.5" />
                            {formatDateFr(emp.date_inactif)}
                          </span>
                          <input
                            type="date"
                            value={emp.date_inactif || ''}
                            disabled={busyId === emp.id}
                            onChange={(e) => handleChangeDateInactif(emp, e.target.value)}
                            title="Modifier la date de mise en inactif"
                            className="text-[11px] font-mono rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-slate-200 px-1.5 py-0.5"
                          />
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingEmploye(emp)}
                            disabled={busyId === emp.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/30 hover:bg-amber-100 text-amber-700 dark:text-amber-300 text-xs font-bold transition"
                            title="Modifier la fiche salarié"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Modifier</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReactiver(emp)}
                            disabled={busyId === emp.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition disabled:opacity-50"
                            title="Réactiver ce salarié"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>Réactiver</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pied de modale */}
        <div className="px-4 sm:px-6 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 text-xs sm:text-sm font-bold transition"
          >
            Fermer
          </button>
        </div>
      </div>

      {editingEmploye && (
        <EmployeModalForm
          employe={editingEmploye}
          onClose={() => setEditingEmploye(null)}
          onSaved={async () => {
            setEditingEmploye(null);
            await charger();
            onChanged();
          }}
        />
      )}
    </div>
  );
};

export default InactifsModal;
