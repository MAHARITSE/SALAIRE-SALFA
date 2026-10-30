import jsPDF from 'jspdf';
import { PaieMensuelle } from '../types';
import {
  BulletinOptions,
  construireBulletin,
  formatCnapsBulletin,
  formatCongesRestantsBulletin,
  formatEmbaucheBulletin,
  formatMontantBulletin,
  montantEnLettresBulletin,
} from '../bulletin/model';
import { loadBulletinHeader, defaultBulletinHeader } from '../bulletin/header';

const NAVY: [number, number, number] = [26, 54, 93];

function fmt(value: number | undefined | null): string {
  return Number(value || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function safeFilePart(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/gi, '_');
}

function drawUnderlinedText(doc: jsPDF, text: string, x: number, y: number, bold = true): number {
  doc.setFont('helvetica', bold ? 'bold' : 'normal');
  doc.text(text, x, y);
  const w = doc.getTextWidth(text);
  doc.setLineWidth(0.22);
  doc.line(x, y + 0.65, x + w, y + 0.65);
  return w;
}

/** Deux exemplaires côte à côte reproduisant fidèlement le corps de la feuille BULLETIN. */
export function drawBulletinPage(doc: jsPDF, p: PaieMensuelle, options?: BulletinOptions): void {
  const bulletin = construireBulletin(p, options);
  // Les polices PDF standard ne comprennent pas l'espace insécable étroit.
  const money = (v: number | null | undefined) => fmt(v).replace(/[\u00a0\u202f]/g, ' ');
  const moneyRubrique = (v: number | null | undefined) =>
    formatMontantBulletin(v).replace(/[\u00a0\u202f]/g, ' ');

  // 30 mm de reliure à gauche, 8 mm à droite et deux zones séparées.
  let image = loadBulletinHeader().image;
  let properties;
  try { properties = doc.getImageProperties(image); }
  catch { image = defaultBulletinHeader().image; properties = doc.getImageProperties(image); }

  const drawCopy = (x: number, width: number) => {
    const center = x + width / 2;
    const headerHeight = Math.min(24, (width * properties.height) / properties.width);
    const headerWidth = (headerHeight * properties.width) / properties.height;
    doc.addImage(
      image,
      properties.fileType,
      center - headerWidth / 2,
      6 + (24 - headerHeight) / 2,
      headerWidth,
      headerHeight
    );

    const titleY = 34;
    doc.setTextColor(0, 0, 0);
    doc.setDrawColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('BULLETIN DE PAIE', center, titleY, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.2);
    doc.text(`Mois de : ${p.mois} ${p.annee}`, center, titleY + 4.7, { align: 'center' });

    // --- Bloc identité (titres soulignés de largeur uniforme et deux-points parfaitement alignés) ---
    let iy = titleY + 10.6;
    const underlineW = 24.5;
    const colonX = x + underlineW + 0.7;
    const labelColW = 28.5;
    const drawAlignedIdLabel = (label: string, rowY: number) => {
      doc.setFont('helvetica', 'bold');
      doc.text(label, x, rowY);
      doc.setLineWidth(0.24);
      doc.line(x, rowY + 0.65, x + underlineW, rowY + 0.65);
      doc.text(':', colonX, rowY);
    };
    const idRows: [string, string][] = [
      ['Employé', p.nom_prenoms || '—'],
      ['Fonction', p.jobs || '—'],
      ['N° Matricule', String(p.numero_matricule)],
      ['Embauche', formatEmbaucheBulletin(p.date_embauche)],
    ];
    doc.setFontSize(9);
    for (const [lbl, val] of idRows) {
      drawAlignedIdLabel(lbl, iy);
      doc.setFont('helvetica', 'normal');
      const clipped = doc.splitTextToSize(val, width - labelColW - 1)[0] || '';
      doc.text(clipped, x + labelColW, iy);
      iy += 4.5;
    }
    drawAlignedIdLabel('Classification', iy);
    doc.setFont('helvetica', 'normal');
    doc.text(String(p.categorie || '—'), x + labelColW, iy);
    doc.setFont('helvetica', 'bold');
    doc.text('N° CNaPS :', x + 48, iy);
    doc.setFont('helvetica', 'normal');
    doc.text(formatCnapsBulletin(p.numero_cnaps), x + 69, iy);

    // --- Tableau principal encadré (sans lignes horizontales internes sauf sous-total GAINS) ---
    const tableTop = iy + 4.5;
    const c1 = width * 0.54;
    const c2 = width * 0.23;
    const c3 = width - c1 - c2;
    const x1 = x + c1;
    const x2 = x1 + c2;
    const x3 = x + width;

    const headH = 6.4;
    doc.setLineWidth(0.45);
    doc.rect(x, tableTop, width, headH);
    doc.line(x1, tableTop, x1, tableTop + headH);
    doc.line(x2, tableTop, x2, tableTop + headH);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.8);
    doc.text('RUBRIQUES DE PAIE', x + c1 / 2, tableTop + 4.4, { align: 'center' });
    doc.text('GAINS', x1 + c2 / 2, tableTop + 4.4, { align: 'center' });
    doc.text('RETENUES', x2 + c3 / 2, tableTop + 4.4, { align: 'center' });

    const bodyTop = tableTop + headH;
    const rowH = 4.6;
    const topPad = 3.2;
    const subGap = 2.2;
    const botPad = 2.6;
    const bodyH = topPad + 10 * rowH + subGap + botPad;

    // Cadre extérieur + séparateurs verticaux du corps
    doc.setLineWidth(0.45);
    doc.rect(x, bodyTop, width, bodyH);
    doc.line(x1, bodyTop, x1, bodyTop + bodyH);
    doc.line(x2, bodyTop, x2, bodyTop + bodyH);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.8);

    const drawGainVal = (val: number, ry: number) => {
      const txt = moneyRubrique(val);
      doc.text(txt, txt === '-' ? x2 - 6 : x2 - 1.8, ry, { align: 'right' });
    };
    const drawRetVal = (val: number, ry: number) => {
      const txt = moneyRubrique(val);
      doc.text(txt, txt === '-' ? x3 - 6 : x3 - 1.8, ry, { align: 'right' });
    };

    let ry = bodyTop + topPad + 2.9;
    // 4 lignes du bloc Salaire de base
    doc.text('Salaire de base', x + 1.5, ry);
    drawGainVal(Number(p.base_aj || 0), ry);
    ry += rowH;

    doc.text('Indemnités de Transp et Logement', x + 1.5, ry);
    drawGainVal(Number(p.logt_trsp || 0), ry);
    ry += rowH;

    doc.text('Indemnité de Rendement', x + 1.5, ry);
    drawGainVal(Number(p.rendement || 0), ry);
    ry += rowH;

    doc.text('Indemnité de Responsabilité', x + 1.5, ry);
    drawGainVal(Number(p.resp_repres || 0), ry);
    ry += rowH + subGap;

    // Filet horizontal uniquement dans la colonne GAINS au-dessus de TOTAL :
    doc.setLineWidth(0.38);
    doc.line(x1, ry - 3.7, x2, ry - 3.7);
    doc.text('TOTAL :', x1 - 2.5, ry, { align: 'right' });
    doc.text(money(bulletin.base), x2 - 1.8, ry, { align: 'right' });
    ry += rowH;

    // Retenues + Primes divers
    doc.text('Cotisation CNaPS', x + 1.5, ry);
    drawRetVal(Number(p.cnaps || 0), ry);
    ry += rowH;

    doc.text('Retenue IRSA', x + 1.5, ry);
    drawRetVal(Number(p.irsa || 0), ry);
    ry += rowH;

    doc.text('Avance sur salaire / Prêt', x + 1.5, ry);
    drawRetVal(bulletin.avance, ry);
    ry += rowH;

    doc.text('Medicament', x + 1.5, ry);
    drawRetVal(bulletin.med, ry);
    ry += rowH;

    doc.text('Primes divers', x + 1.5, ry);
    drawGainVal(Number(p.accessoir || 0), ry);

    // --- Ligne TOTAL ...... ---
    const totY = bodyTop + bodyH;
    const totH = 6.6;
    doc.setLineWidth(0.45);
    doc.rect(x1, totY, c2, totH);
    doc.rect(x2, totY, c3, totH);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text('TOTAL ......', x1 - 12, totY + 4.7, { align: 'right' });
    doc.setFontSize(9.2);
    doc.text(money(bulletin.gains), x2 - 1.8, totY + 4.6, { align: 'right' });
    doc.text(money(bulletin.retenues), x3 - 1.8, totY + 4.6, { align: 'right' });

    // --- Ligne NET à PAYER : ---
    const netY = totY + totH;
    const netH = 7.0;
    const partialLineX = x + c1 * 0.56;
    doc.setLineWidth(0.45);
    doc.line(partialLineX, netY, x2, netY);
    doc.rect(x2, netY, c3, netH);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.8);
    doc.text('NET à PAYER :', partialLineX + 2, netY + 5.0);
    doc.setFontSize(9.5);
    doc.text(money(bulletin.net), x3 - 1.8, netY + 4.9, { align: 'right' });

    // --- Arrêtée à la somme de ---
    let fy = netY + netH + 5.0;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.4);
    const words = doc.splitTextToSize(
      `Arrêtée à la somme de : ${montantEnLettresBulletin(bulletin.net)}`,
      width
    );
    doc.text(words, x, fy);
    fy += words.length * 3.8 + 3.0;

    // --- Paiement : Virement / Espece ---
    doc.setFontSize(10.5);
    drawUnderlinedText(doc, 'Paiement :', x + 18, fy, false);
    doc.setFont('helvetica', 'normal');
    doc.text('Virement', x + 41, fy);
    doc.setFont('helvetica', 'bold');
    doc.text(money(bulletin.virement), x + 95, fy, { align: 'right' });
    fy += 5.1;

    doc.setFont('helvetica', 'normal');
    doc.text('Espece', x + 41, fy);
    doc.setFont('helvetica', 'bold');
    doc.text(money(bulletin.especes), x + 95, fy, { align: 'right' });
    fy += 5.5;

    // --- NB CONGES RESTANTS & Date ---
    doc.setFontSize(8.8);
    drawUnderlinedText(doc, 'NB CONGES RESTANTS:', x, fy, true);
    doc.setFont('helvetica', 'bold');
    doc.text(`${formatCongesRestantsBulletin(p.conge_restant)}   jrs`, x + 58, fy);
    fy += 4.7;

    doc.setFont('helvetica', 'normal');
    doc.text('Tulear le,', x + 28, fy);
    doc.text(new Date().toLocaleDateString('fr-FR'), x + 46, fy);
  };

  drawCopy(30, 125.5);

  // Trait de découpe vertical bien marqué au centre entre les 2 exemplaires + symbole ciseaux
  const cutX = 159.25;
  doc.setDrawColor(71, 85, 105);
  doc.setLineWidth(0.3);
  doc.circle(cutX - 1.1, 6.2, 0.85, 'S');
  doc.circle(cutX + 1.1, 6.2, 0.85, 'S');
  doc.line(cutX - 0.65, 6.9, cutX + 0.85, 9.7);
  doc.line(cutX + 0.65, 6.9, cutX - 0.85, 9.7);

  doc.setLineWidth(0.35);
  doc.setLineDashPattern([2.5, 1.8], 0);
  doc.line(cutX, 11, cutX, 204);
  doc.setLineDashPattern([], 0);

  drawCopy(163, 125.5);
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

export function downloadSingleBulletinPDF(paie: PaieMensuelle, options?: BulletinOptions): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  drawBulletinPage(doc, paie, options);
  const sansAvance = options?.deduireAvance === false;
  const sansMed = options?.deduireMed === false;
  const suffixe =
    sansAvance && sansMed
      ? '_sans_avance_ni_med'
      : sansAvance
      ? '_sans_avance'
      : sansMed
      ? '_sans_med'
      : '';
  doc.save(
    `Bulletin_${safeFilePart(paie.mois)}_${paie.annee}_Mat_${paie.numero_matricule}_${safeFilePart(paie.nom_prenoms)}${suffixe}.pdf`
  );
}
