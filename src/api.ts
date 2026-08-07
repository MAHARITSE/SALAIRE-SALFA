// ==============================================================================
// CLIENT API REST - SALFA TANAMBAO (.TSX / REACT)
// ==============================================================================
import { Employe, PaieMensuelle, TotauxMois, ComparaisonNet, UserSession } from './types';

const BASE_URL = '/api';

export async function apiLogin(username: string, password: string):Promise<UserSession | null> {
  try {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.user;
  } catch {
    return null;
  }
}

export async function fetchEmployes(actifsOnly: boolean = false, search: string = ''): Promise<Employe[]> {
  const params = new URLSearchParams();
  if (actifsOnly) params.append('actifs_seulement', 'true');
  if (search) params.append('search', search);
  const res = await fetch(`${BASE_URL}/employes?${params.toString()}`);
  const data = await res.json();
  return data.employes || [];
}

export async function fetchEmployePaies(id: number): Promise<PaieMensuelle[]> {
  const res = await fetch(`${BASE_URL}/employes/${id}/paies`);
  const data = await res.json();
  return data.paies || [];
}

export async function createEmploye(employe: Partial<Employe>): Promise<boolean> {
  const res = await fetch(`${BASE_URL}/employes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(employe)
  });
  return res.ok;
}

export async function updateEmploye(id: number, employe: Partial<Employe>): Promise<boolean> {
  const res = await fetch(`${BASE_URL}/employes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(employe)
  });
  return res.ok;
}

export async function toggleActifEmploye(id: number, actif: boolean): Promise<boolean> {
  const res = await fetch(`${BASE_URL}/employes/${id}/actif`, {
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
  const res = await fetch(`${BASE_URL}/paies?annee=${annee}&mois=${mois}`);
  return await res.json();
}

export async function initMoisPaie(annee: number, mois: string): Promise<{ success: boolean; initializedCount: number }> {
  const res = await fetch(`${BASE_URL}/paies/initialiser`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ annee, mois })
  });
  return await res.json();
}

export async function savePaieSaisie(id: number, avance: number, med: number, accessoires?: any): Promise<{ success: boolean; updated?: PaieMensuelle }> {
  const res = await fetch(`${BASE_URL}/paies/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ avance, med, accessoires })
  });
  return await res.json();
}

export async function cloturerMois(annee: number, mois: string): Promise<boolean> {
  const res = await fetch(`${BASE_URL}/paies/cloturer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ annee, mois })
  });
  return res.ok;
}

export async function deverrouillerMois(annee: number, mois: string, userRole: string): Promise<boolean> {
  const res = await fetch(`${BASE_URL}/paies/deverrouiller`, {
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
  const res = await fetch(`${BASE_URL}/rapports/comparaison?${params.toString()}`);
  const data = await res.json();
  return data.comparaison || [];
}
