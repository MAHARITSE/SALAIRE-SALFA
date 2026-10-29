// ==============================================================================
// ICÔNE D'ONGLET DE L'APPLICATION (FAVICON PERSONNALISABLE DANS ADMINISTRATION)
// Remplace l'icône par défaut de WampServer (W rose) par le logo SALFA ou par
// toute icône choisie par l'administrateur, persistée en base MySQL (salfa_config)
// et mise en cache localement pour s'afficher dès l'écran de connexion.
// ==============================================================================

import logoSalfaDefault from '../assets/logo-salfa.png';
import logoCourrierSalfa from '../assets/logo-courrier.png';

const LOCAL_FAVICON_CACHE_KEY = 'salfa_custom_favicon_v1';

export const DEFAULT_APP_ICON: string = logoSalfaDefault;
export const PRESET_APP_ICONS: Array<{ id: string; label: string; src: string }> = [
  { id: 'salfa', label: 'Logo SALFA officiel', src: logoSalfaDefault },
  { id: 'courrier', label: 'Logo FLM / Courrier', src: logoCourrierSalfa },
];

/** Lit l'icône mise en cache localement (utile avant authentification WAMP). */
export function getCachedFavicon(): string {
  try {
    if (typeof localStorage !== 'undefined') {
      const v = localStorage.getItem(LOCAL_FAVICON_CACHE_KEY);
      if (v && (v.startsWith('data:image/') || v.startsWith('./') || v.startsWith('/') || v.startsWith('http'))) {
        return v;
      }
    }
  } catch {
    /* ignore */
  }
  return '';
}

/** Met à jour le cache local de l'icône. */
export function setCachedFavicon(iconUrl: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      if (iconUrl && iconUrl.trim()) {
        localStorage.setItem(LOCAL_FAVICON_CACHE_KEY, iconUrl.trim());
      } else {
        localStorage.removeItem(LOCAL_FAVICON_CACHE_KEY);
      }
    }
  } catch {
    /* ignore */
  }
}

/** Applique immédiatement l'icône sur l'onglet du navigateur (<link rel="icon">). */
export function applyAppFavicon(customIcon?: string | null): string {
  const chosen = (customIcon && customIcon.trim()) || getCachedFavicon() || DEFAULT_APP_ICON;
  if (customIcon !== undefined) {
    setCachedFavicon(customIcon || '');
  }
  const effectiveHref = (customIcon && customIcon.trim()) || DEFAULT_APP_ICON;
  if (typeof document === 'undefined' || !document.head) {
    return customIcon !== undefined ? effectiveHref : chosen;
  }

  const href = customIcon !== undefined ? effectiveHref : chosen;
  const mime = href.startsWith('data:image/svg')
    ? 'image/svg+xml'
    : href.startsWith('data:image/x-icon') || href.endsWith('.ico')
      ? 'image/x-icon'
      : 'image/png';

  const ensureLink = (id: string, rel: string) => {
    let el = document.getElementById(id) as HTMLLinkElement | null;
    if (!el) {
      el = document.createElement('link');
      el.id = id;
      el.rel = rel;
      document.head.appendChild(el);
    }
    el.type = mime;
    el.href = href;
  };

  ensureLink('salfa-favicon', 'icon');
  ensureLink('salfa-shortcut-icon', 'shortcut icon');
  ensureLink('salfa-apple-icon', 'apple-touch-icon');
  return href;
}

/**
 * Redimensionne / normalise un fichier image (.png, .ico, .svg, .jpg, .webp)
 * en Data URL PNG 64×64 net et léger (< 20 Ko) pour servir de favicon d'onglet.
 */
export function prepareFaviconDataUrl(file: File, maxSize = 64): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('Aucun fichier sélectionné.'));
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      reject(new Error('Fichier trop volumineux (maximum 4 Mo).'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Lecture du fichier impossible.'));
    reader.onload = () => {
      const rawDataUrl = String(reader.result || '');
      if (!rawDataUrl.startsWith('data:')) {
        reject(new Error('Format de fichier non reconnu.'));
        return;
      }
      // Conserver directement les petits fichiers ICO ou SVG si < 48 Ko
      if ((file.type === 'image/x-icon' || file.type === 'image/vnd.microsoft.icon' || file.name.toLowerCase().endsWith('.ico')) && rawDataUrl.length < 65000) {
        resolve(rawDataUrl);
        return;
      }
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = maxSize;
          canvas.height = maxSize;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(rawDataUrl);
            return;
          }
          ctx.clearRect(0, 0, maxSize, maxSize);
          const ratio = Math.min(maxSize / (img.width || maxSize), maxSize / (img.height || maxSize));
          const w = Math.max(1, Math.round((img.width || maxSize) * ratio));
          const h = Math.max(1, Math.round((img.height || maxSize) * ratio));
          const x = Math.round((maxSize - w) / 2);
          const y = Math.round((maxSize - h) / 2);
          ctx.drawImage(img, x, y, w, h);
          resolve(canvas.toDataURL('image/png'));
        } catch {
          resolve(rawDataUrl);
        }
      };
      img.onerror = () => reject(new Error('Image invalide ou non prise en charge (utilisez PNG, ICO, SVG ou JPG).'));
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  });
}
