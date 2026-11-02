// Formatage des cellules monétaires dans les exports XLSX.
// SheetJS Community écrit fiablement le format numérique (z) ; les cellules
// numériques sont alignées à droite par défaut dans Excel/LibreOffice.
import * as XLSX from 'xlsx';
import { FORMAT_EXCEL_MONTANT } from './montants';

/** Applique le format comptable « zéro = - » aux colonnes indiquées (0-based). */
export function formaterColonnesMonetairesExcel(
  ws: XLSX.WorkSheet,
  colonnes: number[],
  premiereLigne = 0
): void {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  const cols = new Set(colonnes.filter((c) => Number.isInteger(c) && c >= 0));
  for (let r = Math.max(premiereLigne, range.s.r); r <= range.e.r; r++) {
    for (const c of cols) {
      if (c < range.s.c || c > range.e.c) continue;
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr] as XLSX.CellObject | undefined;
      if (!cell) continue;
      if (cell.t === 'n' || typeof cell.v === 'number') {
        cell.t = 'n';
        cell.z = FORMAT_EXCEL_MONTANT;
      }
    }
  }
}
