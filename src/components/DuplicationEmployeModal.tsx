import React, { useState } from 'react';
import { Copy, Search, X } from 'lucide-react';
import type { Employe } from '../types';
import { correspondRecherche } from '../local/recherche';

interface Props {
  employes: Employe[];
  initialEmployeId: number | null;
  onClose: () => void;
  onSelect: (employe: Employe) => void;
}

export function QuestionsDuplication({ source, question, onOui, onNon }: {
  source: Employe;
  question: 1 | 2;
  onOui: () => void;
  onNon: () => void;
}) {
  return (
    <div className="p-4 space-y-4" aria-live="polite">
      <p className="text-xs font-bold uppercase text-sky-700 dark:text-sky-300">Question {question} sur 2</p>
      <h4 className="font-bold text-slate-900 dark:text-white">
        {question === 1
          ? `Voulez-vous dupliquer la fiche de ${source.numero_matricule} — ${source.nom_prenoms} pour un nouveau salarié ?`
          : 'Voulez-vous ouvrir la copie pour modifier les informations du nouveau salarié avant de l’enregistrer ?'}
      </h4>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        {question === 1
          ? 'La fiche du salarié d’origine restera inchangée. Ses bulletins et son historique de congés ne seront pas copiés.'
          : 'Vous devrez adapter les données préremplies. Le nom, la CNaPS, la CIN et le RIB seront vides. Aucune fiche ne sera créée avant votre enregistrement dans le formulaire.'}
      </p>
      <footer className="flex justify-end gap-2 pt-3 border-t dark:border-slate-700">
        <button type="button" onClick={onNon} className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 dark:text-white text-sm font-semibold">Non, annuler</button>
        <button key={question} autoFocus type="button" onClick={onOui} className="px-4 py-2 rounded-lg bg-salfa-dark text-white text-sm font-bold">
          {question === 1 ? 'Oui, continuer' : 'Oui, ouvrir la modification'}
        </button>
      </footer>
    </div>
  );
}

export function DuplicationEmployeModal({ employes, initialEmployeId, onClose, onSelect }: Props) {
  const [question, setQuestion] = useState<0 | 1 | 2>(0);
  const [recherche, setRecherche] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(initialEmployeId);
  const selection = employes.find(e => Number(e.id) === selectedId);
  const resultats = employes.filter(e => correspondRecherche(recherche, e.nom_prenoms, e.numero_matricule, e.jobs));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 backdrop-blur-sm p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="duplication-title" className="caisse-card w-full max-w-xl max-h-[95dvh] flex flex-col rounded-2xl bg-white dark:bg-slate-800 shadow-2xl overflow-hidden">
        <header className="bg-salfa-dark text-white p-4 flex items-center justify-between gap-3">
          <h3 id="duplication-title" className="font-bold">Dupliquer un salarié — Étape 1 sur 2</h3>
          <button type="button" onClick={onClose} aria-label="Fermer" className="p-1 rounded hover:bg-white/10"><X className="w-5 h-5" /></button>
        </header>
        {question !== 0 && selection ? (
          <QuestionsDuplication
            source={selection}
            question={question}
            onNon={onClose}
            onOui={() => {
              if (question === 1) setQuestion(2);
              else onSelect(selection);
            }}
          />
        ) : (
        <div className="p-4 flex flex-col gap-3 min-h-0">
          <p className="text-sm text-slate-600 dark:text-slate-300">Choisissez la fiche à copier. Deux questions de confirmation vous seront posées avant d’ouvrir la copie en modification, sans changer le salarié d’origine.</p>
          <label className="flex items-center gap-2 border rounded-lg px-3 dark:border-slate-600">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input autoFocus aria-label="Rechercher le salarié à copier" value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="Nom, matricule ou fonction…" className="w-full py-2 bg-transparent text-sm dark:text-white outline-none" />
          </label>
          <div className="overflow-y-auto max-h-[45dvh] space-y-1" role="group" aria-label="Salarié à copier">
            {resultats.map(e => (
              <label key={e.id} className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer ${selectedId === Number(e.id) ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/30' : 'border-slate-200 dark:border-slate-600'}`}>
                <input type="radio" name="source-duplication" checked={selectedId === Number(e.id)} onChange={() => setSelectedId(Number(e.id))} />
                <span className="text-sm dark:text-white"><b>{e.numero_matricule} — {e.nom_prenoms}</b><span className="block text-xs text-slate-500 dark:text-slate-300">{e.jobs || 'Fonction non renseignée'}{Number(e.actif) !== 1 ? ' · Inactif' : ''}</span></span>
              </label>
            ))}
            {!resultats.length && <p className="text-sm text-slate-500 p-3">{employes.length ? 'Aucun salarié ne correspond à la recherche.' : 'Aucune fiche disponible à dupliquer.'}</p>}
          </div>
          {selection && <p className="text-xs text-slate-600 dark:text-slate-300">Fiche choisie : <b>{selection.numero_matricule} — {selection.nom_prenoms}</b></p>}
          <footer className="flex justify-end gap-2 pt-3 border-t dark:border-slate-700">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 dark:text-white text-sm font-semibold">Annuler</button>
            <button type="button" disabled={!selection} onClick={() => selection && setQuestion(1)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-salfa-dark text-white text-sm font-bold disabled:opacity-50"><Copy className="w-4 h-4" />Copier et modifier</button>
          </footer>
        </div>
        )}
      </section>
    </div>
  );
}
