import type { PaieMensuelle } from '../types';
import { correspondRecherche } from '../local/recherche';

export function filtrerPaiesBulletins(paies: PaieMensuelle[], recherche: string): PaieMensuelle[] {
  return paies.filter(p => correspondRecherche(recherche, p.numero_matricule, p.nom_prenoms, p.jobs, p.categorie));
}

/** L'aperçu et les sorties ne peuvent jamais viser un salarié hors du filtre. */
export function selectionnerPaieVisible(paiesVisibles: PaieMensuelle[], selectionId: number | null): PaieMensuelle | null {
  return paiesVisibles.find(p => p.id === selectionId) ?? paiesVisibles[0] ?? null;
}
