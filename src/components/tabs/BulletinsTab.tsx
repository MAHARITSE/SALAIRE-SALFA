// BULLETINS - SANS Ar + DARKMODE
import React, { useState, useEffect } from 'react';
import { PaieMensuelle } from '../../types';
import { fetchPaiesMois } from '../../api';
import { Calendar, Printer, Download, FileText, Eye } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

function fmt(val: number | undefined): string {
  if (val === undefined || val === null) return '0,00';
  return val.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const BulletinsTab: React.FC = () => {
  const [mois, setMois] = useState('JANVIER');
  const [annee, setAnnee] = useState(2026);
  const [paies, setPaies] = useState<PaieMensuelle[]>([]);
  const [selectedPaie, setSelectedPaie] = useState<PaieMensuelle | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const moisListe = ["JANVIER","FEVRIER","MARS","AVRIL","MAI","JUIN","JUILLET","AOUT","SEPTEMBRE","OCTOBRE","NOVEMBRE","DECEMBRE"];

  const loadData = async () => {
    setLoading(true);
    const d = await fetchPaiesMois(annee, mois);
    const list = d.employes || [];
    setPaies(list); setLoading(false);
    if (list.length > 0) { if (!selectedPaie || !list.some(p => p.id === selectedPaie.id)) setSelectedPaie(list[0]); } else setSelectedPaie(null);
  };
  useEffect(() => { loadData(); /* eslint-disable-next-line */ }, [mois, annee]);

  const filteredPaies = paies.filter((p) => {
    const s = search.toLowerCase();
    return String(p.numero_matricule).includes(s) || p.nom_prenoms.toLowerCase().includes(s) || (p.jobs && p.jobs.toLowerCase().includes(s));
  });

  const handlePrint = () => window.print();
  const handleDownloadPDF = () => {
    if (!selectedPaie) return;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const p = selectedPaie;
    const drawExemplaire = (startX: number, widthX: number, titreExemplaire: string) => {
      const centerX = startX + (widthX / 2);
      doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(26, 54, 93);
      doc.text("FIANGONANA LOTERANA MALAGASY (EGLISE LUTHERIENNE MALGACHE)", centerX, 13, { align: "center" });
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.2); doc.setTextColor(43, 108, 176);
      doc.text("SAMPAN'ASA LOTERANA MOMBA NY FAHASALAMANA", centerX, 18, { align: "center" });
      doc.setFont("helvetica", "bold"); doc.text("DISPENSAIRE TANAMBAO - TOBY BETELA TOLIARA", centerX, 22.5, { align: "center" });
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.2); doc.setTextColor(100, 116, 139);
      doc.text("NIF: 5000767080 | STAT: 851 125 120 120 001 36", centerX, 26.5, { align: "center" });
      doc.setDrawColor(203, 213, 225); doc.line(startX, 29, startX + widthX, 29);
      doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(26, 54, 93);
      doc.text("FILAZANA NY KARAMA", centerX, 34, { align: "center" });
      doc.setFontSize(8.2); doc.setTextColor(43, 108, 176);
      doc.text(`PÉRIODE : ${p.mois} ${p.annee} | ${titreExemplaire}`, centerX, 39, { align: "center" });
      const empRows = [
        ["N° Mat :", `${p.numero_matricule} (${p.categorie || '—'})`, "Nom :", p.nom_prenoms],
        ["N° CNaPS :", String(p.numero_cnaps || '—'), "Fonction :", `${p.jobs || '—'} (${p.nombre_annees || 0} ans)`],
        ["Enfant(s) :", String(p.enfant_a_charge || 0), "Règlement :", p.rib ? "Virement" : "Espèces"]
      ];
      autoTable(doc, { startY: 42, body: empRows, theme: 'grid', styles: { font: "helvetica", fontSize: 8, cellPadding: 2.2 }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 19 }, 1: { fontStyle: 'bold', cellWidth: 36 }, 2: { fontStyle: 'bold', cellWidth: 18 }, 3: { fontStyle: 'bold', cellWidth: 61 } }, margin: { left: startX, right: 297 - (startX + widthX) } });
      const finalYEmp = (doc as any).lastAutoTable.finalY || 64;
      const rubriquesRows: any[] = [
        ["Salaire Base (BASE AJ)", "30 j", fmt(p.base_aj), ""],
        ["Logement & Transport", "Forf", fmt(p.logt_trsp), ""]
      ];
      if ((p.rendement || 0) > 0) rubriquesRows.push(["Prime Rendement", "Rend", fmt(p.rendement), ""]);
      if ((p.resp_repres || 0) > 0) rubriquesRows.push(["RESP REPRES", "RESP", fmt(p.resp_repres), ""]);
      rubriquesRows.push(["SALAIRE BRUT SOUMIS", "", fmt(p.salaire_brut), ""]);
      rubriquesRows.push(["CNaPS (1%)", "1%", "", fmt(p.cnaps)]);
      rubriquesRows.push(["SALAIRE IMPOSABLE", "Impôt", fmt(p.salaire_imposable), ""]);
      rubriquesRows.push([`IRSA (Enf: ${p.enfant_a_charge || 0})`, "Barème", "", fmt(p.irsa)]);
      rubriquesRows.push(["SALAIRE NET BASE", "Base", fmt(p.salaire_net), ""]);
      if ((p.accessoir || 0) > 0) rubriquesRows.push(["TOTAL ACCESSOIRES", "Acc", fmt(p.accessoir), ""]);
      rubriquesRows.push(["TOTAL BRUT À PAYER", "Net+Acc", fmt(p.brut), ""]);
      if ((p.avance || 0) > 0) rubriquesRows.push(["Avance / Prêt", "Ret", "", fmt(p.avance)]);
      if ((p.med || 0) > 0) rubriquesRows.push(["Médicaments MED", "Ret", "", fmt(p.med)]);
      autoTable(doc, { startY: finalYEmp + 4, head: [["RUBRIQUES", "BASE", "GAINS", "RETENUES"]], body: rubriquesRows, theme: 'grid', headStyles: { fillColor: [226,232,240], textColor: [26,54,93], fontStyle: 'bold', halign: 'center', fontSize: 8 }, styles: { font: "helvetica", fontSize: 7.8, cellPadding: 2.1 }, columnStyles: { 0: { cellWidth: 54 }, 1: { cellWidth: 22, halign: 'center' }, 2: { cellWidth: 29, halign: 'right' }, 3: { cellWidth: 29, halign: 'right' } }, margin: { left: startX, right: 297 - (startX + widthX) } });
      const finalYRub = (doc as any).lastAutoTable.finalY || 148;
      doc.setFillColor(26, 54, 93); doc.rect(startX, finalYRub + 5, widthX, 14, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(255,255,255); doc.text("NET À PAYER", startX + 4, finalYRub + 13.5);
      doc.setFontSize(12.5); doc.text(fmt(p.net), startX + widthX - 4, finalYRub + 14, { align: "right" });
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.8); doc.setTextColor(26,32,44);
      doc.text(`Virement: ${fmt(p.virement || 0)} | Espèces: ${fmt(p.especes || 0)} — RIB: ${p.rib || "Aucun"}`, startX, finalYRub + 25);
      doc.setFont("helvetica", "bold"); doc.text("Employeur", startX + (widthX * 0.25), finalYRub + 35, { align: "center" }); doc.text("Employé", startX + (widthX * 0.75), finalYRub + 35, { align: "center" });
    };
    drawExemplaire(20, 134, "EX1: EMPLOYEUR"); doc.setDrawColor(148,163,184); doc.setLineDashPattern([3,2],0); doc.line(158.5,10,158.5,200); doc.setLineDashPattern([],0); drawExemplaire(162,131,"EX2: SALARIÉ");
    const cleanNom = p.nom_prenoms.replace(/[^a-z0-9]/gi, '_'); doc.save(`Bulletin_${p.mois}_${p.annee}_Mat_${p.numero_matricule}_${cleanNom}.pdf`);
  };

  return (
    <div className="space-y-3 sm:space-y-6 w-full max-w-full overflow-x-hidden">
      <div className="bg-white dark:bg-slate-800 p-3 sm:p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3"><Calendar className="w-4 h-4 text-salfa-teal dark:text-sky-300" /><span className="text-[11px] sm:text-xs font-bold uppercase text-slate-700 dark:text-slate-300">Période :</span><select value={mois} onChange={(e) => setMois(e.target.value)} className="rounded-lg border dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-bold">{["JANVIER","FEVRIER","MARS","AVRIL","MAI","JUIN","JUILLET","AOUT","SEPTEMBRE","OCTOBRE","NOVEMBRE","DECEMBRE"].map((m) => <option key={m} value={m}>{m}</option>)}</select><select value={annee} onChange={(e) => setAnnee(Number(e.target.value))} className="rounded-lg border dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-bold"><option value={2025}>2025</option><option value={2026}>2026</option><option value={2027}>2027</option></select></div>
        <div className="flex flex-col xs:flex-row items-stretch gap-2 w-full sm:w-auto"><button onClick={handleDownloadPDF} disabled={!selectedPaie} className="bg-salfa-dark dark:bg-slate-700 hover:bg-salfa-teal disabled:opacity-50 text-white px-3 sm:px-4 py-2 rounded-lg text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1.5 shadow"><Download className="w-4 h-4" /><span>PDF 2 Ex.</span></button><button onClick={handlePrint} disabled={!selectedPaie} className="bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 px-3 sm:px-4 py-2 rounded-lg text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1.5"><Printer className="w-4 h-4" /><span>Imprimer</span></button></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6 w-full">
        <div className="lg:col-span-1 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-2 sm:p-4 space-y-3 no-print w-full max-w-full overflow-hidden flex flex-col max-h-[40vh] lg:max-h-[75vh]">
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher..." className="w-full rounded-lg border dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-xs shrink-0" />
          <div className="space-y-1 overflow-y-auto thin-scrollbar pr-1 flex-1">
            {loading ? <div className="text-center py-4 text-xs text-slate-500">Chargement...</div> : filteredPaies.length === 0 ? <div className="text-center py-4 text-xs text-slate-500">Aucun bulletin.</div> : filteredPaies.map((p) => { const isSelected = selectedPaie?.id === p.id; return (<button key={p.id} onClick={() => setSelectedPaie(p)} className={`w-full text-left p-2.5 sm:p-3 rounded-lg border transition ${isSelected ? 'bg-salfa-dark dark:bg-slate-600 text-white border-salfa-dark dark:border-slate-600 shadow' : 'bg-white dark:bg-slate-700 hover:bg-sky-50 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-600'}`}><div className="flex justify-between"><span className="text-[11px] font-bold font-mono">Mat {p.numero_matricule}</span><span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${isSelected ? 'bg-white/20 text-white' : 'bg-salfa-teal/10 dark:bg-slate-500 text-salfa-teal dark:text-slate-200'}`}>{p.categorie || '—'}</span></div><div className="text-xs font-semibold truncate mt-1">{p.nom_prenoms}</div><div className={`text-[11px] font-mono mt-0.5 ${isSelected ? 'text-sky-200' : 'text-slate-500 dark:text-slate-400'}`}>NET: {fmt(p.net)}</div></button>); })}
          </div>
        </div>

        <div className="lg:col-span-2 xl:col-span-3 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 p-2 sm:p-4 lg:p-6 print:shadow-none print:border-none print:p-0 w-full max-w-full overflow-x-hidden">
          {!selectedPaie ? <div className="text-center py-12 text-slate-500 dark:text-slate-400"><FileText className="w-10 h-10 mx-auto mb-3 text-slate-300" /><p className="text-sm font-semibold">Aucun bulletin sélectionné.</p></div> : (
            <div className="space-y-3 w-full max-w-full">
              <div className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 p-2.5 rounded-lg text-[11px] sm:text-xs text-salfa-dark dark:text-slate-200 flex items-center gap-2 no-print"><Eye className="w-4 h-4 text-salfa-teal dark:text-sky-300" /><span>Écran: 1 exemplaire. Impression: 2 côte à côte A4 Paysage.</span></div>
              <div className="block print:hidden w-full"><div className="max-w-2xl mx-auto w-full"><BulletinCard paie={selectedPaie} titre="BULLETIN DE PAIE (Vue Écran)" large /></div></div>
              <div className="hidden print:grid grid-cols-2 gap-6 relative border-l-[16px] border-slate-200 pl-4"><BulletinCard paie={selectedPaie} titre="EX1: EMPLOYEUR" /><BulletinCard paie={selectedPaie} titre="EX2: SALARIÉ" /></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface CardProps { paie: PaieMensuelle; titre: string; large?: boolean; }
const BulletinCard: React.FC<CardProps> = ({ paie, titre, large = false }) => {
  const isMaternite = paie.conge_maternite === 1 || paie.conge_maternite === true;
  return (
    <div className={`border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 space-y-3 shadow-sm flex flex-col justify-between w-full max-w-full overflow-hidden ${large ? 'p-3 sm:p-6 lg:p-8 min-h-[550px]' : 'p-3 min-h-[500px]'}`}>
      <div className="w-full">
        <div className="text-center space-y-1 border-b border-slate-200 dark:border-slate-700 pb-3">
          <div className="text-[10px] sm:text-xs font-extrabold uppercase text-salfa-dark dark:text-white">FIANGONANA LOTERANA MALAGASY</div>
          <div className="text-xs sm:text-sm font-extrabold text-salfa-dark dark:text-white">DISPENSAIRE TANAMBAO - TOLIARA</div>
          <div className="pt-2"><h2 className="text-sm sm:text-base font-extrabold text-salfa-dark dark:text-white">FILAZANA NY KARAMA</h2><div className="text-[10px] sm:text-xs font-bold text-salfa-teal dark:text-sky-300 mt-0.5">{paie.mois} {paie.annee} | {titre}</div></div>
        </div>
        <div className={`bg-slate-50 dark:bg-slate-700/50 rounded-lg p-2 sm:p-3 border dark:border-slate-600 grid grid-cols-2 gap-1.5 mt-3 ${large ? 'text-xs sm:text-sm dark:text-slate-200' : 'text-[11px]'}`}>
          <div className="truncate">Mat: <b className="text-salfa-dark dark:text-white">{paie.numero_matricule} ({paie.categorie || '—'})</b></div><div className="truncate">Mode: <b>{paie.rib ? "Virement" : "Espèces"}</b></div>
          <div className="col-span-2 flex items-center gap-1.5 min-w-0"><span className="text-slate-500 dark:text-slate-400">Nom:</span><span className="font-extrabold truncate dark:text-white">{paie.nom_prenoms}</span>{isMaternite && <span title="Congé de maternité (3 mois, base brute à 50%)" className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-pink-100 dark:bg-pink-900/40 text-pink-800 dark:text-pink-200 text-[9px] font-bold ring-1 ring-pink-300 dark:ring-pink-700">MATERNITÉ · 3 mois</span>}</div>
          <div className="col-span-2 truncate">Fonction: {paie.jobs || '—'} ({paie.nombre_annees || 0} ans)</div>
        </div>
        <div className="border border-slate-200 dark:border-slate-600 rounded-lg overflow-hidden mt-3 w-full overflow-x-auto thin-scrollbar">
          <table className="w-full text-left border-collapse min-w-[320px]"><thead><tr className="bg-salfa-light/60 dark:bg-slate-700 border-b dark:border-slate-600 text-salfa-dark dark:text-white font-extrabold text-[10px] sm:text-[11px]"><th className="py-2 px-3">RUBRIQUES</th><th className="py-2 px-1 text-center">BASE</th><th className="py-2 px-3 text-right">GAINS</th><th className="py-2 px-3 text-right">RET</th></tr></thead><tbody className="divide-y dark:divide-slate-700 text-[10px] sm:text-[11px] dark:text-slate-200"><tr><td className="py-1 px-3">BASE AJ</td><td className="text-center text-slate-500">30 j</td><td className="text-right font-mono font-medium">{fmt(paie.base_aj)}</td><td></td></tr><tr><td className="py-1 px-3">Logt & Trsp</td><td className="text-center text-slate-500">Forf</td><td className="text-right font-mono">{fmt(paie.logt_trsp)}</td><td></td></tr>{(paie.rendement || 0) > 0 && <tr><td className="py-1 px-3">Prime Rend</td><td className="text-center">Rend</td><td className="text-right font-mono">{fmt(paie.rendement)}</td><td></td></tr>}{(paie.resp_repres || 0) > 0 && <tr><td className="py-1 px-3">RESP</td><td className="text-center">RESP</td><td className="text-right font-mono">{fmt(paie.resp_repres)}</td><td></td></tr>}<tr className="bg-slate-50 dark:bg-slate-700 font-bold"><td className="py-1.5 px-3">BRUT SOUMIS{isMaternite && <span className="ml-1 text-[9px] text-pink-700 dark:text-pink-300">÷2</span>}</td><td></td><td className="text-right font-mono">{fmt(paie.salaire_brut)}</td><td></td></tr><tr><td className="py-1 px-3">CNaPS 1%</td><td className="text-center">1%</td><td></td><td className="text-right font-mono">{fmt(paie.cnaps)}</td></tr><tr className="bg-slate-50 dark:bg-slate-700 font-bold"><td className="py-1 px-3">Imposable</td><td className="text-center">Imp</td><td className="text-right font-mono">{fmt(paie.salaire_imposable)}</td><td></td></tr><tr><td className="py-1 px-3">IRSA</td><td></td><td></td><td className="text-right font-mono">{fmt(paie.irsa)}</td></tr><tr className="bg-slate-50 dark:bg-slate-700 font-bold"><td className="py-1 px-3">NET BASE</td><td className="text-center">Base</td><td className="text-right font-mono">{fmt(paie.salaire_net)}</td><td></td></tr>{(paie.accessoir || 0) > 0 && <tr><td className="py-1 px-3 font-semibold text-salfa-teal dark:text-sky-300">ACCESSOIRES</td><td className="text-center">Acc</td><td className="text-right font-mono font-bold">{fmt(paie.accessoir)}</td><td></td></tr>}<tr className="bg-slate-50 dark:bg-slate-700 font-extrabold"><td className="py-1 px-3">BRUT À PAYER</td><td></td><td className="text-right font-mono">{fmt(paie.brut)}</td><td></td></tr>{(paie.avance || 0) > 0 && <tr><td className="py-1 px-3">Avance</td><td className="text-center">Ret</td><td></td><td className="text-right font-mono text-red-600 dark:text-red-300">{fmt(paie.avance)}</td></tr>}{(paie.med || 0) > 0 && <tr><td className="py-1 px-3">MED</td><td className="text-center">Ret</td><td></td><td className="text-right font-mono text-red-600 dark:text-red-300">{fmt(paie.med)}</td></tr>}</tbody></table>
        </div>
      </div>
      <div className="space-y-2 pt-2">
        <div className="bg-salfa-dark dark:bg-slate-900 text-white px-3 sm:px-4 py-2.5 rounded-xl shadow flex items-center justify-between"><div><div className="text-[10px] sm:text-xs font-extrabold uppercase">NET À PAYER</div><div className="text-[9px] text-slate-300">Arrondi CGI</div></div><div className={`${large ? 'text-lg sm:text-2xl' : 'text-base'} font-extrabold font-mono`}>{fmt(paie.net)}</div></div>
        <div className="flex justify-between text-[10px] sm:text-xs bg-slate-50 dark:bg-slate-700/50 px-3 py-2 rounded-lg border dark:border-slate-600 dark:text-slate-300"><div>Vir: {fmt(paie.virement || 0)} | Esp: {fmt(paie.especes || 0)}</div><div>RIB: <b className="font-mono">{paie.rib || "Aucun"}</b></div></div>
        <div className="grid grid-cols-2 gap-4 text-center pt-1 text-[10px]"><div><div className="font-extrabold dark:text-white">Employeur</div><div className="text-slate-400">Cachet</div></div><div><div className="font-extrabold dark:text-white">Employé</div><div className="text-slate-400">Signature</div></div></div>
      </div>
    </div>
  );
};
