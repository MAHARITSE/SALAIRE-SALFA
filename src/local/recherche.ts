/** Normalise une recherche de nom ou de texte pour ignorer la casse, les accents et les séparateurs. */
export function normaliserRecherche(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[œŒ]/g, 'oe')
    .toUpperCase()
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Tous les mots saisis doivent être présents, quel que soit leur ordre. */
export function correspondRecherche(recherche: unknown, ...valeurs: unknown[]): boolean {
  const termes = normaliserRecherche(recherche).split(' ').filter(Boolean);
  if (termes.length === 0) return true;
  const texte = normaliserRecherche(valeurs.filter((v) => v !== null && v !== undefined).join(' '));
  return termes.every((terme) => texte.includes(terme));
}
