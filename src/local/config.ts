// ==============================================================================
// CONFIGURATION LOCALE DES PARAMÈTRES DE PAIE (IRSA / CNaPS / MATERNITÉ / ANCIENNETE)
// Les valeurs sont stockées dans le localStorage et modifiables depuis la
// modale Administration. Le moteur de calcul (calcul.ts) lit ces valeurs.
// ==============================================================================

// Barème d'ancienneté : années min/max -> indice multiplicateur sur base
export interface BaremeAncienneteConfig {
  min: number;   // années min inclus
  max: number;   // années max inclus (100 = plafond)
  indice: number; // ex: 1.09
}

// Barème IRSA : chaque tranche = [min, max[ avec taux en %
export interface TrancheIrsaConfig {
  min: number;       // seuil bas (ex: 0)
  max: number | null; // seuil haut, null = infini / au-delà
  taux: number;       // taux en % (ex: 5 pour 5%)
}

export interface PaieConfig {
  // CNaPS
  cnapsSalariale: number;   // en % (ex: 1.0)
  cnapsPatronale: number;   // en % (ex: 13.0)
  // IRSA
  deductionEnfant: number;  // déduction forfaitaire par enfant à charge (Ar)
  minIrsa: number;          // minimum de perception IRSA (Ar)
  arrondiIrsaBase: number;  // arrondi de la base imposable à ... inférieur (ex: 100)
  baremeIrsa: TrancheIrsaConfig[]; // barème progressif
  // Maternité
  tauxMaternite: number;    // part de la base brute versée (ex: 50 %)
  dureeMaterniteMois: number; // durée du congé maternité (ex: 3 mois)
  // Règles NET / RAP
  arrondiNet: number;       // arrondi du net à payer (ex: 100 => 100 Ar inférieur)
  plafondEspeces: number;   // plafond espèces quand RIB présent et RAP actif (ex: 5000)
  // Ancienneté
  baremeAnciennete: BaremeAncienneteConfig[];
}

export const DEFAULT_BAREME_ANCIENNETE: BaremeAncienneteConfig[] = [
  { min: 0, max: 1, indice: 1.00 },
  { min: 2, max: 3, indice: 1.09 },
  { min: 4, max: 5, indice: 1.18 },
  { min: 6, max: 7, indice: 1.27 },
  { min: 8, max: 9, indice: 1.36 },
  { min: 10, max: 11, indice: 1.45 },
  { min: 12, max: 13, indice: 1.53 },
  { min: 14, max: 15, indice: 1.60 },
  { min: 16, max: 17, indice: 1.65 },
  { min: 18, max: 19, indice: 1.68 },
  { min: 20, max: 100, indice: 1.70 }
];

export const DEFAULT_BAREME_IRSA: TrancheIrsaConfig[] = [
  { min: 0, max: 350000, taux: 0 },
  { min: 350000, max: 400000, taux: 5 },
  { min: 400000, max: 500000, taux: 10 },
  { min: 500000, max: 600000, taux: 15 },
  { min: 600000, max: null, taux: 20 },
];

export const DEFAULT_CONFIG: PaieConfig = {
  cnapsSalariale: 1.0,
  cnapsPatronale: 13.0,
  deductionEnfant: 2000,
  minIrsa: 3000,
  arrondiIrsaBase: 100,
  arrondiNet: 100,
  plafondEspeces: 5000,
  tauxMaternite: 50,
  dureeMaterniteMois: 3,
  baremeAnciennete: DEFAULT_BAREME_ANCIENNETE,
  baremeIrsa: DEFAULT_BAREME_IRSA,
};

const CONFIG_KEY = 'salfa_paie_config_v1';

let configCache: PaieConfig | null = null;

function sanitizeBaremeAnciennete(raw: any): BaremeAncienneteConfig[] {
  if (!Array.isArray(raw)) return [...DEFAULT_BAREME_ANCIENNETE];
  const cleaned: BaremeAncienneteConfig[] = [];
  for (const r of raw) {
    const min = Number(r.min);
    const max = Number(r.max);
    const indice = Number(r.indice);
    if (isNaN(min) || isNaN(max) || isNaN(indice)) continue;
    if (min < 0 || max < min || indice <= 0) continue;
    cleaned.push({ min: Math.floor(min), max: Math.floor(max), indice: Math.round(indice * 100) / 100 });
  }
  if (cleaned.length === 0) return [...DEFAULT_BAREME_ANCIENNETE];
  // trier par min
  cleaned.sort((a, b) => a.min - b.min);
  return cleaned;
}

function sanitizeBaremeIrsa(raw: any): TrancheIrsaConfig[] {
  if (!Array.isArray(raw)) return [...DEFAULT_BAREME_IRSA];
  const cleaned: TrancheIrsaConfig[] = [];
  for (const r of raw) {
    const min = Number(r.min);
    const max = r.max === null || r.max === undefined || r.max === '' ? null : Number(r.max);
    const taux = Number(r.taux);
    if (isNaN(min) || (max !== null && isNaN(max)) || isNaN(taux)) continue;
    if (min < 0 || taux < 0 || taux > 100) continue;
    if (max !== null && max <= min) continue;
    cleaned.push({ min: Math.floor(min), max: max === null ? null : Math.floor(max), taux: Math.round(taux * 100) / 100 });
  }
  if (cleaned.length === 0) return [...DEFAULT_BAREME_IRSA];
  cleaned.sort((a, b) => a.min - b.min);
  return cleaned;
}

export function loadConfig(): PaieConfig {
  if (configCache) return configCache;
  let loaded: Partial<PaieConfig> = {};
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) loaded = JSON.parse(raw) || {};
  } catch (e) {
    console.warn('[CONFIG] Lecture config impossible.', e);
  }
  const merged: PaieConfig = {
    ...DEFAULT_CONFIG,
    ...loaded,
    baremeAnciennete: loaded.baremeAnciennete ? sanitizeBaremeAnciennete(loaded.baremeAnciennete) : [...DEFAULT_CONFIG.baremeAnciennete],
    baremeIrsa: loaded.baremeIrsa ? sanitizeBaremeIrsa(loaded.baremeIrsa) : [...DEFAULT_CONFIG.baremeIrsa],
  };
  // sécuriser les nombres
  merged.cnapsSalariale = Number(merged.cnapsSalariale) || DEFAULT_CONFIG.cnapsSalariale;
  merged.cnapsPatronale = Number(merged.cnapsPatronale) || DEFAULT_CONFIG.cnapsPatronale;
  merged.deductionEnfant = Number(merged.deductionEnfant) || 0;
  merged.minIrsa = Number(merged.minIrsa) || 0;
  merged.arrondiIrsaBase = Number(merged.arrondiIrsaBase) || 0;
  merged.arrondiNet = Number(merged.arrondiNet) || 0;
  merged.plafondEspeces = Number(merged.plafondEspeces) || 0;
  merged.tauxMaternite = Number(merged.tauxMaternite) || DEFAULT_CONFIG.tauxMaternite;
  merged.dureeMaterniteMois = Number(merged.dureeMaterniteMois) || DEFAULT_CONFIG.dureeMaterniteMois;

  configCache = merged;
  return merged;
}

export function saveConfig(cfg: Partial<PaieConfig>): PaieConfig {
  const current = loadConfig();
  const nextRaw: PaieConfig = {
    ...current,
    ...cfg,
  };
  if (cfg.baremeAnciennete) nextRaw.baremeAnciennete = sanitizeBaremeAnciennete(cfg.baremeAnciennete);
  if (cfg.baremeIrsa) nextRaw.baremeIrsa = sanitizeBaremeIrsa(cfg.baremeIrsa);

  // re-sanitize nombres
  nextRaw.cnapsSalariale = Number(nextRaw.cnapsSalariale) || 0;
  nextRaw.cnapsPatronale = Number(nextRaw.cnapsPatronale) || 0;
  nextRaw.deductionEnfant = Number(nextRaw.deductionEnfant) || 0;
  nextRaw.minIrsa = Number(nextRaw.minIrsa) || 0;
  nextRaw.arrondiIrsaBase = Number(nextRaw.arrondiIrsaBase) || 0;
  nextRaw.arrondiNet = Number(nextRaw.arrondiNet) || 0;
  nextRaw.plafondEspeces = Number(nextRaw.plafondEspeces) || 0;
  nextRaw.tauxMaternite = Number(nextRaw.tauxMaternite) || 50;
  nextRaw.dureeMaterniteMois = Number(nextRaw.dureeMaterniteMois) || 3;

  configCache = nextRaw;
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(nextRaw));
  } catch (e) {
    console.error('[CONFIG] Sauvegarde config impossible.', e);
  }
  return nextRaw;
}

export function resetConfig(): PaieConfig {
  configCache = {
    ...DEFAULT_CONFIG,
    baremeAnciennete: [...DEFAULT_CONFIG.baremeAnciennete],
    baremeIrsa: [...DEFAULT_CONFIG.baremeIrsa.map(t => ({ ...t }))],
  };
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(configCache));
  } catch (e) {
    /* ignore */
  }
  return configCache;
}
