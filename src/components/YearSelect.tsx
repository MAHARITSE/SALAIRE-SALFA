import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Check, X } from 'lucide-react';
import { fetchAnneesBase, ajouterAnneeBase } from '../api';

export interface YearProps {
  annee: number;
  setAnnee: (annee: number) => void;
  /** Domaine de données interrogé pour lister les années utilisées dans la base ('paie' par défaut, 'conges' pour Congés). */
  domaine?: 'paie' | 'conges';
  /** Années supplémentaires déjà connues du parent (ex. issues de fetchPeriodes). */
  anneesDisponibles?: number[];
  /** Masquer le bouton d'ajout d'année si nécessaire (affiché par défaut). */
  masquerAjout?: boolean;
}

const ANNEES_UPDATED_EVENT = 'salfa-annees-updated';

/**
 * Sélecteur d'année lié aux seules années effectivement utilisées dans la base de données,
 * accompagné d'un bouton « + Année » permettant d'ajouter et sélectionner un nouvel exercice.
 */
export const YearSelect: React.FC<YearProps> = ({
  annee,
  setAnnee,
  domaine = 'paie',
  anneesDisponibles,
  masquerAjout = false,
}) => {
  const [anneesDb, setAnneesDb] = useState<number[]>([]);
  const [charge, setCharge] = useState<boolean>(false);
  const [ajoutOuvert, setAjoutOuvert] = useState<boolean>(false);
  const [saisieAnnee, setSaisieAnnee] = useState<string>('');
  const [erreurAjout, setErreurAjout] = useState<string>('');
  const [enCoursAjout, setEnCoursAjout] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const autoAlignedRef = useRef<boolean>(false);

  const rechargerAnnees = useCallback(async () => {
    try {
      const liste = await fetchAnneesBase(domaine);
      setAnneesDb(liste);
      setCharge(true);
    } catch {
      setCharge(true);
    }
  }, [domaine]);

  useEffect(() => {
    rechargerAnnees();
  }, [rechargerAnnees]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => {
      rechargerAnnees();
    };
    window.addEventListener(ANNEES_UPDATED_EVENT, handler);
    return () => window.removeEventListener(ANNEES_UPDATED_EVENT, handler);
  }, [rechargerAnnees]);

  const anneesBase = useMemo(() => {
    const s = new Set<number>();
    for (const y of anneesDb) {
      if (Number.isInteger(y) && y >= 1990 && y <= 2100) s.add(y);
    }
    if (Array.isArray(anneesDisponibles)) {
      for (const y of anneesDisponibles) {
        const yn = Number(y);
        if (Number.isInteger(yn) && yn >= 1990 && yn <= 2100) s.add(yn);
      }
    }
    return Array.from(s).sort((a, b) => a - b);
  }, [anneesDb, anneesDisponibles]);

  // Au premier chargement, si l'année par défaut n'existe pas dans la base, se caler sur la dernière année utilisée.
  useEffect(() => {
    if (!charge || autoAlignedRef.current) return;
    autoAlignedRef.current = true;
    if (anneesBase.length > 0 && !anneesBase.includes(annee)) {
      setAnnee(anneesBase[anneesBase.length - 1]);
    }
  }, [charge, anneesBase, annee, setAnnee]);

  const optionsAnnees = useMemo(() => {
    const s = new Set<number>(anneesBase);
    if (Number.isInteger(annee) && annee >= 1990 && annee <= 2100) {
      s.add(annee);
    }
    return Array.from(s).sort((a, b) => a - b);
  }, [anneesBase, annee]);

  const ouvrirAjout = () => {
    const maxExistante = optionsAnnees.length > 0 ? optionsAnnees[optionsAnnees.length - 1] : annee;
    const suggestion = Math.min(2100, maxExistante + 1);
    setSaisieAnnee(String(suggestion));
    setErreurAjout('');
    setAjoutOuvert(true);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 20);
  };

  const validerAjout = async () => {
    const y = Math.round(Number(saisieAnnee.trim()));
    if (!Number.isFinite(y) || !Number.isInteger(y) || y < 1990 || y > 2100) {
      setErreurAjout('Année invalide (1990–2100)');
      return;
    }
    setEnCoursAjout(true);
    setErreurAjout('');
    try {
      const res = await ajouterAnneeBase(y);
      if (!res.success) {
        setErreurAjout(res.message || "Impossible d'ajouter l'année.");
        return;
      }
      setAnneesDb((prev) => Array.from(new Set([...prev, y])).sort((a, b) => a - b));
      setAjoutOuvert(false);
      setAnnee(y);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(ANNEES_UPDATED_EVENT, { detail: { annee: y } }));
      }
    } catch (e: any) {
      setErreurAjout(e?.message || "Erreur lors de l'ajout.");
    } finally {
      setEnCoursAjout(false);
    }
  };

  return (
    <div className="inline-flex items-center gap-1.5 flex-wrap">
      <select
        aria-label="Année de paie"
        value={annee}
        onChange={(e) => setAnnee(Number(e.target.value))}
        className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-bold text-salfa-dark focus:ring-2 focus:ring-salfa-sky outline-none"
      >
        {optionsAnnees.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>

      {!masquerAjout && !ajoutOuvert && (
        <button
          type="button"
          onClick={ouvrirAjout}
          title="Ajouter une nouvelle année dans la base"
          className="inline-flex items-center gap-1 rounded-lg border border-sky-200 dark:border-sky-700 bg-sky-50 dark:bg-sky-900/30 hover:bg-salfa-teal hover:text-white hover:border-salfa-teal text-salfa-teal dark:text-sky-300 px-2 sm:px-2.5 py-1.5 text-xs font-bold transition shadow-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Année</span>
        </button>
      )}

      {!masquerAjout && ajoutOuvert && (
        <div className="inline-flex items-center gap-1 bg-sky-50 dark:bg-slate-700/80 border border-sky-300 dark:border-sky-600 rounded-lg px-1.5 py-0.5">
          <input
            ref={inputRef}
            type="number"
            min={1990}
            max={2100}
            step={1}
            disabled={enCoursAjout}
            aria-label="Nouvelle année à ajouter"
            value={saisieAnnee}
            onChange={(e) => {
              setSaisieAnnee(e.target.value);
              if (erreurAjout) setErreurAjout('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                validerAjout();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setAjoutOuvert(false);
                setErreurAjout('');
              }
            }}
            placeholder="Ex: 2027"
            className="w-20 rounded border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-800 dark:text-white px-2 py-1 text-xs font-mono font-bold text-center outline-none focus:ring-2 focus:ring-salfa-teal"
          />
          <button
            type="button"
            disabled={enCoursAjout}
            onClick={validerAjout}
            title="Confirmer l'ajout de l'année"
            className="inline-flex items-center justify-center rounded bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white p-1 transition"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={enCoursAjout}
            onClick={() => {
              setAjoutOuvert(false);
              setErreurAjout('');
            }}
            title="Annuler"
            className="inline-flex items-center justify-center rounded bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-700 dark:text-slate-200 p-1 transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          {erreurAjout && (
            <span className="text-[10px] font-bold text-red-600 dark:text-red-300 px-1">{erreurAjout}</span>
          )}
        </div>
      )}
    </div>
  );
};
