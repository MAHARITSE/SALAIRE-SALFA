// Export PDF du contrat de travail SALFA (A4 portrait).
// Le contenu vient du même modèle que l'aperçu et le Word : aucune clause n'est réécrite ici.
import jsPDF from 'jspdf';
import logoContrat from '../assets/logo-contrat-salfa.png?inline';
import { BlocContrat, ContratDocument, nomFichierContrat } from './model';
import { Employe } from '../types';
import { telechargerBlob } from './download';

const PAGE_W = 210;
const PAGE_H = 297;
const MX = 17.5;
const MT = 12;
const MB = 18;
const CONTENT_W = PAGE_W - MX * 2;
const LINE_H = 4.6;

const ENTETE = [
  'FIANGONANA LOTERANA MALAGASY',
  '(EGLISE LUTHERIENNE MALGACHE - MALAGASY LUTHERAN CHURCH)',
  'SAMPAN’ASA LOTERANA MOMBA NY FAHASALAMANA',
  'DEPARTEMENT DE SANTE – HEALTH DEPARTMENT                             SALFA',
  'DISPENSAIRE TANAMBAO - TOBY BETELA TOLIARA BP: 99 Tél:94 416 56',
  'NIF: 5000767080     STAT: 851 125 120 120 001 36',
  'E-mail: salfa.tulear@moov.mg',
];

function cleanPdfText(value: string): string {
  return String(value ?? '')
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/[’]/g, "'")
    .replace(/[—–]/g, '-')
    .replace(/…/g, '...');
}

interface DrawOptions {
  bold?: boolean;
  italic?: boolean;
  size?: number;
  align?: 'left' | 'center' | 'right';
  underline?: boolean;
}

export function drawContratPdf(doc: jsPDF, contrat: ContratDocument): void {
  let y = MT;
  let page = 1;
  const bottom = PAGE_H - MB;

  const setFont = (opts: DrawOptions = {}) => {
    doc.setFont('times', opts.bold ? 'bold' : opts.italic ? 'italic' : 'normal');
    doc.setFontSize(opts.size ?? 10.5);
    doc.setTextColor(0, 0, 0);
  };

  const newPage = () => {
    doc.addPage('a4', 'portrait');
    page += 1;
    y = MT;
    setFont({ size: 9, italic: true });
    doc.text('CONTRAT DE TRAVAIL — SALFA', PAGE_W / 2, y, { align: 'center' });
    y += 6;
    doc.setDrawColor(0);
    doc.setLineWidth(0.2);
    doc.line(MX, y - 2, PAGE_W - MX, y - 2);
  };

  const ensure = (h: number) => {
    if (y + h > bottom) newPage();
  };

  const drawLines = (lines: string[], opts: DrawOptions = {}, x = MX, width = CONTENT_W) => {
    setFont(opts);
    const align = opts.align ?? 'left';
    for (const line of lines) {
      ensure(LINE_H);
      const tx = align === 'center' ? x + width / 2 : align === 'right' ? x + width : x;
      doc.text(cleanPdfText(line), tx, y, { align });
      if (opts.underline) {
        const w = doc.getTextWidth(cleanPdfText(line));
        const lx = align === 'center' ? tx - w / 2 : align === 'right' ? tx - w : tx;
        doc.setLineWidth(0.2);
        doc.line(lx, y + 0.7, lx + w, y + 0.7);
      }
      y += LINE_H;
    }
  };

  const paragraph = (text: string, opts: DrawOptions = {}) => {
    setFont(opts);
    const lines = doc.splitTextToSize(cleanPdfText(text), CONTENT_W) as string[];
    drawLines(lines, opts);
    y += 1.2;
  };

  const field = (label: string, value: string, manquant: boolean) => {
    setFont({ bold: true });
    const labelText = cleanPdfText(label);
    const labelW = doc.getTextWidth(labelText) + 1.5;
    const valueText = cleanPdfText(value);
    if (labelW > CONTENT_W * 0.6) {
      drawLines([labelText], { bold: true });
      setFont({ italic: manquant });
      const lines = doc.splitTextToSize(valueText, CONTENT_W) as string[];
      drawLines(lines, { italic: manquant });
    } else {
      setFont({ italic: manquant });
      const lines = doc.splitTextToSize(valueText, CONTENT_W - labelW) as string[];
      const h = Math.max(1, lines.length) * LINE_H;
      ensure(h);
      setFont({ bold: true });
      doc.text(labelText, MX, y);
      setFont({ italic: manquant });
      lines.forEach((line, i) => {
        if (i > 0 && y + LINE_H > bottom) newPage();
        doc.text(line, MX + labelW, y);
        y += LINE_H;
      });
      if (lines.length === 0) y += LINE_H;
    }
    y += 0.8;
  };

  // Entête officielle du modèle fourni.
  try {
    doc.addImage(logoContrat, 'PNG', MX, MT - 2, 22, 27.2);
  } catch {
    // Le contrat reste imprimable si le logo ne peut pas être décodé.
  }
  const headerX = MX + 26;
  const headerW = CONTENT_W - 26;
  let hy = MT + 1;
  ENTETE.forEach((line, i) => {
    setFont({ bold: i === 0 || i === 2, size: i === 0 ? 10 : i < 3 ? 8.5 : 7.8 });
    const lines = doc.splitTextToSize(cleanPdfText(line), headerW) as string[];
    lines.forEach(l => {
      doc.text(l, headerX + headerW / 2, hy, { align: 'center' });
      hy += 3.6;
    });
  });
  y = Math.max(hy + 3, MT + 29);
  doc.setDrawColor(0);
  doc.setLineWidth(0.35);
  doc.line(MX, y - 2, PAGE_W - MX, y - 2);
  y += 3;

  const drawBloc = (bloc: BlocContrat) => {
    switch (bloc.type) {
      case 'titre':
        ensure(10);
        drawLines([bloc.texte], { bold: true, size: 13, align: 'center', underline: true });
        y += 2;
        break;
      case 'mention':
        ensure(8);
        drawLines([bloc.texte], { bold: true, italic: true, size: 9.5, align: 'center' });
        y += 2;
        break;
      case 'paragraphe':
        paragraph(bloc.texte);
        break;
      case 'champ':
        field(bloc.label, bloc.valeur, bloc.manquant);
        break;
      case 'article': {
        const heading = `Article ${bloc.numero} : ${bloc.titre}`.trim();
        ensure(14);
        drawLines([heading], { bold: true, underline: true });
        if (bloc.valeur) field('', bloc.valeur, Boolean(bloc.manquant));
        y += 1.5;
        break;
      }
      case 'signature': {
        ensure(48);
        y += 3;
        paragraph(`Fait à ${bloc.lieu}, le ${bloc.date}.`);
        y += 8;
        const colW = CONTENT_W / 2;
        setFont({ bold: true, underline: true });
        doc.text('L’employé(e)', MX + colW / 2, y, { align: 'center' });
        doc.text('L’employeur', MX + colW + colW / 2, y, { align: 'center' });
        y += 5;
        setFont({ size: 9.5 });
        doc.text(cleanPdfText(bloc.representant), MX + colW + colW / 2, y, { align: 'center' });
        y += 20;
        setFont({ italic: true, size: 9 });
        doc.text('(Mentions manuscrites :', MX + colW / 2, y, { align: 'center' });
        doc.text('“Lu et approuvé”, date, signature et nom)', MX + colW / 2, y + 4, { align: 'center' });
        y += 10;
        break;
      }
    }
  };

  contrat.blocs.forEach(drawBloc);

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    setFont({ size: 8, italic: true });
    doc.setDrawColor(0);
    doc.setLineWidth(0.2);
    doc.line(MX, PAGE_H - 12, PAGE_W - MX, PAGE_H - 12);
    if (contrat.mentionProjet) {
      doc.text(cleanPdfText(contrat.mentionProjet), MX, PAGE_H - 8);
    }
    doc.text(`Page ${i} / ${totalPages}`, PAGE_W - MX, PAGE_H - 8, { align: 'right' });
  }
  // La variable page est conservée pour les tests et évolutions de pagination.
  void page;
}

export function construireContratPdf(contrat: ContratDocument): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  drawContratPdf(doc, contrat);
  return doc;
}

export async function telechargerContratPdf(emp: Employe, contrat: ContratDocument): Promise<void> {
  const doc = construireContratPdf(contrat);
  const blob = doc.output('blob');
  telechargerBlob(nomFichierContrat(emp, contrat, 'pdf'), blob);
}
