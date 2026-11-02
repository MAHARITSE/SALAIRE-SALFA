// Génération Word : le modèle fourni est conservé (clauses, entête, logo, styles).
// Seuls les jetons préparés par scripts/preparer-modele-contrat.cjs sont remplacés.
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';

export const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Remplacement pur, testable sans navigateur. */
export function remplirModeleDocx(modele: Uint8Array, valeurs: Record<string, string>): Uint8Array {
  const fichiers = unzipSync(modele);
  const document = fichiers['word/document.xml'];
  if (!document) throw new Error('Modèle Word invalide : word/document.xml absent.');
  let xml = strFromU8(document);

  // La mention de projet est une ligne à part ; on la retire quand le contrat est complet.
  if (!valeurs.mention_projet) {
    xml = xml.replace(/<w:p\b[^>]*>(?:(?!<\/w:p>)[\s\S])*?\{\{mention_projet\}\}(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/g, '');
  }
  for (const [cle, valeur] of Object.entries(valeurs)) {
    const jeton = `{{${cle}}}`;
    if (!xml.includes(jeton)) continue;
    xml = xml.split(jeton).join(escapeXml(valeur));
  }
  const restants = xml.match(/\{\{[a-z_]+\}\}/g);
  if (restants?.length) throw new Error(`Modèle Word : champs non remplacés (${[...new Set(restants)].join(', ')}).`);
  fichiers['word/document.xml'] = strToU8(xml);
  return zipSync(fichiers, { level: 6 });
}
