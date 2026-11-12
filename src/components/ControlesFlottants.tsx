import React, { useEffect, useState } from 'react';
import { Minus, Moon, Plus, Sun } from 'lucide-react';
import type { ThemeMode } from '../local/theme';
import './controles-flottants.css';

export const NIVEAUX_TAILLE = [13, 14, 15, 16, 17, 18, 20, 22] as const;
export const CLE_TAILLE = 'salfa_paie_taille_affichage_v1';

export function lireTailleAffichage(): number {
  try {
    const valeur = Number(localStorage.getItem(CLE_TAILLE));
    return NIVEAUX_TAILLE.some(n => n === valeur) ? valeur : 16;
  } catch { return 16; }
}

/** Contrôles d'écran uniquement : ne modifient ni les impressions ni les données. */
export function ControlesFlottants({ theme, toggleTheme }: {
  theme: ThemeMode;
  toggleTheme: () => void;
}) {
  const [taille, setTaille] = useState(lireTailleAffichage);
  useEffect(() => {
    try { localStorage.setItem(CLE_TAILLE, String(taille)); } catch { /* Stockage facultatif. */ }
  }, [taille]);
  const index = NIVEAUX_TAILLE.findIndex(n => n === taille);
  const pourcentage = Math.round(taille / 16 * 100);
  return (
    <>
      <style media="screen">{`:root { font-size: ${taille}px; }`}</style>
      <aside className="controles-flottants no-print" aria-label="Accessibilité et affichage">
        <button type="button" className="controle-rond" onClick={() => setTaille(NIVEAUX_TAILLE[index - 1])} disabled={index <= 0} aria-label="Réduire la taille de police" title="Réduire la taille de police"><Minus size={16} /></button>
        <button type="button" className="controle-pourcentage" onClick={() => setTaille(16)} aria-label={`Taille actuelle ${pourcentage}%, réinitialiser à 100%`} title="Réinitialiser à 100 %">{pourcentage}%</button>
        <button type="button" className="controle-rond" onClick={() => setTaille(NIVEAUX_TAILLE[index + 1])} disabled={index >= NIVEAUX_TAILLE.length - 1} aria-label="Augmenter la taille de police" title="Augmenter la taille de police"><Plus size={16} /></button>
        <button type="button" className="controle-rond" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Activer le mode clair' : 'Activer le mode sombre'} title="Changer le thème clair / sombre">{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button>
      </aside>
    </>
  );
}
