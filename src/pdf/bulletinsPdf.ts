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
  const totalNet = paies.reduce((sum, p) => sum + Number(p.net || 0), 0);
  doc.setFillColor(...NAVY); doc.rect(0, 0, 297, 210, 'F');
  doc.setDrawColor(110, 191, 191); doc.setLineWidth(1.2); doc.roundedRect(18, 18, 261, 174, 4, 4, 'S');
  doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255); doc.setFontSize(15);
  doc.text('FIANGONANA LOTERANA MALAGASY', 148.5, 43, { align: 'center' });
  doc.setFontSize(10); doc.setTextColor(190, 224, 240);
  doc.text("SAMPAN'ASA LOTERANA MOMBA NY FAHASALAMANA", 148.5, 51, { align: 'center' });
  doc.setDrawColor(190, 224, 240); doc.setLineWidth(.4); doc.line(75, 61, 222, 61);
  doc.setFontSize(18); doc.setTextColor(255, 255, 255); doc.text('DISPENSAIRE TANAMBAO', 148.5, 78, { align: 'center' });
  doc.setFontSize(11); doc.text('TOBY BETELA — TOLIARA', 148.5, 86, { align: 'center' });
  doc.setFillColor(255, 255, 255); doc.roundedRect(68, 105, 161, 36, 3, 3, 'F');
  doc.setFontSize(11); doc.setTextColor(...NAVY); doc.text('ÉTATS DES BULLETINS DE PAIE', 148.5, 119, { align: 'center' });
  doc.setFontSize(20); doc.text(`${mois} ${annee}`, 148.5, 132, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(190, 224, 240);
  doc.text(`${paies.length} salarié${paies.length > 1 ? 's' : ''}  •  Net total : ${fmt(totalNet)}`, 148.5, 157, { align: 'center' });
  doc.text('Un bulletin par page — deux exemplaires côte à côte (employeur / salarié)', 148.5, 165, { align: 'center' });
  doc.setFontSize(7); doc.text(`Édité le ${new Date().toLocaleDateString('fr-FR')}`, 148.5, 181, { align: 'center' });
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
