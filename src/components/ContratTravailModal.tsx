// ==============================================================================
// CONTRAT DE TRAVAIL — édition, aperçu, impression, PDF et Word
// Réservé à l'Administrateur. Les compléments saisis ici ne modifient jamais la
// fiche salarié ni la paie ; ils vivent uniquement dans cet éditeur jusqu'à sa
// fermeture. Le modèle de clauses est celui du DOCX fourni.
// ==============================================================================
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { flushSync } from 'react-dom';
import {
  X, FileSignature, Printer, FileDown, FileType2, RotateCcw, AlertTriangle, CheckCircle2, Info,
} from 'lucide-react';
import { Employe } from '../types';
import { estRoleAdmin } from '../local/roles';
import {
  ContratDonnees, ContratDonneesCles, ContratDocument, construireContrat,
  initialiserContratDepuisEmploye, LIBELLES_CHAMPS_CONTRAT, NATURES_CONTRAT,
  parseMontantContrat, validerContrat,
} from '../contrat/model';
import { telechargerContratDocx } from '../contrat/docx';
import { telechargerContratPdf } from '../contrat/pdf';
import logoContrat from '../assets/logo-contrat-salfa.png?inline';
import { formatMontant } from '../local/montants';

interface Props {
  employes: Employe[];
  initialEmployeId?: number | null;
  userRole?: string | null;
  onClose: () => void;
}

const inputCls = 'w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm focus:ring-2 focus:ring-salfa-sky outline-none';
const labelCls = 'block text-[11px] font-bold uppercase mb-1 text-slate-600 dark:text-slate-300';

function Section({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/30 p-3 sm:p-4 space-y-3">
      <h4 className="text-xs font-extrabold uppercase tracking-wide text-salfa-dark dark:text-sky-300">{titre}</h4>
      {children}
    </section>
  );
}

export const ContratApercu: React.FC<{ contrat: ContratDocument }> = ({ contrat }) => (
  <article className="contrat-sheet" aria-label="Aperçu du contrat de travail">
    <header className="contrat-entete">
      <img src={logoContrat} alt="Logo SALFA" className="contrat-logo" />
      <div className="contrat-entete-texte">
        <strong>FIANGONANA LOTERANA MALAGASY</strong>
        <span>(EGLISE LUTHERIENNE MALGACHE - MALAGASY LUTHERAN CHURCH)</span>
        <strong>SAMPAN’ASA LOTERANA MOMBA NY FAHASALAMANA</strong>
        <span>DEPARTEMENT DE SANTE – HEALTH DEPARTMENT — SALFA</span>
        <span>DISPENSAIRE TANAMBAO - TOBY BETELA TOLIARA BP: 99 Tél:94 416 56</span>
        <span>NIF: 5000767080 — STAT: 851 125 120 120 001 36</span>
        <span>E-mail: salfa.tulear@moov.mg</span>
      </div>
    </header>

    {contrat.blocs.map((bloc, i) => {
      switch (bloc.type) {
        case 'titre':
          return <h2 key={i} className="contrat-titre">{bloc.texte}</h2>;
        case 'mention':
          return <p key={i} className="contrat-mention">{bloc.texte}</p>;
        case 'paragraphe':
          return <p key={i} className="contrat-paragraphe">{bloc.texte}</p>;
        case 'champ':
          return (
            <p key={i} className="contrat-champ">
              <strong>{bloc.label}</strong>{' '}
              <span className={bloc.manquant ? 'contrat-manquant' : undefined}>{bloc.valeur}</span>
            </p>
          );
        case 'article':
          return (
            <div key={i} className="contrat-article">
              <h3>Article {bloc.numero} : {bloc.titre}</h3>
              {bloc.valeur && <p className={bloc.manquant ? 'contrat-manquant' : undefined}>{bloc.valeur}</p>}
            </div>
          );
        case 'signature':
          return (
            <div key={i} className="contrat-signature-bloc">
              <p>Fait à {bloc.lieu}, le {bloc.date}.</p>
              <div className="contrat-signature">
                <div>
                  <strong>L’employé(e)</strong>
                  <div className="contrat-signature-espace" />
                </div>
                <div>
                  <strong>L’employeur</strong>
                  <p>{bloc.representant}</p>
                  <div className="contrat-signature-espace" />
                </div>
              </div>
              <p className="contrat-signature-mention">(Mentions manuscrites : “Lu et approuvé”, date, signature et nom)</p>
            </div>
          );
        default:
          return null;
      }
    })}
  </article>
);

const ContratTravailModalInner: React.FC<Props> = ({ employes, initialEmployeId, onClose }) => {
  const tries = useMemo(
    () => [...employes].sort((a, b) => Number(a.numero_matricule) - Number(b.numero_matricule)),
    [employes]
  );
  const premierId = initialEmployeId ?? tries[0]?.id ?? null;
  const [selectedId, setSelectedId] = useState<number | null>(premierId);
  const [drafts, setDrafts] = useState<Record<number, ContratDonnees>>(() => {
    const emp = tries.find(e => Number(e.id) === Number(premierId));
    return emp ? { [emp.id]: initialiserContratDepuisEmploye(emp) } : {};
  });
  const [dirtyIds, setDirtyIds] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<'pdf' | 'docx' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<'saisie' | 'apercu'>('saisie');

  const emp = tries.find(e => Number(e.id) === Number(selectedId)) || null;
  const donnees = emp ? drafts[emp.id] || initialiserContratDepuisEmploye(emp) : null;
  const contrat = useMemo(() => donnees ? construireContrat(donnees) : null, [donnees]);
  const validation = contrat?.validation || validerContrat(initialiserContratDepuisEmploye({} as Employe));
  const peutExporter = Boolean(emp && contrat && validation.erreurs.length === 0);

  const fermer = () => {
    if (dirtyIds.size > 0 && !window.confirm(
      'Des compléments de contrat n’ont pas été téléchargés. Ils ne sont pas enregistrés dans la fiche salarié. Fermer quand même ?'
    )) return;
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') fermer(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirtyIds]);

  const choisir = (id: number) => {
    setSelectedId(id);
    setError(null);
    setDrafts(prev => {
      if (prev[id]) return prev;
      const e = tries.find(x => Number(x.id) === id);
      return e ? { ...prev, [id]: initialiserContratDepuisEmploye(e) } : prev;
    });
  };

  const maj = (cle: ContratDonneesCles, valeur: string) => {
    if (!emp) return;
    setDrafts(prev => ({
      ...prev,
      [emp.id]: { ...(prev[emp.id] || initialiserContratDepuisEmploye(emp)), [cle]: valeur },
    }));
    setDirtyIds(prev => new Set(prev).add(emp.id));
    setError(null);
  };

  const reinitialiser = () => {
    if (!emp) return;
    if (!window.confirm('Reprendre uniquement les informations de la fiche salarié pour ce contrat ?')) return;
    setDrafts(prev => ({ ...prev, [emp.id]: initialiserContratDepuisEmploye(emp) }));
    setDirtyIds(prev => { const n = new Set(prev); n.delete(emp.id); return n; });
  };

  const imprimer = () => {
    if (!peutExporter) return;
    flushSync(() => setMobileTab('apercu'));
    window.requestAnimationFrame(() => window.print());
  };

  const exporter = async (format: 'pdf' | 'docx') => {
    if (!emp || !contrat || !peutExporter) return;
    setBusy(format);
    setError(null);
    try {
      if (format === 'pdf') await telechargerContratPdf(emp, contrat);
      else await telechargerContratDocx(emp, contrat);
    } catch (e: any) {
      setError(e?.message || 'Export impossible. Réessayez.');
    } finally {
      setBusy(null);
    }
  };

  const champ = (
    cle: ContratDonneesCles,
    label: string,
    opts: { type?: string; placeholder?: string; aide?: string; textarea?: boolean; disabled?: boolean } = {}
  ) => {
    if (!donnees) return null;
    const manquant = validation.champsManquants.includes(cle);
    const montantInvalide = ['salaire_base', 'indemnite_logement', 'indemnite_rendement', 'indemnite_responsabilite'].includes(cle)
      && parseMontantContrat(donnees[cle]) === null;
    const estMontant = ['salaire_base', 'indemnite_logement', 'indemnite_rendement', 'indemnite_responsabilite'].includes(cle);
    const cls = `${inputCls} ${estMontant ? 'text-right font-mono' : ''} ${manquant ? 'border-amber-400 dark:border-amber-500' : ''} ${montantInvalide ? 'border-red-500' : ''}`;
    return (
      <div key={cle}>
        <label htmlFor={`contrat-${cle}`} className={labelCls}>{label}</label>
        {opts.textarea ? (
          <textarea id={`contrat-${cle}`} rows={2} value={donnees[cle]} placeholder={opts.placeholder}
            onChange={e => maj(cle, e.target.value)} className={cls} />
        ) : (
          <input id={`contrat-${cle}`} type={opts.type || 'text'} value={donnees[cle]} placeholder={opts.placeholder}
            disabled={opts.disabled} onChange={e => maj(cle, e.target.value)} className={cls}
            inputMode={opts.type === 'text' && cle.startsWith('indemnite') || cle === 'salaire_base' ? 'decimal' : undefined} />
        )}
        {opts.aide && <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{opts.aide}</p>}
        {montantInvalide && <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">Montant invalide : positif ou nul, deux décimales maximum.</p>}
      </div>
    );
  };

  return (
    <>
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-2 sm:p-4 no-print" role="dialog" aria-modal="true" aria-label="Contrat de travail">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-7xl overflow-hidden border border-slate-200 dark:border-slate-700 max-h-[96dvh] flex flex-col">
          <div className="bg-salfa-dark dark:bg-slate-900 px-4 sm:px-6 py-3 flex items-center justify-between text-white shrink-0 gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <FileSignature className="w-5 h-5 shrink-0" />
              <div className="min-w-0">
                <h3 className="text-sm sm:text-lg font-bold truncate">Contrat de travail</h3>
                <p className="text-[11px] text-slate-300 truncate">Modèle SALFA fourni — édition, aperçu et exports</p>
              </div>
            </div>
            <button type="button" onClick={fermer} className="p-1.5 rounded hover:bg-white/10 shrink-0" aria-label="Fermer">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="px-4 sm:px-6 py-3 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center gap-3 shrink-0">
            <label className="text-xs font-bold text-slate-600 dark:text-slate-300" htmlFor="contrat-salarie">Salarié</label>
            <select id="contrat-salarie" value={selectedId ?? ''} onChange={e => choisir(Number(e.target.value))}
              className={`${inputCls} max-w-md`}>
              {tries.map(e => (
                <option key={e.id} value={e.id}>
                  Mat {e.numero_matricule} — {e.nom_prenoms}{Number(e.actif) !== 1 ? ' (inactif)' : ''}
                </option>
              ))}
            </select>
            {contrat && (
              validation.complets ? (
                <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Complet
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                  <AlertTriangle className="w-3.5 h-3.5" /> Projet — {validation.champsManquants.length} champ(s) à compléter
                </span>
              )
            )}
            <div className="ml-auto flex xl:hidden rounded-lg border border-slate-300 dark:border-slate-600 overflow-hidden text-xs font-bold">
              <button type="button" onClick={() => setMobileTab('saisie')} className={`px-3 py-1.5 ${mobileTab === 'saisie' ? 'bg-salfa-dark text-white' : 'bg-white dark:bg-slate-700'}`}>Saisie</button>
              <button type="button" onClick={() => setMobileTab('apercu')} className={`px-3 py-1.5 ${mobileTab === 'apercu' ? 'bg-salfa-dark text-white' : 'bg-white dark:bg-slate-700'}`}>Aperçu</button>
            </div>
          </div>

          <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-2">
            <div className={`overflow-y-auto thin-scrollbar p-4 sm:p-6 space-y-4 ${mobileTab === 'saisie' ? '' : 'hidden xl:block'}`}>
              {!emp || !donnees || !contrat ? (
                <p className="text-sm text-slate-500">Aucun salarié disponible. Créez d’abord une fiche salarié.</p>
              ) : (
                <>
                  <div className="rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/20 p-3 text-[11px] text-sky-900 dark:text-sky-200 flex gap-2">
                    <Info className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      Les champs préremplis viennent de la fiche salarié. Les compléments saisis ici ne modifient ni la fiche ni la paie
                      et ne sont pas conservés après fermeture : téléchargez le contrat pour le garder. Vérifiez les clauses et les montants avant signature.
                    </span>
                  </div>

                  {validation.erreurs.length > 0 && (
                    <div className="rounded-xl border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/30 p-3 text-xs text-red-800 dark:text-red-200 space-y-1">
                      {validation.erreurs.map((e, i) => <p key={i}>{e}</p>)}
                    </div>
                  )}

                  <Section titre="Identité et état civil">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="contrat-civilite" className={labelCls}>Civilité</label>
                        <select id="contrat-civilite" value={donnees.civilite} onChange={e => maj('civilite', e.target.value)} className={inputCls}>
                          <option value="">Non précisée</option>
                          <option value="Mr">Mr</option>
                          <option value="Mme">Mme</option>
                          <option value="Mlle">Mlle</option>
                        </select>
                      </div>
                      {champ('nom_prenoms', 'Nom et prénoms')}
                      {champ('date_naissance', 'Date de naissance', { type: 'date' })}
                      {champ('lieu_naissance', 'Lieu de naissance')}
                      {champ('pere', 'Père')}
                      {champ('mere', 'Mère')}
                      {champ('cin', 'N° CIN')}
                      {champ('date_cin', 'CIN délivrée le', { type: 'date' })}
                      {champ('lieu_cin', 'CIN délivrée à')}
                      {champ('situation_matrimoniale', 'Situation matrimoniale', { placeholder: 'Célibataire, marié(e)…' })}
                    </div>
                    {champ('adresse', 'Adresse', { textarea: true })}
                  </Section>

                  <Section titre="Engagement">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {champ('service', 'Service d’affectation')}
                      <div>
                        <label htmlFor="contrat-nature" className={labelCls}>Nature du contrat</label>
                        <select id="contrat-nature" value={donnees.nature_contrat} onChange={e => maj('nature_contrat', e.target.value)} className={inputCls}>
                          <option value="">À compléter</option>
                          {NATURES_CONTRAT.map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </div>
                      {champ('duree_contrat', 'Durée / échéance', {
                        placeholder: donnees.nature_contrat === 'CDI' ? 'Durée indéterminée' : 'Ex. 6 mois, du … au …',
                        aide: donnees.nature_contrat === 'CDI' ? 'Laissé vide, le contrat indique « Durée indéterminée ».' : undefined,
                      })}
                      {champ('qualite', 'Qualité / fonction')}
                      {champ('lieu_embauche', 'Lieu d’embauche')}
                      {champ('lieu_travail', 'Lieu d’exécution du travail')}
                      {champ('classification', 'Classification professionnelle')}
                    </div>
                  </Section>

                  <Section titre="Rémunération mensuelle">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {champ('salaire_base', 'Salaire de base (Ar)', { placeholder: '-' })}
                      {champ('indemnite_logement', 'Indemnité de logement (Ar)', { placeholder: '-' })}
                      {champ('indemnite_rendement', 'Indemnité de rendement (Ar)', { placeholder: '-' })}
                      {champ('indemnite_responsabilite', 'Indemnité de responsabilité (Ar)', { placeholder: '-' })}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      La fiche regroupe « logement/transport » ({formatMontant(emp.logement_transport)} Ar) et
                      « responsabilité/représentation » ({formatMontant(emp.responsabilite_representation)} Ar).
                      Ces montants groupés ne sont pas copiés automatiquement dans les indemnités séparées du contrat.
                    </p>
                  </Section>

                  <Section titre="Effet et signature">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {champ('date_effet', 'Date d’effet du contrat', { type: 'date' })}
                      {champ('lieu_signature', 'Fait à')}
                      {champ('date_signature', 'Date de signature', { type: 'date' })}
                      {champ('representant', 'Représentant de l’employeur')}
                    </div>
                    {emp.date_embauche && (
                      <button type="button" onClick={() => maj('date_effet', String(emp.date_embauche).slice(0, 10))}
                        className="text-xs font-semibold text-salfa-teal dark:text-sky-300 hover:underline">
                        Utiliser la date d’embauche de la fiche ({String(emp.date_embauche).slice(0, 10)})
                      </button>
                    )}
                  </Section>

                  {validation.champsManquants.length > 0 && (
                    <details className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 text-xs text-amber-900 dark:text-amber-200">
                      <summary className="font-bold cursor-pointer">Champs restant à compléter</summary>
                      <ul className="mt-2 list-disc pl-5 space-y-0.5">
                        {validation.champsManquants.map(c => <li key={c}>{LIBELLES_CHAMPS_CONTRAT[c]}</li>)}
                      </ul>
                    </details>
                  )}

                  <button type="button" onClick={reinitialiser}
                    className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:underline">
                    <RotateCcw className="w-3.5 h-3.5" /> Reprendre la fiche salarié
                  </button>
                </>
              )}
            </div>

            <div className={`overflow-y-auto thin-scrollbar bg-slate-200/70 dark:bg-slate-950/50 p-3 sm:p-6 ${mobileTab === 'apercu' ? '' : 'hidden xl:block'}`}>
              {contrat ? <ContratApercu contrat={contrat} /> : (
                <p className="text-sm text-slate-500">Sélectionnez un salarié pour afficher le contrat.</p>
              )}
            </div>
          </div>

          <div className="px-4 sm:px-6 py-3 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center gap-2 shrink-0">
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mr-auto">
              {validation.complets ? 'Contrat complet — à vérifier avant signature.' : 'Les exports incomplets portent la mention « PROJET ».'}
            </p>
            {error && <p className="w-full text-xs text-red-600 dark:text-red-400">{error}</p>}
            <button type="button" onClick={imprimer} disabled={!peutExporter}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-sm font-bold disabled:opacity-50">
              <Printer className="w-4 h-4" /> Imprimer
            </button>
            <button type="button" onClick={() => exporter('pdf')} disabled={!peutExporter || busy !== null}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-bold disabled:opacity-50">
              <FileDown className="w-4 h-4" /> {busy === 'pdf' ? 'PDF…' : 'PDF'}
            </button>
            <button type="button" onClick={() => exporter('docx')} disabled={!peutExporter || busy !== null}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-salfa-dark hover:bg-salfa-teal text-white text-sm font-bold disabled:opacity-50">
              <FileType2 className="w-4 h-4" /> {busy === 'docx' ? 'Word…' : 'Word (.docx)'}
            </button>
          </div>
        </div>
      </div>

      {contrat && createPortal(
        <div className="contrat-print"><ContratApercu contrat={contrat} /></div>,
        document.body
      )}
    </>
  );
};

export const ContratTravailModal: React.FC<Props> = (props) => {
  if (!estRoleAdmin(props.userRole)) return null;
  return <ContratTravailModalInner {...props} />;
};

export default ContratTravailModal;
