// ==============================================================================
// MODALE - FICHE SALARIÉ (création / modification + mise en inactif avec date)
// ==============================================================================
import React, { useState, useEffect } from 'react';
import { Employe } from '../types';
import { createEmploye, updateEmploye } from '../api';
import { calculerAnciennete, obtenirIndiceAnciennete } from '../local/calcul';
import { loadConfig } from '../local/config';
import { X, Award, Info, UserX, UserCheck, UserRound, Briefcase } from 'lucide-react';
import { formatMontant, formatMontantSaisie, formatMontantEdition, parseMontantSaisie } from '../local/montants';

const fmt = (val: number | undefined | null) => formatMontant(val);
const formatInputDisplay = (val: number): string => formatMontantSaisie(val);
const parseInputNumber = (raw: string): number => parseMontantSaisie(raw);

interface MonetaryInputProps {
  value: number;
  onChange: (num: number) => void;
  className?: string;
  placeholder?: string;
}

const MonetaryInput: React.FC<MonetaryInputProps> = ({ value, onChange, className = '', placeholder = '-' }) => {
  const [text, setText] = useState<string>(() => formatInputDisplay(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(formatInputDisplay(value));
  }, [value, focused]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      onFocus={(e) => {
        setFocused(true);
        setText(formatMontantEdition(value));
        setTimeout(() => e.target.select(), 0);
      }}
      onBlur={() => {
        setFocused(false);
        const n = parseInputNumber(text);
        onChange(n);
        setText(formatInputDisplay(n));
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        onChange(parseInputNumber(raw));
      }}
      className={`${className} text-right font-mono`}
    />
  );
};

const CATEGORIES_SUGGEREES = ['1A', '1B', '2A', '2B', '3A', '3B', '4A', '4B', '5A', '5B', 'TB', 'HC'];

export interface EmployeModalFormProps {
  employe: Employe | null;
  duplication?: { source: Employe; valeurs: Partial<Employe> };
  periodeActive?: { annee: number; mois: string };
  categoriesExistantes?: string[];
  onClose: () => void;
  onSaved: () => void;
}

export const EmployeModalForm: React.FC<EmployeModalFormProps> = ({
  employe,
  duplication,
  periodeActive,
  categoriesExistantes = [],
  onClose,
  onSaved,
}) => {
  const todayIso = () => new Date().toISOString().slice(0, 10);
  const valeurs = employe ?? duplication?.valeurs;
  const [form, setForm] = useState({
    numero_matricule: valeurs?.numero_matricule || '',
    nom_prenoms: String(valeurs?.nom_prenoms || '').toLocaleUpperCase('fr-FR'),
    numero_cnaps: valeurs?.numero_cnaps || '',
    categorie: valeurs?.categorie || '',
    jobs: valeurs?.jobs || '',
    date_embauche: valeurs?.date_embauche || '',
    enfant_a_charge: valeurs?.enfant_a_charge || 0,
    base_aj: valeurs?.base_aj || 0,
    logement_transport: valeurs?.logement_transport || 0,
    rendement: valeurs?.rendement || 0,
    responsabilite_representation: valeurs?.responsabilite_representation || 0,
    rib: valeurs?.rib || '',
    mode_paiement: valeurs?.mode_paiement || 'ESPECES',
    conge_maternite: valeurs ? (valeurs.conge_maternite === 1 || valeurs.conge_maternite === true) : false,
    date_debut_maternite: valeurs?.date_debut_maternite || '',
    actif: valeurs ? (Number(valeurs.actif) === 1 ? 1 : 0) : 1,
    date_inactif: valeurs?.date_inactif || '',
    genre: valeurs?.genre || '',
    date_naissance: valeurs?.date_naissance || '',
    lieu_naissance: valeurs?.lieu_naissance || '',
    pere: valeurs?.pere || '',
    mere: valeurs?.mere || '',
    cin: valeurs?.cin || '',
    date_cin: valeurs?.date_cin || '',
    lieu_cin: valeurs?.lieu_cin || '',
    situation_matrimoniale: valeurs?.situation_matrimoniale || '',
    adresse: valeurs?.adresse || '',
    service: valeurs?.service || '',
    diplome: valeurs?.diplome || '',
    etablissement: valeurs?.etablissement || '',
    statut: valeurs?.statut || '',
    numero_ordre: valeurs?.numero_ordre || '',
    nature_contrat: valeurs?.nature_contrat || '',
    duree_contrat: valeurs?.duree_contrat || '',
    lieu_embauche: valeurs?.lieu_embauche || '',
    lieu_travail: valeurs?.lieu_travail || '',
    date_effet: valeurs?.date_effet || '',
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const listeCategories = Array.from(
    new Set(
      [...categoriesExistantes, ...CATEGORIES_SUGGEREES]
        .map((c) => String(c || '').trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));

  const ancYears = calculerAnciennete(form.date_embauche);
  const cfg = loadConfig();
  const indice = obtenirIndiceAnciennete(ancYears);
  const baseReval = Math.round(Number(form.base_aj || 0) * indice * 100) / 100;
  const baseBruteNormale =
    Number(form.base_aj || 0) +
    Number(form.logement_transport || 0) +
    Number(form.rendement || 0) +
    Number(form.responsabilite_representation || 0);
  const baseBrutAffichee = form.conge_maternite ? baseBruteNormale * cfg.tauxMaternite / 100 : baseBruteNormale;

  const MOIS_LIB = ['JANVIER', 'FEVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN', 'JUILLET', 'AOUT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DECEMBRE'];
  const periodeMaternite = (() => {
    if (!form.conge_maternite || !form.date_debut_maternite) return null;
    const parts = String(form.date_debut_maternite).split('-');
    if (parts.length < 2) return null;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    if (!y || m < 0) return null;
    const debut = MOIS_LIB[m] + ' ' + y;
    const finIdx = y * 12 + m + cfg.dureeMaterniteMois - 1;
    const fin = MOIS_LIB[finIdx % 12] + ' ' + Math.floor(finIdx / 12);
    return { debut, fin };
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      const estInactif = Number(form.actif) === 0;
      const dataToSend: Partial<Employe> = {
        ...form,
        numero_matricule: Number(form.numero_matricule),
        nom_prenoms: String(form.nom_prenoms || '').trim().toLocaleUpperCase('fr-FR'),
        numero_cnaps: String(form.numero_cnaps || '').trim(),
        categorie: String(form.categorie || '').trim(),
        jobs: String(form.jobs || '').trim(),
        date_embauche: String(form.date_embauche || '').trim(),
        rib: String(form.rib || '').trim(),
        base_aj: Number(form.base_aj),
        logement_transport: Number(form.logement_transport),
        rendement: Number(form.rendement),
        responsabilite_representation: Number(form.responsabilite_representation),
        enfant_a_charge: Number(form.enfant_a_charge),
        conge_maternite: form.conge_maternite ? 1 : 0,
        actif: estInactif ? 0 : 1,
        date_inactif: estInactif ? (form.date_inactif || todayIso()) : '',
      };
      let ok = false;
      if (employe) ok = await updateEmploye(employe.id, dataToSend, periodeActive);
      else ok = await createEmploye(dataToSend);
      setSaving(false);
      if (ok) onSaved();
      else setFormError("Enregistrement refusé : vérifiez que le N° Matricule est valide et n'est pas déjà attribué à un autre salarié.");
    } catch (err: any) {
      setSaving(false);
      setFormError(err?.message || "Erreur lors de l'enregistrement en base de données.");
    }
  };

  const estInactif = Number(form.actif) === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden border border-slate-200 dark:border-slate-700 modal-mobile max-h-[95dvh] flex flex-col">
        <div className="bg-salfa-dark dark:bg-slate-900 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between text-white shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-sm sm:text-lg font-bold truncate">
              {employe ? `Modifier les informations — Mat ${employe.numero_matricule}` : duplication ? 'Modifier la copie — Étape 2 sur 2' : 'Nouveau Salarié'}
            </h3>
            {employe && (
              <span
                className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full shrink-0 ${
                  estInactif ? 'bg-red-500 text-white' : 'bg-emerald-500 text-white'
                }`}
              >
                {estInactif ? 'Inactif' : 'Actif'}
              </span>
            )}
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-white/10 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto thin-scrollbar">
          {duplication && (
            <div className="rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/20 p-3 text-xs text-sky-900 dark:text-sky-200">
              <b>Copie de {duplication.source.numero_matricule} — {duplication.source.nom_prenoms}.</b>{' '}
              Modifiez les informations pour le nouveau salarié avant d’enregistrer. Le matricule proposé est modifiable.
              Le nom, la CNaPS, la CIN et le RIB sont à renseigner ; le statut est remis à actif, hors maternité.
              Vérifiez les autres données copiées, notamment l’état civil, les dates, le mode de paiement et les montants.
              Aucun historique de paie ni de congés n’est copié. Annuler n’ajoute aucune fiche.
            </div>
          )}
          {formError && (
            <div className="rounded-xl border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/30 px-3.5 py-2.5 text-xs font-semibold text-red-800 dark:text-red-200">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {[
              { label: 'N° Matricule *', key: 'numero_matricule', type: 'number', required: true },
              { label: 'NOM ET PRENOMS *', key: 'nom_prenoms', type: 'text', required: true },
              { label: 'N° CNaPS', key: 'numero_cnaps', type: 'text' },
              { label: 'Catégorie (Classification)', key: 'categorie', type: 'text', isCategorie: true },
              { label: 'Fonction (JOBS)', key: 'jobs', type: 'text' },
              { label: 'Date embauche', key: 'date_embauche', type: 'text' },
              { label: 'Enfants à charge', key: 'enfant_a_charge', type: 'number' },
            ].map((f: any) => (
              <div key={f.key}>
                <label className="block text-xs font-bold uppercase mb-1 dark:text-slate-300">{f.label}</label>
                <input
                  type={f.type}
                  list={f.isCategorie ? 'salfa-categories-datalist' : undefined}
                  placeholder={f.isCategorie ? 'Ex: 2B, 3A, HC ou nouvelle catégorie…' : undefined}
                  value={(form as any)[f.key]}
                  onChange={(e) => setForm({
                    ...form,
                    [f.key]: f.type === 'number'
                      ? Number(e.target.value)
                      : f.key === 'nom_prenoms'
                        ? e.target.value.toLocaleUpperCase('fr-FR')
                        : e.target.value,
                  })}
                  required={!!f.required}
                  className={`w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm ${f.key === 'nom_prenoms' ? 'uppercase' : ''}`}
                />
                {f.isCategorie && (
                  <>
                    <datalist id="salfa-categories-datalist">
                      {listeCategories.map((cat) => (
                        <option key={cat} value={cat} />
                      ))}
                    </datalist>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {listeCategories.map((cat) => {
                        const selected = String(form.categorie || '').trim().toUpperCase() === cat.toUpperCase();
                        return (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setForm({ ...form, categorie: cat })}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition ${
                              selected
                                ? 'bg-salfa-dark text-white border-salfa-dark'
                                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-600'
                            }`}
                          >
                            {cat}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            ))}
            <div>
              <label className="block text-xs font-bold uppercase mb-1 dark:text-slate-300">Mode règlement par défaut</label>
              <select
                value={form.mode_paiement}
                onChange={(e) => setForm({ ...form, mode_paiement: e.target.value })}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm"
              >
                <option value="ESPECES">ESPECES</option>
                <option value="VIREMENT">VIREMENT</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold mb-1 dark:text-slate-300">Base</label>
              <MonetaryInput
                value={form.base_aj}
                onChange={(numVal) => setForm({ ...form, base_aj: numVal })}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase mb-1 dark:text-slate-300">Logt/Trsp</label>
              <MonetaryInput
                value={form.logement_transport}
                onChange={(numVal) => setForm({ ...form, logement_transport: numVal })}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase mb-1 dark:text-slate-300">Prime Rendement</label>
              <MonetaryInput
                value={form.rendement}
                onChange={(numVal) => setForm({ ...form, rendement: numVal })}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase mb-1 dark:text-slate-300">RESP REPRES</label>
              <MonetaryInput
                value={form.responsabilite_representation}
                onChange={(numVal) => setForm({ ...form, responsabilite_representation: numVal })}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase mb-1 dark:text-slate-300">RIB</label>
            <input
              type="text"
              value={form.rib}
              onChange={(e) => setForm({ ...form, rib: e.target.value })}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm font-mono"
            />
          </div>

          <details className="rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/30 p-3 sm:p-4" open={!!employe}>
            <summary className="cursor-pointer text-xs font-extrabold uppercase text-salfa-dark dark:text-sky-300 flex items-center gap-2">
              <UserRound className="w-4 h-4" /> État civil et coordonnées
            </summary>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <div>
                <label className="block text-xs font-bold uppercase mb-1 dark:text-slate-300">Genre</label>
                <select value={form.genre} onChange={(e) => setForm({ ...form, genre: e.target.value })} className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm">
                  <option value="">Non précisé</option>
                  <option value="Masculin">Masculin</option>
                  <option value="Féminin">Féminin</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase mb-1 dark:text-slate-300">Date de naissance</label>
                <input type="date" value={form.date_naissance} onChange={(e) => setForm({ ...form, date_naissance: e.target.value })} className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm" />
              </div>
              {([
                ['lieu_naissance', 'Lieu de naissance'],
                ['pere', 'Père'],
                ['mere', 'Mère'],
                ['cin', 'N° CIN'],
                ['lieu_cin', 'Lieu de délivrance CIN'],
                ['situation_matrimoniale', 'Situation matrimoniale'],
              ] as const).map(([key, label]) => (
                <div key={key}>
                  <label className="block text-xs font-bold uppercase mb-1 dark:text-slate-300">{label}</label>
                  <input type="text" value={(form as any)[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm" />
                </div>
              ))}
              <div>
                <label className="block text-xs font-bold uppercase mb-1 dark:text-slate-300">Date de délivrance CIN</label>
                <input type="date" value={form.date_cin} onChange={(e) => setForm({ ...form, date_cin: e.target.value })} className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold uppercase mb-1 dark:text-slate-300">Adresse</label>
                <textarea value={form.adresse} onChange={(e) => setForm({ ...form, adresse: e.target.value })} rows={2} className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm" />
              </div>
            </div>
          </details>

          <details className="rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/30 p-3 sm:p-4" open={!!employe}>
            <summary className="cursor-pointer text-xs font-extrabold uppercase text-salfa-dark dark:text-sky-300 flex items-center gap-2">
              <Briefcase className="w-4 h-4" /> Affectation, diplôme et contrat
            </summary>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              {([
                ['service', 'Service d’affectation'],
                ['diplome', 'Diplôme'],
                ['etablissement', 'Établissement'],
                ['statut', 'Statut'],
                ['numero_ordre', 'N° ordre'],
                ['duree_contrat', 'Durée du contrat'],
                ['lieu_embauche', 'Lieu d’embauche'],
                ['lieu_travail', 'Lieu de travail'],
              ] as const).map(([key, label]) => (
                <div key={key}>
                  <label className="block text-xs font-bold uppercase mb-1 dark:text-slate-300">{label}</label>
                  <input type="text" value={(form as any)[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm" />
                </div>
              ))}
              <div>
                <label className="block text-xs font-bold uppercase mb-1 dark:text-slate-300">Nature du contrat</label>
                <select value={form.nature_contrat} onChange={(e) => setForm({ ...form, nature_contrat: e.target.value })} className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm">
                  <option value="">Non précisée</option>
                  <option value="CDI">CDI</option>
                  <option value="CDD">CDD</option>
                  <option value="Autre">Autre</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase mb-1 dark:text-slate-300">Date d’effet du contrat</label>
                <input type="date" value={form.date_effet} onChange={(e) => setForm({ ...form, date_effet: e.target.value })} className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm" />
              </div>
            </div>
          </details>

          {/* OPTION : RENDRE LA PERSONNE INACTIVE (MODIFICATION DE LA FICHE SALARIÉ) */}
          {employe && (
            <div
              className={`p-3 sm:p-4 rounded-xl border-2 space-y-3 transition ${
                estInactif
                  ? 'bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-800'
                  : 'bg-slate-50 dark:bg-slate-700/40 border-slate-200 dark:border-slate-600'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-start gap-3 cursor-pointer flex-1">
                  <input
                    type="checkbox"
                    checked={estInactif}
                    onChange={(e) => {
                      const inactif = e.target.checked;
                      setForm({
                        ...form,
                        actif: inactif ? 0 : 1,
                        date_inactif: inactif ? (form.date_inactif || todayIso()) : '',
                      });
                    }}
                    className="mt-0.5 rounded text-red-600 w-4 h-4"
                  />
                  <div className="text-xs">
                    <span className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                      {estInactif ? (
                        <UserX className="w-4 h-4 text-red-600 dark:text-red-400" />
                      ) : (
                        <UserCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      )}
                      Rendre cette personne inactive
                    </span>
                    <span className="text-slate-600 dark:text-slate-400 block mt-0.5">
                      {estInactif
                        ? 'Ce salarié est marqué comme inactif et figure dans Administration → Personnes inactives.'
                        : 'Cochez cette option pour retirer ce salarié des prochains états de paie et enregistrer sa date de mise en inactif.'}
                    </span>
                  </div>
                </label>
              </div>

              {estInactif && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-7">
                  <div>
                    <label className="block text-[11px] font-bold uppercase mb-1 text-red-900 dark:text-red-300">
                      Date de mise en inactif *
                    </label>
                    <input
                      type="date"
                      required
                      value={form.date_inactif}
                      onChange={(e) => setForm({ ...form, date_inactif: e.target.value })}
                      className="w-full rounded-lg border border-red-300 dark:border-red-700 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm font-mono"
                    />
                  </div>
                  <div className="flex items-end">
                    <div className="w-full rounded-lg bg-white/80 dark:bg-slate-800/70 border border-red-200 dark:border-red-800 px-3 py-2 text-[11px] text-red-900 dark:text-red-200">
                      Consultable à tout moment dans le sous-menu <b>Administration → Personnes inactives</b>.
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="p-3 sm:p-4 rounded-xl bg-pink-50 dark:bg-pink-900/20 border-2 border-pink-200 dark:border-pink-800 space-y-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.conge_maternite}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setForm({
                    ...form,
                    conge_maternite: checked,
                    date_debut_maternite: checked ? (form.date_debut_maternite || todayIso()) : '',
                  });
                }}
                className="mt-0.5 rounded text-pink-600 w-4 h-4"
              />
              <div className="text-xs">
                <span className="font-extrabold text-pink-900 dark:text-pink-300 block">
                  Congé de Maternité ({cfg.dureeMaterniteMois} mois — base brute à {cfg.tauxMaternite}%)
                </span>
                <span className="text-slate-600 dark:text-slate-400 block">
                  La personne est <b>mise en évidence</b> et sa base brute passe à{' '}
                  <b className="text-pink-800 dark:text-pink-300 font-mono">{fmt(baseBrutAffichee)}</b> au lieu de{' '}
                  {fmt(baseBruteNormale)} pendant la durée du congé.
                </span>
              </div>
            </label>
            {form.conge_maternite && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-7">
                <div>
                  <label className="block text-[11px] font-bold uppercase mb-1 text-pink-900 dark:text-pink-300">
                    Date de début du congé
                  </label>
                  <input
                    type="date"
                    value={form.date_debut_maternite}
                    onChange={(e) => setForm({ ...form, date_debut_maternite: e.target.value })}
                    className="w-full rounded-lg border border-pink-300 dark:border-pink-700 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex items-end">
                  <div className="w-full rounded-lg bg-white/70 dark:bg-slate-800/60 border border-pink-200 dark:border-pink-800 px-3 py-2 text-[11px] text-pink-900 dark:text-pink-200">
                    <b>Durée :</b> {cfg.dureeMaterniteMois} mois (mois du début inclus).
                    {periodeMaternite && (
                      <div className="mt-0.5 font-mono">
                        Période : <b>{periodeMaternite.debut}</b> → <b>{periodeMaternite.fin}</b>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="p-3 sm:p-4 rounded-xl bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 text-xs space-y-1 dark:text-slate-300">
            <div className="font-bold text-salfa-teal dark:text-sky-300 flex items-center gap-1.5">
              <Award className="w-4 h-4" />
              <span>Ancienneté :</span>
            </div>
            <div>
              Ancienneté : <b>{ancYears} ans</b> | Indice : <b>x{indice.toFixed(2)}</b>
            </div>
            <div className="text-[11px]">L’ancienneté augmente au mois anniversaire de l’embauche.</div>
            <div>
              Base revalorisée : <b className="text-sm">{fmt(baseReval)}</b>
            </div>
          </div>

          {!employe && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-300">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Après l’enregistrement, un bulletin est généré si le mois affiché est déjà initialisé et non clôturé. Sinon, il faudra initialiser le mois ou ajouter les salariés manquants.
              </span>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-3 border-t dark:border-slate-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:text-slate-200 text-sm font-semibold"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 rounded-lg bg-salfa-dark dark:bg-slate-600 hover:bg-salfa-teal text-white text-sm font-bold shadow"
            >
              {saving ? '...' : duplication ? 'Enregistrer le nouveau salarié' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EmployeModalForm;
