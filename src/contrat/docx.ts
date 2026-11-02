// Téléchargement Word du contrat à partir du modèle fourni.
import modeleUrl from '../assets/contrat-salfa-modele.docx?url';
import { ContratDocument, nomFichierContrat, valeursModeleContrat } from './model';
import { Employe } from '../types';
import { MIME_DOCX, remplirModeleDocx } from './docx-core';
import { telechargerBlob } from './download';

export { remplirModeleDocx } from './docx-core';

let modeleCache: Promise<Uint8Array> | null = null;
function chargerModele(): Promise<Uint8Array> {
  if (!modeleCache) {
    modeleCache = fetch(modeleUrl)
      .then(res => {
        if (!res.ok) throw new Error(`Modèle Word introuvable (HTTP ${res.status}).`);
        return res.arrayBuffer();
      })
      .then(buf => new Uint8Array(buf))
      .catch(err => {
        modeleCache = null;
        throw err;
      });
  }
  return modeleCache;
}

export async function telechargerContratDocx(emp: Employe, doc: ContratDocument): Promise<void> {
  const modele = await chargerModele();
  const bytes = remplirModeleDocx(modele, valeursModeleContrat(doc));
  const copie = new Uint8Array(bytes); // garantit un ArrayBuffer standard pour Blob
  telechargerBlob(nomFichierContrat(emp, doc, 'docx'), new Blob([copie.buffer], { type: MIME_DOCX }));
}
