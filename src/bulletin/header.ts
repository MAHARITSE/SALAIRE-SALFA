import defaultImage from '../assets/entete-salfa.png?inline';
import defaultLogoLeft from '../assets/logo-salfa.png?inline';
import defaultLogoRight from '../assets/logo-courrier.png?inline';

const STORAGE_KEY = 'salfa_bulletin_entete_v1';
const CONGE_HEADER_STORAGE_KEY = 'salfa_conge_entete_v1';
export const DEFAULT_LINES = [
  'FIANGONANA LOTERANA MALAGASY',
  '(EGLISE LUTHERIENNE MALGACHE - MALAGASY LUTHERAN CHURCH)',
  "SAMPAN'ASA LOTERANA MOMBA NY FAHASALAMANA",
  'DEPARTEMENT DE SANTE – HEALTH DEPARTMENT',
  'DISPENSAIRE TANAMBAO - TOBY BETELA TOLIARA BP: 99 Tél:94 416 56',
  'NIF: 5000767080    STAT: 851 125 120 120 001 36',
  'E-mail: salfa.tulear@moov.mg',
];
export interface BulletinHeaderConfig {
  mode: 'image' | 'personnalise';
  image: string; // rendu final utilisé par l'aperçu, l'impression et les PDF
  fullImage: string; // image complète conservée lors du passage en mode personnalisé
  lines: string[];
  logoLeft: string;
  logoRight: string;
}
export function defaultBulletinHeader(): BulletinHeaderConfig {
  return { mode: 'image', image: defaultImage, fullImage: defaultImage, lines: [...DEFAULT_LINES], logoLeft: defaultLogoLeft, logoRight: defaultLogoRight };
}
export function defaultCongeHeader(): BulletinHeaderConfig {
  return defaultBulletinHeader();
}
const isImage = (value: unknown): value is string => typeof value === 'string' && /^data:image\/(png|jpeg);base64,/i.test(value);

function parseStoredHeaderConfig(raw: string | null, fallback: () => BulletinHeaderConfig): BulletinHeaderConfig {
  if (!raw) return fallback();
  try {
    const cfg = JSON.parse(raw);
    if (
      (cfg.mode !== 'image' && cfg.mode !== 'personnalise') ||
      !isImage(cfg.image) ||
      !isImage(cfg.fullImage) ||
      !Array.isArray(cfg.lines) ||
      cfg.lines.length !== DEFAULT_LINES.length ||
      !cfg.lines.every((x: unknown) => typeof x === 'string') ||
      !(cfg.logoLeft === '' || isImage(cfg.logoLeft)) ||
      !(cfg.logoRight === '' || isImage(cfg.logoRight))
    ) {
      return fallback();
    }
    return cfg as BulletinHeaderConfig;
  } catch {
    return fallback();
  }
}

let remoteHeader: BulletinHeaderConfig | null | undefined;
export function setRemoteHeader(config: BulletinHeaderConfig | null): void { remoteHeader = config; }
export function loadBulletinHeader(): BulletinHeaderConfig {
  if (remoteHeader !== undefined) return remoteHeader || defaultBulletinHeader();
  try {
    return parseStoredHeaderConfig(localStorage.getItem(STORAGE_KEY), defaultBulletinHeader);
  } catch { return defaultBulletinHeader(); }
}

export function saveBulletinHeader(config: BulletinHeaderConfig): void {
  // En cas de quota dépassé, laisser l'appelant afficher l'erreur sans modifier l'aperçu.
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

let remoteCongeHeader: BulletinHeaderConfig | null | undefined;
export function setRemoteCongeHeader(config: BulletinHeaderConfig | null): void { remoteCongeHeader = config; }
export function loadCongeHeader(): BulletinHeaderConfig {
  if (remoteCongeHeader !== undefined) return remoteCongeHeader || defaultCongeHeader();
  try {
    return parseStoredHeaderConfig(localStorage.getItem(CONGE_HEADER_STORAGE_KEY), defaultCongeHeader);
  } catch { return defaultCongeHeader(); }
}

export function saveCongeHeader(config: BulletinHeaderConfig): void {
  localStorage.setItem(CONGE_HEADER_STORAGE_KEY, JSON.stringify(config));
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('salfa-conge-header-updated'));
  }
}

/** Lit une image locale et vérifie son type, son poids et son décodage. */
export async function readHeaderImage(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg'].includes(file.type)) throw new Error('Choisissez une image PNG ou JPEG.');
  if (file.size > 1024 * 1024) throw new Error('L’image ne doit pas dépasser 1 Mo.');
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Image illisible.'));
    reader.onerror = () => reject(new Error('Image illisible.'));
    reader.readAsDataURL(file);
  });
  const image = await loadImage(data);
  if (image.naturalWidth > 12000 || image.naturalHeight > 12000) throw new Error('Image trop grande.');
  return data;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Image invalide ou illisible.'));
    image.src = src;
  });
}

/** Rend textes et logos en une seule image, identique dans les PDF et le navigateur. */
export async function renderPersonalisedHeader(lines: string[], logoLeft: string, logoRight: string): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = 1470; canvas.height = 312;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Impossible de préparer l’entête dans ce navigateur.');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const drawLogo = async (src: string, x: number, y: number, width: number, height: number) => {
    if (!src) return;
    const img = await loadImage(src);
    const ratio = Math.min(width / img.naturalWidth, height / img.naturalHeight);
    const w = img.naturalWidth * ratio, h = img.naturalHeight * ratio;
    ctx.drawImage(img, x + (width - w) / 2, y + (height - h) / 2, w, h);
  };
  await Promise.all([drawLogo(logoLeft, 8, 8, 208, 296), drawLogo(logoRight, 1320, 65, 140, 170)]);
  ctx.fillStyle = '#000'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const sizes = [37, 27, 30, 27, 29, 28, 28];
  const heights = [35, 79, 119, 158, 199, 237, 277];
  lines.forEach((line, i) => {
    ctx.font = `${[0, 2, 4].includes(i) ? 'bold ' : ''}${sizes[i]}px ${i === 1 || i === 3 ? 'Arial, sans-serif' : 'Georgia, serif'}`;
    ctx.fillText(line, 768, heights[i], 1088);
  });
  return canvas.toDataURL('image/png');
}
