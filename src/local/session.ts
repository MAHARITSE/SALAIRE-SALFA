// Mécanisme de présence de CAISSE-SALFA : contact toutes les 15 s,
// fenêtre portée à 1 heure sans contact à la demande de l’utilisateur. Ce n'est pas un
// minuteur d'inactivité clavier/souris. Les clés sont propres à la PAIE.
export const CLE_SESSION_PRESENCE = 'salfa_paie_session_v1';
export const INTERVALLE_PRESENCE_MS = 15_000;
export const DUREE_PRESENCE_MS = 3_600_000;
const COOKIE_PRESENCE = 'salfa_paie_presence';
const CLE_PREUVE_ONGLET = 'salfa_paie_presence_onglet_v1';
// Seulement si le navigateur refuse le cookie à la connexion explicite.
// Pas de repli après disparition d'un cookie qui avait bien été accepté.
let preuveEnMemoire: number | null = null;

function cookiePresent(): boolean {
  try { return document.cookie.split(';').some(c => c.trim() === `${COOKIE_PRESENCE}=1`); }
  catch { return false; }
}

/** Oublie ce seul onglet, sans toucher à la session d'un autre compte/onglet. */
export function oublierPreuvePresenceLocale(): void {
  preuveEnMemoire = null;
  try { sessionStorage.removeItem(CLE_PREUVE_ONGLET); } catch { /* Stockage facultatif. */ }
}

function preuveOngletValide(id: number): boolean {
  if (preuveEnMemoire === id) return true;
  try { return sessionStorage.getItem(CLE_PREUVE_ONGLET) === String(id); }
  catch { return false; }
}

export interface PresenceLocale { id: number; derniereActivite: number }

export function memoriserPresenceLocale(id: number | null, maintenant = Date.now()): boolean {
  try {
    if (id === null) {
      oublierPreuvePresenceLocale();
      localStorage.removeItem(CLE_SESSION_PRESENCE);
      try {
        document.cookie = `${COOKIE_PRESENCE}=; path=/; max-age=0; SameSite=Lax`;
        if (typeof location !== 'undefined' && location.protocol === 'https:') {
          document.cookie = `${COOKIE_PRESENCE}=; path=/; max-age=0; SameSite=None; Secure; Partitioned`;
        }
      } catch { /* La preuve d'onglet et le marqueur sont déjà effacés. */ }
    } else {
      localStorage.setItem(CLE_SESSION_PRESENCE, JSON.stringify({ id, derniereActivite: maintenant }));
      // Cookie de session, sans expiration persistante ni identifiant de compte.
      oublierPreuvePresenceLocale();
      try {
        // CHIPS : cookie de session également utilisable dans un aperçu HTTPS intégré.
        const attributs = typeof location !== 'undefined' && location.protocol === 'https:'
          ? 'SameSite=None; Secure; Partitioned' : 'SameSite=Lax';
        document.cookie = `${COOKIE_PRESENCE}=1; path=/; ${attributs}`;
      } catch { /* Le navigateur peut interdire tous les cookies. */ }
      if (!cookiePresent()) {
        // Session de l'onglet seulement, jamais un cookie persistant/localStorage seul.
        // Elle autorise le heartbeat et l'actualisation, pas un nouveau navigateur.
        preuveEnMemoire = id;
        try { sessionStorage.setItem(CLE_PREUVE_ONGLET, String(id)); } catch { /* Mémoire du document seulement. */ }
      }
    }
    return true;
  } catch { return false; /* Aucun secret ni session persistante de secours. */ }
}

export function lirePresenceLocale(maintenant = Date.now()): PresenceLocale | null {
  try {
    const brut = localStorage.getItem(CLE_SESSION_PRESENCE);
    const presence = brut ? JSON.parse(brut) : null;
    if (!presence || !Number.isSafeInteger(presence.id) || presence.id <= 0 ||
        typeof presence.derniereActivite !== 'number' || !Number.isFinite(presence.derniereActivite) ||
        maintenant < presence.derniereActivite || maintenant - presence.derniereActivite > DUREE_PRESENCE_MS) return null;
    if (!cookiePresent() && !preuveOngletValide(presence.id)) return null;
    return { id: presence.id, derniereActivite: presence.derniereActivite };
  } catch { return null; }
}

/** Ne ressuscite ni une session expirée, ni une déconnexion, ni un autre compte. */
export function renouvelerPresenceLocale(id: number, maintenant = Date.now()): boolean {
  try {
    const presence = lirePresenceLocale(maintenant);
    if (!presence || presence.id !== id) return false;
    localStorage.setItem(CLE_SESSION_PRESENCE, JSON.stringify({ id, derniereActivite: maintenant }));
    return true;
  } catch { return false; }
}
