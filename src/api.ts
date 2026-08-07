// ==============================================================================
// CLIENT API REST - SALFA TANAMBAO (.TSX / REACT) - MODE JSON PUR
// ==============================================================================

import { Employe, PaieMensuelle, TotauxMois, ComparaisonNet, UserSession } from './types';

const BASE_URL = '/api';

// Helper : fetch avec timeout et messages d'erreur clairs
async function safeFetch(url: string, opts?: RequestInit) {
  try {
    const res = await fetch(url, opts);
    return res;
  } catch (e: any) {
    // Réseau indisponible (serveur non démarré)
    throw new Error(`Serveur inaccessible (${e?.message || 'fetch failed'}). Vérifiez que "npm run dev" est lancé et que le port 3000 est accessible.`);
  }
}

export async function apiLogin(username: string, password: string): Promise<UserSession | null> {
  try {
    const res = await safeFetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.warn('[LOGIN] échec', res.status, err);
      // 401 signifie réellement que les identifiants sont invalides. Les
      // autres statuts indiquent un problème de déploiement/API et ne doivent
      // pas être présentés à l'utilisateur comme une faute de saisie.
      if (res.status !== 401) {
        throw new Error(
          `API d'authentification indisponible (HTTP ${res.status}). Vérifiez que le serveur Node est déployé et que /api/auth/login est accessible.`
        );
      }
      return null;
    }
    const data = await res.json();
    return data.user || null;
  } catch (e: any) {
    console.error('[LOGIN] erreur réseau', e.message);
    // Propager pour que LoginModal affiche le message réseau distinct
    throw e;
  }
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await safeFetch(`${BASE_URL}/health`);
    if (!res.ok) return false;
    const d = await res.json();
    return d.status === 'ok';
  } catch {
    return false;
  }
}

export async function fetchEmployes(actifsOnly: boolean = false, search: string = ''): Promise<Employe[]> {
  const params = new URLSearchParams();
  if (actifsOnly) params.append('actifs_seulement', 'true');
  if (search) params.append('search', search);
  const res = await safeFetch(`${BASE_URL}/employes?${params.toString()}`);
  const data = await res.json();
  return data.employes || [];
}

export async function fetchEmployePaies(id: number): Promise<PaieMensuelle[]> {
  const res = await safeFetch(`${BASE_URL}/employes/${id}/paies`);
  const data = await res.json();
  return data.paies || [];
}

export async function createEmploye(employe: Partial<Employe>): Promise<boolean> {
  const res = await safeFetch(`${BASE_URL}/employes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(employe)
  });
  return res.ok;
}

export async function updateEmploye(id: number, employe: Partial<Employe>): Promise<boolean> {
  const res = await safeFetch(`${BASE_URL}/employes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(employe)
  });
  return res.ok;
}

export async function toggleActifEmploye(id: number, actif: boolean): Promise<boolean> {
  const res = await safeFetch(`${BASE_URL}/employes/${id}/actif`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actif })
  });
  return res.ok;
}

export async function fetchPaiesMois(annee: number, mois: string): Promise<{
  employes: PaieMensuelle[];
  verrouille: boolean;
  totaux: TotauxMois;
}> {
  const res = await safeFetch(`${BASE_URL}/paies?annee=${annee}&mois=${mois}`);
  return await res.json();
}

export async function initMoisPaie(annee: number, mois: string): Promise<{ success: boolean; initializedCount: number }> {
  const res = await safeFetch(`${BASE_URL}/paies/initialiser`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ annee, mois })
  });
  return await res.json();
}

export async function savePaieSaisie(id: number, avance: number, med: number, accessoires?: any): Promise<{ success: boolean; updated?: PaieMensuelle }> {
  const res = await safeFetch(`${BASE_URL}/paies/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ avance, med, accessoires })
  });
  return await res.json();
}

export async function cloturerMois(annee: number, mois: string): Promise<boolean> {
  const res = await safeFetch(`${BASE_URL}/paies/cloturer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ annee, mois })
  });
  return res.ok;
}

export async function deverrouillerMois(annee: number, mois: string, userRole: string): Promise<boolean> {
  const res = await safeFetch(`${BASE_URL}/paies/deverrouiller`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ annee, mois, userRole })
  });
  return res.ok;
}

export async function fetchComparaison(annee: number, moisActuel: string, moisAvant: string, useHist: boolean): Promise<ComparaisonNet[]> {
  const params = new URLSearchParams({
    annee: String(annee),
    mois_actuel: moisActuel,
    mois_avant: moisAvant,
    use_hist: String(useHist)
  });
  const res = await safeFetch(`${BASE_URL}/rapports/comparaison?${params.toString()}`);
  const data = await res.json();
  return data.comparaison || [];
}
