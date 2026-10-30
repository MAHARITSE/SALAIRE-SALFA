import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle, Banknote, CheckCircle2, Pill, Plus, Search, Trash2, X,
} from 'lucide-react';
import { enregistrerSaisieLot, SaisieLot } from '../api';
import { Employe, PaieMensuelle } from '../types';
import { correspondRecherche, normaliserRecherche } from '../local/recherche';

export type TypeSaisieRetenue = 'avance' | 'med';

interface Props {
  annee: number;
  mois: string;
  paies: PaieMensuelle[];
  employes: Employe[];
  initialType?: TypeSaisieRetenue;
  onClose: () => void;
  onSaved: (count: number, type: TypeSaisieRetenue) => void;
}

interface DraftItem {
  paieId: number;
  nom: string;
  matricule: number;
  avanceInitiale: number;
  medInitial: number;
  brut: number;
  montant: number;
}

const fmt = (n: number) =>
  n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function parseMontant(text: string): number | undefined | null {
  const value = text.trim().replace(/\s/g, '');
  if (!value) return undefined;
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value)) return null;
  const num = Number(value.replace(',', '.'));
  return Number.isFinite(num) && num <= Number.MAX_SAFE_INTEGER / 100 ? num : null;
}

export const SaisieLotModal: React.FC<Props> = ({
  annee,
  mois,
  paies,
  employes,
  initialType = 'avance',
  onClose,
  onSaved,
}) => {
  const [typeSaisie, setTypeSaisie] = useState<TypeSaisieRetenue>(initialType);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [selected, setSelected] = useState<PaieMensuelle | null>(null);
  const [montant, setMontant] = useState('');
  const [lignes, setLignes] = useState<DraftItem[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const montantRef = useRef<HTMLInputElement>(null);

  const estAvance = typeSaisie === 'avance';
  const libelleCourt = estAvance ? 'Avance' : 'Médicament';
  const libellePluriel = estAvance ? 'Avances sur salaire' : 'Médicaments (Pharmacie)';

  const candidats = useMemo(() => {
    const result = paies.map((p) => ({
      id: p.employe_id,
      mat: p.numero_matricule,
      nom: p.nom_prenoms,
      jobs: p.jobs,
      paie: p,
    }));
    const ids = new Set(result.map((e) => Number(e.id)));
    for (const e of employes) {
      if (Number(e.actif) === 1 && !ids.has(Number(e.id))) {
        result.push({
          id: e.id,
          mat: e.numero_matricule,
          nom: e.nom_prenoms,
          jobs: e.jobs,
          paie: null as any,
        });
      }
    }
    return result.sort((a, b) => Number(a.mat) - Number(b.mat));
  }, [paies, employes]);

  const searchTerm = normaliserRecherche(query);
  const matches = searchTerm
    ? candidats
        .filter((e) => correspondRecherche(searchTerm, e.mat, e.nom, e.jobs))
        .slice(0, 30)
    : [];

  const basculerType = (nouveau: TypeSaisieRetenue) => {
    if (nouveau === typeSaisie || saving) return;
    if (
      (lignes.length > 0 || montant.trim()) &&
      !window.confirm(
        `Vous avez ${lignes.length} saisie(s) en attente pour « ${libellePluriel} ». Basculer vers l'autre volet annulera cette liste non enregistrée. Continuer ?`
      )
    ) {
      return;
    }
    setTypeSaisie(nouveau);
    setLignes([]);
    setSelected(null);
    setQuery('');
    setMontant('');
    setError('');
    setOpen(false);
    requestAnimationFrame(() => searchRef.current?.focus());
  };

  const choisir = (p: PaieMensuelle) => {
    setSelected(p);
    setQuery(`${p.numero_matricule} — ${p.nom_prenoms}`.toLocaleUpperCase('fr-FR'));
    setOpen(false);
    setError('');
    const existing = lignes.find((l) => l.paieId === p.id);
    setMontant(existing ? String(existing.montant) : '');
    requestAnimationFrame(() => montantRef.current?.focus());
  };

  const close = () => {
    if (saving) return;
    if (
      (lignes.length || montant.trim()) &&
      !window.confirm('Fermer sans enregistrer les saisies en attente ?')
    ) {
      return;
    }
    onClose();
  };

  const ajouter = (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!selected) {
      setError('Choisissez un salarié dans la liste.');
      searchRef.current?.focus();
      return;
    }
    const val = parseMontant(montant);
    if (val === null || val === undefined) {
      setError(`Saisissez un montant de ${libelleCourt.toLowerCase()} positif (0 pour remettre à zéro).`);
      montantRef.current?.focus();
      return;
    }
    const draft: DraftItem = {
      paieId: selected.id,
      nom: selected.nom_prenoms,
      matricule: selected.numero_matricule,
      avanceInitiale: Number(selected.avance || 0),
      medInitial: Number(selected.med || 0),
      brut: Number(selected.brut || 0),
      montant: val,
    };
    setLignes((prev) => {
      const idx = prev.findIndex((l) => l.paieId === draft.paieId);
      if (idx < 0) return [...prev, draft];
      return prev.map((l, i) => (i === idx ? draft : l));
    });
    setSelected(null);
    setQuery('');
    setMontant('');
    setOpen(false);
    requestAnimationFrame(() => searchRef.current?.focus());
  };

  const enregistrer = async () => {
    if (!lignes.length || saving) return;
    if (selected || montant.trim()) {
      setError('Ajoutez la saisie en cours à la liste avant d’enregistrer le lot.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload: SaisieLot[] = lignes.map((l) => ({
        paieId: l.paieId,
        avanceInitiale: l.avanceInitiale,
        medInitial: l.medInitial,
        ...(estAvance ? { avance: l.montant } : { med: l.montant }),
      }));
      const result = await enregistrerSaisieLot(annee, mois, payload);
      if (!result.success) {
        setError(result.message || "L'enregistrement a échoué.");
        return;
      }
      onSaved(result.count || 0, typeSaisie);
    } catch {
      setError("L'enregistrement a échoué. Aucune confirmation de sauvegarde reçue.");
    } finally {
      setSaving(false);
    }
  };

  const valeurActuelleSelected = selected
    ? Number((estAvance ? selected.avance : selected.med) || 0)
    : 0;
  const autreRetenueSelected = selected
    ? Number((estAvance ? selected.med : selected.avance) || 0)
    : 0;
  const montantApercu = parseMontant(montant);
  const netEstimeSelected =
    selected && typeof montantApercu === 'number'
      ? Math.max(0, Math.floor((Number(selected.brut || 0) - montantApercu - autreRetenueSelected) / 100) * 100)
      : null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-2 sm:p-5"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="saisie-lot-title"
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[95dvh] flex flex-col overflow-hidden border dark:border-slate-600"
      >
        {/* En-tête */}
        <div
          className={`${
            estAvance ? 'bg-amber-800 dark:bg-amber-950' : 'bg-rose-800 dark:bg-rose-950'
          } text-white px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3 transition-colors`}
        >
          <div>
            <h2 id="saisie-lot-title" className="font-bold text-base flex items-center gap-2">
              {estAvance ? <Banknote className="w-5 h-5" /> : <Pill className="w-5 h-5" />}
              <span>Saisie indépendante — {libellePluriel}</span>
            </h2>
            <p className="text-xs text-white/80 mt-0.5">
              Période : <b>{mois} {annee}</b> · Seule la colonne <b>{estAvance ? 'AVANCE' : 'MED'}</b> sera modifiée
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            disabled={saving}
            aria-label="Fermer"
            className="p-2 rounded-lg hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 sm:p-5 overflow-y-auto space-y-4">
          {/* Sélecteur des 2 volets totalement indépendants */}
          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-700/70">
            <button
              type="button"
              onClick={() => basculerType('avance')}
              className={`py-2 px-3 rounded-lg text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition ${
                estAvance
                  ? 'bg-amber-600 text-white shadow'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-600'
              }`}
            >
              <Banknote className="w-4 h-4 shrink-0" />
              <span>Volet Avances</span>
            </button>
            <button
              type="button"
              onClick={() => basculerType('med')}
              className={`py-2 px-3 rounded-lg text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition ${
                !estAvance
                  ? 'bg-rose-600 text-white shadow'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-600'
              }`}
            >
              <Pill className="w-4 h-4 shrink-0" />
              <span>Volet Médicaments</span>
            </button>
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-300">
            {estAvance ? (
              <>
                Saisissez uniquement les <b>avances sur salaire</b>. Les montants de <b>médicaments restent intacts</b>. Saisissez <b>0</b> pour effacer une avance existante.
              </>
            ) : (
              <>
                Saisissez uniquement les <b>retenues médicaments / pharmacie</b>. Les <b>avances sur salaire restent intactes</b>. Saisissez <b>0</b> pour effacer un montant médicament existant.
              </>
            )}
          </p>

          {/* Formulaire mono-rubrique (jamais côte à côte) */}
          <form onSubmit={ajouter} className="space-y-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-700/30 p-3 sm:p-4">
            <div
              className="relative"
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
              }}
            >
              <label htmlFor="lot-search" className="block text-xs font-bold mb-1">
                1. Salarié — rechercher par nom ou matricule
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input
                  id="lot-search"
                  ref={searchRef}
                  autoFocus
                  role="combobox"
                  aria-expanded={open}
                  aria-controls="lot-options"
                  aria-autocomplete="list"
                  aria-activedescendant={
                    open && matches[highlight]?.paie
                      ? `lot-option-${matches[highlight].paie.id}`
                      : undefined
                  }
                  value={query}
                  onFocus={() => {
                    if (!selected && searchTerm) setOpen(true);
                  }}
                  onChange={(e) => {
                    const text = e.target.value.toLocaleUpperCase('fr-FR');
                    setQuery(text);
                    setSelected(null);
                    setMontant('');
                    setHighlight(0);
                    setOpen(Boolean(normaliserRecherche(text)));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown' && open && matches.length) {
                      e.preventDefault();
                      setHighlight((i) => Math.min(i + 1, matches.length - 1));
                    } else if (e.key === 'ArrowUp' && open) {
                      e.preventDefault();
                      setHighlight((i) => Math.max(0, i - 1));
                    } else if (e.key === 'Escape' && open) {
                      e.preventDefault();
                      setOpen(false);
                    } else if (e.key === 'Enter' && open) {
                      e.preventDefault();
                      const match = matches[highlight];
                      if (match?.paie) choisir(match.paie);
                    }
                  }}
                  placeholder="Tapez un matricule ou un nom…"
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-salfa-teal"
                />
              </div>
              {open && (
                <div
                  id="lot-options"
                  role="listbox"
                  className="absolute z-20 w-full mt-1 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg shadow-xl max-h-52 overflow-y-auto"
                >
                  {matches.length === 0 ? (
                    <div className="p-3 text-xs text-slate-500">Aucun salarié trouvé.</div>
                  ) : (
                    matches.map((c, i) => (
                      <button
                        type="button"
                        role="option"
                        aria-selected={i === highlight}
                        aria-disabled={!c.paie}
                        id={c.paie ? `lot-option-${c.paie.id}` : undefined}
                        key={`${c.id}-${c.mat}`}
                        onMouseEnter={() => setHighlight(i)}
                        onClick={() => c.paie && choisir(c.paie)}
                        className={`w-full text-left px-3 py-2 text-xs border-b dark:border-slate-600 flex items-center justify-between gap-2 ${
                          i === highlight ? 'bg-sky-50 dark:bg-slate-600' : ''
                        } ${!c.paie ? 'text-slate-400' : ''}`}
                      >
                        <span>
                          <b>{c.mat} — {c.nom}</b>
                          <span className="block text-[11px] text-slate-500 dark:text-slate-300">
                            {c.paie
                              ? c.jobs || 'Salarié'
                              : 'Sans bulletin : créez son bulletin pour cette période'}
                          </span>
                        </span>
                        {c.paie && (
                          <span className="font-mono text-[11px] shrink-0">
                            {libelleCourt} act. :{' '}
                            <b>{fmt(Number((estAvance ? c.paie.avance : c.paie.med) || 0))}</b>
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
              <div className="flex-1">
                <label htmlFor="lot-montant" className="block text-xs font-bold mb-1">
                  2. {estAvance ? "Montant de l'avance (Ar)" : 'Montant médicament / pharmacie (Ar)'}
                </label>
                <input
                  id="lot-montant"
                  ref={montantRef}
                  inputMode="decimal"
                  value={montant}
                  onChange={(e) => setMontant(e.target.value)}
                  placeholder={selected ? fmt(valeurActuelleSelected) : 'Saisissez le montant en Ariary'}
                  className={`w-full py-2 px-3 rounded-lg border bg-white dark:bg-slate-700 text-sm text-right font-mono font-bold focus:outline-none focus:ring-2 ${
                    estAvance
                      ? 'border-amber-300 dark:border-amber-700 focus:ring-amber-500'
                      : 'border-rose-300 dark:border-rose-700 focus:ring-rose-500'
                  }`}
                />
              </div>
              <button
                type="submit"
                className={`${
                  estAvance
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                } text-white rounded-lg px-5 py-2 text-sm font-bold flex items-center justify-center gap-1.5 shrink-0`}
              >
                <Plus className="w-4 h-4" />
                <span>Ajouter à la liste</span>
              </button>
            </div>

            {selected && (
              <div className="text-xs text-slate-600 dark:text-slate-300 flex flex-wrap gap-x-4 gap-y-1 pt-1 border-t border-slate-200 dark:border-slate-600">
                <span>
                  {libelleCourt} actuelle de <b>{selected.nom_prenoms}</b> :{' '}
                  <b className="font-mono">{fmt(valeurActuelleSelected)} Ar</b>
                </span>
                <span className="text-slate-400">•</span>
                <span>
                  {estAvance ? 'Médicament (inchangé)' : 'Avance (inchangée)'} :{' '}
                  <span className="font-mono">{fmt(autreRetenueSelected)} Ar</span>
                </span>
                {netEstimeSelected !== null && (
                  <>
                    <span className="text-slate-400">•</span>
                    <span className="text-emerald-700 dark:text-emerald-300">
                      Net à payer estimé : <b className="font-mono">{fmt(netEstimeSelected)} Ar</b>
                    </span>
                  </>
                )}
              </div>
            )}
          </form>

          {error && (
            <div
              role="alert"
              className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 rounded-lg p-2.5 text-xs flex gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Liste des saisies du volet actif uniquement */}
          <div className="border dark:border-slate-600 rounded-xl overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="bg-slate-100 dark:bg-slate-700 text-xs uppercase text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="text-left p-2.5">Salarié</th>
                  <th className="text-right p-2.5">{libelleCourt} actuelle</th>
                  <th className="text-right p-2.5">
                    {estAvance ? 'Nouvelle avance' : 'Nouveau médicament'}
                  </th>
                  <th className="p-2.5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {lignes.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center p-6 text-slate-500 text-xs">
                      Aucune saisie de {libelleCourt.toLowerCase()} ajoutée pour le moment.
                    </td>
                  </tr>
                ) : (
                  lignes.map((l) => (
                    <tr key={l.paieId} className="border-t dark:border-slate-600">
                      <td className="p-2.5">
                        <b>{l.matricule}</b> — {l.nom}
                      </td>
                      <td className="p-2.5 text-right font-mono text-xs text-slate-500">
                        {fmt(estAvance ? l.avanceInitiale : l.medInitial)} Ar
                      </td>
                      <td
                        className={`p-2.5 text-right font-mono font-bold ${
                          estAvance
                            ? 'text-amber-700 dark:text-amber-300'
                            : 'text-rose-700 dark:text-rose-300'
                        }`}
                      >
                        {fmt(l.montant)} Ar
                      </td>
                      <td className="p-2.5 whitespace-nowrap text-center">
                        <button
                          type="button"
                          className="text-sky-700 dark:text-sky-300 text-xs underline mr-3"
                          onClick={() => {
                            const p = paies.find((x) => x.id === l.paieId);
                            if (p) choisir(p);
                          }}
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          aria-label={`Retirer ${l.nom}`}
                          className="text-red-600"
                          onClick={() => {
                            setLignes((prev) => prev.filter((x) => x.paieId !== l.paieId));
                            if (selected?.id === l.paieId) {
                              setSelected(null);
                              setQuery('');
                              setMontant('');
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4 inline" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot className="bg-emerald-50 dark:bg-emerald-900/20 border-t dark:border-slate-600 font-bold text-xs">
                <tr>
                  <td className="p-2.5" colSpan={2}>
                    Total {libellePluriel.toLowerCase()} saisis · {lignes.length} salarié(s)
                  </td>
                  <td className="p-2.5 text-right font-mono">
                    {fmt(lignes.reduce((s, l) => s + l.montant, 0))} Ar
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Pied */}
        <div className="border-t dark:border-slate-600 p-3 flex justify-end gap-2 bg-slate-50 dark:bg-slate-900/40">
          <button
            type="button"
            onClick={close}
            disabled={saving}
            className="px-4 py-2 rounded-lg border dark:border-slate-600 text-sm font-semibold"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={enregistrer}
            disabled={saving || !lignes.length}
            className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold flex items-center gap-1.5 shadow"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>
              {saving
                ? 'Enregistrement…'
                : `Enregistrer ${estAvance ? 'les avances' : 'les médicaments'} (${lignes.length})`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
