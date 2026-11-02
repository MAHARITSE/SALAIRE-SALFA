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
  NB_EXEMPLAIRES_BULLETIN,
  paginerPaiesDecharge,
} from '../bulletin/model';
import { loadBulletinHeader, defaultBulletinHeader } from '../bulletin/header';
import { formatMontant } from '../local/montants';

function fmt(value: number | undefined | null): string {
  return formatMontant(value);
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

  const drawCutLine = () => {
    // Trait de découpe vertical bien marqué au centre entre les exemplaires + symbole ciseaux
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
  };

  const copiesA4 = [
    { x: 30, width: 125.5 },
    { x: 163, width: 125.5 },
  ].slice(0, NB_EXEMPLAIRES_BULLETIN);
  copiesA4.forEach((copy, index) => {
    if (index > 0) drawCutLine();
    drawCopy(copy.x, copy.width);
  });
}

function drawCover(doc: jsPDF, mois: string, annee: number): void {
  const PAGE_W = 297;
  const PAGE_H = 210;
  let image = loadBulletinHeader().image;
  let properties;
  try { properties = doc.getImageProperties(image); }
  catch { image = defaultBulletinHeader().image; properties = doc.getImageProperties(image); }

  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F');

  const maxHeaderW = 132;
  const maxHeaderH = 30;
  const headerScale = Math.min(maxHeaderW / properties.width, maxHeaderH / properties.height);
  const headerW = properties.width * headerScale;
  const headerH = properties.height * headerScale;
  doc.addImage(image, properties.fileType, 23, 5, headerW, headerH);

  // Reprise du modèle de couverture fourni : entête SALFA en haut, période en grand dessous.
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(32);
  doc.text('BULLETIN DE PAIE SALAIRE', 26, 92);
  doc.setFontSize(32);
  doc.text(`Mois de : ${mois} ${annee}`, 26, 110);
}

function drawCashDischargePages(doc: jsPDF, paies: PaieMensuelle[], mois: string, annee: number): void {
  const pages = paginerPaiesDecharge(paies);
  const pageW = 210;
  const marginX = 10;
  const tableW = pageW - marginX * 2;
  const colWidths = [13, 122, tableW - 135];
  const titleY = 18;
  const tableTop = 29;
  const headerH = 9;
  const rowH = 9.5;

  for (const lignes of pages) {
    doc.addPage('a4', 'portrait');
    doc.setTextColor(0, 0, 0);
    doc.setDrawColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.text(`FICHE DECHARGE MOIS DE ${mois} ${annee}`, pageW / 2, titleY, { align: 'center' });

    const drawCell = (x: number, y: number, width: number, height: number, text: string, align: 'left' | 'center', isHeader = false) => {
      doc.setLineWidth(0.25);
      doc.rect(x, y, width, height);
      doc.setFont('helvetica', isHeader ? 'bold' : 'normal');
      doc.setFontSize(isHeader ? 9.2 : 9);
      const textY = y + height / 2 + 1.2;
      const textX = align === 'center' ? x + width / 2 : x + 2;
      doc.text(text, textX, textY, { align });
    };

    let x = marginX;
    drawCell(x, tableTop, colWidths[0], headerH, 'MAT', 'center', true);
    x += colWidths[0];
    drawCell(x, tableTop, colWidths[1], headerH, 'Noms et Prenom', 'center', true);
    x += colWidths[1];
    drawCell(x, tableTop, colWidths[2], headerH, 'Emargement', 'center', true);

    const lignesPage: Array<PaieMensuelle | null> = lignes.length ? lignes : [null];
    lignesPage.forEach((paie, index) => {
      const y = tableTop + headerH + index * rowH;
      let cellX = marginX;
      if (paie) {
        drawCell(cellX, y, colWidths[0], rowH, String(paie.numero_matricule), 'center');
        cellX += colWidths[0];
        drawCell(cellX, y, colWidths[1], rowH, String(paie.nom_prenoms || ''), 'left');
        cellX += colWidths[1];
        drawCell(cellX, y, colWidths[2], rowH, '', 'left');
      } else {
        drawCell(cellX, y, tableW, rowH, 'Aucun paiement en espèces supérieur à 5 000 Ar.', 'left');
      }
    });
  }
}

/** Downloads the booklet: cover, landscape payroll pages, a blank binding page, then the cash-payment discharge sheet. */
export function downloadPayrollBookletPDF(paies: PaieMensuelle[], mois: string, annee: number): void {
  if (!paies.length) return;
  const ordered = [...paies].sort((a, b) => Number(a.numero_matricule) - Number(b.numero_matricule));
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  drawCover(doc, mois, annee);
  ordered.forEach((p) => { doc.addPage('a4', 'landscape'); drawBulletinPage(doc, p); });
  doc.addPage('a4', 'landscape'); // page blanche prévue pour la reliure du livre des bulletins
  drawCashDischargePages(doc, ordered, mois, annee);
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
