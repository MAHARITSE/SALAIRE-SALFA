import { YearSelect, YearProps } from '../YearSelect';
// ==============================================================================
// ONGLET « ÉTAT DE PAIE » — REPRODUCTION FIDÈLE DU CLASSEUR EXCEL SALFA
// Toutes les colonnes de l'état mensuel : identification, salaire de base,
// charges (CNaPS / IRSA), accessoires, retenues et règlement + ligne TOTAUX.
// Impression A4 paysage en deux parties et export Excel au même format.
// ==============================================================================
import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { PaieMensuelle, TotauxMois } from '../../types';
import { fetchPaiesMois, fetchPeriodes, initMoisPaie } from '../../api';
import {
  Calendar, Printer, FileSpreadsheet, Search, RefreshCw, Users, Lock, Unlock,
  AlertCircle, Download,
} from 'lucide-react';

const MOIS_LISTE = [
  'JANVIER', 'FEVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN',
  'JUILLET', 'AOUT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DECEMBRE',
];

// ------------------------------------------------------------------------------
// Définition des colonnes (ordre identique au classeur Excel)
// ------------------------------------------------------------------------------
type Align = 'left' | 'right' | 'center';

interface ColDef {
  key: string;
  label: string;
  width: number;
  align: Align;
  money?: boolean;
  group: number;
  value: (p: PaieMensuelle, index: number) => number | string;
}

const GROUPES = [
  { nom: 'IDENTIFICATION DU SALARIÉ', couleur: 'bg-slate-700 dark:bg-slate-900' },
  { nom: 'SALAIRE DE BASE', couleur: 'bg-sky-800 dark:bg-sky-900' },
  { nom: 'COTISATIONS & IMPÔT', couleur: 'bg-indigo-800 dark:bg-indigo-900' },
  { nom: 'ACCESSOIRES', couleur: 'bg-teal-800 dark:bg-teal-900' },
  { nom: 'RETENUES & RÈGLEMENT', couleur: 'bg-emerald-800 dark:bg-emerald-900' },
];

const num = (v: any): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const COLONNES: ColDef[] = [
  // 0 — Identification
  { key: 'mat', label: 'MAT', width: 60, align: 'center', group: 0, value: (p) => num(p.numero_matricule) },
  { key: 'nom', label: 'NOM ET PRÉNOMS', width: 230, align: 'left', group: 0, value: (p) => p.nom_prenoms || '' },
  { key: 'cnaps', label: 'N° CNAPS', width: 105, align: 'center', group: 0, value: (p) => p.numero_cnaps || '' },
  { key: 'cat', label: 'CAT', width: 52, align: 'center', group: 0, value: (p) => p.categorie || '' },
  { key: 'job', label: 'JOB', width: 140, align: 'left', group: 0, value: (p) => p.jobs || '' },
  { key: 'dateEmb', label: 'DATE EMB.', width: 88, align: 'center', group: 0, value: (p) => p.date_embauche || '' },
  { key: 'annees', label: 'ANNÉE', width: 58, align: 'center', group: 0, value: (p) => num(p.nombre_annees) },
  { key: 'enfants', label: 'ENFANT', width: 58, align: 'center', group: 0, value: (p) => num(p.enfant_a_charge) },

  // 1 — Salaire de base
  { key: 'base_aj', label: 'BASE AJ', width: 100, align: 'right', money: true, group: 1, value: (p) => num(p.base_aj) },
  { key: 'logt_trsp', label: 'LOGT/TRSP', width: 95, align: 'right', money: true, group: 1, value: (p) => num(p.logt_trsp) },
  { key: 'rendement', label: 'RENDEMENT', width: 95, align: 'right', money: true, group: 1, value: (p) => num(p.rendement) },
  { key: 'resp_repres', label: 'RESP/REPRES', width: 100, align: 'right', money: true, group: 1, value: (p) => num(p.resp_repres) },

  // 2 — Cotisations & impôt
  { key: 'salaire_brut', label: 'SALAIRE BRUT', width: 105, align: 'right', money: true, group: 2, value: (p) => num(p.salaire_brut) },
  { key: 'cnaps_sal', label: 'CNaPS', width: 82, align: 'right', money: true, group: 2, value: (p) => num(p.cnaps) },
  { key: 'patronal', label: 'PATRONAL', width: 88, align: 'right', money: true, group: 2, value: (p) => num(p.patronal) },
  { key: 'imposable', label: 'SAL. IMPOSABLE', width: 110, align: 'right', money: true, group: 2, value: (p) => num(p.salaire_imposable) },
  { key: 'irsa', label: 'IRSA', width: 85, align: 'right', money: true, group: 2, value: (p) => num(p.irsa) },
  { key: 'salaire_net', label: 'SALAIRE NET', width: 105, align: 'right', money: true, group: 2, value: (p) => num(p.salaire_net) },

  // 3 — Accessoires
  { key: 'augmentation_divers', label: 'AUGM. DIVERS', width: 95, align: 'right', money: true, group: 3, value: (p) => num(p.augmentation_divers) },
  { key: 'prime_de_garde', label: 'PRIME GARDE', width: 95, align: 'right', money: true, group: 3, value: (p) => num(p.prime_de_garde) },
  { key: 'anciennete2', label: 'ANC 2', width: 78, align: 'right', money: true, group: 3, value: (p) => num(p.anciennete2) },
  { key: 'risque', label: 'RISQUE', width: 80, align: 'right', money: true, group: 3, value: (p) => num(p.risque) },
  { key: 'repr_rec', label: 'REPR/REC', width: 85, align: 'right', money: true, group: 3, value: (p) => num(p.repr_rec) },
  { key: 'accessoir', label: 'ACCESSOIR', width: 95, align: 'right', money: true, group: 3, value: (p) => num(p.accessoir) },
  { key: 'brut', label: 'BRUT', width: 100, align: 'right', money: true, group: 3, value: (p) => num(p.brut) },

  // 4 — Retenues & règlement
  { key: 'avance', label: 'AVANCE', width: 90, align: 'right', money: true, group: 4, value: (p) => num(p.avance) },
  { key: 'med', label: 'MED', width: 85, align: 'right', money: true, group: 4, value: (p) => num(p.med) },
  { key: 'net', label: 'NET À PAYER', width: 110, align: 'right', money: true, group: 4, value: (p) => num(p.net) },
  { key: 'virement', label: 'VIREMENT', width: 100, align: 'right', money: true, group: 4, value: (p) => (p.virement === null || p.virement === undefined ? 0 : num(p.virement)) },
  { key: 'especes', label: 'ESPÈCES', width: 100, align: 'right', money: true, group: 4, value: (p) => (p.especes === null || p.especes === undefined ? 0 : num(p.especes)) },
  { key: 'rap', label: 'RAP', width: 48, align: 'center', group: 4, value: (p) => (num(p.rap) ? 'X' : '') },
  { key: 'rib', label: 'RIB', width: 180, align: 'left', group: 4, value: (p) => p.rib || '' },
];

const fmt = (v: number): string =>
  Number(v || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Colonnes gelées à gauche
const STICKY_KEYS = ['mat', 'nom'];

export const EtatTab: React.FC<YearProps> = ({ annee, setAnnee }) => {
  const now = new Date();
  const [periodes, setPeriodes] = useState<{ annee: number; mois: string; nb: number }[]>([]);
  const [mois, setMois] = useState(MOIS_LISTE[now.getMonth()]);
  const [paies, setPaies] = useState<PaieMensuelle[]>([]);
  const [totaux, setTotaux] = useState<TotauxMois>({});
  const [verrouille, setVerrouille] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const chargerPeriodes = async () => {
    const list = await fetchPeriodes();
    setPeriodes(list);
    return list;
  };

  const charger = async (a = annee, m = mois) => {
    setLoading(true);
    const d = await fetchPaiesMois(a, m);
    setPaies(d.employes || []);
    setTotaux(d.totaux || {});
    setVerrouille(!!d.verrouille);
    setLoading(false);
  };

  useEffect(() => { chargerPeriodes(); }, []);
  useEffect(() => { charger(annee, mois); }, [annee, mois]);

  const q = search.trim().toLowerCase();
  const lignes = useMemo(
    () =>
      paies.filter(
        (p) =>
          !q ||
          String(p.nom_prenoms || '').toLowerCase().includes(q) ||
          String(p.jobs || '').toLowerCase().includes(q) ||
          String(p.categorie || '').toLowerCase().includes(q) ||
          String(p.numero_matricule || '').includes(q)
      ),
    [paies, q]
  );

  // Totaux recalculés sur les lignes affichées
  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    for (const c of COLONNES) {
      if (!c.money) continue;
      t[c.key] = lignes.reduce((s, p, i) => s + Number(c.value(p, i) || 0), 0);
    }
    return t;
  }, [lignes]);

  const handleInit = async () => {
    if (verrouille) return;
    if (!window.confirm(`Créer les bulletins manquants des salariés actifs pour ${mois} ${annee} ?`)) return;
    const res = await initMoisPaie(annee, mois);
    alert(`${res.initializedCount} bulletin(s) créé(s).`);
    await chargerPeriodes();
    await charger();
  };

  // ---------------------------------------------------------------- Export Excel
  const exportExcel = () => {
    const titre = [
      ['FIANGONANA LOTERANA MALAGASY — SALFA'],
      ['DISPENSAIRE TANAMBAO - TOBY BETELA TOLIARA'],
      [`ÉTAT DE PAIE — MOIS DE ${mois} ${annee}`],
      [],
    ];

    const ligneGroupe: any[] = [];
    const ligneEntete: any[] = [];
    GROUPES.forEach((g, gi) => {
      const cols = COLONNES.filter((c) => c.group === gi);
      ligneGroupe.push(g.nom);
      for (let i = 1; i < cols.length; i++) ligneGroupe.push('');
      cols.forEach((c) => ligneEntete.push(c.label));
    });

    const corps = lignes.map((p, i) => COLONNES.map((c) => c.value(p, i)));
    const totalLigne = COLONNES.map((c, i) => i === 0 ? 'TOTAUX' : (c.money ? Math.round((totals[c.key] || 0) * 100) / 100 : ''));

    const aoa = [...titre, ligneGroupe, ligneEntete, ...corps, totalLigne];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = COLONNES.map((c) => ({ wch: Math.max(8, Math.round(c.width / 7)) }));
    ws['!merges'] = (() => {
      const merges: XLSX.Range[] = [];
      let col = 0;
      GROUPES.forEach((_g, gi) => {
        const nb = COLONNES.filter((c) => c.group === gi).length;
        merges.push({ s: { r: 4, c: col }, e: { r: 4, c: col + nb - 1 } });
        col += nb;
      });
      merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: COLONNES.length - 1 } });
      merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: COLONNES.length - 1 } });
      merges.push({ s: { r: 2, c: 0 }, e: { r: 2, c: COLONNES.length - 1 } });
      return merges;
    })();

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `ETAT_${mois}_${annee}`.replace(/[\\/?*[\]:]/g, '-').slice(0, 31));
    XLSX.writeFile(wb, `ETAT_PAIE_SALFA_${mois}_${annee}.xlsx`);
  };

  const imprimer = () => window.print();

  return (
    <div className="space-y-3 w-full max-w-full etat-page-root">
      {/* Barre d'outils */}
      <div className="bg-white dark:bg-slate-800 p-3 sm:p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col gap-3 no-print">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-salfa-teal dark:text-sky-300" />
            <span className="text-[11px] sm:text-xs font-bold uppercase text-slate-700 dark:text-slate-300">Période :</span>
            <select value={mois} onChange={(e) => setMois(e.target.value)} className="rounded-lg border dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-bold">
              {MOIS_LISTE.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <YearSelect annee={annee} setAnnee={setAnnee} />
          </div>

          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-bold ${
            verrouille
              ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
              : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
          }`}>
            {verrouille ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
            {verrouille ? 'CLÔTURÉ' : 'OUVERT'}
          </span>

          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-bold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
            <Users className="w-3.5 h-3.5" />{lignes.length} salarié(s)
          </span>

          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full sm:w-auto sm:ml-auto">
            <button onClick={handleInit} disabled={verrouille} className="order-1 sm:order-none min-h-9 flex-1 sm:flex-initial bg-sky-100 dark:bg-sky-900/30 hover:bg-sky-200 dark:hover:bg-sky-800 text-salfa-teal dark:text-sky-300 disabled:opacity-50 px-3 py-2 rounded-lg text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1.5">
              <RefreshCw className="w-4 h-4" /><span>Initialiser le mois</span>
            </button>
            <button onClick={imprimer} className="order-3 sm:order-none col-span-2 min-h-9 flex-1 sm:flex-initial bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 px-3 py-2 rounded-lg text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1.5">
              <Printer className="w-4 h-4" /><span>Imprimer (A4 · 2 pages)</span>
            </button>
            <button onClick={exportExcel} className="order-2 sm:order-none min-h-9 flex-1 sm:flex-initial bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1.5 shadow">
              <FileSpreadsheet className="w-4 h-4" /><span>Excel</span>
            </button>
          </div>
        </div>

        <p className="text-[11px] text-slate-500 dark:text-slate-400">Impression A4 paysage : deux pages, mêmes salariés sur chaque page. La recherche filtre aussi l’impression.</p>
        <div className="relative w-full sm:max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un matricule, un nom, une fonction…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-salfa-teal"
          />
        </div>
      </div>

      {annee === 2026 && mois === 'OCTOBRE' && (
        <div className="no-print rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Dans le classeur, la feuille OCTOBRE porte le titre « SEPTEMBRE 2026 ». Les données sont classées sous octobre d’après le nom de la feuille ; vérifiez la période avant utilisation.
        </div>
      )}

      {/* Document */}
      <div className="no-print bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-2 sm:p-4 w-full">
        {/* En-tête imprimé */}
        <div className="text-center mb-3 space-y-0.5">
          <div className="text-[11px] sm:text-sm font-extrabold uppercase text-salfa-dark dark:text-white">
            SALFA TANAMBAO
          </div>
          <div className="text-sm sm:text-lg font-extrabold text-salfa-dark dark:text-white">
            FILAZANA NY KARAMA SY NY TOA AZY ISAM-BATAN'OLONA
          </div>
          <div className="text-xs sm:text-sm font-extrabold text-salfa-teal dark:text-sky-300 uppercase tracking-wide">
            État de paie — Mois de {mois} {annee}
          </div>
        </div>

        <div className="table-responsive thin-scrollbar etat-scroll max-h-[66vh]">
          <table className="border-collapse etat-table" style={{ minWidth: COLONNES.reduce((s, c) => s + c.width, 0) }}>
            <colgroup>
              {COLONNES.map((c) => <col key={c.key} style={{ width: c.width }} />)}
            </colgroup>

            <thead className="sticky top-0 z-20">
              {/* Ligne des groupes */}
              <tr>
                {GROUPES.map((g, gi) => {
                  const nb = COLONNES.filter((c) => c.group === gi).length;
                  return (
                    <th
                      key={g.nom}
                      colSpan={nb}
                      className={`${g.couleur} text-white text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider py-1 px-2 border border-slate-400 dark:border-slate-600 text-center whitespace-nowrap`}
                    >
                      {g.nom}
                    </th>
                  );
                })}
              </tr>
              {/* Ligne des colonnes */}
              <tr className="bg-slate-100 dark:bg-slate-700">
                {COLONNES.map((c) => {
                  const sticky = STICKY_KEYS.includes(c.key);
                  const left = sticky
                    ? COLONNES.slice(0, COLONNES.findIndex((x) => x.key === c.key)).reduce((s, x) => s + x.width, 0)
                    : undefined;
                  return (
                    <th
                      key={c.key}
                      style={sticky ? { position: 'sticky', left, zIndex: 25 } : undefined}
                      className={`${sticky ? 'bg-slate-100 dark:bg-slate-700' : ''} text-[9px] sm:text-[10px] font-extrabold uppercase text-slate-700 dark:text-slate-200 py-1.5 px-1 border border-slate-300 dark:border-slate-600 text-center leading-tight whitespace-nowrap`}
                    >
                      {c.label}
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={COLONNES.length} className="py-10 text-center text-slate-500 text-sm">
                    Chargement…
                  </td>
                </tr>
              ) : lignes.length === 0 ? (
                <tr>
                  <td colSpan={COLONNES.length} className="py-10 text-center text-slate-500 text-sm">
                    <div className="flex flex-col items-center gap-2">
                      <AlertCircle className="w-6 h-6 text-slate-300" />
                      <span>Aucun bulletin pour {mois} {annee}.</span>
                      {!verrouille && (
                        <button onClick={handleInit} className="no-print text-[11px] font-bold text-salfa-teal dark:text-sky-300 underline">
                          Créer les bulletins des salariés actifs
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                lignes.map((p, i) => (
                  <tr key={p.id} className="hover:bg-sky-50/70 dark:hover:bg-slate-700/50 even:bg-slate-50/60 dark:even:bg-slate-800/60">
                    {COLONNES.map((c) => {
                      const sticky = STICKY_KEYS.includes(c.key);
                      const left = sticky
                        ? COLONNES.slice(0, COLONNES.findIndex((x) => x.key === c.key)).reduce((s, x) => s + x.width, 0)
                        : undefined;
                      const v = c.value(p, i);
                      const isMat = c.key === 'mat';
                      return (
                        <td
                          key={c.key}
                          style={sticky ? { position: 'sticky', left, zIndex: 10 } : undefined}
                          className={`${sticky ? 'bg-white dark:bg-slate-800' : ''} border border-slate-200 dark:border-slate-700 px-1 py-[3px] text-[10px] sm:text-[11px] whitespace-nowrap ${
                            c.align === 'right' ? 'text-right font-mono' : c.align === 'center' ? 'text-center' : 'text-left'
                          } ${isMat ? 'font-bold text-salfa-dark dark:text-white' : 'text-slate-800 dark:text-slate-200'} ${
                            c.key === 'net' ? 'font-extrabold bg-emerald-50/60 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300' : ''
                          }`}
                          title={typeof v === 'string' ? v : undefined}
                        >
                          {c.money ? fmt(Number(v)) : v}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>

            {lignes.length > 0 && (
              <tfoot className="sticky bottom-0 z-20">
                <tr className="bg-slate-800 dark:bg-slate-900 text-white font-extrabold">
                  {COLONNES.map((c, idx) => {
                    if (idx === 0) {
                      return (
                        <td key={c.key} className="border border-slate-600 px-1 py-1.5 text-[10px] sm:text-[11px] text-center whitespace-nowrap">
                          TOTAUX
                        </td>
                      );
                    }
                    if (c.key === 'mat') {
                      return (
                        <td key={c.key} className="border border-slate-600 px-1 py-1.5 text-[10px] sm:text-[11px] text-center whitespace-nowrap">
                          {lignes.length}
                        </td>
                      );
                    }
                    if (c.key === 'nom') {
                      return (
                        <td key={c.key} className="border border-slate-600 px-1.5 py-1.5 text-[10px] sm:text-[11px] text-left whitespace-nowrap">
                          {lignes.length} salarié(s)
                        </td>
                      );
                    }
                    if (c.money) {
                      return (
                        <td key={c.key} className="border border-slate-600 px-1 py-1.5 text-[10px] sm:text-[11px] text-right font-mono whitespace-nowrap">
                          {fmt(totals[c.key] || 0)}
                        </td>
                      );
                    }
                    return <td key={c.key} className="border border-slate-600 px-1 py-1.5" />;
                  })}
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Récapitulatif visible aussi à l'impression */}
        <div className="mt-3 grid grid-cols-2 sm:flex sm:flex-wrap gap-2 text-[10px] sm:text-xs">
          <Recap label="SALAIRE BRUT" value={totals['salaire_brut'] || 0} />
          <Recap label="CNaPS" value={totals['cnaps_sal'] || 0} />
          <Recap label="IRSA" value={totals['irsa'] || 0} />
          <Recap label="ACCESSOIRES" value={totals['accessoir'] || 0} />
          <Recap label="BRUT" value={totals['brut'] || 0} />
          <Recap label="AVANCE" value={totals['avance'] || 0} danger />
          <Recap label="MED" value={totals['med'] || 0} danger />
          <Recap label="NET À PAYER" value={totals['net'] || 0} accent />
        </div>

        <div className="mt-2 flex flex-wrap justify-between gap-2 text-[9px] sm:text-[10px] text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-700 pt-2">
          <span>Nombre de salariés : <b>{lignes.length}</b></span>
          <span>Édité le {new Date().toLocaleDateString('fr-FR')} — Logiciel de paie SALFA TANAMBAO</span>
        </div>
      </div>

      <EtatImpression lignes={lignes} totals={totals} mois={mois} annee={annee} />

      {periodes.length > 1 && (
        <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 no-print">
          <div className="text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300 mb-2 flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5" />Périodes disponibles dans l'application
          </div>
          <div className="flex flex-wrap gap-1.5">
            {periodes.map((p) => (
              <button
                key={`${p.annee}-${p.mois}`}
                onClick={() => { setAnnee(p.annee); setMois(p.mois); }}
                className={`text-[10px] sm:text-[11px] font-bold px-2 py-1 rounded-full border transition ${
                  p.annee === annee && p.mois === mois
                    ? 'bg-salfa-dark dark:bg-slate-600 text-white border-salfa-dark dark:border-slate-500'
                    : 'bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-600 hover:bg-slate-100'
                }`}
              >
                {p.mois} {p.annee} · {p.nb}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};


// Les deux parties utilisent exactement les mêmes lignes et un espacement commun.
const PRINT_KEYS = [
  ['mat', 'nom', 'cnaps', 'cat', 'job', 'dateEmb', 'annees', 'enfants', 'base_aj', 'logt_trsp', 'rendement', 'resp_repres', 'salaire_brut', 'cnaps_sal', 'patronal', 'imposable', 'irsa', 'salaire_net'],
  ['mat', 'nom', 'cnaps', 'cat', 'job', 'salaire_net', 'augmentation_divers', 'prime_de_garde', 'anciennete2', 'risque', 'repr_rec', 'accessoir', 'brut', 'avance', 'med', 'net'],
];

const printValue = (c: ColDef, p: PaieMensuelle, index: number) => {
  const v = c.value(p, index);
  return c.money ? fmt(Number(v)) : String(v);
};

const EtatImpression: React.FC<{
  lignes: PaieMensuelle[]; totals: Record<string, number>; mois: string; annee: number;
}> = ({ lignes, totals, mois, annee }) => {
  const groups = PRINT_KEYS.map(keys => keys.map(key => COLONNES.find(c => c.key === key)!));
  // Mesurer le contenu réel pour réserver assez de largeur à chaque colonne,
  // notamment les noms, sans couper ni arrondir les montants.
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.font = 'bold 5pt Arial';
  const measure = (text: string) => ctx ? ctx.measureText(text).width : text.length * 4;
  const layouts = groups.map(cols => {
    const widths = cols.map((c, ci) => {
      const values = lignes.map((p, i) => printValue(c, p, i));
      if (c.money) values.push(fmt(totals[c.key] || 0));
      if (ci === 1) values.push('TOTAUX');
      // Conversion pixels vers millimètres, plus marge et bordure.
      return Math.max(c.key === 'mat' || c.key === 'cat' ? 6 : 8, Math.max(0, ...values.map(measure)) * 25.4 / 96 + 1.2);
    });
    const total = widths.reduce((a, b) => a + b, 0);
    return { widths, total };
  });
  const rowHeight = Math.min(2.65, 150 / Math.max(lignes.length, 1));
  // Réduire aussi la police quand les noms ou le nombre de lignes sont importants.
  const fontPt = Math.min(5, 5 * 278 / Math.max(...layouts.map(l => l.total)), rowHeight * 2.1);

  return (
    <div className="etat-print" aria-hidden="true" style={{ '--etat-row-height': `${rowHeight}mm`, '--etat-font-size': `${fontPt}pt` } as React.CSSProperties}>
      {groups.map((cols, part) => (
        <section className="etat-print-page" key={part}>
          <div className="etat-print-heading">
            <strong>SALFA TANAMBAO</strong>
            <strong>FILAZANA NY KARAMA SY NY TOA AZY ISAM-BATAN'OLONA</strong>
            <strong>État de paie — Mois de {mois} {annee} · Page {part + 1}/2</strong>
          </div>
          <table className="etat-print-table">
            <colgroup>{cols.map((c, i) => <col key={c.key} style={{ width: `${layouts[part].widths[i] / layouts[part].total * 100}%` }} />)}</colgroup>
            <thead><tr>{cols.map(c => <th key={c.key}>{c.label}</th>)}</tr></thead>
            <tbody>{lignes.map((p, i) => (
              <tr key={p.id}>{cols.map(c => <td key={c.key} style={{ textAlign: c.align }}>{printValue(c, p, i)}</td>)}</tr>
            ))}</tbody>
            {lignes.length > 0 && <tfoot><tr><td colSpan={2}>TOTAUX</td>{cols.slice(2).map(c => (
              <td key={c.key} style={{ textAlign: c.align }}>{c.money ? fmt(totals[c.key] || 0) : ''}</td>
            ))}</tr></tfoot>}
          </table>
        </section>
      ))}
    </div>
  );
};

const Recap: React.FC<{ label: string; value: number; danger?: boolean; accent?: boolean }> = ({ label, value, danger, accent }) => (
  <div className={`rounded-lg border px-2 py-1.5 flex-1 min-w-[120px] ${
    accent
      ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-800'
      : 'bg-slate-50 dark:bg-slate-700/40 border-slate-200 dark:border-slate-700'
  }`}>
    <div className="text-[8px] sm:text-[9px] uppercase font-bold text-slate-500 dark:text-slate-400">{label}</div>
    <div className={`font-mono font-extrabold ${danger ? 'text-red-600 dark:text-red-300' : accent ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-800 dark:text-white'}`}>
      {value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </div>
  </div>
);

export default EtatTab;
