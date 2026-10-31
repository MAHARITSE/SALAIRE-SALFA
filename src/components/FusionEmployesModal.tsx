import React, { useEffect, useMemo, useState } from 'react';
import {
  GitMerge,
  ArrowLeftRight,
  AlertTriangle,
  CheckCircle2,
  X,
  Sparkles,
  FileSpreadsheet,
  CalendarDays,
  ShieldCheck,
} from 'lucide-react';
import { Employe } from '../types';
import {
  fetchDoublonsEmployes,
  apercevoirFusionEmployes,
  fusionnerEmployes,
  GroupeDoublonEmploye,
  ApercuFusionEmployes,
  ResultatFusionEmployes,
} from '../api';
import { correspondRecherche, normaliserRecherche } from '../local/recherche';

interface FusionEmployesModalProps {
  employes: Employe[];
  initialEmployeId?: number | null;
  onClose: () => void;
  onMerged: (res: ResultatFusionEmployes) => void;
}

const fmtAr = (n: number) =>
  (n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const FusionEmployesModal: React.FC<FusionEmployesModalProps> = ({
  employes,
  initialEmployeId,
  onClose,
  onMerged,
}) => {
  const [groupes, setGroupes] = useState<GroupeDoublonEmploye[]>([]);
  const [cibleId, setCibleId] = useState<number>(0);
  const [sourceId, setSourceId] = useState<number>(0);
  const [apercu, setApercu] = useState<ApercuFusionEmployes | null>(null);
  const [cumulerRetenues, setCumulerRetenues] = useState<boolean>(true);
  const [filtreEmployes, setFiltreEmployes] = useState<string>('');
  const [confirmReady, setConfirmReady] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const g = await fetchDoublonsEmployes();
        if (cancelled) return;
        setGroupes(g);

        // Pré-sélection intelligente à partir du salarié cliqué ou du 1er doublon détecté
        if (initialEmployeId) {
          const grp = g.find(
            (x) =>
              Number(x.cibleSuggeree.employe.id) === Number(initialEmployeId) ||
              x.doublons.some((d) => Number(d.employe.id) === Number(initialEmployeId))
          );
          if (grp) {
            setCibleId(Number(grp.cibleSuggeree.employe.id));
            const autre =
              Number(grp.cibleSuggeree.employe.id) === Number(initialEmployeId)
                ? grp.doublons[0]?.employe.id
                : initialEmployeId;
            if (autre) setSourceId(Number(autre));
            return;
          }
          setCibleId(Number(initialEmployeId));
          return;
        }

        if (g.length > 0 && g[0].doublons.length > 0) {
          setCibleId(Number(g[0].cibleSuggeree.employe.id));
          setSourceId(Number(g[0].doublons[0].employe.id));
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Erreur lors de la détection des doublons.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialEmployeId]);

  useEffect(() => {
    let cancelled = false;
    setConfirmReady(false);
    setError(null);
    if (!cibleId || !sourceId || cibleId === sourceId) {
      setApercu(null);
      return;
    }
    (async () => {
      try {
        const res = await apercevoirFusionEmployes(cibleId, sourceId);
        if (!cancelled) setApercu(res);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Aperçu indisponible.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cibleId, sourceId]);

  const employesTries = useMemo(() => {
    const q = normaliserRecherche(filtreEmployes);
    return [...employes]
      .filter((e) =>
        correspondRecherche(q, e.numero_matricule, e.nom_prenoms, e.numero_cnaps, e.jobs, e.categorie)
      )
      .sort((a, b) => Number(a.numero_matricule) - Number(b.numero_matricule));
  }, [employes, filtreEmployes]);

  const handleInverser = () => {
    if (!cibleId && !sourceId) return;
    setCibleId(sourceId);
    setSourceId(cibleId);
  };

  const handleExecuterFusion = async () => {
    if (!cibleId || !sourceId || cibleId === sourceId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fusionnerEmployes(cibleId, sourceId, {
        cumulerRetenuesMoisOuverts: cumulerRetenues,
      });
      if (!res.success) {
        setError(res.message || 'Échec de la fusion.');
        setBusy(false);
        return;
      }
      onMerged(res);
    } catch (e: any) {
      setError(e?.message || 'Erreur lors de la fusion des fiches salariés.');
      setBusy(false);
    }
  };

  const aRetenuesDoublonOuvert = Boolean(
    apercu?.periodesEnDoublon.some(
      (d) => !d.verrouille && (d.avanceSource > 0 || d.medSource > 0)
    )
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden border border-slate-200 dark:border-slate-700 max-h-[95dvh] flex flex-col">
        {/* EN-TÊTE */}
        <div className="bg-salfa-dark dark:bg-slate-900 px-4 sm:px-6 py-3.5 flex items-center justify-between text-white shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-lg bg-amber-500/20 text-amber-300 shrink-0">
              <GitMerge className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-extrabold truncate">
                Fusionner des fiches salariés en doublon
              </h3>
              <p className="text-[11px] text-slate-300 truncate">
                Regroupe tout l&apos;historique des paies &amp; congés sur un seul matricule et supprime le doublon
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 transition shrink-0"
            title="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CORPS */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
          {/* DOUBLONS DÉTECTÉS AUTOMATIQUEMENT */}
          {groupes.length > 0 && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-800/70 bg-amber-50/80 dark:bg-amber-950/30 p-3.5 space-y-2">
              <div className="flex items-center gap-2 text-xs font-extrabold text-amber-900 dark:text-amber-200">
                <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>
                  {groupes.length} groupe{groupes.length > 1 ? 's' : ''} de doublons détecté
                  {groupes.length > 1 ? 's' : ''} automatiquement dans la base :
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {groupes.flatMap((g) =>
                  g.doublons.map((d) => {
                    const cId = Number(g.cibleSuggeree.employe.id);
                    const sId = Number(d.employe.id);
                    const selected =
                      (cibleId === cId && sourceId === sId) ||
                      (cibleId === sId && sourceId === cId);
                    return (
                      <button
                        key={`${cId}-${sId}`}
                        type="button"
                        onClick={() => {
                          setCibleId(cId);
                          setSourceId(sId);
                        }}
                        className={`text-left px-3 py-1.5 rounded-lg border text-xs transition ${
                          selected
                            ? 'bg-amber-600 text-white border-amber-700 font-bold shadow-sm'
                            : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-amber-300 dark:border-amber-700 hover:bg-amber-100/70'
                        }`}
                      >
                        <span className="font-extrabold">
                          Mat {g.cibleSuggeree.employe.numero_matricule} ⟵ Mat {d.employe.numero_matricule}
                        </span>{' '}
                        · {g.cibleSuggeree.employe.nom_prenoms}{' '}
                        <span className={selected ? 'text-amber-100' : 'text-slate-500 dark:text-slate-400'}>
                          ({g.raison})
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* FILTRE RAPIDE POUR SÉLECTION MANUELLE */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              autoCapitalize="characters"
              value={filtreEmployes}
              onChange={(e) => setFiltreEmployes(e.target.value.toLocaleUpperCase('fr-FR'))}
              placeholder="Filtrer la liste déroulante par matricule, nom ou N° CNaPS…"
              className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/60 dark:text-white text-xs uppercase outline-none focus:ring-2 focus:ring-salfa-sky"
            />
          </div>

          {/* SÉLECTION CÔTE À CÔTE : CIBLE À CONSERVER vs DOUBLON À SUPPRIMER */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-3 items-stretch">
            {/* FICHE CIBLE */}
            <div className="rounded-xl border-2 border-emerald-500/70 bg-emerald-50/40 dark:bg-emerald-950/20 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
                  <ShieldCheck className="w-4 h-4" />
                  1. Fiche principale À CONSERVER
                </span>
                {apercu?.cible && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-600 text-white font-bold">
                    Mat {apercu.cible.employe.numero_matricule}
                  </span>
                )}
              </div>
              <select
                value={cibleId || ''}
                onChange={(e) => setCibleId(Number(e.target.value))}
                className="w-full px-2.5 py-2 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-800 dark:text-white text-xs font-semibold"
              >
                <option value="">— Choisir le salarié à conserver —</option>
                {employesTries.map((e) => (
                  <option key={e.id} value={e.id} disabled={Number(e.id) === sourceId}>
                    Mat {e.numero_matricule} — {e.nom_prenoms} {e.rib ? `(RIB: ${e.rib})` : '(Sans RIB)'}{' '}
                    {Number(e.actif) === 1 ? '' : '[Inactif]'}
                  </option>
                ))}
              </select>
              {apercu?.cible && (
                <div className="text-[11px] text-slate-700 dark:text-slate-300 space-y-1 pt-1 border-t border-emerald-200/70 dark:border-emerald-800/50">
                  <div>
                    <b>Nom :</b> {apercu.cible.employe.nom_prenoms}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                    <span>
                      <b>CNaPS :</b> {apercu.cible.employe.numero_cnaps || '—'}
                    </span>
                    <span>
                      <b>Cat./Poste :</b> {apercu.cible.employe.categorie || '—'} ·{' '}
                      {apercu.cible.employe.jobs || '—'}
                    </span>
                  </div>
                  <div>
                    <b>RIB :</b>{' '}
                    <span className="font-mono">{apercu.cible.employe.rib || '— (Espèces)'}</span>
                  </div>
                  <div className="text-emerald-800 dark:text-emerald-300 font-semibold">
                    {apercu.cible.nbPaies} bulletin(s)
                    {apercu.cible.premierePeriode
                      ? ` (${apercu.cible.premierePeriode} → ${apercu.cible.dernierePeriode})`
                      : ''}{' '}
                    · {apercu.cible.nbConges} fiche(s) congé
                  </div>
                </div>
              )}
            </div>

            {/* BOUTON INVERSER */}
            <div className="flex items-center justify-center">
              <button
                type="button"
                onClick={handleInverser}
                disabled={!cibleId && !sourceId}
                title="Inverser la fiche conservée et le doublon"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-bold transition disabled:opacity-40"
              >
                <ArrowLeftRight className="w-4 h-4" />
                <span className="lg:hidden">Inverser</span>
              </button>
            </div>

            {/* FICHE DOUBLON SOURCE */}
            <div className="rounded-xl border-2 border-rose-400/70 bg-rose-50/40 dark:bg-rose-950/20 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-rose-800 dark:text-rose-300">
                  <GitMerge className="w-4 h-4" />
                  2. Doublon À FUSIONNER (sera supprimé)
                </span>
                {apercu?.source && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-600 text-white font-bold">
                    Mat {apercu.source.employe.numero_matricule}
                  </span>
                )}
              </div>
              <select
                value={sourceId || ''}
                onChange={(e) => setSourceId(Number(e.target.value))}
                className="w-full px-2.5 py-2 rounded-lg border border-rose-300 dark:border-rose-700 bg-white dark:bg-slate-800 dark:text-white text-xs font-semibold"
              >
                <option value="">— Choisir le doublon à absorber —</option>
                {employesTries.map((e) => (
                  <option key={e.id} value={e.id} disabled={Number(e.id) === cibleId}>
                    Mat {e.numero_matricule} — {e.nom_prenoms} {e.rib ? `(RIB: ${e.rib})` : '(Sans RIB)'}{' '}
                    {Number(e.actif) === 1 ? '' : '[Inactif]'}
                  </option>
                ))}
              </select>
              {apercu?.source && (
                <div className="text-[11px] text-slate-700 dark:text-slate-300 space-y-1 pt-1 border-t border-rose-200/70 dark:border-rose-800/50">
                  <div>
                    <b>Nom :</b> {apercu.source.employe.nom_prenoms}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                    <span>
                      <b>CNaPS :</b> {apercu.source.employe.numero_cnaps || '—'}
                    </span>
                    <span>
                      <b>Cat./Poste :</b> {apercu.source.employe.categorie || '—'} ·{' '}
                      {apercu.source.employe.jobs || '—'}
                    </span>
                  </div>
                  <div>
                    <b>RIB :</b>{' '}
                    <span className="font-mono">{apercu.source.employe.rib || '— (Espèces)'}</span>
                  </div>
                  <div className="text-rose-800 dark:text-rose-300 font-semibold">
                    {apercu.source.nbPaies} bulletin(s)
                    {apercu.source.premierePeriode
                      ? ` (${apercu.source.premierePeriode} → ${apercu.source.dernierePeriode})`
                      : ''}{' '}
                    · {apercu.source.nbConges} fiche(s) congé
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* APERÇU DÉTAILLÉ DE L'IMPACT */}
          {apercu && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-4 space-y-3 text-xs">
              <div className="font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-salfa-teal" />
                <span>
                  Résumé des opérations (Mat {apercu.source.employe.numero_matricule} → Mat{' '}
                  {apercu.cible.employe.numero_matricule}) :
                </span>
              </div>

              <ul className="space-y-1.5 text-slate-700 dark:text-slate-300">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>
                    <b>{apercu.periodesTransferees.length} bulletin(s) manquant(s)</b> transféré(s)
                    intégralement vers <b>Mat {apercu.cible.employe.numero_matricule}</b>
                    {apercu.periodesTransferees.length > 0
                      ? ` : ${apercu.periodesTransferees.join(', ')}`
                      : ' (aucun mois exclusif sur le doublon)'}.
                  </span>
                </li>

                {apercu.periodesEnDoublon.length > 0 && (
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <div>
                        <b>{apercu.periodesEnDoublon.length} bulletin(s) en doublon sur le même mois</b>{' '}
                        (le bulletin de <b>Mat {apercu.cible.employe.numero_matricule}</b> est conservé et
                        la ligne en double de Mat {apercu.source.employe.numero_matricule} est retirée) :
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {apercu.periodesEnDoublon.map((d) => (
                          <span
                            key={d.periode}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 text-[11px] font-mono"
                          >
                            {d.periode} (gardé: {fmtAr(d.netCible)} Ar / doublon: {fmtAr(d.netSource)} Ar)
                          </span>
                        ))}
                      </div>
                    </div>
                  </li>
                )}

                <li className="flex items-start gap-2">
                  <CalendarDays className="w-4 h-4 text-violet-600 shrink-0 mt-0.5" />
                  <span>
                    <b>Congés &amp; permissions :</b> {apercu.congesATransferer} fiche(s) rattachée(s) à
                    Mat {apercu.cible.employe.numero_matricule}
                    {apercu.congesDoublons > 0
                      ? ` (${apercu.congesDoublons} ouverture/doublon ignoré(s) pour éviter tout cumul en double)`
                      : ''}.
                  </span>
                </li>

                {apercu.champsCompletesSurCible.length > 0 && (
                  <li className="flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                    <span>
                      <b>Champs complétés sur la fiche conservée :</b>{' '}
                      {apercu.champsCompletesSurCible.join(', ')}.
                    </span>
                  </li>
                )}
              </ul>

              {aRetenuesDoublonOuvert && (
                <label className="flex items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cumulerRetenues}
                    onChange={(e) => setCumulerRetenues(e.target.checked)}
                    className="rounded border-slate-300 text-salfa-teal focus:ring-salfa-sky"
                  />
                  <span className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                    Additionner les Avances / Médicaments déjà saisis sur le doublon dans le mois ouvert conservé
                  </span>
                </label>
              )}
            </div>
          )}

          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* PIED DE MODALE */}
        <div className="px-4 sm:px-6 py-3.5 bg-slate-50 dark:bg-slate-900/70 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold transition"
          >
            Annuler
          </button>

          {apercu && !confirmReady ? (
            <button
              type="button"
              onClick={() => setConfirmReady(true)}
              disabled={busy}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-extrabold shadow-sm transition"
            >
              <GitMerge className="w-4 h-4" />
              <span>
                Fusionner Mat {apercu.source.employe.numero_matricule} dans Mat{' '}
                {apercu.cible.employe.numero_matricule}…
              </span>
            </button>
          ) : apercu && confirmReady ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-rose-700 dark:text-rose-300">
                Confirmer la suppression du doublon Mat {apercu.source.employe.numero_matricule} ?
              </span>
              <button
                type="button"
                onClick={handleExecuterFusion}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-sm transition disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{busy ? 'Fusion en cours…' : 'Oui, confirmer la fusion'}</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
