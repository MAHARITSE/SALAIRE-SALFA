import { SortableHeader, useTableSort } from '../SortableHeader';
import { changementAncienneteDuMois } from '../../local/calcul';
import { AncienneteBadge, AncienneteLegende } from '../AncienneteRepere';
import { YearSelect, YearProps } from '../YearSelect';
// RAPPORTS - SANS Ar + DARKMODE
import React, { useState, useEffect } from 'react';
import { PaieMensuelle, TotauxMois, ComparaisonNet } from '../../types';
import { fetchPaiesMois, fetchComparaison } from '../../api';
import { FileSpreadsheet, FileCode, Calendar, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import * as XLSX from 'xlsx';
import { formatMontant } from '../../local/montants';
import { formaterColonnesMonetairesExcel } from '../../local/excelFormat';

function fmt(val: number | undefined): string {
  return formatMontant(val);
}

function fmtJ(val: number | undefined | null): string {
  const n = Number(val ?? 0);
  if (!Number.isFinite(n)) return '0';
  return (Math.round(n * 100) / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
}

export const RapportsTab: React.FC<YearProps> = ({ annee, setAnnee }) => {
  const [vue, setVue] = useState<'paie' | 'comparaison'>('paie');
  const [mois, setMois] = useState(['JANVIER','FEVRIER','MARS','AVRIL','MAI','JUIN','JUILLET','AOUT','SEPTEMBRE','OCTOBRE','NOVEMBRE','DECEMBRE'][new Date().getMonth()]);
  const [moisAvant, setMoisAvant] = useState('JANVIER');
  const [useHist, setUseHist] = useState(false);
  const [paies, setPaies] = useState<PaieMensuelle[]>([]);
  const [totaux, setTotaux] = useState<TotauxMois>({});
  const [comparaison, setComparaison] = useState<ComparaisonNet[]>([]);
  const [selectedRowKey, setSelectedRowKey] = useState<string | number | null>(null);
  const [loading, setLoading] = useState(true);
  const moisListe = ["JANVIER","FEVRIER","MARS","AVRIL","MAI","JUIN","JUILLET","AOUT","SEPTEMBRE","OCTOBRE","NOVEMBRE","DECEMBRE"];

  const paieSort = useTableSort(paies, {
    numero_matricule: p => Number(p.numero_matricule || 0),
    nom_prenoms: p => p.nom_prenoms || '',
    numero_cnaps: p => p.numero_cnaps || '',
    categorie: p => p.categorie || '',
    jobs: p => p.jobs || '',
    base_aj: p => Number(p.base_aj || 0),
    logt_trsp: p => Number(p.logt_trsp || 0),
    rendement: p => Number(p.rendement || 0),
    resp_repres: p => Number(p.resp_repres || 0),
    salaire_brut: p => Number(p.salaire_brut || 0),
    cnaps: p => Number(p.cnaps || 0),
    patronal: p => Number(p.patronal || 0),
    salaire_imposable: p => Number(p.salaire_imposable || 0),
    irsa: p => Number(p.irsa || 0),
    salaire_net: p => Number(p.salaire_net || 0),
    accessoir: p => Number(p.accessoir || 0),
    brut: p => Number(p.brut || 0),
    avance: p => Number(p.avance || 0),
    med: p => Number(p.med || 0),
    net: p => Number(p.net || 0),
    conge_pris_mois: p => Number(p.conge_pris_mois || 0),
    conge_restant: p => Number(p.conge_restant || 0)
  });
  const compSort = useTableSort(comparaison, {
    numero_matricule: p => Number(p.numero_matricule || 0),
    nom_prenoms: p => p.nom_prenoms || '',
    categorie: p => p.categorie || '',
    jobs: p => p.jobs || '',
    net_actuel: p => Number(p.net_actuel || 0),
    net_avant: p => Number(p.net_avant || 0),
    ecart: p => Number(p.ecart || 0)
  });

  const loadData = async () => {
    setLoading(true);
    setSelectedRowKey(null);
    if (vue === 'paie') { const d = await fetchPaiesMois(annee, mois); setPaies(d.employes || []); setTotaux(d.totaux || {}); }
    else { const c = await fetchComparaison(annee, mois, moisAvant, useHist); setComparaison(c); }
    setLoading(false);
  };
  useEffect(() => { loadData(); /* eslint-disable-next-line */ }, [vue, mois, annee, moisAvant, useHist]);

  const handleExportPaieExcel = () => {
    const wsData: any[][] = [
      ["CLINIQUE SALFA TANAMBAO"], [`TABLEAU MENSUEL DE PAIE — ${mois} ${annee}`], [],
      ["N° Mat","NOM","CNaPS","CAT","JOBS","Date emb","Anc","Enf","Base","Logt Trsp","Rend","RESP","Brut","CNaPS","Patronal","Imp","IRSA","NET","AUG DIV","Garde","Anc2","RISQUE","Repr","Accessoir","BRUT","AVANCE","MED","NET","Virement","Espèces","RIB","Congé Pris","Congé Restant"]
    ];
    for (const p of paieSort.rows) {
      wsData.push([p.numero_matricule,p.nom_prenoms,p.numero_cnaps||'',p.categorie||'',p.jobs||'',p.date_embauche||'',p.nombre_annees||0,p.enfant_a_charge||0,p.base_aj||0,p.logt_trsp||0,p.rendement||0,p.resp_repres||0,p.salaire_brut||0,p.cnaps||0,p.patronal||0,p.salaire_imposable||0,p.irsa||0,p.salaire_net||0,p.augmentation_divers||0,p.prime_de_garde||0,p.anciennete2||0,p.risque||0,p.repr_rec||0,p.accessoir||0,p.brut||0,p.avance||0,p.med||0,p.net||0,p.virement||0,p.especes||0,p.rib||'',Number(p.conge_pris_mois||0),Number(p.conge_restant||0)]);
    }
    wsData.push(["Total",`${totaux.count_employes || paies.length} salariés`,"","","","","",totaux.total_enfant_a_charge||0,totaux.total_base_aj||0,totaux.total_logt_trsp||0,totaux.total_rendement||0,totaux.total_resp_repres||0,totaux.total_salaire_brut||0,totaux.total_cnaps||0,totaux.total_patronal||0,totaux.total_salaire_imposable||0,totaux.total_irsa||0,totaux.total_salaire_net||0,totaux.total_augmentation_divers||0,totaux.total_prime_de_garde||0,totaux.total_anciennete2||0,totaux.total_risque||0,totaux.total_repr_rec||0,totaux.total_accessoir||0,totaux.total_brut||0,totaux.total_avance||0,totaux.total_med||0,totaux.total_net||0,totaux.total_virement||0,totaux.total_especes||0,"",totaux.total_conge_pris_mois||0,totaux.total_conge_restant||0]);
    const ws = XLSX.utils.aoa_to_sheet(wsData); formaterColonnesMonetairesExcel(ws, Array.from({ length: 22 }, (_, i) => i + 8), 3); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, `PAIE_${mois}_${annee}`); XLSX.writeFile(wb, `PAIE_SALFA_${mois}_${annee}.xlsx`);
  };
  const handleExportCompExcel = () => {
    const wsData: any[][] = [["CLINIQUE SALFA"], [`COMPARAISON NETS — ${mois} ${annee} vs ${useHist ? "Feuil3" : moisAvant}`], [], ["N° Mat","NOM","CAT","JOBS",`NET (${mois})`,`Net Avant (${useHist ? "Feuil3" : moisAvant})`,"ÉCART"]];
    let ta=0,tb=0,te=0; for (const d of compSort.rows) { ta+=Number(d.net_actuel||0); tb+=Number(d.net_avant||0); te+=Number(d.ecart||0); wsData.push([d.numero_matricule,d.nom_prenoms,d.categorie||'',d.jobs||'',Number(d.net_actuel||0),Number(d.net_avant||0),Number(d.ecart||0)]); }
    wsData.push(["Total",`${comparaison.length} salariés`,"","",ta,tb,te]);
    const ws = XLSX.utils.aoa_to_sheet(wsData); formaterColonnesMonetairesExcel(ws, [4, 5, 6], 3); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, `COMPARAISON_${mois}`); XLSX.writeFile(wb, `COMPARAISON_NET_${mois}_${annee}.xlsx`);
  };
  const handleExportJSON = () => {
    const data = vue === 'paie' ? { annee, mois, employes: paieSort.rows, totaux } : { annee, mois, comparaison: compSort.rows };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = vue === 'paie' ? `PAIE_SALFA_${mois}_${annee}.json` : `COMPARAISON_NET_${mois}_${annee}.json`; a.click();
  };

  return (
    <div className="space-y-3 sm:space-y-6 w-full max-w-full overflow-x-hidden">
      <div className="caisse-card bg-white dark:bg-slate-800 p-3 sm:p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col gap-3 w-full">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-700 p-1 rounded-lg w-fit"><button onClick={() => setVue('paie')} className={`px-2.5 sm:px-3 py-1.5 rounded-md text-[11px] sm:text-xs font-bold whitespace-nowrap ${vue === 'paie' ? 'bg-salfa-dark dark:bg-slate-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300'}`}>Récap Paie</button><button onClick={() => setVue('comparaison')} className={`px-2.5 sm:px-3 py-1.5 rounded-md text-[11px] sm:text-xs font-bold whitespace-nowrap ${vue === 'comparaison' ? 'bg-salfa-dark dark:bg-slate-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300'}`}>Comparaison Net</button></div>
            <div className="flex flex-wrap items-center gap-2"><Calendar className="w-4 h-4 text-salfa-teal dark:text-sky-300 hidden sm:block" /><select value={mois} onChange={(e) => setMois(e.target.value)} className="rounded-lg border dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-bold">{moisListe.map((m) => <option key={m} value={m}>{m}</option>)}</select><YearSelect annee={annee} setAnnee={setAnnee} /></div>
            {vue === 'comparaison' && <div className="flex flex-wrap items-center gap-2 border-t sm:border-t-0 sm:border-l border-slate-200 dark:border-slate-700 pt-2 sm:pt-0 sm:pl-3"><label className="flex items-center gap-1.5 text-[11px] sm:text-xs font-medium cursor-pointer dark:text-slate-300"><input type="checkbox" checked={useHist} onChange={(e) => setUseHist(e.target.checked)} className="rounded" /><span>Historique Feuil3</span></label>{!useHist && <div className="flex items-center gap-1 text-xs"><span className="font-semibold text-[11px] dark:text-slate-400">Mois avant:</span><select value={moisAvant} onChange={(e) => setMoisAvant(e.target.value)} className="rounded border dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-2 py-1 text-xs font-bold">{moisListe.map((m) => <option key={m} value={m}>{m}</option>)}</select></div>}</div>}
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto"><button onClick={vue === 'paie' ? handleExportPaieExcel : handleExportCompExcel} className="flex-1 sm:flex-initial bg-emerald-600 hover:bg-emerald-700 text-white px-3 sm:px-4 py-2 rounded-lg text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1.5 shadow"><FileSpreadsheet className="w-4 h-4" /><span>Excel</span></button><button onClick={handleExportJSON} className="flex-1 sm:flex-initial justify-center bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5"><FileCode className="w-4 h-4" /><span>JSON</span></button></div>
        </div>
      </div>

      {vue === 'paie' && <AncienneteLegende />}
      {vue === 'paie' ? (
        <>
          <div className="block lg:hidden space-y-2">
            {loading ? <div className="caisse-card bg-white dark:bg-slate-800 rounded-xl p-6 text-center text-sm text-slate-500 border dark:border-slate-700">Chargement...</div> : paies.length === 0 ? <div className="caisse-card bg-white dark:bg-slate-800 rounded-xl p-6 text-center text-sm text-slate-500 border dark:border-slate-700">Aucune donnée.</div> : paieSort.rows.map((p) => { const anniversaire = changementAncienneteDuMois(p.date_embauche, annee, mois); return (<div key={p.id} className={`${anniversaire ? 'anciennete-card' : 'caisse-card bg-white dark:bg-slate-800'} rounded-xl border dark:border-slate-700 p-3 shadow-sm`}><div className="flex justify-between gap-2"><div className="flex-1 min-w-0 break-words"><div className="font-bold text-sm dark:text-white">Mat {p.numero_matricule} — {p.nom_prenoms} {anniversaire && <AncienneteBadge changement={anniversaire} />}</div><div className="text-[11px] text-slate-500 dark:text-slate-400">{p.categorie||''} • {p.jobs||''}</div></div><div className="text-right shrink-0"><div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">NET</div><div className="font-mono font-bold text-emerald-700 dark:text-emerald-400 text-sm whitespace-nowrap">{fmt(p.net)}</div></div></div><div className="grid grid-cols-4 gap-1.5 mt-2 text-[11px] dark:text-slate-200"><div className="bg-slate-50 dark:bg-slate-700/50 rounded p-1.5"><div className="text-[9px] text-slate-500 dark:text-slate-400">BRUT</div><div className="font-mono font-bold">{fmt(p.salaire_brut)}</div></div><div className="bg-red-50 dark:bg-red-900/20 rounded p-1.5"><div className="text-[9px] text-red-600">AVANCE</div><div className="font-mono font-bold text-red-700 dark:text-red-300">{fmt(p.avance)}</div></div><div className="bg-slate-50 dark:bg-slate-700/50 rounded p-1.5"><div className="text-[9px] text-slate-500 dark:text-slate-400">IMP</div><div className="font-mono">{fmt(p.salaire_imposable)}</div></div><div className="bg-violet-50 dark:bg-violet-900/20 rounded p-1.5"><div className="text-[9px] text-violet-700 dark:text-violet-300">CONGÉ REST.</div><div className="font-mono font-bold text-violet-700 dark:text-violet-300">{fmtJ(p.conge_restant)} j</div></div></div></div>); })}
            {paies.length > 0 && <div className="bg-salfa-dark dark:bg-slate-700 text-white rounded-xl p-3 flex justify-between text-xs font-bold"><span>TOTAL {totaux.count_employes||paies.length} salariés</span><span className="font-mono">{fmt(totaux.total_net)}</span></div>}
          </div>
          <div className="hidden lg:block caisse-card bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden w-full"><div className="table-responsive thin-scrollbar max-h-[65vh]"><table className="w-full text-left border-collapse text-xs min-w-[1520px]"><thead className="sticky top-0 z-10 bg-salfa-dark dark:bg-slate-900 text-white"><tr className="uppercase tracking-wider"><SortableHeader column="numero_matricule" sort={paieSort} className="py-3 px-2 text-center">Mat</SortableHeader><SortableHeader column="nom_prenoms" sort={paieSort} className="py-3 px-3">NOM</SortableHeader><SortableHeader column="numero_cnaps" sort={paieSort} className="py-3 px-2 text-center">CNaPS</SortableHeader><SortableHeader column="categorie" sort={paieSort} className="py-3 px-2 text-center">CAT</SortableHeader><SortableHeader column="jobs" sort={paieSort} className="py-3 px-3">JOBS</SortableHeader><SortableHeader column="base_aj" sort={paieSort} className="py-3 px-3 text-right normal-case">Base</SortableHeader><SortableHeader column="logt_trsp" sort={paieSort} className="py-3 px-3 text-right">Logt</SortableHeader><SortableHeader column="rendement" sort={paieSort} className="py-3 px-3 text-right">Rend</SortableHeader><SortableHeader column="resp_repres" sort={paieSort} className="py-3 px-3 text-right">RESP</SortableHeader><SortableHeader column="salaire_brut" sort={paieSort} className="py-3 px-3 text-right">Brut</SortableHeader><SortableHeader column="cnaps" sort={paieSort} className="py-3 px-2 text-right">CNaPS</SortableHeader><SortableHeader column="patronal" sort={paieSort} className="py-3 px-2 text-right">Pat</SortableHeader><SortableHeader column="salaire_imposable" sort={paieSort} className="py-3 px-3 text-right">Imp</SortableHeader><SortableHeader column="irsa" sort={paieSort} className="py-3 px-2 text-right">IRSA</SortableHeader><SortableHeader column="salaire_net" sort={paieSort} className="py-3 px-3 text-right">Net base</SortableHeader><SortableHeader column="accessoir" sort={paieSort} className="py-3 px-3 text-right">Access</SortableHeader><SortableHeader column="brut" sort={paieSort} className="py-3 px-3 text-right">BRUT</SortableHeader><SortableHeader column="avance" sort={paieSort} className="py-3 px-3 text-right text-red-300">AVANCE</SortableHeader><SortableHeader column="med" sort={paieSort} className="py-3 px-3 text-right text-red-300">MED</SortableHeader><SortableHeader column="net" sort={paieSort} className="py-3 px-4 text-right bg-salfa-teal/40 dark:bg-slate-700">NET</SortableHeader><SortableHeader column="conge_pris_mois" sort={paieSort} className="py-3 px-2 text-right text-violet-200">Congé Pris</SortableHeader><SortableHeader column="conge_restant" sort={paieSort} className="py-3 px-3 text-right text-violet-200">Congé Rest.</SortableHeader></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-700 dark:text-slate-200">{loading ? <tr><td colSpan={22} className="py-8 text-center">Chargement...</td></tr> : paies.length===0 ? <tr><td colSpan={22} className="py-8 text-center">Aucune donnée.</td></tr> : paieSort.rows.map((p) => { const anniversaire = changementAncienneteDuMois(p.date_embauche, annee, mois); const isSel = selectedRowKey === p.id; const hasSel = selectedRowKey !== null; const bdr = isSel ? 'border-y-2 border-y-amber-500 dark:border-y-amber-400' : ''; return (<tr key={p.id} data-anciennete={anniversaire ? "true" : undefined} aria-selected={isSel} onClick={() => setSelectedRowKey((prev) => (prev === p.id ? null : p.id))} className={`cursor-pointer transition-all ${isSel ? 'bg-amber-100/95 dark:bg-amber-900/55 shadow-md font-bold text-slate-950 dark:text-amber-50' : `hover:bg-sky-50/50 dark:hover:bg-slate-700/50 ${hasSel ? 'opacity-80 hover:opacity-100' : ''}`}`}><td className={`py-2 px-2 text-center font-bold ${isSel ? 'border-l-4 border-l-amber-600 dark:border-l-amber-400' : ''} ${bdr}`}>{p.numero_matricule}</td><td className={`py-2 px-3 font-semibold truncate max-w-[160px] ${bdr}`}>{p.nom_prenoms} {anniversaire && <AncienneteBadge changement={anniversaire} />}</td><td className={`py-2 px-2 text-center font-mono ${bdr}`}>{p.numero_cnaps||''}</td><td className={`py-2 px-2 text-center font-bold text-salfa-teal dark:text-sky-300 ${bdr}`}>{p.categorie||''}</td><td className={`py-2 px-3 truncate max-w-[120px] ${bdr}`}>{p.jobs||''}</td><td className={`py-2 px-3 text-right font-mono ${bdr}`}>{fmt(p.base_aj)}</td><td className={`py-2 px-3 text-right font-mono ${bdr}`}>{fmt(p.logt_trsp)}</td><td className={`py-2 px-3 text-right font-mono ${bdr}`}>{fmt(p.rendement)}</td><td className={`py-2 px-3 text-right font-mono ${bdr}`}>{fmt(p.resp_repres)}</td><td className={`py-2 px-3 text-right font-mono font-bold ${bdr}`}>{fmt(p.salaire_brut)}</td><td className={`py-2 px-2 text-right font-mono ${bdr}`}>{fmt(p.cnaps)}</td><td className={`py-2 px-2 text-right font-mono ${bdr}`}>{fmt(p.patronal)}</td><td className={`py-2 px-3 text-right font-mono ${bdr}`}>{fmt(p.salaire_imposable)}</td><td className={`py-2 px-2 text-right font-mono ${bdr}`}>{fmt(p.irsa)}</td><td className={`py-2 px-3 text-right font-mono ${bdr}`}>{fmt(p.salaire_net)}</td><td className={`py-2 px-3 text-right font-mono ${bdr}`}>{fmt(p.accessoir)}</td><td className={`py-2 px-3 text-right font-mono font-bold ${bdr}`}>{fmt(p.brut)}</td><td className={`py-2 px-3 text-right font-mono text-red-600 dark:text-red-300 ${bdr}`}>{fmt(p.avance)}</td><td className={`py-2 px-3 text-right font-mono text-red-600 dark:text-red-300 ${bdr}`}>{fmt(p.med)}</td><td className={`py-2 px-4 text-right font-mono font-extrabold text-emerald-700 dark:text-emerald-400 ${isSel ? 'bg-emerald-200/70 dark:bg-emerald-900/45' : 'bg-emerald-50/50 dark:bg-emerald-900/10'} ${bdr}`}>{fmt(p.net)}</td><td className={`py-2 px-2 text-right font-mono text-violet-700 dark:text-violet-300 ${bdr}`}>{Number(p.conge_pris_mois||0)?`${fmtJ(p.conge_pris_mois)} j`:'—'}</td><td className={`py-2 px-3 text-right font-mono font-bold text-violet-700 dark:text-violet-300 ${bdr}`}>{fmtJ(p.conge_restant)} j</td></tr>); })}{paies.length>0 && <tr className="bg-slate-200 dark:bg-slate-700 font-extrabold border-t-2 sticky bottom-0"><td className="py-3 px-2 text-center">TOTAL</td><td className="py-3 px-3">{totaux.count_employes||paies.length} sal.</td><td colSpan={3}></td><td className="py-3 px-3 text-right font-mono">{fmt(totaux.total_base_aj)}</td><td className="py-3 px-3 text-right">{fmt(totaux.total_logt_trsp)}</td><td className="py-3 px-3 text-right">{fmt(totaux.total_rendement)}</td><td className="py-3 px-3 text-right">{fmt(totaux.total_resp_repres)}</td><td className="py-3 px-3 text-right">{fmt(totaux.total_salaire_brut)}</td><td className="py-3 px-2 text-right">{fmt(totaux.total_cnaps)}</td><td className="py-3 px-2 text-right">{fmt(totaux.total_patronal)}</td><td className="py-3 px-3 text-right">{fmt(totaux.total_salaire_imposable)}</td><td className="py-3 px-2 text-right">{fmt(totaux.total_irsa)}</td><td className="py-3 px-3 text-right">{fmt(totaux.total_salaire_net)}</td><td className="py-3 px-3 text-right">{fmt(totaux.total_accessoir)}</td><td className="py-3 px-3 text-right">{fmt(totaux.total_brut)}</td><td className="py-3 px-3 text-right text-red-700 dark:text-red-300">{fmt(totaux.total_avance)}</td><td className="py-3 px-3 text-right text-red-700 dark:text-red-300">{fmt(totaux.total_med)}</td><td className="py-3 px-4 text-right text-emerald-800 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/20">{fmt(totaux.total_net)}</td><td className="py-3 px-2 text-right font-mono text-violet-700 dark:text-violet-300">{fmtJ(totaux.total_conge_pris_mois)} j</td><td className="py-3 px-3 text-right font-mono text-violet-700 dark:text-violet-300">{fmtJ(totaux.total_conge_restant)} j</td></tr>}</tbody></table></div></div>
        </>
      ) : (
        <>
          <div className="block lg:hidden space-y-2">{loading ? <div className="caisse-card bg-white dark:bg-slate-800 rounded-xl p-6 text-center text-sm text-slate-500 border dark:border-slate-700">Chargement...</div> : comparaison.length===0 ? <div className="caisse-card bg-white dark:bg-slate-800 rounded-xl p-6 text-center text-sm text-slate-500 border dark:border-slate-700">Aucune donnée.</div> : compSort.rows.map((d,i) => { const ec=Number(d.ecart||0); return (<div key={i} className="caisse-card bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-700 p-3 shadow-sm"><div className="flex justify-between gap-2"><div><div className="font-bold text-sm dark:text-white">{d.numero_matricule} — {d.nom_prenoms}</div><div className="text-[11px] text-slate-500 dark:text-slate-400">{d.categorie||''} • {d.jobs||''}</div></div><div className={`text-xs font-bold px-2 py-1 rounded-full ${ec>0.01?'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300':ec<-0.01?'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300':'bg-slate-100 dark:bg-slate-700 text-slate-500'}`}>{ec>0?'+':''}{fmt(ec)}</div></div><div className="grid grid-cols-2 gap-2 mt-2 text-xs"><div className="bg-slate-50 dark:bg-slate-700/50 rounded p-2 dark:text-slate-200"><div className="text-[9px] text-slate-500 dark:text-slate-400 uppercase">NET {mois}</div><div className="font-mono font-bold">{fmt(Number(d.net_actuel||0))}</div></div><div className="bg-slate-50 dark:bg-slate-700/50 rounded p-2 dark:text-slate-200"><div className="text-[9px] text-slate-500 dark:text-slate-400 uppercase">Net Avant</div><div className="font-mono">{fmt(Number(d.net_avant||0))}</div></div></div></div>); })}</div>
          <div className="hidden lg:block caisse-card bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden w-full"><div className="table-responsive thin-scrollbar max-h-[65vh]"><table className="w-full text-left border-collapse min-w-[800px]"><thead className="sticky top-0 z-10 bg-salfa-dark dark:bg-slate-900 text-white text-xs uppercase"><tr><SortableHeader column="numero_matricule" sort={compSort} className="py-3.5 px-4 text-center">Mat</SortableHeader><SortableHeader column="nom_prenoms" sort={compSort} className="py-3.5 px-6">NOM</SortableHeader><SortableHeader column="categorie" sort={compSort} className="py-3.5 px-3 text-center">CAT</SortableHeader><SortableHeader column="jobs" sort={compSort} className="py-3.5 px-6">JOBS</SortableHeader><SortableHeader column="net_actuel" sort={compSort} className="py-3.5 px-6 text-right">NET ({mois})</SortableHeader><SortableHeader column="net_avant" sort={compSort} className="py-3.5 px-6 text-right">Net Avant</SortableHeader><SortableHeader column="ecart" sort={compSort} className="py-3.5 px-6 text-right">ÉCART</SortableHeader></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-700 text-sm dark:text-slate-200">{loading ? <tr><td colSpan={7} className="py-8 text-center">Chargement...</td></tr> : comparaison.length===0 ? <tr><td colSpan={7} className="py-8 text-center">Aucune donnée.</td></tr> : (() => { let ta=0,tb=0,te=0; return (<>{compSort.rows.map((d,i) => { const act=Number(d.net_actuel||0),av=Number(d.net_avant||0),ec=Number(d.ecart||0); ta+=act; tb+=av; te+=ec; return (<tr key={i} className="hover:bg-sky-50/50 dark:hover:bg-slate-700/50"><td className="py-3 px-4 text-center font-bold">{d.numero_matricule}</td><td className="py-3 px-6 font-semibold">{d.nom_prenoms}</td><td className="py-3 px-3 text-center font-bold text-salfa-teal dark:text-sky-300">{d.categorie||'—'}</td><td className="py-3 px-6">{d.jobs||'—'}</td><td className="py-3 px-6 text-right font-mono">{fmt(act)}</td><td className="py-3 px-6 text-right font-mono text-slate-600 dark:text-slate-400">{fmt(av)}</td><td className="py-3 px-6 text-right font-mono font-bold">{ec>0.01?<span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-0.5 rounded-full"><ArrowUpRight className="w-4 h-4" />+{fmt(ec)}</span>:ec<-0.01?<span className="inline-flex items-center gap-1 text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-900/20 px-2.5 py-0.5 rounded-full"><ArrowDownRight className="w-4 h-4" />{fmt(ec)}</span>:<span className="inline-flex items-center gap-1 text-slate-500"><Minus className="w-3.5 h-3.5" />-</span>}</td></tr>); })}<tr className="bg-slate-200 dark:bg-slate-700 font-extrabold border-t-2 sticky bottom-0"><td className="py-3.5 px-4 text-center">TOTAL</td><td className="py-3.5 px-6">{comparaison.length} salariés</td><td colSpan={2}></td><td className="py-3.5 px-6 text-right font-mono">{fmt(ta)}</td><td className="py-3.5 px-6 text-right font-mono">{fmt(tb)}</td><td className="py-3.5 px-6 text-right font-mono">{te>0.01?<span className="text-emerald-800 dark:text-emerald-300">+{fmt(te)}</span>:te<-0.01?<span className="text-red-700 dark:text-red-300">{fmt(te)}</span>:<span>-</span>}</td></tr></>); })()}</tbody></table></div></div>
        </>
      )}
    </div>
  );
};
