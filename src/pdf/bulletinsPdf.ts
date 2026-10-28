import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PaieMensuelle } from '../types';
import { construireBulletin, formatDate, montantEnLettres } from '../bulletin/model';
import { loadBulletinHeader, defaultBulletinHeader } from '../bulletin/header';

const NAVY: [number, number, number] = [26, 54, 93];
const BLUE: [number, number, number] = [43, 108, 176];

function fmt(value: number | undefined | null): string {
  return Number(value || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function safeFilePart(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/gi, '_');
}

/** Deux exemplaires, rubriques et formules de la feuille BULLETIN. */
export function drawBulletinPage(doc: jsPDF, p: PaieMensuelle): void {
  const bulletin = construireBulletin(p);
  // Les polices PDF standard ne comprennent pas l'espace insécable étroit.
  const money = (v: number | null | undefined) => fmt(v).replace(/[\u00a0\u202f]/g, ' ');
  // 30 mm de reliure à gauche, 8 mm à droite et deux zones séparées de 5 mm.
  let image = loadBulletinHeader().image;
  let properties;
  try { properties = doc.getImageProperties(image); }
  catch { image = defaultBulletinHeader().image; properties = doc.getImageProperties(image); }
  const drawCopy = (x: number, width: number) => {
    const center = x + width / 2;
    const headerHeight = Math.min(26, width * properties.height / properties.width);
    const headerWidth = headerHeight * properties.width / properties.height;
    doc.addImage(image, properties.fileType, center - headerWidth / 2, 6 + (26 - headerHeight) / 2, headerWidth, headerHeight);
    const titleY = 6 + 26 + 5;
    doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text('BULLETIN DE PAIE', center, titleY, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.text(`Mois de : ${p.mois} ${p.annee}`, center, titleY + 5, { align: 'center' });
    autoTable(doc, {
      startY: titleY + 9, tableWidth: width, theme: 'plain',
      body: [
        ['Employé :', p.nom_prenoms || '—'],
        ['Fonction :', p.jobs || '—'],
        ['N° Matricule :', String(p.numero_matricule)],
        ['Embauche :', formatDate(p.date_embauche)],
        ['Classification :', `${p.categorie || '—'}     N° CNaPS : ${p.numero_cnaps || '—'}`],
      ],
      styles: { font: 'helvetica', fontSize: 7.4, cellPadding: 0.7, overflow: 'linebreak', textColor: [0,0,0] },
      columnStyles: { 0: { cellWidth: 27, fontStyle: 'bold' }, 1: { cellWidth: width - 27 } },
      margin: { left: x, right: 297 - x - width },
    });
    const startY = (doc as any).lastAutoTable.finalY + 3;
    autoTable(doc, {
      startY, tableWidth: width, theme: 'grid',
      head: [['RUBRIQUES DE PAIE', 'GAINS', 'RETENUES']],
      body: bulletin.lignes.map(r => [r.libelle, r.gain === undefined ? '' : money(r.gain), r.retenue === undefined ? '' : money(r.retenue)]),
      headStyles: { fillColor: [255,255,255], textColor: [0,0,0], fontStyle: 'bold', halign: 'center', lineColor: [60,60,60], lineWidth: 0.15 },
      styles: { font: 'helvetica', fontSize: 7, cellPadding: 1.2, lineColor: [60,60,60], lineWidth: 0.15, textColor: [0,0,0] },
      columnStyles: { 0: { cellWidth: width * .54 }, 1: { cellWidth: width * .23, halign: 'right' }, 2: { cellWidth: width * .23, halign: 'right' } },
      didParseCell: (data) => { if (data.section === 'body' && bulletin.lignes[data.row.index]?.total) data.cell.styles.fontStyle = 'bold'; },
      margin: { left: x, right: 297 - x - width },
    });
    const end = (doc as any).lastAutoTable.finalY;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
    doc.text('NET à PAYER :', x + width * .57, end + 5);
    doc.text(money(bulletin.net), x + width - 2, end + 5, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
    const words = doc.splitTextToSize(`Arrêtée à la somme de : ${montantEnLettres(bulletin.net)}`, width);
    doc.text(words, x, end + 10);
    let y = end + 10 + words.length * 3.2;
    doc.text(`Paiement :     Virement : ${money(p.virement)}`, x, y); y += 4;
    doc.text(`                        Espèce : ${money(p.especes)}`, x, y); y += 4;
    if (bulletin.ecartNet) {
      const note = doc.splitTextToSize(`Net enregistré dans l'état : ${money(bulletin.netEnregistre)} (différent du net calculé ci-dessus).`, width);
      doc.text(note, x, y); y += note.length * 3.2;
    }
    doc.text('NB CONGÉS RESTANTS : .......... jrs', x, y + 1);
    doc.text(`Tulear le, ${new Date().toLocaleDateString('fr-FR')}`, x + width, y + 6, { align: 'right' });
  };
  drawCopy(30, 127);
  doc.setDrawColor(170,170,170); doc.setLineDashPattern([2, 2], 0); doc.line(159.5, 8, 159.5, 202); doc.setLineDashPattern([], 0);
  drawCopy(162, 127);
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
