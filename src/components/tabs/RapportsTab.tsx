// ==============================================================================
// COMPOSANT REACT : ONGLET 4 - RAPPORTS & EXPORTS EXCEL / JSON (.TSX)
// ==============================================================================
import React, { useState, useEffect } from 'react';
import { PaieMensuelle, TotauxMois, ComparaisonNet } from '../../types';
import { fetchPaiesMois, fetchComparaison } from '../../api';
import {
  FileSpreadsheet, FileCode, Calendar, ArrowUpRight, ArrowDownRight,
  Minus, Table, TrendingUp, CheckCircle2
} from 'lucide-react';
import * as XLSX from 'xlsx';

function formatAr(val: number | undefined): string {
  if (val === undefined || val === null) return '0,00 Ar';
  return val.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' Ar';
}

export const RapportsTab: React.FC = () => {
  const [vue, setVue] = useState<'paie' | 'comparaison'>('paie');
  const [mois, setMois] = useState('JANVIER');
  const [annee, setAnnee] = useState(2026);
  const [moisAvant, setMoisAvant] = useState('JANVIER');
  const [useHist, setUseHist] = useState(true);

  // Données
  const [paies, setPaies] = useState<PaieMensuelle[]>([]);
  const [totaux, setTotaux] = useState<TotauxMois>({});
  const [comparaison, setComparaison] = useState<ComparaisonNet[]>([]);
  const [loading, setLoading] = useState(true);

  const moisListe = [
    "JANVIER", "FEVRIER", "MARS", "AVRIL", "MAI", "JUIN",
    "JUILLET", "AOUT", "SEPTEMBRE", "OCTOBRE", "NOVEMBRE", "DECEMBRE"
  ];

  const loadData = async () => {
    setLoading(true);
    if (vue === 'paie') {
      const d = await fetchPaiesMois(annee, mois);
      setPaies(d.employes || []);
      setTotaux(d.totaux || {});
    } else {
      const c = await fetchComparaison(annee, mois, moisAvant, useHist);
      setComparaison(c);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [vue, mois, annee, moisAvant, useHist]);

  // Export Excel du tableau de paie mensuel
  const handleExportPaieExcel = () => {
    const wsData: any[][] = [
      ["CLINIQUE SALFA TANAMBAO - DISPENSAIRE TOBY BETELA TOLIARA"],
      [`TABLEAU MENSUEL DE PAIE — Période : ${mois} ${annee}`],
      [],
      [
        "N° Mat", "NOM ET PRENOMS", "N° CNaPS", "CAT", "JOBS", "Date emb", "Nombre d'année",
        "Enfant à charge", "BASE AJ", "Logt Trsp", "Rendement", "RESP REPRES",
        "Salaire Brut", "CNaPS", "Patronal", "salaire imp.", "IRSA", "SALAIRE NET",
        "AUGMENTATION DIVERS", "Prime de garde", "Ancienneté2", "RISQUE", "Repr° réc°",
        "Accessoir", "BRUT", "AVANCE", "MED", "NET", "Virement", "Espèces", "RAP", "RIB"
      ]
    ];

    for (const p of paies) {
      wsData.push([
        p.numero_matricule,
        p.nom_prenoms,
        p.numero_cnaps || '',
        p.categorie || '',
        p.jobs || '',
        p.date_embauche || '',
        p.nombre_annees || 0,
        p.enfant_a_charge || 0,
        p.base_aj || 0,
        p.logt_trsp || 0,
        p.rendement || 0,
        p.resp_repres || 0,
        p.salaire_brut || 0,
        p.cnaps || 0,
        p.patronal || 0,
        p.salaire_imposable || 0,
        p.irsa || 0,
        p.salaire_net || 0,
        p.augmentation_divers || 0,
        p.prime_de_garde || 0,
        p.anciennete2 || 0,
        p.risque || 0,
        p.repr_rec || 0,
        p.accessoir || 0,
        p.brut || 0,
        p.avance || 0,
        p.med || 0,
        p.net || 0,
        p.virement || 0,
        p.especes || 0,
        p.rap ? "OUI" : "NON",
        p.rib || ''
      ]);
    }

    // Ligne TOTAL
    wsData.push([
      "Total",
      `${totaux.count_employes || paies.length} salariés`,
      "", "", "", "", "",
      totaux.total_enfant_a_charge || 0,
      totaux.total_base_aj || 0,
      totaux.total_logt_trsp || 0,
      totaux.total_rendement || 0,
      totaux.total_resp_repres || 0,
      totaux.total_salaire_brut || 0,
      totaux.total_cnaps || 0,
      totaux.total_patronal || 0,
      totaux.total_salaire_imposable || 0,
      totaux.total_irsa || 0,
      totaux.total_salaire_net || 0,
      totaux.total_augmentation_divers || 0,
      totaux.total_prime_de_garde || 0,
      totaux.total_anciennete2 || 0,
      totaux.total_risque || 0,
      totaux.total_repr_rec || 0,
      totaux.total_accessoir || 0,
      totaux.total_brut || 0,
      totaux.total_avance || 0,
      totaux.total_med || 0,
      totaux.total_net || 0,
      totaux.total_virement || 0,
      totaux.total_especes || 0,
      "", ""
    ]);

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `PAIE_${mois}_${annee}`);
    XLSX.writeFile(wb, `PAIE_SALFA_${mois}_${annee}.xlsx`);
  };

  // Export Excel de la comparaison des salaires Nets
  const handleExportCompExcel = () => {
    const wsData: any[][] = [
      ["CLINIQUE SALFA TANAMBAO - DISPENSAIRE TOBY BETELA TOLIARA"],
      [`COMPARAISON DES SALAIRES NETS — ${mois} ${annee} vs ${useHist ? "Feuil3" : moisAvant}`],
      [],
      ["N° Mat", "NOM ET PRENOMS", "CAT", "JOBS", `NET (${mois})`, `Net Avant (${useHist ? "Feuil3" : moisAvant})`, "ÉCART"]
    ];

    let totAct = 0;
    let totAv = 0;
    let totEc = 0;

    for (const d of comparaison) {
      totAct += Number(d.net_actuel || 0);
      totAv += Number(d.net_avant || 0);
      totEc += Number(d.ecart || 0);

      wsData.push([
        d.numero_matricule,
        d.nom_prenoms,
        d.categorie || '',
        d.jobs || '',
        Number(d.net_actuel || 0),
        Number(d.net_avant || 0),
        Number(d.ecart || 0)
      ]);
    }

    wsData.push([
      "Total",
      `${comparaison.length} salariés`,
      "", "",
      totAct,
      totAv,
      totEc
    ]);

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `COMPARAISON_${mois}`);
    XLSX.writeFile(wb, `COMPARAISON_NET_SALFA_${mois}_${annee}.xlsx`);
  };

  // Export JSON
  const handleExportJSON = () => {
    const data = vue === 'paie' ? { annee, mois, employes: paies, totaux } : { annee, mois, comparaison };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = vue === 'paie' ? `PAIE_SALFA_${mois}_${annee}.json` : `COMPARAISON_NET_${mois}_${annee}.json`;
    a.click();
  };

  return (
    <div className="space-y-6">
      
      {/* Barre d'outils supérieure */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setVue('paie')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition ${
                vue === 'paie'
                  ? 'bg-salfa-dark text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Récapitulatif Paie (Ligne Total)
            </button>
            <button
              onClick={() => setVue('comparaison')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition ${
                vue === 'comparaison'
                  ? 'bg-salfa-dark text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Comparaison Net (Écart)
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-salfa-teal" />
            <span className="text-xs font-bold uppercase text-slate-700">Période :</span>
            <select
              value={mois}
              onChange={(e) => setMois(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-bold text-salfa-dark"
            >
              {moisListe.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <select
              value={annee}
              onChange={(e) => setAnnee(Number(e.target.value))}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-bold text-salfa-dark"
            >
              <option value={2025}>2025</option>
              <option value={2026}>2026</option>
              <option value={2027}>2027</option>
            </select>
          </div>

          {vue === 'comparaison' && (
            <div className="flex items-center gap-3 border-l border-slate-200 pl-3">
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useHist}
                  onChange={(e) => setUseHist(e.target.checked)}
                  className="rounded text-salfa-teal"
                />
                <span>Historique Feuil3</span>
              </label>

              {!useHist && (
                <div className="flex items-center gap-1 text-xs">
                  <span className="font-semibold text-slate-500">Mois avant :</span>
                  <select
                    value={moisAvant}
                    onChange={(e) => setMoisAvant(e.target.value)}
                    className="rounded border border-slate-300 px-2 py-1 text-xs font-bold text-salfa-dark"
                  >
                    {moisListe.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Boutons exports */}
        <div className="flex items-center gap-3">
          <button
            onClick={vue === 'paie' ? handleExportPaieExcel : handleExportCompExcel}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow transition"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Exporter Excel (.XLSX)</span>
          </button>
          <button
            onClick={handleExportJSON}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition"
          >
            <FileCode className="w-4 h-4" />
            <span>JSON</span>
          </button>
        </div>

      </div>

      {/* Rendu VUE 1 : RECAPITULATIF DE PAIE AVEC LIGNE TOTAL */}
      {vue === 'paie' ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto max-h-[65vh]">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-salfa-dark text-white">
                <tr className="uppercase tracking-wider">
                  <th className="py-3 px-2 text-center">Mat</th>
                  <th className="py-3 px-3">NOM ET PRENOMS</th>
                  <th className="py-3 px-2 text-center">CNaPS</th>
                  <th className="py-3 px-2 text-center">CAT</th>
                  <th className="py-3 px-3">JOBS</th>
                  <th className="py-3 px-3 text-right">BASE AJ</th>
                  <th className="py-3 px-3 text-right">Logt Trsp</th>
                  <th className="py-3 px-3 text-right">Rend.</th>
                  <th className="py-3 px-3 text-right">RESP</th>
                  <th className="py-3 px-3 text-right">Brut</th>
                  <th className="py-3 px-2 text-right">CNaPS</th>
                  <th className="py-3 px-2 text-right">Patronal</th>
                  <th className="py-3 px-3 text-right">Imposable</th>
                  <th className="py-3 px-2 text-right">IRSA</th>
                  <th className="py-3 px-3 text-right">Net base</th>
                  <th className="py-3 px-3 text-right">Access.</th>
                  <th className="py-3 px-3 text-right">BRUT</th>
                  <th className="py-3 px-3 text-right text-red-300">AVANCE</th>
                  <th className="py-3 px-3 text-right text-red-300">MED</th>
                  <th className="py-3 px-4 text-right bg-salfa-teal/40 font-bold">NET À PAYER</th>
                  <th className="py-3 px-3 text-right">Virement</th>
                  <th className="py-3 px-3 text-right">Espèces</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={22} className="py-8 text-center text-slate-500">
                      Chargement du tableau...
                    </td>
                  </tr>
                ) : paies.length === 0 ? (
                  <tr>
                    <td colSpan={22} className="py-8 text-center text-slate-500">
                      Aucune donnée pour {mois} {annee}.
                    </td>
                  </tr>
                ) : (
                  paies.map((p) => (
                    <tr key={p.id} className="hover:bg-sky-50/50">
                      <td className="py-2 px-2 text-center font-bold text-salfa-dark">{p.numero_matricule}</td>
                      <td className="py-2 px-3 font-semibold text-slate-800">{p.nom_prenoms}</td>
                      <td className="py-2 px-2 text-center text-slate-500 font-mono">{p.numero_cnaps || ''}</td>
                      <td className="py-2 px-2 text-center font-bold text-salfa-teal">{p.categorie || ''}</td>
                      <td className="py-2 px-3 text-slate-600 truncate max-w-[120px]">{p.jobs || ''}</td>
                      <td className="py-2 px-3 text-right font-mono">{formatAr(p.base_aj)}</td>
                      <td className="py-2 px-3 text-right font-mono">{formatAr(p.logt_trsp)}</td>
                      <td className="py-2 px-3 text-right font-mono">{formatAr(p.rendement)}</td>
                      <td className="py-2 px-3 text-right font-mono">{formatAr(p.resp_repres)}</td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-salfa-dark">{formatAr(p.salaire_brut)}</td>
                      <td className="py-2 px-2 text-right font-mono text-slate-600">{formatAr(p.cnaps)}</td>
                      <td className="py-2 px-2 text-right font-mono text-slate-600">{formatAr(p.patronal)}</td>
                      <td className="py-2 px-3 text-right font-mono">{formatAr(p.salaire_imposable)}</td>
                      <td className="py-2 px-2 text-right font-mono text-slate-600">{formatAr(p.irsa)}</td>
                      <td className="py-2 px-3 text-right font-mono font-medium">{formatAr(p.salaire_net)}</td>
                      <td className="py-2 px-3 text-right font-mono">{formatAr(p.accessoir)}</td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-salfa-dark">{formatAr(p.brut)}</td>
                      <td className="py-2 px-3 text-right font-mono text-red-600">{formatAr(p.avance)}</td>
                      <td className="py-2 px-3 text-right font-mono text-red-600">{formatAr(p.med)}</td>
                      <td className="py-2 px-4 text-right font-mono font-extrabold text-emerald-700 bg-emerald-50/50">
                        {formatAr(p.net)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-slate-600">{formatAr(p.virement || 0)}</td>
                      <td className="py-2 px-3 text-right font-mono text-slate-600">{formatAr(p.especes || 0)}</td>
                    </tr>
                  ))
                )}

                {/* LIGNE TOTAL GÉNÉRAL */}
                {paies.length > 0 && (
                  <tr className="bg-slate-200/80 font-extrabold text-salfa-dark border-t-2 border-salfa-dark sticky bottom-0">
                    <td className="py-3 px-2 text-center">TOTAL</td>
                    <td className="py-3 px-3">{totaux.count_employes || paies.length} salariés</td>
                    <td colSpan={3}></td>
                    <td className="py-3 px-3 text-right font-mono">{formatAr(totaux.total_base_aj)}</td>
                    <td className="py-3 px-3 text-right font-mono">{formatAr(totaux.total_logt_trsp)}</td>
                    <td className="py-3 px-3 text-right font-mono">{formatAr(totaux.total_rendement)}</td>
                    <td className="py-3 px-3 text-right font-mono">{formatAr(totaux.total_resp_repres)}</td>
                    <td className="py-3 px-3 text-right font-mono">{formatAr(totaux.total_salaire_brut)}</td>
                    <td className="py-3 px-2 text-right font-mono">{formatAr(totaux.total_cnaps)}</td>
                    <td className="py-3 px-2 text-right font-mono">{formatAr(totaux.total_patronal)}</td>
                    <td className="py-3 px-3 text-right font-mono">{formatAr(totaux.total_salaire_imposable)}</td>
                    <td className="py-3 px-2 text-right font-mono">{formatAr(totaux.total_irsa)}</td>
                    <td className="py-3 px-3 text-right font-mono">{formatAr(totaux.total_salaire_net)}</td>
                    <td className="py-3 px-3 text-right font-mono">{formatAr(totaux.total_accessoir)}</td>
                    <td className="py-3 px-3 text-right font-mono">{formatAr(totaux.total_brut)}</td>
                    <td className="py-3 px-3 text-right font-mono text-red-700">{formatAr(totaux.total_avance)}</td>
                    <td className="py-3 px-3 text-right font-mono text-red-700">{formatAr(totaux.total_med)}</td>
                    <td className="py-3 px-4 text-right font-mono text-emerald-800 bg-emerald-100">
                      {formatAr(totaux.total_net)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono">{formatAr(totaux.total_virement)}</td>
                    <td className="py-3 px-3 text-right font-mono">{formatAr(totaux.total_especes)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Rendu VUE 2 : COMPARAISON DES SALAIRES NETS (ACTUEL VS AVANT - ÉCART) */
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto max-h-[65vh]">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-salfa-dark text-white text-xs uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-4 text-center">N° Mat</th>
                  <th className="py-3.5 px-6">NOM ET PRENOMS</th>
                  <th className="py-3.5 px-3 text-center">CAT</th>
                  <th className="py-3.5 px-6">JOBS (Fonction)</th>
                  <th className="py-3.5 px-6 text-right">NET ({mois})</th>
                  <th className="py-3.5 px-6 text-right">Net Avant ({useHist ? "Feuil3" : moisAvant})</th>
                  <th className="py-3.5 px-6 text-right">ÉCART (Ar)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      Chargement de la comparaison...
                    </td>
                  </tr>
                ) : comparaison.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      Aucune donnée de comparaison disponible pour {mois}.
                    </td>
                  </tr>
                ) : (
                  (() => {
                    let totAct = 0;
                    let totAv = 0;
                    let totEc = 0;
                    return (
                      <>
                        {comparaison.map((d, i) => {
                          const act = Number(d.net_actuel || 0);
                          const av = Number(d.net_avant || 0);
                          const ec = Number(d.ecart || 0);
                          totAct += act;
                          totAv += av;
                          totEc += ec;

                          return (
                            <tr key={i} className="hover:bg-sky-50/50">
                              <td className="py-3 px-4 text-center font-bold text-salfa-dark">
                                {d.numero_matricule}
                              </td>
                              <td className="py-3 px-6 font-semibold text-slate-800">
                                {d.nom_prenoms}
                              </td>
                              <td className="py-3 px-3 text-center font-bold text-salfa-teal">
                                {d.categorie || '—'}
                              </td>
                              <td className="py-3 px-6 text-slate-600">
                                {d.jobs || '—'}
                              </td>
                              <td className="py-3 px-6 text-right font-mono font-medium text-slate-800">
                                {formatAr(act)}
                              </td>
                              <td className="py-3 px-6 text-right font-mono text-slate-600">
                                {formatAr(av)}
                              </td>
                              <td className="py-3 px-6 text-right font-mono font-bold">
                                {ec > 0.01 ? (
                                  <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full">
                                    <ArrowUpRight className="w-4 h-4" />
                                    +{formatAr(ec)}
                                  </span>
                                ) : ec < -0.01 ? (
                                  <span className="inline-flex items-center gap-1 text-red-600 bg-red-50 px-2.5 py-0.5 rounded-full">
                                    <ArrowDownRight className="w-4 h-4" />
                                    {formatAr(ec)}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-slate-500">
                                    <Minus className="w-3.5 h-3.5" />
                                    0,00 Ar
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}

                        {/* Ligne TOTAL de comparaison */}
                        <tr className="bg-slate-200 font-extrabold text-salfa-dark border-t-2 border-salfa-dark sticky bottom-0">
                          <td className="py-3.5 px-4 text-center">TOTAL</td>
                          <td className="py-3.5 px-6">{comparaison.length} salariés</td>
                          <td colSpan={2}></td>
                          <td className="py-3.5 px-6 text-right font-mono">{formatAr(totAct)}</td>
                          <td className="py-3.5 px-6 text-right font-mono">{formatAr(totAv)}</td>
                          <td className="py-3.5 px-6 text-right font-mono">
                            {totEc > 0.01 ? (
                              <span className="text-emerald-800">+{formatAr(totEc)}</span>
                            ) : totEc < -0.01 ? (
                              <span className="text-red-700">{formatAr(totEc)}</span>
                            ) : (
                              <span>0,00 Ar</span>
                            )}
                          </td>
                        </tr>
                      </>
                    );
                  })()
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
};
