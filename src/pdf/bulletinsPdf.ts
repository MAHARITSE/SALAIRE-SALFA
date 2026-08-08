import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PaieMensuelle } from '../types';

const NAVY: [number, number, number] = [26, 54, 93];
const BLUE: [number, number, number] = [43, 108, 176];

function fmt(value: number | undefined | null): string {
  return Number(value || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function safeFilePart(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/gi, '_');
}

/** Draws the two employer/employee copies on one landscape A4 page. */
function drawBulletinPage(doc: jsPDF, p: PaieMensuelle): void {
  const drawCopy = (x: number, width: number, title: string) => {
    const center = x + width / 2;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.2); doc.setTextColor(...NAVY);
    doc.text('FIANGONANA LOTERANA MALAGASY', center, 11, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.6); doc.setTextColor(...BLUE);
    doc.text("SAMPAN'ASA LOTERANA MOMBA NY FAHASALAMANA", center, 15, { align: 'center' });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...NAVY);
    doc.text('DISPENSAIRE TANAMBAO - TOBY BETELA TOLIARA', center, 19, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(5.8); doc.setTextColor(100, 116, 139);
    doc.text('NIF: 5000767080  |  STAT: 851 125 120 120 001 36', center, 22, { align: 'center' });
    doc.setDrawColor(203, 213, 225); doc.line(x, 24.5, x + width, 24.5);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...NAVY);
    doc.text('FILAZANA NY KARAMA', center, 30, { align: 'center' });
    doc.setFontSize(7); doc.setTextColor(...BLUE);
    doc.text(`PÉRIODE : ${p.mois} ${p.annee}  |  ${title}`, center, 34, { align: 'center' });

    autoTable(doc, {
      startY: 37,
      body: [
        ['N° Mat :', `${p.numero_matricule} (${p.categorie || '—'})`, 'Nom :', p.nom_prenoms],
        ['N° CNaPS :', String(p.numero_cnaps || '—'), 'Fonction :', `${p.jobs || '—'} (${p.nombre_annees || 0} ans)`],
        ['Enfant(s) :', String(p.enfant_a_charge || 0), 'Règlement :', p.rib ? 'Virement' : 'Espèces'],
      ],
      theme: 'grid', tableWidth: width,
      styles: { font: 'helvetica', fontSize: 6.3, cellPadding: 1.45, overflow: 'ellipsize' },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 16 }, 1: { fontStyle: 'bold', cellWidth: 34 }, 2: { fontStyle: 'bold', cellWidth: 16 }, 3: { fontStyle: 'bold', cellWidth: 70 } },
      margin: { left: x, right: 297 - x - width },
    });
    const employeeEnd = (doc as any).lastAutoTable.finalY || 55;
    const rows: string[][] = [
      ['Salaire Base (BASE AJ)', '30 j', fmt(p.base_aj), ''],
      ['Logement & Transport', 'Forf.', fmt(p.logt_trsp), ''],
    ];
    if (Number(p.rendement || 0) > 0) rows.push(['Prime Rendement', 'Rend.', fmt(p.rendement), '']);
    if (Number(p.resp_repres || 0) > 0) rows.push(['RESP REPRES', 'RESP', fmt(p.resp_repres), '']);
    rows.push(['SALAIRE BRUT SOUMIS', '', fmt(p.salaire_brut), '']);
    rows.push(['CNaPS (1%)', '1%', '', fmt(p.cnaps)]);
    rows.push(['SALAIRE IMPOSABLE', 'Impôt', fmt(p.salaire_imposable), '']);
    rows.push([`IRSA (Enf: ${p.enfant_a_charge || 0})`, 'Barème', '', fmt(p.irsa)]);
    rows.push(['SALAIRE NET BASE', 'Base', fmt(p.salaire_net), '']);
    if (Number(p.accessoir || 0) > 0) rows.push(['TOTAL ACCESSOIRES', 'Acc.', fmt(p.accessoir), '']);
    rows.push(['TOTAL BRUT À PAYER', 'Net+Acc', fmt(p.brut), '']);
    if (Number(p.avance || 0) > 0) rows.push(['Avance / Prêt', 'Ret.', '', fmt(p.avance)]);
    if (Number(p.med || 0) > 0) rows.push(['Médicaments MED', 'Ret.', '', fmt(p.med)]);

    autoTable(doc, {
      startY: employeeEnd + 3, head: [['RUBRIQUES', 'BASE', 'GAINS', 'RETENUES']], body: rows,
      theme: 'grid', tableWidth: width,
      headStyles: { fillColor: [226, 232, 240], textColor: NAVY, fontStyle: 'bold', halign: 'center', fontSize: 6.4 },
      styles: { font: 'helvetica', fontSize: 6.2, cellPadding: 1.3 },
      columnStyles: { 0: { cellWidth: 55 }, 1: { cellWidth: 19, halign: 'center' }, 2: { cellWidth: 31, halign: 'right' }, 3: { cellWidth: 31, halign: 'right' } },
      margin: { left: x, right: 297 - x - width },
    });
    const end = (doc as any).lastAutoTable.finalY || 130;
    doc.setFillColor(...NAVY); doc.roundedRect(x, end + 4, width, 12, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.6); doc.setTextColor(255, 255, 255);
    doc.text('NET À PAYER', x + 3, end + 11.5);
    doc.setFontSize(10.5); doc.text(fmt(p.net), x + width - 3, end + 11.5, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.4); doc.setTextColor(26, 32, 44);
    doc.text(`Virement: ${fmt(p.virement)}  |  Espèces: ${fmt(p.especes)}`, x, end + 21);
    doc.text(`RIB: ${p.rib || 'Aucun'}`, x, end + 25);
    doc.setFont('helvetica', 'bold'); doc.text('Employeur', x + width * .25, end + 35, { align: 'center' }); doc.text('Employé', x + width * .75, end + 35, { align: 'center' });
  };

  drawCopy(8, 136, 'EXEMPLAIRE EMPLOYEUR');
  doc.setDrawColor(148, 163, 184); doc.setLineDashPattern([2, 2], 0); doc.line(148.5, 8, 148.5, 202); doc.setLineDashPattern([], 0);
  drawCopy(153, 136, 'EXEMPLAIRE SALARIÉ');
}

function drawCover(doc: jsPDF, paies: PaieMensuelle[], mois: string, annee: number): void {
  const TEAL: [number, number, number] = [61, 153, 153];
  const TEAL_LIGHT: [number, number, number] = [190, 224, 220];
  const SLATE_50: [number, number, number] = [248, 250, 252];
  const SLATE_200: [number, number, number] = [226, 232, 240];
  const SLATE_500: [number, number, number] = [100, 116, 139];

  // 1) Fond blanc total - conforme demande
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, 297, 210, 'F');

  // 2) Bande gauche (respect visuel) - occupe côté gauche
  const LEFT_W = 84;
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, LEFT_W, 210, 'F');

  // Liseré teal à la jonction pour séparer proprement
  doc.setFillColor(...TEAL);
  doc.rect(LEFT_W, 0, 4, 210, 'F');

  // -- Contenu bande gauche (image respectée = logo circulaire non déformé) --
  const cx = LEFT_W / 2; // 42

  // Logo circulaire blanc - contient une croix médicale stylisée (respecte ratio 1:1)
  // Cercle blanc
  doc.setFillColor(255, 255, 255);
  doc.circle(cx, 38, 17, 'F');

  // Croix navy à l'intérieur (forme respectant le ratio)
  // On dessine une croix épaisse mais centrée
  doc.setFillColor(...NAVY);
  // barre verticale
  doc.roundedRect(cx - 2.6, 26, 5.2, 24, 1, 1, 'F');
  // barre horizontale
  doc.roundedRect(cx - 12, 35.4, 24, 5.2, 1, 1, 'F');

  // Petit cercle teal au centre de la croix pour détail
  doc.setFillColor(...TEAL);
  doc.circle(cx, 38, 2.2, 'F');

  // Texte SALFA sous le logo
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(17);
  doc.text('SALFA', cx, 68, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(...TEAL_LIGHT);
  doc.text('SAHAM — CLINIQUE', cx, 73.5, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(165, 195, 205);
  doc.text('Fiangonana Loterana', cx, 78, { align: 'center' });
  doc.text('Malagasy', cx, 81.5, { align: 'center' });

  // Séparateur fin
  doc.setDrawColor(...TEAL);
  doc.setLineWidth(0.25);
  doc.setDrawColor(80, 170, 170);
  doc.line(14, 87, LEFT_W - 14, 87);

  // Bloc Dispensaire
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10.5);
  doc.text('DISPENSAIRE', cx, 102, { align: 'center' });
  doc.text('TANAMBAO', cx, 109, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(...TEAL_LIGHT);
  doc.text('TOBY BETELA • TOLIARA', cx, 116, { align: 'center' });

  doc.setFontSize(6.5);
  doc.setTextColor(140, 180, 190);
  doc.text('SAMPAN’ASA LOTERANA', cx, 123, { align: 'center' });
  doc.text('MOMBA NY FAHASALAMANA', cx, 127, { align: 'center' });

  // Illustration simple "image respectée" sur côté gauche : une icône dossier/bulletins en filaire blanc
  // On dessine un rectangle représentant un état
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.35);
  doc.setFillColor(255, 255, 255);
  // petite doc icon
  const iconX = cx - 13;
  const iconY = 137;
  doc.setDrawColor(255, 255, 255);
  doc.roundedRect(iconX, iconY, 26, 18, 1.2, 1.2, 'S');
  doc.line(iconX, iconY + 5, iconX + 26, iconY + 5);
  doc.setFillColor(255, 255, 255);
  doc.rect(iconX + 2, iconY + 7.5, 14, 1.1, 'F');
  doc.rect(iconX + 2, iconY + 10, 18, 1.1, 'F');
  doc.rect(iconX + 2, iconY + 12.5, 11, 1.1, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.8);
  doc.setTextColor(255, 255, 255);
  doc.text('ÉTATS DE PAIE', cx, 163, { align: 'center' });

  // Pied de bande gauche
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.2);
  doc.setTextColor(120, 160, 175);
  doc.text('NIF: 5000767080', cx, 184, { align: 'center' });
  doc.text('STAT: 851 125 120 120 001 36', cx, 187.5, { align: 'center' });

  doc.setFontSize(5);
  doc.setTextColor(100, 140, 155);
  doc.text(`Édité le ${new Date().toLocaleDateString('fr-FR')}`, cx, 195, { align: 'center' });

  // -- Zone droite : fond blanc, contenu centré --
  const rightCenter = LEFT_W + 4 + (297 - LEFT_W - 4) / 2; // 192.5

  // Cadre très léger autour de la zone droite pour structure
  doc.setDrawColor(...SLATE_200);
  doc.setLineWidth(0.4);
  doc.roundedRect(LEFT_W + 12, 10, 297 - LEFT_W - 24, 190, 4, 4, 'S');

  // En-tête haut droite
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...NAVY);
  doc.setFontSize(12.5);
  doc.text('FIANGONANA LOTERANA MALAGASY', rightCenter, 32, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...SLATE_500);
  doc.text("SAMPAN'ASA LOTERANA MOMBA NY FAHASALAMANA", rightCenter, 39, { align: 'center' });

  doc.setDrawColor(...SLATE_200);
  doc.setLineWidth(0.35);
  doc.line(rightCenter - 58, 45, rightCenter + 58, 45);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...TEAL);
  doc.text('DISPENSAIRE TANAMBAO — TOBY BETELA TOLIARA • CLINIQUE SALFA', rightCenter, 51.5, { align: 'center' });

  // Badge "Document officiel"
  doc.setFillColor(...SLATE_50);
  doc.setDrawColor(...SLATE_200);
  doc.setLineWidth(0.3);
  doc.roundedRect(rightCenter - 38, 59, 76, 9, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.3);
  doc.setTextColor(...TEAL);
  doc.text('DOCUMENT OFFICIEL DE PAIE', rightCenter, 64.8, { align: 'center' });

  // Titre principal
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  doc.setTextColor(...NAVY);
  doc.text('ÉTATS DES', rightCenter, 88, { align: 'center' });
  doc.setFontSize(26);
  doc.text('BULLETINS DE PAIE', rightCenter, 100, { align: 'center' });

  // Période - encadré blanc avec fond très léger
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.55);
  doc.roundedRect(rightCenter - 60, 111, 120, 28, 3, 3, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18.5);
  doc.setTextColor(...NAVY);
  doc.text(`${mois} ${annee}`, rightCenter, 128.5, { align: 'center' });

  // Badge nombre salariés
  doc.setFillColor(...NAVY);
  doc.roundedRect(rightCenter - 35, 146, 70, 11, 2.5, 2.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.8);
  doc.setTextColor(255, 255, 255);
  doc.text(`${paies.length} salarié${paies.length > 1 ? 's' : ''} • ${paies.length > 0 ? 'LISTE COMPLÈTE' : ''}`, rightCenter, 153.5, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(...SLATE_500);
  doc.text('Un bulletin par page — deux exemplaires côte à côte (employeur / salarié)', rightCenter, 165.5, { align: 'center' });

  // Pied de page droite
  doc.setDrawColor(...SLATE_200);
  doc.setLineWidth(0.3);
  doc.line(LEFT_W + 22, 180, 297 - 12, 180);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(140, 150, 165);
  doc.text('Document confidentiel — Usage interne uniquement — Clinique SALFA Tanambao — Toby Betela Toliara', rightCenter, 186, { align: 'center' });
}

/** Downloads a single print-ready PDF: cover page then one A4 landscape page per employee. */
export function downloadPayrollBookletPDF(paies: PaieMensuelle[], mois: string, annee: number): void {
  if (!paies.length) return;
  const ordered = [...paies].sort((a, b) => Number(a.numero_matricule) - Number(b.numero_matricule));
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  drawCover(doc, ordered, mois, annee);
  ordered.forEach((p) => { doc.addPage('a4', 'landscape'); drawBulletinPage(doc, p); });
  doc.save(`Etats_Bulletins_${safeFilePart(mois)}_${annee}.pdf`);
}

export function downloadSingleBulletinPDF(paie: PaieMensuelle): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  drawBulletinPage(doc, paie);
  doc.save(`Bulletin_${safeFilePart(paie.mois)}_${paie.annee}_Mat_${paie.numero_matricule}_${safeFilePart(paie.nom_prenoms)}.pdf`);
}
