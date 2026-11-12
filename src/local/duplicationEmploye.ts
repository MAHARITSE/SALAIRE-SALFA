import type { Employe } from '../types';

// Un brouillon seulement : aucun ID, bulletin, congé ou historique n'est copié.
export function preparerDuplicationEmploye(source: Employe, employes: Employe[]): Partial<Employe> {
  const champs = [
    'categorie', 'jobs', 'date_embauche', 'enfant_a_charge', 'base_aj',
    'logement_transport', 'rendement', 'responsabilite_representation', 'mode_paiement',
    'genre', 'date_naissance', 'lieu_naissance', 'pere', 'mere',
    'situation_matrimoniale', 'adresse', 'service', 'diplome', 'etablissement',
    'statut', 'numero_ordre', 'nature_contrat', 'duree_contrat', 'lieu_embauche',
    'lieu_travail', 'date_effet',
  ] as const;
  const copie: Partial<Employe> = {};
  for (const champ of champs) {
    Object.assign(copie, { [champ]: source[champ] });
  }
  const matricules = employes.map(e => Number(e.numero_matricule))
    .filter(n => Number.isSafeInteger(n) && n > 0);
  const maximum = matricules.reduce((max, n) => Math.max(max, n), 0);
  let prochain = maximum + 1;
  if (!Number.isSafeInteger(prochain)) {
    const attribues = new Set(matricules);
    prochain = 1;
    while (attribues.has(prochain)) prochain++;
  }
  return {
    ...copie,
    numero_matricule: prochain,
    nom_prenoms: '',
    numero_cnaps: '',
    cin: '',
    date_cin: '',
    lieu_cin: '',
    rib: '',
    actif: 1,
    date_inactif: '',
    conge_maternite: 0,
    date_debut_maternite: '',
  };
}
