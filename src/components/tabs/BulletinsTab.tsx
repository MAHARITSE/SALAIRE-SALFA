// ==============================================================================
// COMPOSANT REACT : ONGLET 3 - BULLETINS DE PAIE (1 EX. À L'ÉCRAN / 2 EX. SUR A4)
// ==============================================================================
import React, { useState, useEffect } from 'react';
import { PaieMensuelle } from '../../types';
import { fetchPaiesMois } from '../../api';
import {
  Calendar, Printer, Download, FileText, Building2, ShieldCheck, User, Scissors, BookOpen, Eye
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

function formatAr(val: number | undefined): string {
  if (val === undefined || val === null) return '0,00 Ar';
  return val.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' Ar';
}

export const BulletinsTab: React.FC = () => {
  const [mois, setMois] = useState('JANVIER');
  const [annee, setAnnee] = useState(2026);
  const [paies, setPaies] = useState<PaieMensuelle[]>([]);
  const [selectedPaie, setSelectedPaie] = useState<PaieMensuelle | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const moisListe = [
    "JANVIER", "FEVRIER", "MARS", "AVRIL", "MAI", "JUIN",
    "JUILLET", "AOUT", "SEPTEMBRE", "OCTOBRE", "NOVEMBRE", "DECEMBRE"
  ];

  const loadData = async () => {
    setLoading(true);
    const d = await fetchPaiesMois(annee, mois);
    const list = d.employes || [];
    setPaies(list);
    setLoading(false);
    if (list.length > 0) {
      if (!selectedPaie || !list.some(p => p.id === selectedPaie.id)) {
        setSelectedPaie(list[0]);
      }
    } else {
      setSelectedPaie(null);
    }
  };

  useEffect(() => {
    loadData();
  }, [mois, annee]);

  const filteredPaies = paies.filter((p) => {
    const s = search.toLowerCase();
    return (
      String(p.numero_matricule).includes(s) ||
      p.nom_prenoms.toLowerCase().includes(s) ||
      (p.jobs && p.jobs.toLowerCase().includes(s))
    );
  });

  const handlePrint = () => {
    window.print();
  };

  // Générateur PDF jsPDF A4 PAYSAGE : 2 EX. CÔTÉ À CÔTÉ AVEC MARGE DE RELIURE À GAUCHE (20 MM)
  const handleDownloadPDF = () => {
    if (!selectedPaie) return;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const p = selectedPaie;

    const drawExemplaire = (startX: number, widthX: number, titreExemplaire: string) => {
      const centerX = startX + (widthX / 2);

      // 1. En-tête texte officiel sans image
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(26, 54, 93); // #1A365D
      doc.text("FIANGONANA LOTERANA MALAGASY (EGLISE LUTHERIENNE MALGACHE)", centerX, 13, { align: "center" });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.2);
      doc.setTextColor(43, 108, 176); // #2B6CB0
      doc.text("SAMPAN'ASA LOTERANA MOMBA NY FAHASALAMANA — DEPARTEMENT DE SANTE", centerX, 18, { align: "center" });
      doc.setFont("helvetica", "bold");
      doc.text("DISPENSAIRE TANAMBAO - TOBY BETELA TOLIARA", centerX, 22.5, { align: "center" });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.2);
      doc.setTextColor(100, 116, 139);
      doc.text("NIF: 5000767080 | STAT: 851 125 120 120 001 36 | E-mail: salfa.tulear@gmail.com", centerX, 26.5, { align: "center" });

      // Ligne de séparation
      doc.setDrawColor(203, 213, 225);
      doc.line(startX, 29, startX + widthX, 29);

      // Titre Centré + Mention Exemplaire
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(26, 54, 93);
      doc.text("FILAZANA NY KARAMA SY NY TOA AZY ISAM-BATAN'OLONA", centerX, 34, { align: "center" });

      doc.setFontSize(8.2);
      doc.setTextColor(43, 108, 176);
      doc.text(`(Bulletin de paie) — PÉRIODE : ${p.mois} ${p.annee}  |  ${titreExemplaire}`, centerX, 39, { align: "center" });

      // Bloc Identification aéré et rallongé
      const empRows = [
        [
          "N° Mat :", `${p.numero_matricule} (${p.categorie || '—'})`,
          "Nom :", p.nom_prenoms
        ],
        [
          "N° CNaPS :", String(p.numero_cnaps || '—'),
          "Fonction :", `${p.jobs || '—'} (${p.nombre_annees || 0} ans)`
        ],
        [
          "Enfant(s) :", String(p.enfant_a_charge || 0),
          "Règlement :", p.rib ? "Virement Bancaire" : "Espèces"
        ]
      ];

      autoTable(doc, {
        startY: 42,
        body: empRows,
        theme: 'grid',
        styles: { font: "helvetica", fontSize: 8, textColor: [26, 32, 44], cellPadding: 2.2 },
        columnStyles: {
          0: { fontStyle: 'bold', textColor: [100, 116, 139], cellWidth: 19 },
          1: { fontStyle: 'bold', cellWidth: 36 },
          2: { fontStyle: 'bold', textColor: [100, 116, 139], cellWidth: 18 },
          3: { fontStyle: 'bold', cellWidth: 61 }
        },
        headStyles: { fillColor: [247, 250, 252] },
        margin: { left: startX, right: 297 - (startX + widthX) }
      });

      const finalYEmp = (doc as any).lastAutoTable.finalY || 64;

      // Tableau des rubriques rallongé
      const rubriquesRows: any[] = [
        ["Salaire de Base (BASE AJ)", "Base 30 j", formatAr(p.base_aj), ""],
        ["Indemnité Logement & Transport", "Forfaitaire", formatAr(p.logt_trsp), ""]
      ];
      if ((p.rendement || 0) > 0) rubriquesRows.push(["Prime de Rendement", "Rendement", formatAr(p.rendement), ""]);
      if ((p.resp_repres || 0) > 0) rubriquesRows.push(["Indemnité Resp. / Représentation", "RESP REPRES", formatAr(p.resp_repres), ""]);

      rubriquesRows.push(["SALAIRE BRUT SOUMIS À COTISATION", "", formatAr(p.salaire_brut), ""]);
      rubriquesRows.push(["Retenue CNaPS (1%)", "1,00 %", "", formatAr(p.cnaps)]);
      rubriquesRows.push(["SALAIRE IMPOSABLE", "Base impôt", formatAr(p.salaire_imposable), ""]);
      rubriquesRows.push([`Retenue IRSA (Enfants : ${p.enfant_a_charge || 0})`, "Barème CGI", "", formatAr(p.irsa)]);
      rubriquesRows.push(["SALAIRE NET DE BASE", "Avant accessoires", formatAr(p.salaire_net), ""]);

      if ((p.accessoir || 0) > 0) rubriquesRows.push(["TOTAL ACCESSOIRES (Primes div.)", "Accessoire", formatAr(p.accessoir), ""]);
      rubriquesRows.push(["TOTAL BRUT À PAYER", "Net + Access.", formatAr(p.brut), ""]);
      if ((p.avance || 0) > 0) rubriquesRows.push(["Avance sur salaire / Prêt", "Retenue", "", formatAr(p.avance)]);
      if ((p.med || 0) > 0) rubriquesRows.push(["Médicaments / Pharmacie (MED)", "Retenue", "", formatAr(p.med)]);

      autoTable(doc, {
        startY: finalYEmp + 4,
        head: [["DÉSIGNATION DES RUBRIQUES", "BASE / OBS", "GAINS (Ar)", "RETENUES (Ar)"]],
        body: rubriquesRows,
        theme: 'grid',
        headStyles: { fillColor: [226, 232, 240], textColor: [26, 54, 93], fontStyle: 'bold', halign: 'center', fontSize: 8 },
        styles: { font: "helvetica", fontSize: 7.8, cellPadding: 2.1 },
        columnStyles: {
          0: { cellWidth: 54 },
          1: { cellWidth: 22, halign: 'center' },
          2: { cellWidth: 29, halign: 'right' },
          3: { cellWidth: 29, halign: 'right' }
        },
        didParseCell: (data) => {
          const text = String(data.cell.raw || '');
          if (text.includes("SALAIRE BRUT") || text.includes("SALAIRE IMPOSABLE") || text.includes("SALAIRE NET") || text.includes("TOTAL BRUT")) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.textColor = [26, 54, 93];
          }
        },
        margin: { left: startX, right: 297 - (startX + widthX) }
      });

      const finalYRub = (doc as any).lastAutoTable.finalY || 148;

      // Encadré NET À PAYER AU SALARIÉ aéré et rallongé
      doc.setFillColor(26, 54, 93);
      doc.rect(startX, finalYRub + 5, widthX, 14, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(255, 255, 255);
      doc.text("NET À PAYER (Arrondi CGI Madagascar)", startX + 4, finalYRub + 13.5);
      doc.setFontSize(12.5);
      doc.text(formatAr(p.net), startX + widthX - 4, finalYRub + 14, { align: "right" });

      // Détail règlement et Signatures au bas de la page
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.8);
      doc.setTextColor(26, 32, 44);
      const ribTxt = p.rib ? p.rib : "Aucun (Espèces)";
      doc.text(`Règlement : Virement : ${formatAr(p.virement || 0)} | Espèces : ${formatAr(p.especes || 0)}  —  RIB : ${ribTxt}`, startX, finalYRub + 25);

      doc.setFont("helvetica", "bold");
      doc.text("L'Employeur / La Direction (Cachet)", startX + (widthX * 0.25), finalYRub + 35, { align: "center" });
      doc.text("L'Employé(e) (Bon pour acquit)", startX + (widthX * 0.75), finalYRub + 35, { align: "center" });
    };

    // 1. Exemplaire 1 : Employeur avec MARGE DE RELIURE À GAUCHE (startX = 20 mm, largeur = 134 mm)
    drawExemplaire(20, 134, "EXEMPLAIRE 1 : EMPLOYEUR (Souche clinique)");

    // 2. Ligne de découpe en pointillés verticale à X = 158.5 mm
    doc.setDrawColor(148, 163, 184);
    doc.setLineDashPattern([3, 2], 0);
    doc.line(158.5, 10, 158.5, 200);
    doc.setLineDashPattern([], 0);

    // 3. Exemplaire 2 : Salarié (startX = 162 mm, largeur = 131 mm)
    drawExemplaire(162, 131, "EXEMPLAIRE 2 : SALARIÉ (Original à conserver)");

    const cleanNom = p.nom_prenoms.replace(/[^a-z0-9]/gi, '_');
    doc.save(`Bulletin_CoteACote_A4_Reliure_${p.mois}_${p.annee}_Mat_${p.numero_matricule}_${cleanNom}.pdf`);
  };

  return (
    <div className="space-y-6">
      
      {/* Barre d'outils supérieure */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4 no-print">
        <div className="flex items-center gap-3">
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

        <div className="flex items-center gap-3">
          <button
            onClick={handleDownloadPDF}
            disabled={!selectedPaie}
            className="bg-salfa-dark hover:bg-salfa-teal disabled:opacity-50 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow transition"
            title="Génère 2 exemplaires côte à côte avec marge de reliure gauche (20 mm) sur la feuille A4 paysage"
          >
            <Download className="w-4 h-4" />
            <span>Télécharger PDF (2 Ex. Côte à Côte A4 + Reliure)</span>
          </button>
          <button
            onClick={handlePrint}
            disabled={!selectedPaie}
            className="bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimer (2 Ex. A4 Paysage)</span>
          </button>
        </div>
      </div>

      {/* Zone principale : liste à gauche / aperçu à droite */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Volet sélection salarié */}
        <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-4 no-print">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom / matricule..."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:ring-2 focus:ring-salfa-teal"
          />

          <div className="space-y-1 max-h-[60vh] overflow-y-auto pr-1">
            {loading ? (
              <div className="text-center py-4 text-xs text-slate-500">Chargement...</div>
            ) : filteredPaies.length === 0 ? (
              <div className="text-center py-4 text-xs text-slate-500">Aucun bulletin pour cette période.</div>
            ) : (
              filteredPaies.map((p) => {
                const isSelected = selectedPaie?.id === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPaie(p)}
                    className={`w-full text-left p-3 rounded-lg border transition ${
                      isSelected
                        ? 'bg-salfa-dark text-white border-salfa-dark shadow'
                        : 'bg-white hover:bg-sky-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold font-mono">Mat {p.numero_matricule}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        isSelected ? 'bg-white/20 text-white' : 'bg-salfa-teal/10 text-salfa-teal'
                      }`}>
                        {p.categorie || '—'}
                      </span>
                    </div>
                    <div className="text-xs font-semibold truncate mt-1">{p.nom_prenoms}</div>
                    <div className={`text-[11px] font-mono mt-1 ${isSelected ? 'text-sky-200' : 'text-slate-500'}`}>
                      NET : {formatAr(p.net)}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* VOLET APERÇU ÉCRAN : 1 SEUL BULLETIN AFFICHÉ / IMPRESSION : 2 EX. CÔTÉ À CÔTÉ */}
        <div className="lg:col-span-3 bg-white rounded-xl shadow-lg border border-slate-200 p-6 print:shadow-none print:border-none print:p-0">
          {!selectedPaie ? (
            <div className="text-center py-16 text-slate-500">
              <FileText className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p className="text-sm font-semibold">Aucun bulletin sélectionné ou disponible pour cette période.</p>
              <p className="text-xs text-slate-400 mt-1">Rendez-vous dans l'onglet Saisie Mensuelle pour initialiser le mois.</p>
            </div>
          ) : (
            <div className="space-y-4">
              
              {/* Bandeau explicatif (écran uniquement) */}
              <div className="bg-sky-50 border border-sky-200 p-3 rounded-lg text-xs text-salfa-dark flex flex-col sm:flex-row items-center justify-between gap-2 no-print">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-salfa-teal shrink-0" />
                  <span>
                    <b>Affichage écran :</b> 1 seul exemplaire est affiché pour un confort de lecture optimal.
                  </span>
                </div>
                <div className="text-[11px] font-semibold text-slate-600 bg-white px-2.5 py-1 rounded border border-sky-100">
                  Impression & PDF : <b>2 exemplaires côté à côte (A4 Paysage) + Marge de reliure (20 mm)</b>
                </div>
              </div>

              {/* === VUE ÉCRAN : 1 SEUL BULLETIN AFFICHÉ (block print:hidden) === */}
              <div className="block print:hidden max-w-2xl mx-auto">
                <BulletinExemplaireCard
                  paie={selectedPaie}
                  titreExemplaire="BULLETIN DE PAIE INDIVIDUEL (Vue Écran / Salarié)"
                  largeText={true}
                />
              </div>

              {/* === VUE IMPRESSION : 2 EXEMPLAIRES CÔTÉ À CÔTÉ SUR A4 PAYSAGE (hidden print:grid) === */}
              <div className="hidden print:grid grid-cols-2 gap-6 relative border-l-[16px] border-slate-200 pl-4">
                
                {/* EXEMPLAIRE 1 : EMPLOYEUR (GAUCHE) */}
                <BulletinExemplaireCard
                  paie={selectedPaie}
                  titreExemplaire="EXEMPLAIRE 1 : EMPLOYEUR (Souche clinique / Bon pour acquit)"
                  largeText={false}
                />

                {/* EXEMPLAIRE 2 : SALARIÉ (DROITE) */}
                <BulletinExemplaireCard
                  paie={selectedPaie}
                  titreExemplaire="EXEMPLAIRE 2 : SALARIÉ (Original à conserver par l'employé)"
                  largeText={false}
                />

              </div>

            </div>
          )}
        </div>

      </div>

    </div>
  );
};

// ------------------------------------------------------------------------------
// SOUS-COMPOSANT : CARTE BULLETIN (LARGE SUR ÉCRAN / COMPACT POUR IMPRESSION)
// ------------------------------------------------------------------------------
interface CardProps {
  paie: PaieMensuelle;
  titreExemplaire: string;
  largeText?: boolean;
}

const BulletinExemplaireCard: React.FC<CardProps> = ({ paie, titreExemplaire, largeText = false }) => {
  const isMaternite = paie.conge_maternite === 1 || paie.conge_maternite === true;

  return (
    <div className={`border border-slate-300 rounded-xl bg-white space-y-4 shadow-sm flex flex-col justify-between ${
      largeText ? 'p-6 sm:p-8 min-h-[640px]' : 'p-5 min-h-[580px]'
    }`}>
      
      <div>
        {/* En-tête officiel sans image et Titre Centré */}
        <div className="text-center space-y-1 border-b border-slate-200 pb-3">
          <div className={`${largeText ? 'text-xs' : 'text-[11px]'} font-extrabold uppercase text-salfa-dark`}>
            FIANGONANA LOTERANA MALAGASY (EGLISE LUTHERIENNE MALGACHE)
          </div>
          <div className={`${largeText ? 'text-[11px]' : 'text-[10px]'} font-bold text-salfa-teal`}>
            SAMPAN'ASA LOTERANA MOMBA NY FAHASALAMANA — DEPARTEMENT DE SANTE
          </div>
          <div className={`${largeText ? 'text-sm' : 'text-xs'} font-extrabold text-salfa-dark`}>
            DISPENSAIRE TANAMBAO - TOBY BETELA TOLIARA
          </div>
          <div className={`${largeText ? 'text-[10.5px]' : 'text-[9.5px]'} text-slate-500 font-mono`}>
            NIF: 5000767080 | STAT: 851 125 120 120 001 36 | E-mail: salfa.tulear@gmail.com
          </div>

          <div className="pt-3">
            <h2 className={`${largeText ? 'text-base' : 'text-xs'} font-extrabold text-salfa-dark tracking-tight`}>
              FILAZANA NY KARAMA SY NY TOA AZY ISAM-BATAN'OLONA
            </h2>
            <div className={`${largeText ? 'text-xs' : 'text-[10.5px]'} font-bold text-salfa-teal mt-0.5`}>
              (Bulletin de paie) — PÉRIODE : {paie.mois} {paie.annee}  |  {titreExemplaire}
            </div>
          </div>
        </div>

        {/* Bloc identification salarié */}
        <div className={`bg-slate-50 rounded-lg p-3 border border-slate-200 grid grid-cols-2 gap-2 mt-3 ${
          largeText ? 'text-sm' : 'text-xs'
        }`}>
          <div>
            <span className="text-slate-500">N° Mat :</span>{' '}
            <span className="font-extrabold text-salfa-dark">{paie.numero_matricule} ({paie.categorie || '—'})</span>
          </div>
          <div>
            <span className="text-slate-500">Mode :</span>{' '}
            <span className="font-bold text-salfa-dark">{paie.rib ? "Virement Bancaire" : "Espèces"}</span>
          </div>
          <div className="col-span-2 flex items-center gap-2">
            <span className="text-slate-500">Nom :</span>{' '}
            <span className="font-extrabold text-slate-900 truncate">{paie.nom_prenoms}</span>
            {isMaternite && (
              <span className="px-2 py-0.5 rounded bg-pink-100 text-pink-800 text-[10px] font-bold uppercase shrink-0">
                Maternité (50%)
              </span>
            )}
          </div>
          <div className="col-span-2">
            <span className="text-slate-500">Fonction / Emb :</span>{' '}
            <span className="font-semibold text-slate-700">{paie.jobs || '—'} | {paie.date_embauche || '—'} ({paie.nombre_annees || 0} ans)</span>
          </div>
        </div>

        {/* Tableau des rubriques */}
        <div className="border border-slate-200 rounded-lg overflow-hidden mt-3">
          <table className={`w-full text-left border-collapse ${largeText ? 'text-xs' : 'text-xs'}`}>
            <thead>
              <tr className="bg-salfa-light/60 border-b border-slate-200 text-salfa-dark font-extrabold text-[11px]">
                <th className="py-2 px-3">RUBRIQUES</th>
                <th className="py-2 px-2 text-center">BASE</th>
                <th className="py-2 px-3 text-right">GAINS (Ar)</th>
                <th className="py-2 px-3 text-right">RETENUES</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[11px]">
              <tr>
                <td className="py-1.5 px-3">Salaire de Base (BASE AJ)</td>
                <td className="py-1.5 px-2 text-center text-slate-500">30 j</td>
                <td className="py-1.5 px-3 text-right font-mono font-medium">{formatAr(paie.base_aj)}</td>
                <td className="py-1.5 px-3 text-right"></td>
              </tr>
              <tr>
                <td className="py-1.5 px-3">Indemnité Logement & Transport</td>
                <td className="py-1.5 px-2 text-center text-slate-500">Forfait</td>
                <td className="py-1.5 px-3 text-right font-mono font-medium">{formatAr(paie.logt_trsp)}</td>
                <td className="py-1.5 px-3 text-right"></td>
              </tr>
              {(paie.rendement || 0) > 0 && (
                <tr>
                  <td className="py-1.5 px-3">Prime de Rendement</td>
                  <td className="py-1.5 px-2 text-center text-slate-500">Rend.</td>
                  <td className="py-1.5 px-3 text-right font-mono font-medium">{formatAr(paie.rendement)}</td>
                  <td className="py-1.5 px-3 text-right"></td>
                </tr>
              )}
              {(paie.resp_repres || 0) > 0 && (
                <tr>
                  <td className="py-1.5 px-3">Indemnité RESP REPRES</td>
                  <td className="py-1.5 px-2 text-center text-slate-500">RESP</td>
                  <td className="py-1.5 px-3 text-right font-mono font-medium">{formatAr(paie.resp_repres)}</td>
                  <td className="py-1.5 px-3 text-right"></td>
                </tr>
              )}

              <tr className="bg-slate-50 font-bold text-salfa-dark">
                <td className="py-1.5 px-3">
                  SALAIRE BRUT SOUMIS
                  {isMaternite && <span className="ml-1 text-[10px] text-pink-700 font-normal">(÷2 - Maternité)</span>}
                </td>
                <td className="py-1.5 px-2 text-center"></td>
                <td className="py-1.5 px-3 text-right font-mono">{formatAr(paie.salaire_brut)}</td>
                <td className="py-1.5 px-3 text-right"></td>
              </tr>

              <tr>
                <td className="py-1.5 px-3">Retenue CNaPS (1%)</td>
                <td className="py-1.5 px-2 text-center text-slate-500">1 %</td>
                <td className="py-1.5 px-3 text-right"></td>
                <td className="py-1.5 px-3 text-right font-mono">{formatAr(paie.cnaps)}</td>
              </tr>

              <tr className="bg-slate-50 font-bold text-salfa-dark">
                <td className="py-1.5 px-3">SALAIRE IMPOSABLE</td>
                <td className="py-1.5 px-2 text-center text-slate-500">Impôt</td>
                <td className="py-1.5 px-3 text-right font-mono">{formatAr(paie.salaire_imposable)}</td>
                <td className="py-1.5 px-3 text-right"></td>
              </tr>

              <tr>
                <td className="py-1.5 px-3">Retenue IRSA (Impôt)</td>
                <td className="py-1.5 px-2 text-center text-slate-500">Enf: {paie.enfant_a_charge || 0}</td>
                <td className="py-1.5 px-3 text-right"></td>
                <td className="py-1.5 px-3 text-right font-mono">{formatAr(paie.irsa)}</td>
              </tr>

              <tr className="bg-slate-50 font-bold text-salfa-dark">
                <td className="py-1.5 px-3">SALAIRE NET DE BASE</td>
                <td className="py-1.5 px-2 text-center text-slate-500">Base</td>
                <td className="py-1.5 px-3 text-right font-mono">{formatAr(paie.salaire_net)}</td>
                <td className="py-1.5 px-3 text-right"></td>
              </tr>

              {(paie.accessoir || 0) > 0 && (
                <tr>
                  <td className="py-1.5 px-3 font-semibold text-salfa-teal">TOTAL ACCESSOIRES (Primes)</td>
                  <td className="py-1.5 px-2 text-center text-slate-500">Access.</td>
                  <td className="py-1.5 px-3 text-right font-mono font-bold">{formatAr(paie.accessoir)}</td>
                  <td className="py-1.5 px-3 text-right"></td>
                </tr>
              )}

              <tr className="bg-slate-50 font-extrabold text-salfa-dark">
                <td className="py-1.5 px-3">TOTAL BRUT À PAYER</td>
                <td className="py-1.5 px-2 text-center"></td>
                <td className="py-1.5 px-3 text-right font-mono">{formatAr(paie.brut)}</td>
                <td className="py-1.5 px-3 text-right"></td>
              </tr>

              {(paie.avance || 0) > 0 && (
                <tr>
                  <td className="py-1.5 px-3">Avance sur salaire / Prêt</td>
                  <td className="py-1.5 px-2 text-center text-slate-500">Retenue</td>
                  <td className="py-1.5 px-3 text-right"></td>
                  <td className="py-1.5 px-3 text-right font-mono text-red-600">{formatAr(paie.avance)}</td>
                </tr>
              )}
              {(paie.med || 0) > 0 && (
                <tr>
                  <td className="py-1.5 px-3">Médicaments / Pharmacie (MED)</td>
                  <td className="py-1.5 px-2 text-center text-slate-500">Retenue</td>
                  <td className="py-1.5 px-3 text-right"></td>
                  <td className="py-1.5 px-3 text-right font-mono text-red-600">{formatAr(paie.med)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3 pt-3">
        {/* Encadré NET À PAYER AU SALARIÉ */}
        <div className="bg-salfa-dark text-white px-4 py-3 rounded-xl shadow flex items-center justify-between">
          <div>
            <div className="text-xs font-extrabold uppercase tracking-wide">
              NET À PAYER AU SALARIÉ
            </div>
            <div className="text-[10px] text-slate-300">
              Arrondi officiel CGI Madagascar (100 Ar inf.)
            </div>
          </div>
          <div className={`${largeText ? 'text-2xl' : 'text-xl'} font-extrabold font-mono text-white tracking-tight`}>
            {formatAr(paie.net)}
          </div>
        </div>

        {/* Détail règlement et Signatures */}
        <div className="flex items-center justify-between text-xs text-slate-700 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
          <div>
            <b>Règlement :</b> Vir : <span className="font-mono">{formatAr(paie.virement || 0)}</span> | Esp : <span className="font-mono">{formatAr(paie.especes || 0)}</span>
          </div>
          <div>
            <b>RIB :</b> <span className="font-mono font-semibold">{paie.rib || "Aucun"}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-center pt-2 pb-2 text-xs">
          <div>
            <div className="font-extrabold text-salfa-dark">L'Employeur / Direction</div>
            <div className="text-slate-400 text-[10px]">Cachet et Signature</div>
          </div>
          <div>
            <div className="font-extrabold text-salfa-dark">L'Employé(e) (Bon pour acquit)</div>
            <div className="text-slate-400 text-[10px]">Signature du salarié</div>
          </div>
        </div>
      </div>

    </div>
  );
};
