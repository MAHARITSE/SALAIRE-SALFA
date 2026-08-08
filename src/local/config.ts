// ==============================================================================
// CONFIGURATION LOCALE DES PARAMÈTRES DE PAIE (IRSA / CNaPS / MATERNITÉ)
// Les valeurs sont stockées dans le localStorage et modifiables depuis la
// modale Administration. Le moteur de calcul (calcul.ts) lit ces valeurs.
// ==============================================================================

export interface PaieConfig {
  // CNaPS
  cnapsSalariale: number;   // en % (ex: 1.0)
  cnapsPatronale: number;   // en % (ex: 13.0)
  // IRSA
  deductionEnfant: number;  // déduction forfaitaire par enfant à charge (Ar)
  minIrsa: number;          // minimum de perception IRSA (Ar)
  // Maternité
  tauxMaternite: number;    // part de la base brute versée (ex: 50 %)
  dureeMaterniteMois: number; // durée du congé maternité (ex: 3 mois)
}

export const DEFAULT_CONFIG: PaieConfig = {
  cnapsSalariale: 1.0,
  cnapsPatronale: 13.0,
  deductionEnfant: 2000,
  minIrsa: 3000,
  tauxMaternite: 50,
  dureeMaterniteMois: 3,
};

const CONFIG_KEY = 'salfa_paie_config_v1';

let configCache: PaieConfig | null = null;

export function loadConfig(): PaieConfig {
  if (configCache) return configCache;
  let loaded: Partial<PaieConfig> = {};
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) loaded = JSON.parse(raw) || {};
  } catch (e) {
    console.warn('[CONFIG] Lecture config impossible.', e);
  }
  configCache = { ...DEFAULT_CONFIG, ...loaded };
  return configCache;
}

export function saveConfig(cfg: Partial<PaieConfig>): PaieConfig {
  const merged: PaieConfig = { ...loadConfig(), ...cfg };
  configCache = merged;
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(merged));
  } catch (e) {
    console.error('[CONFIG] Sauvegarde config impossible.', e);
  }
  return merged;
}

export function resetConfig(): PaieConfig {
  configCache = { ...DEFAULT_CONFIG };
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(configCache));
  } catch (e) {
    /* ignore */
  }
  return configCache;
}
