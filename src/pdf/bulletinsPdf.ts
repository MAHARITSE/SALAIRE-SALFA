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
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.2); doc.setTextColor(...NAVY);
    doc.text('Fiangonana Loterana Malagasy — Sampan\'asa Loterana Momba ny Fahasalamana', center, 9, { align: 'center' });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...NAVY);
    doc.text('DISPENSAIRE TANAMBAO - TOBY BETELA TOLIARA', center, 13, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(5.2); doc.setTextColor(100, 116, 139);
    doc.text('NIF: 5000767080  |  STAT: 851 125 120 120 001 36', center, 16.5, { align: 'center' });
    doc.setDrawColor(203, 213, 225); doc.line(x, 18.5, x + width, 18.5);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...NAVY);
    doc.text('FILAZANA NY KARAMA', center, 24.5, { align: 'center' });
    doc.setFontSize(7); doc.setTextColor(...BLUE);
    doc.text(`PÉRIODE : ${p.mois} ${p.annee}  |  ${title}`, center, 28.5, { align: 'center' });

    autoTable(doc, {
      startY: 31,
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
  const TEAL_DARK: [number, number, number] = [33, 122, 122];
  const SLATE_50: [number, number, number] = [248, 250, 252];
  const SLATE_200: [number, number, number] = [226, 232, 240];
  const SLATE_500: [number, number, number] = [100, 116, 139];
  const SLATE_600: [number, number, number] = [71, 85, 105];

  const PAGE_W = 297;
  const PAGE_H = 210;
  const LEFT_W = 92;
  const GUTTER_X = LEFT_W;
  const rightCenter = GUTTER_X + (PAGE_W - GUTTER_X) / 2;

  // Fond blanc pour toute la page de couverture.
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F');

  // Séparation discrète : la couverture reste blanche, avec l'identité placée à gauche.
  doc.setDrawColor(...SLATE_200);
  doc.setLineWidth(0.35);
  doc.line(GUTTER_X, 12, GUTTER_X, PAGE_H - 12);

  doc.setDrawColor(...TEAL);
  doc.setLineWidth(1.15);
  doc.line(GUTTER_X + 2.8, 20, GUTTER_X + 2.8, PAGE_H - 20);

  // -- Bloc gauche : logo / établissement / infos, sans fond coloré --
  const leftCenter = LEFT_W / 2;
  const cardX = 10;
  const cardY = 12;
  const cardW = LEFT_W - 20;
  const cardH = PAGE_H - 24;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...SLATE_200);
  doc.setLineWidth(0.4);
  doc.roundedRect(cardX, cardY, cardW, cardH, 4, 4, 'S');

  // Petit liseré supérieur gauche pour rappeler la charte sans colorer le fond.
  doc.setDrawColor(...TEAL);
  doc.setLineWidth(1.5);
  doc.line(cardX + 8, cardY + 8, cardX + cardW - 8, cardY + 8);

  // Logo stylisé conservé au ratio 1:1.
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.8);
  doc.circle(leftCenter, 39, 17, 'FD');

  doc.setFillColor(...TEAL);
  doc.roundedRect(leftCenter - 2.6, 27, 5.2, 24, 1, 1, 'F');
  doc.roundedRect(leftCenter - 12, 36.4, 24, 5.2, 1, 1, 'F');
  doc.setFillColor(...NAVY);
  doc.circle(leftCenter, 39, 2.2, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...NAVY);
  doc.setFontSize(18);
  doc.text('SALFA', leftCenter, 69, { align: 'center' });

  doc.setFontSize(6.8);
  doc.setTextColor(...TEAL_DARK);
  doc.text('SAHAM — CLINIQUE', leftCenter, 74.5, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  doc.setTextColor(...SLATE_500);
  doc.text('Fiangonana Loterana Malagasy', leftCenter, 80, { align: 'center' });

  doc.setDrawColor(...SLATE_200);
  doc.setLineWidth(0.25);
  doc.line(cardX + 11, 91, cardX + cardW - 11, 91);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...NAVY);
  doc.setFontSize(10.5);
  doc.text('DISPENSAIRE', leftCenter, 105, { align: 'center' });
  doc.text('TANAMBAO', leftCenter, 112, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(...TEAL_DARK);
  doc.text('TOBY BETELA • TOLIARA', leftCenter, 119.5, { align: 'center' });

  doc.setFontSize(6.4);
  doc.setTextColor(...SLATE_500);
  doc.text('SAMPAN’ASA LOTERANA', leftCenter, 127, { align: 'center' });
  doc.text('MOMBA NY FAHASALAMANA', leftCenter, 131, { align: 'center' });

  // Icône état/documents sur le côté gauche de l'état.
  const iconX = leftCenter - 14;
  const iconY = 143;
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.45);
  doc.roundedRect(iconX, iconY, 28, 19, 1.4, 1.4, 'S');
  doc.line(iconX, iconY + 5, iconX + 28, iconY + 5);
  doc.setFillColor(...TEAL);
  doc.rect(iconX + 3, iconY + 8, 14, 1.15, 'F');
  doc.setFillColor(...NAVY);
  doc.rect(iconX + 3, iconY + 10.8, 20, 0.9, 'F');
  doc.rect(iconX + 3, iconY + 13.3, 12, 0.9, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.2);
  doc.setTextColor(...NAVY);
  doc.text('ÉTATS DE PAIE', leftCenter, 171, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.3);
  doc.setTextColor(...SLATE_500);
  doc.text('NIF: 5000767080', leftCenter, 185, { align: 'center' });
  doc.text('STAT: 851 125 120 120 001 36', leftCenter, 188.6, { align: 'center' });
  doc.text(`Édité le ${new Date().toLocaleDateString('fr-FR')}`, leftCenter, 196, { align: 'center' });

  // -- Zone droite : contenu principal sur fond blanc --
  doc.setDrawColor(...SLATE_200);
  doc.setLineWidth(0.4);
  doc.roundedRect(GUTTER_X + 14, 12, PAGE_W - GUTTER_X - 26, PAGE_H - 24, 4, 4, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...NAVY);
  doc.setFontSize(12.5);
  doc.text('FIANGONANA LOTERANA MALAGASY', rightCenter, 34, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...SLATE_500);
  doc.text("SAMPAN'ASA LOTERANA MOMBA NY FAHASALAMANA", rightCenter, 41, { align: 'center' });

  doc.setDrawColor(...SLATE_200);
  doc.setLineWidth(0.35);
  doc.line(rightCenter - 58, 48, rightCenter + 58, 48);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...TEAL_DARK);
  doc.text('DISPENSAIRE TANAMBAO — TOBY BETELA TOLIARA • CLINIQUE SALFA', rightCenter, 55, { align: 'center' });

  // Badge "Document officiel" sur fond blanc/gris très léger.
  doc.setFillColor(...SLATE_50);
  doc.setDrawColor(...SLATE_200);
  doc.setLineWidth(0.3);
  doc.roundedRect(rightCenter - 38, 63, 76, 9, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.3);
  doc.setTextColor(...TEAL_DARK);
  doc.text('DOCUMENT OFFICIEL DE PAIE', rightCenter, 68.8, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.setTextColor(...NAVY);
  doc.text('ÉTAT GLOBAL', rightCenter, 91, { align: 'center' });
  doc.setFontSize(23);
  doc.text('DES BULLETINS DE PAIE', rightCenter, 103, { align: 'center' });

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.55);
  doc.roundedRect(rightCenter - 60, 115, 120, 28, 3, 3, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18.5);
  doc.setTextColor(...NAVY);
  doc.text(`${mois} ${annee}`, rightCenter, 132.5, { align: 'center' });

  // Nombre de salariés : badge lisible, le reste de la page reste blanc.
  doc.setFillColor(...TEAL);
  doc.roundedRect(rightCenter - 36, 150, 72, 11, 2.5, 2.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.8);
  doc.setTextColor(255, 255, 255);
  doc.text(`${paies.length} salarié${paies.length > 1 ? 's' : ''} • ${paies.length > 0 ? 'LISTE COMPLÈTE' : ''}`, rightCenter, 157.5, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(...SLATE_600);
  doc.text('Un bulletin par page — deux exemplaires côte à côte (employeur / salarié)', rightCenter, 169.5, { align: 'center' });

  doc.setDrawColor(...SLATE_200);
  doc.setLineWidth(0.3);
  doc.line(GUTTER_X + 24, 183, PAGE_W - 14, 183);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(140, 150, 165);
  doc.text('Document confidentiel — Usage interne uniquement — Clinique SALFA Tanambao — Toby Betela Toliara', rightCenter, 190, { align: 'center' });
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
