// ==============================================================================
// EXPORT PDF — FICHE D'ABSENCE (A4 Portrait) & ÉTAT DES CONGÉS (A4 Paysage)
// Fidèle à « FICHE D'ABSENCE 2026.docx » et au « CONTRÔLE DES CONGÉS ET
// PERMISSIONS » utilisé par la Clinique SALFA Tanambao.
// ==============================================================================
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CongeAbsence, EtatConges, fmtJours, LIBELLES_STATUT } from '../local/conges';
import { loadBulletinHeader, defaultBulletinHeader } from '../bulletin/header';
import { blocsFiche, dateFr, periodeAbsenceDocx, dateRetourFiche, RecapFiche } from '../components/conges/FicheAbsence';
import { colonnesEtat, valeurCellule } from '../components/conges/EtatConges';

function cleanPdfText(value: string): string {
  return String(value ?? '')
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/[’]/g, "'")
    .replace(/[—–]/g, '-')
    .replace(/…/g, '...');
}

function safeFilePart(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

const andro = (n: number): string => `${String(Math.abs(Math.round(Number(n) || 0))).padStart(2, '0')} andro`;

const heureDocx = (h: string): string => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(h || '').trim());
  return m ? `@ ${m[1]} Ora ${m[2]} mn` : '@ ....... Ora ....... mn';
};

/** Dessine une page A4 portrait reproduisant fidèlement « FICHE D'ABSENCE 2026.docx ». */
export function drawFicheAbsencePage(doc: jsPDF, conge: CongeAbsence, recap?: RecapFiche | null): void {
  const pageW = 210;
  const marginX = 12;
  const contentW = pageW - marginX * 2;

  let image = loadBulletinHeader().image;
  let props;
  try {
    props = doc.getImageProperties(image);
  } catch {
    image = defaultBulletinHeader().image;
    props = doc.getImageProperties(image);
  }
  const maxHeaderH = 22;
  const headerH = Math.min(maxHeaderH, (contentW * props.height) / props.width);
  const headerW = (headerH * props.width) / props.height;
  doc.addImage(image, props.fileType, pageW / 2 - headerW / 2, 6, headerW, headerH);

  // Titre encadré « FICHE D'ABSENCE »
  const boxW = 66;
  const boxH = 7.5;
  const boxX = pageW / 2 - boxW / 2;
  const boxY = 6 + headerH + 2.5;
  doc.setDrawColor(50, 62, 79);
  doc.setLineWidth(0.3);
  doc.rect(boxX, boxY, boxW, boxH);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text("FICHE D'ABSENCE", pageW / 2, boxY + 5.1, { align: 'center' });

  const jours = Number(conge.jours_valides ?? conge.jours_demandes ?? 0);
  const objet = cleanPdfText(conge.motif_libelle || LIBELLES_STATUT[conge.statut]);

  // 4 lignes d'identification du demandeur
  let y = boxY + boxH + 5;
  const drawField = (label: string, val: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.8);
    doc.text(label, marginX, y);
    const lw = doc.getTextWidth(label + ' ');
    doc.setFont('helvetica', 'normal');
    const clean = cleanPdfText(val);
    doc.text(clean || '..................................................................................', marginX + lw, y);
    y += 4.6;
  };

  const identite = conge.nom_prenoms
    ? `${conge.nom_prenoms}${conge.numero_matricule ? ` (Mat. ${conge.numero_matricule}${conge.fonction ? ` - ${conge.fonction}` : ''})` : ''}`
    : '';
  drawField("Anarana & Fanampin'anarana :", identite);
  drawField('Service /Projet :', conge.service || conge.fonction || '');
  drawField('Adiresy / n° tel ahafahana mifandray :', conge.contact || '');
  drawField('Fangatahana :', jours ? `${objet} (${cleanPdfText(fmtJours(jours))} andro)` : objet);

  // Tableau central des motifs et droits du FITSIPIKA ANATINY
  const blocs = blocsFiche();
  const categorieFiche =
    conge.categorie === 'PERMISSION' ? 'PERMISSION'
      : conge.categorie === 'EXAMEN_MEDICAL' ? 'EXAMEN'
        : 'CONGE';

  const bodyRows: any[][] = [];
  const checkedRows = new Set<number>();
  let rowCursor = 0;

  for (const bloc of blocs) {
    const nb = bloc.lignes.length;
    bloc.lignes.forEach((ligne, idx) => {
      const coche = bloc.categorie === 'CONGE'
        ? categorieFiche === 'CONGE'
        : ligne.code === conge.motif_code && categorieFiche === bloc.categorie;
      if (coche) checkedRows.add(rowCursor);
      const row: any[] = [];
      if (idx === 0) {
        row.push({
          content: cleanPdfText(bloc.enTete),
          rowSpan: nb,
          styles: { fontStyle: 'bold', halign: 'center', valign: 'middle', fillColor: [248, 250, 252] },
        });
      }
      const motifCell = bloc.categorie === 'CONGE'
        ? (coche && conge.titre_periode ? cleanPdfText(conge.titre_periode) : '')
        : (ligne.sousLigne ? `    ${cleanPdfText(ligne.texte)}` : cleanPdfText(ligne.texte));
      row.push({
        content: motifCell,
        styles: { fontStyle: ligne.sousLigne ? 'italic' : 'normal' },
      });
      row.push({ content: coche ? 'X' : '', styles: { halign: 'center', fontStyle: 'bold' } });
      row.push({ content: coche ? andro(jours) : '', styles: { halign: 'center', fontStyle: 'bold' } });
      if (bloc.droitFusionne) {
        if (idx === 0) {
          row.push({
            content: cleanPdfText(bloc.droitGlobal),
            rowSpan: nb,
            styles: { halign: 'center', valign: 'middle' },
          });
        }
      } else {
        row.push({ content: cleanPdfText(ligne.droit), styles: { halign: 'center' } });
      }
      bodyRows.push(row);
      rowCursor++;
    });
  }

  autoTable(doc, {
    startY: y + 0.5,
    tableWidth: contentW,
    margin: { left: marginX, right: marginX },
    theme: 'grid',
    head: [[
      { content: "Anton'ny fangatahana", colSpan: 2, styles: { halign: 'center' } },
      { content: 'x', styles: { halign: 'center' } },
      { content: "Isan'ny andro angatahana", styles: { halign: 'center' } },
      { content: "Voalazan'ny FITSIPIKA ANATINY manan-kery", styles: { halign: 'center' } },
    ]],
    body: bodyRows,
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      fontSize: 7.8,
      lineColor: [60, 60, 60],
      lineWidth: 0.2,
      cellPadding: 1.1,
    },
    styles: {
      font: 'helvetica',
      fontSize: 7.6,
      cellPadding: 0.85,
      lineColor: [60, 60, 60],
      lineWidth: 0.2,
      textColor: [0, 0, 0],
    },
    columnStyles: {
      0: { cellWidth: 32 },
      1: { cellWidth: 55 },
      2: { cellWidth: 9 },
      3: { cellWidth: 28 },
      4: { cellWidth: contentW - 124 },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && checkedRows.has(data.row.index) && data.column.index >= 1 && data.column.index <= 3) {
        data.cell.styles.fillColor = [224, 242, 254];
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  // Soldes (sisa ambiny / Titre / Sisa tavela)
  const surPermission = conge.imputation === 'PERMISSION';
  const avant = recap
    ? surPermission ? recap.permAvant : (recap.resteTitreAvant !== undefined ? recap.resteTitreAvant : recap.soldeAvant)
    : 0;
  const apres = recap
    ? surPermission ? recap.permApres : (recap.resteTitreApres !== undefined ? recap.resteTitreApres : recap.soldeApres)
    : 0;
  const titreAvant = cleanPdfText(
    conge.titre_periode || (recap ? String(surPermission ? recap.annee : recap.titreAvant || recap.annee) : '............')
  );
  const anneeApres = cleanPdfText(
    recap ? String(surPermission ? recap.annee : recap.titreApres || recap.annee) : String(conge.annee)
  );

  let afterTbl = (doc as any).lastAutoTable.finalY + 4.2;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(
    cleanPdfText(
      `Congé/Permission sisa ambiny : ${recap ? `${fmtJours(avant)} andro` : '............'}     Titre/Année : ${titreAvant}     Isan'ny angatahina : ${fmtJours(jours)}`
    ),
    marginX,
    afterTbl
  );
  afterTbl += 4.5;
  doc.text(
    cleanPdfText(
      `Olona hisolo : ${conge.remplacant || '..........................................'}     Sisa tavela : ${recap ? `${fmtJours(apres)} andro` : '..........'}     Année : ${anneeApres}`
    ),
    marginX,
    afterTbl
  );

  // Tableau des dates et heures
  autoTable(doc, {
    startY: afterTbl + 2.5,
    tableWidth: contentW,
    margin: { left: marginX, right: marginX },
    theme: 'grid',
    head: [[
      "Datin'ny fangatahana",
      'Daty handehanana (congé , permission, repos medical)',
      'Daty fiverenana miasa',
    ]],
    body: [[
      cleanPdfText(dateFr(conge.date_demande)),
      `${cleanPdfText(periodeAbsenceDocx(conge))}\n${heureDocx(conge.heure_debut)}`,
      `${cleanPdfText(dateFr(dateRetourFiche(conge)))}\n${heureDocx(conge.heure_fin)}`,
    ]],
    headStyles: {
      fillColor: [248, 250, 252], textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center',
      fontSize: 7.8, lineColor: [60, 60, 60], lineWidth: 0.2, cellPadding: 1,
    },
    styles: {
      font: 'helvetica', fontSize: 8, halign: 'center', valign: 'middle',
      cellPadding: 1.2, lineColor: [60, 60, 60], lineWidth: 0.2, textColor: [0, 0, 0],
    },
    columnStyles: {
      0: { cellWidth: contentW * 0.25 },
      1: { cellWidth: contentW * 0.45 },
      2: { cellWidth: contentW * 0.30 },
    },
  });

  let sigStartY = (doc as any).lastAutoTable.finalY + 2.5;
  if (conge.justificatif || conge.observations || conge.motif_refus) {
    const notes: string[] = [];
    if (conge.justificatif) notes.push(`Justificatif : ${cleanPdfText(conge.justificatif)}`);
    if (conge.observations && conge.observations !== 'Reprise du contrôle des congés importé.') {
      notes.push(`Observations : ${cleanPdfText(conge.observations)}`);
    }
    if (conge.motif_refus) notes.push(`Motif du refus : ${cleanPdfText(conge.motif_refus)}`);
    if (notes.length) {
      doc.setFontSize(7.5);
      const wrapped = doc.splitTextToSize(notes.join('  |  '), contentW);
      doc.text(wrapped.slice(0, 2), marginX, sigStartY + 2.5);
      sigStartY += Math.min(2, wrapped.length) * 3.3 + 1.5;
    }
  }

  // Tableau des 4 signatures : Ny mpangataka | Chef de Service | Médecin Chef | Gestionnaire
  const visaCell = (qui: string, date: string) =>
    cleanPdfText([qui, date ? dateFr(date) : ''].filter(Boolean).join('\n'));

  autoTable(doc, {
    startY: sigStartY + 1,
    tableWidth: contentW,
    margin: { left: marginX, right: marginX },
    theme: 'grid',
    head: [['Ny mpangataka', 'Chef de Service', 'Médecin Chef', 'Gestionnaire']],
    body: [[
      visaCell(conge.nom_prenoms, conge.date_demande),
      visaCell(conge.visa_chef_par, conge.visa_chef_le),
      visaCell(conge.visa_medecin_par, conge.visa_medecin_le),
      visaCell(conge.visa_gestionnaire_par, conge.visa_gestionnaire_le),
    ]],
    headStyles: {
      fillColor: [248, 250, 252], textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center',
      fontSize: 8, lineColor: [60, 60, 60], lineWidth: 0.2, cellPadding: 1.1,
    },
    styles: {
      font: 'helvetica', fontSize: 7.5, halign: 'center', minCellHeight: 15,
      cellPadding: 1.2, lineColor: [60, 60, 60], lineWidth: 0.2, textColor: [0, 0, 0],
    },
  });

  const endY = Math.min(291, (doc as any).lastAutoTable.finalY + 3.8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(80, 80, 80);
  doc.text(
    cleanPdfText(`Statut : ${LIBELLES_STATUT[conge.statut]}  |  Fiche n° ${conge.id || '-'}  |  Imputation : ${conge.imputation === 'CONGE' ? 'Congé' : conge.imputation === 'PERMISSION' ? 'Permission' : 'Sans décompte'}`),
    marginX,
    endY
  );
  doc.text(`Toliara, le ${new Date().toLocaleDateString('fr-FR')}`, pageW - marginX, endY, { align: 'right' });
}

export function downloadFicheAbsencePDF(conge: CongeAbsence, recap?: RecapFiche | null): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  drawFicheAbsencePage(doc, conge, recap);
  const nom = safeFilePart(conge.nom_prenoms || 'SALARIE');
  doc.save(`FICHE_ABSENCE_${conge.numero_matricule ? `MAT${conge.numero_matricule}_` : ''}${nom}_${conge.annee}.pdf`);
}

/** Génère le PDF A4 Paysage de l'état « CONTRÔLE DES CONGÉS ET PERMISSIONS ». */
export function buildEtatCongesPDF(etat: EtatConges, annee: number): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const { groupes, colonnes } = colonnesEtat(etat.annees);
  const marginX = 7;
  const contentW = 297 - marginX * 2;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('FIANGONANA LOTERANA MALAGASY - CLINIQUE SALFA TANAMBAO', 148.5, 9, { align: 'center' });
  doc.setFontSize(9.5);
  doc.text(`CONTRÔLE DES CONGÉS ET PERMISSIONS - ANNÉE ${annee}`, 148.5, 14, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(
    cleanPdfText(
      `Loi malgache : ${fmtJours(etat.config.joursCongeParAn)} j de congé/an sur les ${etat.config.nbAnneesCumul} dernières années (${etat.annees.join('/')}, max ${fmtJours(etat.config.plafondCumulConge)} j) - ${fmtJours(etat.config.joursPermissionParAn)} j de permission/an  |  ${etat.parcours.length} salarié(s)`
    ),
    148.5,
    18.5,
    { align: 'center' }
  );

  const headRow1 = groupes.map((g, gi) => ({
    content: cleanPdfText(g),
    colSpan: colonnes.filter((c) => c.groupe === gi).length,
    styles: { halign: 'center' as const, fillColor: [26, 54, 93] as [number, number, number], textColor: [255, 255, 255] as [number, number, number] },
  }));
  const headRow2 = colonnes.map((c) => ({
    content: cleanPdfText(c.label),
    styles: { halign: 'center' as const, fillColor: [241, 245, 249] as [number, number, number], textColor: [15, 23, 42] as [number, number, number] },
  }));

  const body: any[][] = [];
  const finalRowIdx = new Set<number>();
  const MAX_SPAN = 20;

  for (const p of etat.parcours) {
    const toutesLignes = p.lignes.length ? p.lignes : [];
    for (let offset = 0; offset < toutesLignes.length; offset += MAX_SPAN) {
      const tranche = toutesLignes.slice(offset, offset + MAX_SPAN);
      tranche.forEach((ligne, idx) => {
        if (ligne.type === 'SOLDE_FINAL') finalRowIdx.add(body.length);
        const row: any[] = [];
        if (idx === 0) {
          row.push({ content: String(p.numero_matricule || ''), rowSpan: tranche.length, styles: { halign: 'center', fontStyle: 'bold', valign: 'top' } });
          row.push({
            content: cleanPdfText(`${p.nom_prenoms}${offset > 0 ? ' (suite)' : `\n(Titre ${p.titreActif} : ${fmtJours(p.resteTitreActif)} j)`}`),
            rowSpan: tranche.length,
            styles: { fontStyle: 'bold', valign: 'top' },
          });
          row.push({ content: cleanPdfText(p.fonction || ''), rowSpan: tranche.length, styles: { valign: 'top' } });
        }
        for (const c of colonnes) {
          if (c.cle === 'mat' || c.cle === 'nom' || c.cle === 'fonction') continue;
          const v = valeurCellule(ligne, c.cle, p, etat.annees);
          const txt = v === '·' ? '' : cleanPdfText(String(v));
          row.push({
            content: txt,
            styles: { halign: c.align },
          });
        }
        body.push(row);
      });
    }
  }

  const totalWidth = colonnes.reduce((s, c) => s + c.width, 0);
  const columnStyles: Record<number, any> = {};
  colonnes.forEach((c, i) => {
    columnStyles[i] = { cellWidth: (c.width / totalWidth) * contentW, halign: c.align };
  });

  const totalCongesRestants = etat.parcours.reduce((s, p) => s + (p.soldeActuel || 0), 0);

  autoTable(doc, {
    startY: 21,
    tableWidth: contentW,
    margin: { left: marginX, right: marginX, top: 10, bottom: 10 },
    theme: 'grid',
    head: [headRow1, headRow2],
    body,
    foot: [[
      { content: `TOTAUX ${annee} (${etat.parcours.length} salariés)`, colSpan: 3 + etat.annees.length, styles: { fontStyle: 'bold' } },
      { content: cleanPdfText(fmtJours(etat.totaux.joursConge)), styles: { halign: 'right', fontStyle: 'bold' } },
      { content: '' },
      { content: cleanPdfText(fmtJours(totalCongesRestants)), styles: { halign: 'right', fontStyle: 'bold' } },
      { content: '' },
      { content: cleanPdfText(fmtJours(etat.totaux.joursPermission)), styles: { halign: 'right', fontStyle: 'bold' } },
      { content: '' },
      { content: '' },
      { content: '' },
      { content: 'Congés & permissions validés de l’exercice', styles: { fontStyle: 'bold' } },
      { content: cleanPdfText(fmtJours(etat.totaux.joursExamen)), styles: { halign: 'right', fontStyle: 'bold' } },
      { content: `${etat.totaux.nbEnAttente} att.`, styles: { halign: 'center', fontStyle: 'bold' } },
    ]],
    styles: {
      font: 'helvetica',
      fontSize: 5.5,
      cellPadding: 0.6,
      lineColor: [90, 90, 90],
      lineWidth: 0.15,
      textColor: [0, 0, 0],
    },
    headStyles: { fontStyle: 'bold', fontSize: 6, cellPadding: 0.9 },
    footStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 6 },
    columnStyles,
    didParseCell: (data) => {
      if (data.section === 'body' && finalRowIdx.has(data.row.index)) {
        data.cell.styles.fillColor = [238, 242, 247];
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  return doc;
}

export function downloadEtatCongesPDF(etat: EtatConges, annee: number): void {
  const doc = buildEtatCongesPDF(etat, annee);
  doc.save(`CONTROLE_CONGES_PERMISSIONS_SALFA_${annee}.pdf`);
}
